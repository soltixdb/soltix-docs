---
id: write
title: Write API
sidebar_position: 4
---

# Write API

Soltix provides two write endpoints: single-point write and batch write. Both accept flat JSON with dynamic fields — any key besides `time` and `id` is treated as a data field.

## Single Write

```
POST /v1/databases/:database/collections/:collection/write
```

### Request Body

Flat JSON object. `time` and `id` are required; all other keys become data fields.

```json
{
  "time": "2026-01-15T12:00:00Z",
  "id": "sensor-001",
  "temperature": 25.5,
  "humidity": 60.2,
  "active": true,
  "location": "warehouse-A"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `time` | string | Yes | Timestamp in RFC 3339 format |
| `id` | string | Yes | Device ID — used for shard routing |
| `*` | any | No | Dynamic data fields (float, int, string, bool) |

### Success Response

**202 Accepted** — write queued for processing via message queue.

```json
{
  "group_id": 42,
  "success_nodes": ["storage-1", "storage-2"],
  "status": "accepted",
  "message": "Write request accepted and queued for processing"
}
```

### Partial Success

If some replica nodes fail to receive the message, the write is still accepted:

```json
{
  "group_id": 42,
  "success_nodes": ["storage-1"],
  "status": "partial",
  "failed_nodes": ["storage-2"],
  "message": "Write queued to 1/2 nodes. Some replicas may be missing."
}
```

## Batch Write

```
POST /v1/databases/:database/collections/:collection/write/batch
```

### Request Body

Array of points wrapped in a `points` field. Each point follows the same format as single write.

```json
{
  "points": [
    {
      "time": "2026-01-15T12:00:00Z",
      "id": "sensor-001",
      "temperature": 25.5,
      "humidity": 60.2
    },
    {
      "time": "2026-01-15T12:00:00Z",
      "id": "sensor-002",
      "temperature": 22.1,
      "humidity": 55.0
    },
    {
      "time": "2026-01-15T12:01:00Z",
      "id": "sensor-001",
      "temperature": 25.8
    }
  ]
}
```

Points can belong to different devices and have different fields — the Router groups them by shard automatically.

### Success Response

**202 Accepted**

```json
{
  "total_points": 3,
  "published_count": 6,
  "group_count": 2,
  "success_nodes": ["storage-1", "storage-2"],
  "status": "accepted",
  "message": "Batch write request accepted and queued for processing"
}
```

`published_count` may exceed `total_points` because each point is replicated to all nodes in its group assignment (primary + replicas).

## Write Flow

```
Client → Router → ShardRouter → Message Queue → Storage Node(s)
```

1. Router validates the request and infers field types
2. `ShardRouter` computes `GroupID = FNV32a(db:collection:device_id) % TotalGroups`
3. Resolves group to primary + replica nodes via etcd
4. Publishes serialized message to `soltix.write.node.<nodeID>` for each node
5. Storage subscriber receives → WAL → MemoryStore → eventual flush to disk

## Field Type Detection

Field types are automatically inferred on first write and tracked in collection metadata:

| JSON Value | Inferred Type |
|------------|---------------|
| `25.5` | float |
| `100` | int |
| `"warehouse-A"` | string |
| `true` / `false` | bool |
| `null` | null (skipped) |

## Validation Rules

| Rule | HTTP Status | Error Code |
|------|-------------|------------|
| Invalid JSON body | 400 | `INVALID_REQUEST` |
| Missing `time` field | 400 | `INVALID_REQUEST` |
| Missing `id` field | 400 | `INVALID_REQUEST` |
| `time` not in RFC 3339 format | 400 | `INVALID_TIME_FORMAT` |
| Database or collection not found | 404 | `COLLECTION_NOT_FOUND` |
| Shard routing failure | 500 | `ROUTING_ERROR` |
| All queue nodes unreachable | 503 | `QUEUE_UNAVAILABLE` |

For batch writes, validation fails the **entire batch** on the first invalid point.

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INVALID_TIME_FORMAT",
    "message": "Invalid time format. Expected RFC3339 format: 2006-01-02T15:04:05Z07:00",
    "path": "/v1/databases/mydb/collections/sensors/write"
  }
}
```

## cURL Examples

### Single write

```bash
curl -X POST http://localhost:8080/v1/databases/mydb/collections/sensors/write \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "time": "2026-01-15T12:00:00Z",
    "id": "sensor-001",
    "temperature": 25.5,
    "humidity": 60.2
  }'
```

### Batch write

```bash
curl -X POST http://localhost:8080/v1/databases/mydb/collections/sensors/write/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "points": [
      {"time": "2026-01-15T12:00:00Z", "id": "sensor-001", "temperature": 25.5},
      {"time": "2026-01-15T12:00:00Z", "id": "sensor-002", "temperature": 22.1},
      {"time": "2026-01-15T12:01:00Z", "id": "sensor-001", "temperature": 25.8}
    ]
  }'
```
