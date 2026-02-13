---
id: overview
title: Architecture Overview
sidebar_position: 1
---

# Architecture Overview

Soltix is a distributed time-series database designed for IoT and sensor data. It uses a **two-service architecture** (Router + Storage) with device-based sharding, V6 columnar storage, adaptive compression, and automatic replication.

## System Overview

```
                         ┌───────────────────────────┐
                         │         Clients           │
                         │  (HTTP REST / SSE / gRPC) │
                         └────────────┬──────────────┘
                                      │
                                      ▼
                         ┌───────────────────────────┐
                         │      Router Service       │
                         │  ┌──────────────────────┐ │
                         │  │  HTTP API (Fiber)    │ │
                         │  │  ShardRouter         │ │
                         │  │  QueryCoordinator    │ │
                         │  │  GroupAutoAssigner   │ │
                         │  │  Post-Processing     │ │
                         │  │  (Downsampling,      │ │
                         │  │   Anomaly Detection, │ │
                         │  │   Timezone)          │ │
                         │  └──────────────────────┘ │
                         └───────┬──────────┬────────┘
                                 │          │
                        Write    │          │  Query
                     (via Queue) │          │  (via gRPC)
                                 │          │
                                 ▼          ▼
           ┌──────────────────────┐    ┌───────────────────────────┐
           │    Message Queue     │    │     Storage Nodes (N)     │
           │ (NATS/Redis/Kafka)   │    │                           │
           └──────────┬──────────-┘    │  ┌─────────────────────┐  │
                      │                │  │ Subscriber          │  │
                      │                │  │ WriteWorkerPool     │  │
                      └───────────────►│  │ PartitionedWAL      │  │
                                       │  │ MemoryStore         │  │
                                       │  │ FlushWorkerPool     │  │
                                       │  │ TieredStorage       │  │
                                       │  │ CompactionWorker    │  │
                                       │  │ AggregationPipeline │  │
                                       │  │ gRPC Server         │  │
                                       │  │ SyncManager         │  │
                                       │  └─────────────────────┘  │
                                       └──────────┬────────────────┘
                                                  │
                                                  ▼
                                           ┌──────────────┐
                                           │    etcd      │
                                           │  (metadata,  │
                                           │   registry,  │
                                           │   groups)    │
                                           └──────────────┘
```

## Services

### Router Service

The **Router** is the user-facing API gateway. All client requests flow through the Router, which validates input, routes writes to the correct storage nodes via a message queue, and coordinates scatter-gather queries via gRPC.

**Key Components:**

| Component | Description |
|-----------|-------------|
| **HTTP API (Fiber)** | REST endpoints for writes, queries, streaming (SSE), database/collection CRUD, admin, forecasting, and CSV download |
| **ShardRouter** | Routes each `device_id` to a logical group via `GroupManager` (FNV-32a hash) and resolves the group to primary + replica nodes |
| **QueryCoordinator** | Fan-out/scatter-gather query engine — groups device queries by node, executes parallel gRPC calls, merges and deduplicates results |
| **GroupAutoAssigner** | Background goroutine that polls etcd for node changes and auto-distributes groups evenly across storage nodes |
| **Post-Processing Pipeline** | Applied after query results are merged: anomaly detection (Z-Score, IQR, Moving Average), downsampling (LTTB, MinMax, Average, M4), timezone conversion |
| **API Key Auth** | Middleware supporting `X-API-Key`, `Authorization: Bearer`, and `Authorization: ApiKey` headers |

### Storage Service

The **Storage** service handles data persistence, retrieval, aggregation, and replication. It subscribes to the message queue for writes and exposes a gRPC server for queries.

**Key Components:**

| Component | Description |
|-----------|-------------|
| **Subscriber** | Listens to `soltix.write.node.<nodeID>` on the message queue (NATS/Redis/Kafka) |
| **WriteWorkerPool** | One worker goroutine per partition key (`db:collection:date`), processing writes in parallel |
| **PartitionedWAL** | Write-Ahead Log partitioned by `db/collection/date`. Protobuf-encoded entries with CRC32 checksums. Batch writer with 10ms flush interval |
| **MemoryStore** | 64-shard FNV-hash partitioned in-memory store for hot data (recent 2 hours). Supports concurrent writes without contention |
| **FlushWorkerPool** | Event-driven (triggered on WAL segment boundaries). Reads WAL segments → flushes to TieredStorage → removes processed segments |
| **TieredStorage** | 3-tier group-aware columnar engine: Group → Device Group → Partition. Append-only writes with atomic batch rename for crash safety |
| **CompactionWorker** | Background process (every 30s) that merges small part files within device groups |
| **AggregationPipeline** | Cascading 4-level pipeline: 1h → 1d → 1M → 1y. Triggered after flush, each level feeds the next |
| **SyncManager** | Startup sync + anti-entropy (hourly SHA-256 checksum comparison) for group-scoped replication |
| **gRPC Server** | Serves `QueryShard` requests from Router — queries both MemoryStore (hot) and TieredStorage (cold) concurrently, merges results |

## Data Flow

### Write Path

```
Client HTTP POST
    │
    ▼
Router: Validate → ShardRouter.RouteWrite(db, collection, device_id)
    │               └── GroupID = FNV32a(db:collection:device_id) % TotalGroups
    │                   └── Lookup GroupAssignment (cache → etcd → create lazily)
    ▼
Queue: Publish to "soltix.write.node.<nodeID>" for each node (primary + replicas)
    │
    ▼
Storage: Subscriber receives message → WriteWorkerPool.Submit()
    │
    ├── 1. PartitionedWAL.Write()     ← always (durability)
    ├── 2. MemoryStore.Write()        ← if data age ≤ maxAge (hot data)
    └── 3. FlushWorkerPool.Notify()   ← only on new WAL segments
              │
              ▼
         FlushWorker: Read WAL segments → TieredStorage.WriteBatch()
              │          └── Group by GroupID → per-group Storage engine
              │              └── Append-only V6 part files (.tmp → atomic rename)
              ▼
         AggregationPipeline.OnFlushComplete()
              └── Hourly → Daily → Monthly → Yearly (cascading)
```

### Query Path

```
Client HTTP GET/POST
    │
    ▼
Router: Parse query params → QueryCoordinator.Query()
    │     ├── Route each device_id → group → primary node
    │     ├── Group queries by node (minimize RPCs)
    │     └── Parallel gRPC QueryShard calls via ConnectionPool
    │
    ▼
Storage (per node): gRPC QueryShard handler
    ├── MemoryStore.Query()      ← hot data (recent ~2h, binary search)
    ├── TieredStorage.Query()    ← cold data (V6 columnar, footer-based seeks)
    │     ├── Time-range pruning via metadata min/max timestamps
    │     ├── Device → DeviceGroup routing via DeviceGroupMap
    │     ├── Column projection (only requested fields)
    │     └── Bloom filter for fast device existence check
    └── Merge + deduplicate (keep latest by InsertedAt)
    │
    ▼
Router: Merge results from all nodes → Post-processing pipeline
    ├── 1. Anomaly detection (Z-Score / IQR / Moving Average)
    ├── 2. Downsampling (LTTB / MinMax / Average / M4)
    └── 3. Timezone conversion
    │
    ▼
Response (columnar format: device_id, timestamps[], field → values[])
```

## Device-Based Sharding

Data is distributed across **logical groups** (default: 256) based on `device_id`:

```
GroupID = FNV32a(database + ":" + collection + ":" + device_id) % TotalGroups
```

Each group is assigned to a **primary node** and **replica nodes**. The assignment is managed by the `GroupAutoAssigner` in the Router and persisted in etcd.

**Key properties:**
- **Deterministic**: Same device always maps to the same group
- **Lazy creation**: Groups are created on first write, no pre-provisioning needed
- **Adaptive hashing**: Small clusters (< 20 nodes) use Rendezvous hashing for better distribution; large clusters switch to Consistent hashing with virtual nodes for O(log N) lookups
- **Auto-rebalancing**: When nodes join or leave, the GroupAutoAssigner redistributes groups evenly

## V6 Columnar Storage Format

On-disk data uses a single-file columnar format with 3-tier organization (Group → Device → Partition):

```
data/
  group_{gid}/
    {database}/
      {collection}/
        {year}/{month}/{date}/
          _metadata.idx              ← Global metadata (fields, DG manifests, device→DG map)
          dg_0000/
            _metadata.idx            ← DG metadata (parts, device→part map)
            part_0000.bin            ← V6 columnar file
            part_0001.bin
          dg_0001/
            ...
```

**V6 Part File Structure:**

```
┌──────────────────────────────────┐
│ Header (64 bytes)                │
├──────────────────────────────────┤
│ Column Chunk: device0._time      │  ← Delta encoded + Snappy
│ Column Chunk: device0.field1     │  ← Gorilla/Delta/Dict/Bool + Snappy
│ Column Chunk: device0.field2     │
│ Column Chunk: device1._time      │
│ ...                              │
├──────────────────────────────────┤
│ Footer                           │
│  ├── ColumnIndex[]               │  ← (deviceIdx, fieldIdx, offset, size, rowCount, type)
│  ├── FieldDictionary             │
│  └── DeviceIndex                 │
├──────────────────────────────────┤
│ FooterSize (4 bytes)             │
│ FooterOffset (8 bytes)           │  ← Last 8 bytes of file
└──────────────────────────────────┘
```

## Adaptive Compression

Each column uses a **type-specific encoder** before being wrapped with Snappy block compression:

| Data Type | Encoder | Algorithm |
|-----------|---------|-----------|
| float64 | GorillaEncoder | Facebook Gorilla XOR bit-packing (~1.37 bytes/value) |
| int64 / timestamps | DeltaEncoder | Delta + ZigZag + Varint encoding |
| string | DictionaryEncoder | Unique-string dictionary with varint indices |
| bool | BoolEncoder | Bitmap (1 bit per value) |

Compression pipeline: `Raw values → Column Encoder → Snappy Compress → Disk`

## Multi-Level Aggregation

A cascading pipeline computes pre-aggregated data at 4 levels:

```
Raw Data → Flush Complete Event
    │
    ▼
Hourly (1h)  → aggregate raw points  → notify Daily
    │
    ▼
Daily (1d)   → aggregate hourly points → notify Monthly
    │
    ▼
Monthly (1M) → aggregate daily points  → notify Yearly
    │
    ▼
Yearly (1y)  → aggregate monthly points
```

Each level computes **sum, avg, min, max, count** per field, stored in V6 columnar format under `data/agg/agg_{level}/`. The pipeline uses partitioned worker pools with semaphore-based concurrency limiting (100 hourly, 50 daily, 20 monthly, 10 yearly).

## Replication & Sync

Data replication operates at the **group scope** — only replicas within the same group sync with each other.

| Mode | Description |
|------|-------------|
| **Write replication** | Router publishes writes to all nodes in a group's assignment (primary + replicas) |
| **Startup sync** | On node restart, recovers missed data from replicas via gRPC streaming |
| **Anti-entropy** | Hourly background process: SHA-256 checksum comparison over a 24h window, auto-repairs on mismatch |

## Coordination Layer (etcd)

etcd serves as the single source of truth for all cluster state:

| Key Prefix | Data |
|------------|------|
| `/soltix/nodes/` | Node registration with lease-based heartbeats (10s TTL) |
| `/soltix/groups/` | Group assignments (primary, replicas, state, epoch) |
| `/soltix/databases/` | Database metadata |
| `/soltix/collections/` | Collection metadata, field schemas, device tracking |

All Router and Storage nodes are **stateless** — cluster state lives entirely in etcd, enabling zero-downtime restarts and easy horizontal scaling.

## Message Queue

Writes are decoupled through a pluggable message queue:

| Backend | Implementation | Notes |
|---------|---------------|-------|
| **NATS** (default) | JetStream | Async publish, durable consumers, file storage |
| **Redis** | Redis Streams | XADD/XREADGROUP with consumer groups |
| **Kafka** | segmentio/kafka-go | Standard Kafka producer/consumer |
| **Memory** | In-process channels | For testing only |

All backends implement the same `Publisher`/`Subscriber` interface, making them interchangeable via configuration.
