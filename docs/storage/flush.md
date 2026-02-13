---
id: flush
title: Flush Mechanism
sidebar_position: 3
---

# Flush Mechanism

The flush mechanism transfers data from WAL segments to persistent V6 columnar storage on disk. It is **event-driven**, triggered by WAL segment boundaries rather than timers or buffer sizes.

## Overview

Flush is handled by the **FlushWorkerPool** — one worker per partition key (`db:collection:date`). Workers are created on-demand and destroyed when idle.

## Trigger Model

The flush is triggered in three ways:

1. **WAL segment boundary** (primary): When a new WAL segment is created, the WriteWorkerPool sends a `WriteNotification` to the FlushWorkerPool
2. **WAL segment count**: When accumulated WAL segments exceed `max_wal_segments` threshold
3. **Manual**: Via admin API `POST /v1/admin/flush`

Critical design: notifications fire on **segment boundaries**, not per record, drastically reducing overhead.

## Flush Pipeline

```
WriteNotification (new WAL segment)
    │
    ▼
FlushWorkerPool.dispatchLoop()
    │
    ▼
getOrCreateWorker(db, collection, date)
    │
    ▼
FlushWorker:
    ├── 1. PrepareFlushPartition()  → rotate WAL segment, return old files
    ├── 2. Read each segment file   → convert to []*DataPoint
    ├── 3. TieredStorage.WriteBatch(points)
    │       ├── Group by GroupID
    │       └── Per-group Storage.WriteBatch()
    │           ├── Group by date → storageFileKey
    │           ├── Assign devices to DGs (or create new ones)
    │           ├── Write V6 part files to .tmp
    │           ├── Write DG _metadata.idx
    │           ├── Write global _metadata.idx
    │           └── ATOMIC BATCH RENAME (.tmp → final)
    ├── 4. Remove processed WAL segments
    └── 5. Notify AggregationPipeline → FlushCompleteEvent
```

## Atomic Writes

All files are written atomically using a batch rename pattern:

```
1. Write all files to .tmp:   part_0001.bin.tmp, _metadata.idx.tmp
2. Batch rename all at once:  part_0001.bin.tmp → part_0001.bin
```

This guarantees that partial writes never corrupt existing data. If a crash occurs during write, only `.tmp` files exist and are cleaned up on restart.

## Append-Only Strategy

Flush uses an **append-only** write strategy:
- New data creates new part files in existing device groups
- No read-back of old data during writes (zero read amplification)
- The `CompactionWorker` merges small parts later (when a DG has > 4 parts)

## Configuration

```yaml
storage:
  flush:
    interval: 5m           # Periodic flush interval
    max_records: 50000     # Max record count before flush
    max_wal_segments: 5    # Max WAL segments before flush
  multipart:
    max_rows_per_part: 100000    # Split when rows >= 100K
    max_part_size: 67108864      # Safety limit: 64MB per part
    min_rows_per_part: 1000      # Don't split below 1K rows
    max_devices_per_group: 50    # Max devices per device group
```
