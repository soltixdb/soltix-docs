---
id: coordinator-optimization
title: Coordinator Optimization
sidebar_position: 3
---

# Coordinator Optimization

The coordinator layer in the Router optimizes both write routing and query execution across distributed storage nodes.

## ShardRouter (Write Path)

The `ShardRouter` wraps `GroupManager` and `AdaptiveHasher` to provide efficient write routing:

1. **Route cache**: Per-device group lookups are cached in memory to avoid redundant etcd reads
2. **Batch grouping**: Batch writes group messages by target node, minimizing queue publishes
3. **sync.Pool**: JSON serialization buffers are pooled to reduce GC pressure
4. **Metadata tracking**: Device IDs and field schemas are tracked once per unique device (not per point)

## QueryCoordinator (Query Path)

The `QueryCoordinator` implements scatter-gather query execution:

### Query Planning

```
1. Route each device_id → group → primary node
2. Group queries by node to minimize RPCs
3. Execute parallel gRPC QueryShard calls
4. Merge, deduplicate, format results
5. Apply global limit
```

### Optimization Techniques

#### Node Grouping

When querying multiple devices, queries are grouped by target node. If 10 devices all map to the same storage node, only **one gRPC call** is made with all 10 device IDs.

#### Parallel Execution

Queries to different storage nodes are executed concurrently using goroutines. Results are collected via channels and merged.

#### Predicate Pushdown

Filters are pushed down to storage nodes via the gRPC `QueryShard` request:
- Time range (`start_time`, `end_time`)
- Device ID list
- Field selection (column projection)
- Aggregation interval (`1h`, `1d`, `1M`, `1y`)

Storage nodes use these predicates for:
- **Time-range pruning**: Skip date directories and parts outside the range (via metadata min/max timestamps)
- **Device→DG routing**: Jump directly to the correct Device Group
- **Column projection**: Only read requested fields from the V6 footer index
- **Bloom filter**: Fast device existence check before scanning

#### Aggregation Pushdown

When the query interval is `1h`, `1d`, `1M`, or `1y`, storage nodes read from **pre-computed aggregation data** instead of raw data, drastically reducing I/O.

## gRPC Connection Pool

The Router maintains a reusable pool of gRPC connections to storage nodes:

- **Lazy creation**: Connections established on first use with double-checked locking
- **Health checks**: Background goroutine removes connections in `TransientFailure` or `Shutdown` state
- **Configuration**: 10MB max message size, insecure credentials (internal network)
- **Address resolution**: Node addresses resolved from etcd registry

## Post-Processing Pipeline

After query results are merged from all nodes, the Router applies a 3-stage post-processing pipeline:

```
Merged Results → Anomaly Detection → Downsampling → Timezone Conversion → Response
```

| Stage | Options |
|-------|--------|
| **Anomaly Detection** | `zscore`, `iqr`, `moving_avg`, `auto`, `none` |
| **Downsampling** | `lttb`, `minmax`, `avg`, `m4`, `auto`, `none` |
| **Timezone** | Configurable output timezone |

## Columnar Response Format

Query results use a **column-oriented format** to reduce JSON overhead:

```json
{
  "results": [
    {
      "device_id": "sensor-001",
      "timestamps": ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"],
      "fields": {
        "temperature": [25.5, 26.0],
        "humidity": [60.2, 58.5]
      }
    }
  ]
}
```

This is more compact than row-per-point format, especially for queries returning many data points.
