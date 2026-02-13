---
id: shard-management
title: Shard Management
sidebar_position: 2
---

# Shard Management

Soltix uses **device-based group sharding** to distribute data across storage nodes. Each `(database, collection, device_id)` tuple is deterministically mapped to a logical group.

## Group Concept

A **group** is a logical partition of data. All data points for a given `(database, collection, device_id)` belong to the same group. Groups are numbered from `0` to `TotalGroups - 1` (configurable, default: 256).

## Hash Function

Group ID is computed using FNV-32a:

```
GroupID = FNV32a(database + ":" + collection + ":" + device_id) % TotalGroups
```

This ensures:
- **Deterministic**: Same `(db, collection, device_id)` always maps to the same group
- **Uniform**: FNV-32a provides good distribution across groups
- **Stable**: Adding/removing nodes does NOT change group IDs — only group-to-node mapping changes

## Group Assignment

Each group has an assignment record persisted in etcd:

```json
{
  "group_id": 42,
  "primary_node": "storage-node-01",
  "replica_nodes": ["storage-node-02", "storage-node-03"],
  "state": "active",
  "epoch": 3,
  "updated_at": "2026-01-15T10:30:00Z"
}
```

### Group States

| State | Meaning |
|-------|--------|
| `active` | Normal operation — reads and writes are served |
| `syncing` | Data is being synced to a new replica |
| `rebalancing` | Group is being moved between nodes |

## Write Routing

When a write arrives for a specific device:

1. Compute `GroupID = FNV32a(db:collection:device_id) % TotalGroups`
2. Check in-memory cache for `GroupAssignment`
3. If not cached → load from etcd
4. If not in etcd → create new group (auto-assign nodes)
5. Publish to message queue for all assigned nodes (primary + replicas)

Groups are **created lazily** on first write — no need to pre-create all groups.

## Adaptive Hashing (Node Selection)

When creating a new group, nodes are selected using an **AdaptiveHasher** that automatically switches strategy based on cluster size:

| Cluster Size | Strategy | Reason |
|-------------|----------|--------|
| < 20 nodes | Rendezvous Hashing | Better distribution for small clusters |
| ≥ 20 nodes | Consistent Hashing (200 vnodes/node) | O(log N) lookups for large clusters |

## GroupAutoAssigner

A background goroutine running in the **Router** process:

- Polls etcd for node changes at configurable intervals (default: 15s)
- Detects node joins/leaves and triggers:
  - **Full assignment** (first run): distribute all groups across available nodes
  - **Incremental assignment**: new nodes get unassigned groups
  - **Rebalance**: when group count difference exceeds threshold
- Distributes groups evenly across active storage nodes

## Configuration

```yaml
coordinator:
  hash_threshold: 20         # Switch from rendezvous to consistent hash
  vnode_count: 200           # Virtual nodes per physical node
  replica_factor: 3          # Replicas per group
  total_groups: 256          # Total logical groups
  auto_assigner:
    enabled: true
    poll_interval: 15s
    rebalance_on_join: true
    rebalance_threshold: 10  # Max group count diff before rebalance
```

## Admin API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/admin/groups` | List all groups with assignments |
| GET | `/v1/admin/groups/:id` | Get specific group assignment |
| GET | `/v1/admin/nodes/:id/groups` | Get all groups for a node |
| GET | `/v1/admin/devices/:id/group` | Look up which group a device belongs to |
