---
id: configuration
title: Configuration
sidebar_position: 2
---

# Configuration

Soltix uses a YAML configuration file for both the Router and Storage services. Configuration is loaded via [Viper](https://github.com/spf13/viper) with support for file-based config, default values, and environment variable overrides.

## Loading Order

Both services accept a `-config` flag to specify the config file path:

```bash
./router -config ./configs/config.yaml
./storage -config ./configs/config.yaml
```

If no `-config` flag is provided, Soltix searches for `config.yaml` in the following locations (in order):

1. Current working directory (`./`)
2. `./configs/`
3. `./config/`
4. `/etc/soltix/`

If no config file is found, the service starts with default values.

## Environment Variable Overrides

All config values can be overridden via environment variables with the `SOLTIX_` prefix. Nested keys use `_` as separator:

```bash
export SOLTIX_SERVER_HTTP_PORT=5555
export SOLTIX_STORAGE_NODE_ID=node-02
export SOLTIX_QUEUE_TYPE=redis
export SOLTIX_LOGGING_LEVEL=debug
```

## Full Configuration Reference

### server

Network settings for HTTP and gRPC servers.

```yaml
server:
  host: 0.0.0.0
  http_port: 5555
  grpc_port: 5556
  grpc_host: "localhost"
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `host` | string | `0.0.0.0` | Bind address for both HTTP and gRPC servers |
| `http_port` | int | `5555` | HTTP API port (1-65535) |
| `grpc_port` | int | `5556` | gRPC inter-service port (1-65535, must differ from `http_port`) |
| `grpc_host` | string | `""` | Advertise address for gRPC service discovery. Used as fallback when `host` is `0.0.0.0` and auto IP detection fails. Set this in Docker/VM environments with complex networking |

### storage

Storage engine settings. Used by the Storage service only.

```yaml
storage:
  node_id: storage-node-01
  data_dir: ./data
  timezone: "UTC"
  memory_store:
    max_age: 2h
    max_size: 100000
  flush:
    interval: 5m
    max_records: 50000
    max_wal_segments: 10
  multipart:
    max_rows_per_part: 100000
    max_part_size: 67108864
    min_rows_per_part: 1000
    max_devices_per_group: 50
  sync:
    enabled: true
    startup_sync: true
    startup_timeout: 5m
    sync_batch_size: 1000
    max_concurrent_syncs: 5
    anti_entropy:
      enabled: true
      interval: 1h
      batch_size: 10000
```

#### storage (root)

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| `node_id` | string | `storage-default-node` | Yes | Unique identifier for this storage node. Must be unique across the cluster |
| `data_dir` | string | `./data` | Yes | Root directory for all persistent data (WAL, V6 part files, aggregations) |
| `timezone` | string | `UTC` | No | Timezone for data storage, sharding, and file organization. Supports IANA format (`Asia/Tokyo`, `America/New_York`) or offset format (`+09:00`, `-05:00`) |

#### storage.memory_store

Hot data cache for recent writes. Data within `max_age` is kept in memory for fast reads.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_age` | duration | `2h` | How long to keep data in memory. Data older than this is only available on disk |
| `max_size` | int | `100000` | Maximum number of records in memory across all 64 shards |

#### storage.flush

Controls when data is flushed from WAL to disk (V6 columnar files).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `interval` | duration | `5m` | Time-based flush trigger interval |
| `max_records` | int | `50000` | Flush when record count in WAL exceeds this threshold |
| `max_wal_segments` | int | `10` | Flush when WAL segment count exceeds this threshold |

#### storage.multipart

V6 columnar part file settings. Controls how data is split across part files.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_rows_per_part` | int | `100000` | Primary split criterion — create new part file when row count exceeds this |
| `max_part_size` | int64 | `67108864` (64 MB) | Safety limit — split if part file exceeds this size in bytes |
| `min_rows_per_part` | int | `1000` | Don't split if part has fewer rows than this |
| `max_devices_per_group` | int | `50` | Maximum devices per device group (DG). New DG created when exceeded |

#### storage.sync

Replica synchronization settings for multi-node deployments.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Enable sync functionality |
| `startup_sync` | bool | `true` | Recover missed data from replicas on node startup |
| `startup_timeout` | duration | `5m` | Maximum time to wait for startup sync to complete |
| `sync_batch_size` | int | `1000` | Batch size when writing synced data points |
| `max_concurrent_syncs` | int | `5` | Maximum number of concurrent shard syncs during startup |

#### storage.sync.anti_entropy

Background consistency checker that compares checksums between replicas.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Enable anti-entropy background process |
| `interval` | duration | `1h` | How often to run checksum comparison |
| `batch_size` | int | `10000` | Number of data points per checksum batch |

### etcd

etcd connection settings. etcd is required for cluster coordination, node registry, and group assignment.

```yaml
etcd:
  endpoints:
    - http://localhost:2379
  dial_timeout: 5s
  username: ""
  password: ""
```

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| `endpoints` | string[] | `["http://localhost:2379"]` | Yes | List of etcd server endpoints |
| `dial_timeout` | duration | `5s` | No | Connection timeout. Must be positive |
| `username` | string | `""` | No | etcd authentication username |
| `password` | string | `""` | No | etcd authentication password |

### queue

Message queue configuration. Writes flow through the queue from Router to Storage nodes.

```yaml
queue:
  type: "nats"
  url: nats://localhost:4222
  username: ""
  password: ""
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `type` | string | `nats` | Queue backend: `nats`, `redis`, `kafka`, or `memory` |
| `url` | string | `nats://localhost:4222` | Server URL (NATS or Redis) |
| `username` | string | `""` | Authentication username (NATS) |
| `password` | string | `""` | Authentication password (NATS) |

#### Redis-specific options

Used when `type: "redis"`:

```yaml
queue:
  type: "redis"
  url: localhost:6379
  redis_db: 0
  redis_stream: "soltix"
  redis_group: "soltix-group"
  redis_consumer: "soltix-consumer-01"
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `redis_db` | int | `0` | Redis database number |
| `redis_stream` | string | `soltix` | Redis stream name prefix |
| `redis_group` | string | `soltix-group` | Redis consumer group name |
| `redis_consumer` | string | hostname | Redis consumer name (unique per node) |

#### Kafka-specific options

Used when `type: "kafka"`:

```yaml
queue:
  type: "kafka"
  kafka_brokers: ["localhost:9092"]
  kafka_group_id: "soltix-consumers"
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `kafka_brokers` | string[] | `["localhost:9092"]` | Kafka broker addresses |
| `kafka_group_id` | string | `soltix-consumers` | Kafka consumer group ID |

#### Memory queue

Used when `type: "memory"`. No additional options. For testing only — data is not persisted and not shared between processes.

### coordinator

Sharding and group assignment settings. Used by the Router service.

```yaml
coordinator:
  hash_threshold: 20
  vnode_count: 200
  replica_factor: 3
  total_groups: 256
  auto_assigner:
    enabled: true
    poll_interval: 15s
    rebalance_on_join: true
    rebalance_threshold: 10
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `hash_threshold` | int | `20` | Node count threshold to switch from Rendezvous hashing (better distribution for small clusters) to Consistent hashing (O(log N) lookups for large clusters) |
| `vnode_count` | int | `200` | Virtual nodes per physical node when using consistent hashing |
| `replica_factor` | int | `3` | Number of replica nodes per group assignment |
| `total_groups` | int | `256` | Total number of logical groups for device-based sharding. Devices are mapped via `FNV32a(db:collection:device_id) % total_groups` |

#### coordinator.auto_assigner

Automatic group-to-node assignment and rebalancing.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `true` | Enable automatic group assignment |
| `poll_interval` | duration | `15s` | How often to check etcd for node changes |
| `rebalance_on_join` | bool | `true` | Rebalance groups when a new node joins the cluster |
| `rebalance_threshold` | int | `10` | Maximum group count difference between nodes before triggering rebalance |

### replication

Data replication settings.

```yaml
replication:
  factor: 3
  strategy: async
  min_replicas_for_write: 1
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `factor` | int | `3` | Number of replicas per data shard (1-10) |
| `strategy` | string | `async` | Replication strategy: `async` (non-blocking) or `sync` (wait for all replicas) |
| `min_replicas_for_write` | int | `1` | Minimum replicas that must acknowledge a write. Must be between 1 and `factor` |

### auth

API key authentication. Used by the Router service.

```yaml
auth:
  enabled: true
  api_keys:
    - "your-api-key-with-at-least-32-characters"
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | bool | `false` | Enable API key authentication. When `false`, all requests are allowed |
| `api_keys` | string[] | `[]` | List of valid API keys. Each key must be at least 32 characters |

When enabled, clients must pass the API key via one of these headers:
- `X-API-Key: <key>`
- `Authorization: Bearer <key>`
- `Authorization: ApiKey <key>`

### logging

Logging configuration.

```yaml
logging:
  level: info
  format: json
  output_path: stdout
  time_format: RFC3339
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `level` | string | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `format` | string | `json` | Output format: `json` or `console` |
| `output_path` | string | `stdout` | Output destination: `stdout`, `stderr`, or a file path |
| `time_format` | string | `RFC3339` | Timestamp format in log output |

## Example Configurations

### Minimal (single node, development)

```yaml
server:
  http_port: 5555
  grpc_port: 5556

storage:
  node_id: dev-node
  data_dir: ./data

etcd:
  endpoints:
    - http://localhost:2379

queue:
  type: "memory"

auth:
  enabled: false

logging:
  level: debug
  format: console
```

### Production (multi-node with NATS)

```yaml
server:
  host: 0.0.0.0
  http_port: 5555
  grpc_port: 5556
  grpc_host: "192.168.1.100"

storage:
  node_id: storage-node-01
  data_dir: /var/lib/soltix/data
  timezone: "UTC"
  memory_store:
    max_age: 24h
    max_size: 100000
  flush:
    interval: 5m
    max_records: 50000
    max_wal_segments: 10
  multipart:
    max_rows_per_part: 100000
    max_part_size: 67108864
    min_rows_per_part: 1000
    max_devices_per_group: 50
  sync:
    enabled: true
    startup_sync: true
    startup_timeout: 5m
    max_concurrent_syncs: 5
    anti_entropy:
      enabled: true
      interval: 1h

etcd:
  endpoints:
    - http://etcd-1:2379
    - http://etcd-2:2379
    - http://etcd-3:2379
  dial_timeout: 5s

queue:
  type: "nats"
  url: nats://nats:4222

coordinator:
  total_groups: 256
  replica_factor: 3
  auto_assigner:
    enabled: true
    poll_interval: 15s
    rebalance_on_join: true

replication:
  factor: 3
  strategy: async
  min_replicas_for_write: 1

auth:
  enabled: true
  api_keys:
    - "your-production-api-key-at-least-32-characters-long"

logging:
  level: info
  format: json
  output_path: /var/log/soltix/soltix.log
```

### Docker

```yaml
server:
  host: 0.0.0.0
  http_port: 5555
  grpc_port: 5556
  grpc_host: "storage"

storage:
  node_id: storage-node-01
  data_dir: /app/data
  timezone: "UTC"

etcd:
  endpoints:
    - http://etcd:2379

queue:
  type: "nats"
  url: nats://nats:4222
```

In Docker, use container/service names (`etcd`, `nats`, `storage`) instead of `localhost`.

### With Redis Queue

```yaml
queue:
  type: "redis"
  url: localhost:6379
  redis_db: 0
  redis_stream: "soltix"
  redis_group: "soltix-group"
  redis_consumer: "consumer-01"
```

### With Kafka Queue

```yaml
queue:
  type: "kafka"
  kafka_brokers:
    - "kafka-1:9092"
    - "kafka-2:9092"
    - "kafka-3:9092"
  kafka_group_id: "soltix-consumers"
```

## Validation Rules

The following validation rules are enforced at startup:

| Section | Rule |
|---------|------|
| `server.http_port` | Must be 1-65535 |
| `server.grpc_port` | Must be 1-65535, must differ from `http_port` |
| `storage.data_dir` | Required, cannot be empty |
| `storage.memory_store.max_age` | Must be positive |
| `storage.memory_store.max_size` | Must be positive |
| `etcd.endpoints` | At least one endpoint required |
| `etcd.dial_timeout` | Must be positive |
| `replication.factor` | Must be 1-10 |
| `replication.strategy` | Must be `sync` or `async` |
| `replication.min_replicas_for_write` | Must be between 1 and `replication.factor` |
| `logging.level` | Must be `debug`, `info`, `warn`, or `error` |
| `logging.format` | Must be `json` or `console` |

If validation fails, the service exits with an error message indicating the invalid field.
