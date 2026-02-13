---
id: wal
title: Write-Ahead Log
sidebar_position: 2
---

# Write-Ahead Log (WAL)

The WAL ensures data durability. Every write is persisted to WAL before being stored in the main storage engine, preventing data loss on crash.

## Key Features

- **Partitioned by db/collection/date**: Each partition gets its own Writer instance
- **Batch Writer**: Groups commits with 10ms flush interval for optimal I/O
- **Protobuf Encoding**: Entries serialized with Protocol Buffers, framed with CRC32 checksums
- **Segment Rotation**: Max 64MB per segment file, automatic rotation
- **Event-Driven Flush**: FlushWorkerPool is notified only on new segment boundaries (not per record)

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                  PartitionedWriter                    │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Partition: db1/sensors/2026-01-29              │  │
│  │  ┌──────────────────────────────────────────┐   │  │
│  │  │  batchWriter                             │   │  │
│  │  │  Buffer → flushLoop (10ms) → baseWAL     │   │  │
│  │  │  Returns WriteResult{IsNewSegment: bool} │   │  │
│  │  └──────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Partition: db1/metrics/2026-01-29              │  │
│  │  (lazy-created, idle cleanup after 10 min)      │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Entry Format

Each WAL entry is protobuf-encoded and framed:

```
[4 bytes: entry size] [N bytes: protobuf data] [4 bytes: CRC32 checksum]
```

Entry fields:

```go
type Entry struct {
    Type       EntryType   // Write or Delete
    Database   string
    Collection string
    ShardID    string
    GroupID    int
    Time       string      // RFC3339 timestamp
    ID         string      // device_id
    Fields     map[string]interface{}
    Timestamp  int64       // Unix timestamp
}
```

## Segment Files

```
data/wal/
├── db1/
│   └── sensors/
│       └── 2026-01-29/
│           ├── wal-1706486400000.log  (64MB max per segment)
│           ├── wal-1706486500000.log
│           └── ...
```

Segments are rotated when they reach 64MB. Old segments are removed after successful flush to TieredStorage.

## Write Modes

### Async Write (Default)
- ~137ns per write
- Entries buffered in memory, flushed every 10ms or when batch size reached (1000 entries)
- Best for high-throughput scenarios

### Sync Write
- ~18ms per write
- Adds a notification channel, blocks until flush completes
- Guaranteed durability per write

### Batch Write
- Bulk insert of multiple entries in a single call
- Entries are buffered and flushed together

## Flush Integration

The WAL integrates with the FlushWorkerPool through an event-driven model:

1. `WriteWorkerPool` writes entries to the `PartitionedWriter`
2. When a new segment is created, `WriteResult.IsNewSegment = true`
3. `FlushWorkerPool` is notified only on new segments (not per record)
4. `FlushWorker` calls `PrepareFlushPartition()` — rotates segment, returns old files
5. Old segments are read, data flushed to TieredStorage, then segment files removed

## Recovery

On startup, WAL replays uncommitted entries:
1. Scan all partition directories for segment files
2. Read entries segment-by-segment
3. Recent data → MemoryStore; all data → flush to TieredStorage
4. Processed segments are removed after successful recovery
