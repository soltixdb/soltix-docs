---
id: getting-started
title: Getting Started
sidebar_position: 1
slug: /getting-started
---

# Getting Started with Soltix

Soltix is a high-performance distributed time-series database built with Go, designed for IoT and sensor data. It uses a **two-service architecture** (Router + Storage) with device-based sharding, V6 columnar storage, adaptive compression, and multi-level aggregation to handle millions of data points efficiently.

## Features

- **High Performance**: 10K+ writes/sec and sub-100ms query latency
- **Adaptive Compression**: Gorilla (float64), Delta (int64), Dictionary (string), Bool (bitmap), all wrapped with Snappy
- **V6 Columnar Storage**: Single-file parts with footer-based index for fast direct seeks
- **Device-Based Sharding**: FNV-32a hash of `(db, collection, device_id)` distributes data across logical groups
- **Multi-Level Aggregation**: Pre-computed 1h/1d/1M/1y aggregates with cascading pipeline
- **Scatter-Gather Queries**: QueryCoordinator fans out to storage nodes via gRPC, merges results
- **Hot/Cold Data**: 64-shard MemoryStore for recent data, columnar files for historical data
- **Pluggable Message Queue**: NATS JetStream (default), Redis Streams, Kafka, or in-memory
- **Built-in Analytics**: Anomaly detection (Z-Score, IQR, Moving Average) and forecasting (SMA, Linear, Holt-Winters, ARIMA, Prophet)
- **Streaming & Download**: SSE streaming API and async CSV/JSON download
- **API Key Authentication**: Supports X-API-Key, Bearer, and ApiKey headers

## Quick Start

### Prerequisites

- Go 1.21+
- NATS Server (or Redis/Kafka for message queue)
- etcd (for metadata and coordination)

### Installation

```bash
# Clone the repository
git clone https://github.com/soltixdb/soltix.git
cd soltix

# Build
make build

# Or build for specific platform
make build-linux
make build-darwin
```

### Configuration

Copy and edit the sample configuration:

```bash
cp configs/config.yaml.sample configs/config.yaml
```

Key configuration sections:

```yaml
server:
  http_port: 5555
  grpc_port: 5556
  host: 0.0.0.0

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
    max_wal_segments: 5

etcd:
  endpoints:
    - http://localhost:2379
  dial_timeout: 5s

queue:
  type: "nats"
  url: nats://localhost:4222

coordinator:
  total_groups: 256
  auto_assigner:
    enabled: true
    poll_interval: 15s

auth:
  enabled: true
  api_keys:
    - "your-api-key-min-32-characters-long-here"
```

### Running

```bash
# Start Router service
./bin/router -config configs/config.yaml

# Start Storage service
./bin/storage -config configs/config.yaml
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# With Kafka
docker-compose -f docker-compose.kafka.yml up -d
```

## Write Data

### Single Point

```bash
curl -X POST http://localhost:5555/v1/databases/mydb/collections/sensors/write \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "time": "2026-01-01T00:00:00Z",
    "id": "sensor-001",
    "temperature": 25.5,
    "humidity": 60.2
  }'
```

All keys except `time` and `id` are treated as field values.

### Batch Write

```bash
curl -X POST http://localhost:5555/v1/databases/mydb/collections/sensors/write/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "points": [
      {"time": "2026-01-01T00:00:00Z", "id": "sensor-001", "temperature": 25.5},
      {"time": "2026-01-01T00:00:01Z", "id": "sensor-002", "temperature": 26.0}
    ]
  }'
```

## Query Data

```bash
curl "http://localhost:5555/v1/databases/mydb/collections/sensors/query?\
device_id=sensor-001&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z" \
  -H "X-API-Key: your-api-key"
```

### With Aggregation

```bash
curl "http://localhost:5555/v1/databases/mydb/collections/sensors/query?\
device_id=sensor-001&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-08T00:00:00Z&\
interval=1h&\
aggregation=avg" \
  -H "X-API-Key: your-api-key"
```

## Next Steps

- [Architecture Overview](./architecture/overview) — Understand the system design
- [API Authentication](./api/authentication) — Set up API keys
- [Storage Layer](./storage/overview) — Learn about the storage engine
- [Aggregation Pipeline](./aggregation/pipeline) — Pre-computed aggregates
- [Streaming API](./api/streaming) — Real-time SSE streaming
- [Anomaly Detection](./advanced/anomaly-detection) — Built-in analytics
