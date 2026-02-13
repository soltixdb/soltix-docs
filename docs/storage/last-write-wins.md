---
id: last-write-wins
title: Last-Write-Wins Deduplication
sidebar_position: 6
---

# Last-Write-Wins Deduplication

Soltix implements **last-write-wins (LWW)** conflict resolution for time-series data. When multiple writes target the same `(device_id, timestamp)` pair, the write with the most recent `InsertedAt` time is kept and all older writes are discarded.

## Why Last-Write-Wins?

In time-series systems, duplicate or conflicting writes occur in several scenarios:

| Scenario | Description |
|----------|-------------|
| **Client retries** | Network timeouts cause clients to resend the same data point |
| **Late corrections** | An updated value is pushed for a previously-written timestamp |
| **Multi-source ingestion** | Multiple producers write to the same device/timestamp |
| **Sync & replication** | Anti-entropy sync replays data that already exists locally |
| **Re-push after failure** | Operators re-push a data batch after a partial failure |

Without LWW, these scenarios would produce **duplicate points** in query results or keep stale values instead of corrections.

## How It Works

### The `InsertedAt` Timestamp

Every data point carries two timestamps:

| Field | Purpose |
|-------|---------|
| `Time` | The **business timestamp** — when the measurement was taken (set by the producer) |
| `InsertedAt` | The **ingestion timestamp** — when Soltix received the write (set by the server) |

`InsertedAt` is assigned automatically by the write worker when the data point enters the storage pipeline. It is **not user-settable** — the server always uses its own wall clock.

### Deduplication Rule

```
Key:   (device_id, timestamp)
Rule:  Keep the point with the latest InsertedAt
```

When two points share the same device ID and business timestamp:

```
Point A: device="sensor-001", time=2026-02-01T10:00:00Z, InsertedAt=T1, temperature=25.0
Point B: device="sensor-001", time=2026-02-01T10:00:00Z, InsertedAt=T2, temperature=26.5

If T2 > T1 → Point B wins (temperature=26.5 is kept)
```

### Core Algorithm

The deduplication function groups points by `(device_id, time)` and retains only the latest:

```go
func deduplicatePoints(points []*DataPoint) []*DataPoint {
    pointMap := map[string]map[int64]*DataPoint{}

    for _, p := range points {
        existing := pointMap[p.ID][p.Time.UnixNano()]
        if existing == nil || p.InsertedAt.After(existing.InsertedAt) {
            pointMap[p.ID][p.Time.UnixNano()] = p
        }
    }
    // ... collect results and sort
}
```

## Data Lifecycle of `InsertedAt`

The `InsertedAt` timestamp is persisted end-to-end through the entire storage pipeline:

```
Producer write
    │
    ▼
WriteWorker: point.InsertedAt = time.Now()     ← Server assigns ingestion time
    │
    ▼
WAL: _inserted_at field stored as int64        ← Persisted in WAL entry as UnixNano
    │  (map key: "_inserted_at")
    ▼
Flush → V6 Part File:
    │  _inserted_at written as internal         ← Persisted as delta-encoded int64
    │  column (like _time)                         column in V6 columnar format
    ▼
Read (query / compaction):
    │  _inserted_at column decoded              ← Restored to DataPoint.InsertedAt
    │  → DataPoint.InsertedAt restored
    ▼
deduplicatePoints():
    └── Compare InsertedAt, keep latest         ← LWW resolution
```

### V6 Column Layout

In the V6 file format, `_inserted_at` is stored as a **special internal column** alongside `_time`:

```
Field Dictionary: [_time, field_0, field_1, ..., field_N, _inserted_at]
Field Types:      [int64, float64, int64,   ..., bool,    int64       ]
                   ↑                                       ↑
                   Always first                            Always last
```

- **Encoding**: Delta encoder (same as `_time`) — consecutive ingestion timestamps compress extremely well due to monotonic nature
- **Compression**: Snappy on top of delta-encoded bytes
- **Visibility**: `_inserted_at` is **never exposed** in query results — it is filtered out by `collectFieldNames()` and excluded from the user-visible field dictionary

### Zero-Value Fallback

If a data point has no `InsertedAt` (e.g., migrated from an older format), the write path falls back to `time.Now()`:

```go
if !p.InsertedAt.IsZero() {
    insertedAtValues[i] = p.InsertedAt.UnixNano()
} else {
    insertedAtValues[i] = time.Now().UnixNano()
}
```

This ensures backward compatibility — old V6 files without `_inserted_at` columns are readable, and the deduplication degrades gracefully (arbitrary winner when all `InsertedAt` values are zero).

## Where Deduplication Runs

LWW deduplication is applied at multiple points in the pipeline:

| Stage | Trigger | Effect |
|-------|---------|--------|
| **Query (TieredStorage)** | Every query reads multiple part files per DG | Points from all parts are merged and deduplicated before returning |
| **Compaction** | Background worker merges small part files | All points from a DG are read → deduplicated → rewritten as a single compacted file |
| **Query (MemoryStore + Disk)** | gRPC `QueryShard` merges hot + cold data | Memory data (recent) and disk data are merged with LWW |

### Compaction Flow

Compaction is where LWW produces the most significant effect — it permanently eliminates duplicates:

```
Before compaction:
    part_0000.bin: sensor-001 @ T1 → temp=25.0 (InsertedAt=2026-02-01T10:00:00Z)
    part_0001.bin: sensor-001 @ T1 → temp=26.5 (InsertedAt=2026-02-01T10:05:00Z)

Compaction reads all parts → deduplicatePoints() → rewrite

After compaction:
    part_0000.bin: sensor-001 @ T1 → temp=26.5 (InsertedAt=2026-02-01T10:05:00Z)
                                      ↑ latest write wins
```

## Storage Overhead

The `_inserted_at` column adds minimal overhead per part file:

| Metric | Impact |
|--------|--------|
| **Raw size** | 8 bytes per point (int64 UnixNano) |
| **After delta encoding** | ~1-2 bytes per point (monotonically increasing timestamps compress very well) |
| **After Snappy** | Often less than 1 byte per point |
| **Footer** | +25 bytes per device (one V6ColumnEntry) |

For a typical part file with 100,000 points, the `_inserted_at` column adds approximately **100-200 KB** of compressed data — less than 1% overhead.

## Interaction with Aggregation

The aggregation pipeline operates on **already-deduplicated** data:

1. Flush writes raw points to V6 → triggers `FlushCompleteEvent`
2. Aggregation reads raw points via `QueryRawDataForAggregation()`
3. Query path applies `deduplicatePoints()` before returning data
4. Aggregation receives clean, deduplicated points

This means aggregated values (sum, avg, min, max, count) always reflect the **latest version** of each data point, not duplicates.

## Related Topics

- [Storage Overview](./overview) — Storage architecture and query strategy
- [File Format](./file-format) — V6 binary columnar format (where `_inserted_at` is stored)
- [WAL](./wal) — Write-Ahead Log (where `InsertedAt` is first persisted)
- [Flush Mechanism](./flush) — WAL to disk pipeline
- [Compression](./compression) — Delta encoding used for `_inserted_at` column
