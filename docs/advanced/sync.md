---
id: sync
title: Data Synchronization
sidebar_position: 3
---

# Data Synchronization

Soltix supports data synchronization between storage nodes for replication and disaster recovery. Sync operates at the **group scope** — only replicas within the same group sync with each other.

## Replication Architecture

### Write Replication

During writes, the Router publishes messages to **all nodes** in a group's assignment (primary + replicas) via the message queue. This provides write-time replication without any sync overhead.

### Startup Sync

When a storage node restarts, it recovers missed data from other replicas:

1. Query etcd for groups assigned to this node
2. For each group, find the last local timestamp
3. Get active replicas from etcd
4. Stream missing data via gRPC from replicas
5. Write received data through the normal WAL → MemoryStore → flush path

Startup sync runs with a configurable concurrency semaphore (default: 5 concurrent group syncs).

### Anti-Entropy

A background process that runs periodically (default: every 1 hour) to detect and repair data inconsistencies:

1. For each group assigned to this node:
   - Compute local **SHA-256 checksum** over sorted data points in a 24-hour window
   - Request checksums from replica nodes via gRPC
2. Compare checksums
3. On mismatch: trigger full sync for that group to repair

## Configuration

```yaml
storage:
  sync:
    enabled: true              # Enable sync functionality
    startup_sync: true         # Sync from replicas on node startup
    startup_timeout: 5m        # Timeout for startup sync
    sync_batch_size: 1000      # Points per batch when syncing
    max_concurrent_syncs: 5    # Max concurrent group syncs
    anti_entropy:
      enabled: true            # Enable anti-entropy background checker
      interval: 1h             # Check interval for consistency
      batch_size: 10000        # Batch size for checksum calculation

replication:
  factor: 3                    # Number of replicas per group
  strategy: async              # async or sync
  min_replicas_for_write: 1    # Min replicas required for write ack
```

## Sync Components

| Component | Description |
|-----------|-------------|
| **SyncManager** | Orchestrates startup sync and on-demand sync |
| **AntiEntropy** | Background checksum comparison and auto-repair |
| **LocalStorageAdapter** | Bridges MemoryStore + TieredStorage to sync interface |
| **EtcdMetadataManager** | Reads node/group metadata from etcd |
| **RemoteSyncClient** | gRPC client for streaming data from replicas |

## Group-Scoped Sync

Sync is scoped to individual groups:
- Each group has a `primary_node` and `replica_nodes`
- Sync only occurs between nodes that share the same group
- This minimizes cross-node traffic compared to full-node sync
- Group state transitions: `active` → `syncing` → `active`

## Data Integrity

Checksum calculation:
- Sort all data points by `(device_id, timestamp)` within the time window
- Compute SHA-256 over the sorted, serialized data
- Compare with remote replicas
- Any mismatch triggers a full resync for that group
