---
id: overview
title: Storage Overview
sidebar_position: 1
---

# Storage Layer

The Storage service handles all data persistence and retrieval. It uses a **3-tier group-aware architecture** with V6 columnar format: Group → Device Group → Partition.

## Key Components

| Component | Description |
|-----------|-------------|
| **Subscriber** | Receives write messages from the queue (NATS/Redis/Kafka) |
| **WriteWorkerPool** | One worker per partition key (`db:collection:date`), parallel writes |
| **PartitionedWAL** | Durability — partitioned by `db/collection/date`, protobuf-encoded with CRC32 |
| **MemoryStore** | 64-shard FNV-hash partitioned in-memory store for hot data (configurable max_age) |
| **FlushWorkerPool** | Event-driven flush — triggered on WAL segment boundaries, not per record |
| **TieredStorage** | V6 columnar engine with per-group Storage instances (lazy-created) |
| **CompactionWorker** | Background merge of small part files (runs every 30s) |
| **AggregationPipeline** | Cascading 4-level aggregation: 1h → 1d → 1M → 1y |
| **SyncManager** | Startup sync + anti-entropy for group-scoped replication |
| **gRPC Server** | Serves `QueryShard` from Router — queries MemoryStore + TieredStorage concurrently |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      TieredStorage                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  group_0000  │  │  group_0001  │  │  group_0042  │    │
│  │  V6 Engine   │  │  V6 Engine   │  │  V6 Engine   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────────────────────────────────────────┘
```

Each group gets its own independent `Storage` instance with its own metadata cache and directory locks.

## V6 File Layout

V6 eliminated the Column Group (`cg_XXXX/`) directories — all columns are stored in a single part file per device group.

```
data/
├── group_0000/
│   └── mydb/
│       └── sensors/
│           └── 2026/
│               └── 01/
│                   └── 15/
│                       ├── _metadata.idx       # Global metadata (fields, DG manifests, device→DG map)
│                       ├── dg_0000/
│                       │   ├── _metadata.idx   # DG metadata (parts, device→part map)
│                       │   ├── part_0000.bin   # V6 columnar file
│                       │   └── part_0001.bin
│                       └── dg_0001/
│                           ├── _metadata.idx
│                           └── part_0000.bin
```

## Storage Limits

| Setting | Default | Description |
|---------|---------|-------------|
| `max_rows_per_part` | 100,000 | Split part file when rows exceed this |
| `max_part_size` | 64 MB | Safety limit per part file |
| `min_rows_per_part` | 1,000 | Don't split below this |
| `max_devices_per_group` | 50 | Max devices per device group |
| `max_parts_per_dg` | 4 | Compaction triggered above this |

## Write Strategy

Writes are **append-only** — new data creates new part files without reading back existing data. This ensures:
- No read amplification during writes
- Crash safety via atomic batch rename (`.tmp` → final)
- Background compaction handles merge later

## Query Strategy

Queries scan both hot and cold data:
1. **MemoryStore** — binary search in sorted slices (recent data)
2. **TieredStorage** — footer-based seeks in V6 columnar files (historical data)
3. **Merge + deduplicate** — keep latest by `InsertedAt`

Optimizations: bloom filters, metadata time-range pruning, column projection, device→DG routing.

## Related Topics

- [WAL (Write-Ahead Log)](./wal) — Durability mechanism
- [Flush Mechanism](./flush) — WAL to disk pipeline
- [File Format](./file-format) — V6 binary columnar format specification
- [Compression](./compression) — Adaptive compression per column type
- [Last-Write-Wins](./last-write-wins) — Conflict resolution and deduplication strategy
