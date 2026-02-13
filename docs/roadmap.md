---
id: roadmap
title: Roadmap
sidebar_position: 11
---

# Roadmap

## Completed

- [x] Core time-series storage engine
- [x] WAL with batch writer and partitioned storage
- [x] V6 columnar format (single-file parts with footer index)
- [x] Adaptive compression (Gorilla, Delta, Dictionary, Bool + Snappy)
- [x] 3-tier group-aware TieredStorage (Group → Device → Partition)
- [x] 64-shard MemoryStore for hot data
- [x] Event-driven FlushWorkerPool
- [x] Background CompactionWorker
- [x] Multi-level aggregation pipeline (1h/1d/1M/1y cascading)
- [x] Device-based sharding with GroupAutoAssigner
- [x] Adaptive hashing (Rendezvous + Consistent)
- [x] NATS/Redis/Kafka/Memory message queue support
- [x] gRPC inter-service communication with connection pooling
- [x] Scatter-gather QueryCoordinator
- [x] API key authentication (X-API-Key, Bearer, ApiKey)
- [x] Timezone support
- [x] SSE Streaming API with chunk_size/chunk_interval
- [x] Async CSV/JSON download API
- [x] Built-in anomaly detection (Z-Score, IQR, Moving Average, Auto)
- [x] Built-in forecasting (SMA, Exponential, Linear, Holt-Winters, ARIMA, Prophet, Auto)
- [x] Post-processing pipeline (downsampling: LTTB, MinMax, Average, M4)
- [x] Group-scoped replication with startup sync and anti-entropy
- [x] Node registration with etcd lease-based heartbeats
- [x] Docker deployment
- [x] Documentation site (Docusaurus)

## In Progress

- [ ] Web-based admin dashboard
- [ ] Grafana plugin
- [ ] S3/GCS cold storage tier

## Planned

- [ ] Prometheus remote write/read integration
- [ ] Automated backup and restore
- [ ] Multi-tenancy
- [ ] SQL-like query language

## Contributing

We welcome contributions! Please see the [GitHub repository](https://github.com/soltixdb/soltix) for details.
