---
id: pipeline
title: Aggregation Pipeline
sidebar_position: 1
---

# Aggregation Pipeline

The aggregation pipeline computes pre-aggregated statistics (sum, avg, min, max, count) from raw data across 4 cascading time levels: hourly → daily → monthly → yearly.

## Pipeline Architecture

```
Raw Data (Flush) → Hourly → Daily → Monthly → Yearly
                   (1h)     (1d)    (1M)      (1y)
```

Each level aggregates from the previous level:

| Level | Source | Storage Path | Worker Concurrency |
|-------|--------|-------------|--------------------|
| Hourly | Raw data | `agg/agg_1h/` | 100 |
| Daily | Hourly aggregates | `agg/agg_1d/` | 50 |
| Monthly | Daily aggregates | `agg/agg_1M/` | 20 |
| Yearly | Monthly aggregates | `agg/agg_1y/` | 10 |

## Trigger Flow

The pipeline is triggered by flush events and cascades automatically:

```
Storage Flush → FlushCompleteEvent
    │
    ▼
Pipeline.OnFlushComplete()
    │
    ▼
Hourly WorkerPool (aggregate raw → hourly)
    │  └─ AggregateCompleteEvent
    ▼
Daily WorkerPool (aggregate hourly → daily)
    │  └─ AggregateCompleteEvent
    ▼
Monthly WorkerPool (aggregate daily → monthly)
    │  └─ AggregateCompleteEvent
    ▼
Yearly WorkerPool (aggregate monthly → yearly)
```

## Worker Pool Pattern

Each level has a **partitioned worker pool**:

- One goroutine per partition key (`db:collection:date`)
- Semaphore-based concurrency limiting (100/50/20/10 per level)
- Worker states: `idle → pending → running → waitingForJob`
- **Batch delay**: Workers wait 2–10s after first notification to batch multiple updates
- Each level's `nextPool` links to the next level for cascade

## Aggregation Functions

For each field, the following statistics are computed per time bucket:

| Function | Description |
|----------|-------------|
| **sum** | Total sum of values |
| **avg** | Average value |
| **min** | Minimum value |
| **max** | Maximum value |
| **count** | Number of data points |

The `AggregatedField` struct also supports derived statistics: `Variance()` and `StdDev()`.

:::info Numeric Fields Only
Aggregation **only processes numeric fields** (`float64`, `int`, `int64`). Non-numeric types (`bool`, `string`) are silently skipped during the type-switch in the aggregation loop:

```go
for fieldName, fieldValue := range point.Fields {
    var value float64
    switch v := fieldValue.(type) {
    case float64:
        value = v
    case int:
        value = float64(v)
    case int64:
        value = float64(v)
    default:
        continue // bool, string → skipped
    }
    // aggregate value...
}
```

This means:
- **count** only counts numeric values, not all data points
- A point with only `bool`/`string` fields produces no aggregated output
- `null` values (missing fields) are also excluded from all aggregation functions
:::

## Cascading Aggregation

Higher levels aggregate from already-aggregated data using `Merge()` logic:

| Function | Hourly (from raw) | Daily/Monthly/Yearly (from previous level) |
|----------|-------------------|--------------------------------------------|
| **sum** | `sum += value` | `sum += child.sum` |
| **min** | `min = min(min, value)` | `min = min(min, child.min)` |
| **max** | `max = max(max, value)` | `max = max(max, child.max)` |
| **count** | `count++` per numeric value | `count += child.count` |
| **avg** | `avg = sum / count` | `avg = sum / count` (recomputed) |

### How `avg` Works Across Levels

`avg` is **never merged directly** — it is always recomputed from `sum` and `count`:

```
Hourly bucket A: sum=100, count=10 → avg=10.0
Hourly bucket B: sum=200, count=20 → avg=10.0

Daily (merge A+B):
  sum   = 100 + 200     = 300
  count = 10 + 20       = 30
  avg   = 300 / 30      = 10.0   ✅ correct
  avg   ≠ (10.0+10.0)/2 = 10.0   ← same here by coincidence, but NOT the formula used
```

This is critical because averaging averages produces incorrect results when bucket sizes differ:

```
Hourly bucket A: sum=100, count=5  → avg=20.0
Hourly bucket B: sum=200, count=20 → avg=10.0

Daily (merge A+B):
  sum   = 100 + 200     = 300
  count = 5 + 20        = 25
  avg   = 300 / 25      = 12.0   ✅ correct weighted average
  avg   ≠ (20.0+10.0)/2 = 15.0   ❌ wrong (naive average of averages)
```

### How `count` Accumulates

`count` represents the **number of numeric values** aggregated, not the number of data points:

```
Raw points for field "temperature" in hour 10:00-11:00:
  point1: temperature=25.0   → count++  (numeric)
  point2: temperature=null   → skipped  (missing)
  point3: temperature=26.5   → count++  (numeric)

Hourly result: count=2, sum=51.5, avg=25.75
```

At higher levels, counts from child buckets are summed:

```
Hourly 10:00: count=2
Hourly 11:00: count=3
Hourly 12:00: count=1

Daily: count = 2 + 3 + 1 = 6
```

This avoids re-reading raw data for daily/monthly/yearly levels.

## Storage Format

Aggregation results use V6 columnar format with device groups:

```
agg/
├── agg_1h/
│   └── group_0000/mydb/sensors/2026/01/15/
│       ├── _metadata.idx
│       └── dg_0000/
│           ├── _metadata.idx
│           └── part_0000.bin
├── agg_1d/
├── agg_1M/
└── agg_1y/
```

Each part file stores per-metric columns (sum, avg, min, max, count) for each aggregated field.

## Timezone Support

All aggregation levels apply a configurable timezone for time truncation. This ensures hourly buckets align with local time boundaries, not just UTC.
