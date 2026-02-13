---
id: benchmark
title: Benchmark Results
sidebar_position: 10
---

# Benchmark Results

Performance benchmarks for Soltix components.

## Write Performance

| Metric | Value |
|--------|-------|
| Async WAL Write | ~137 ns/op |
| Sync WAL Write | ~18 ms/op |
| Batch Flush | ~50ms for 10K points |
| End-to-end Write | < 1ms (async) |

## Query Performance

| Metric | Value |
|--------|-------|
| Point Query | < 5ms |
| Range Query (1 day) | < 50ms |
| Range Query (1 month) | < 200ms |
| Aggregated Query | < 100ms |

## Aggregation Performance

| Level | Throughput |
|-------|-----------|
| Hourly | ~10K points/sec |
| Daily | ~50K points/sec |
| Monthly | ~100K points/sec |

## Compression Ratios

| Data Type | Encoder | Ratio |
|-----------|---------|-------|
| float64 | Gorilla (XOR bit-packing) | 3-5x |
| int64 / timestamps | Delta + ZigZag + Varint | 8-10x |
| string | Dictionary + Varint | 5-10x |
| bool | Bitmap | up to 64x |
| Overall (with Snappy) | Column encoder + Snappy | 4-6x |

## Hardware

Benchmarks run on:
- **CPU**:  Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
- **RAM**: 16GB
- **Storage**: NVMe SSD
- **OS**: macOS
- **Go**: 1.21+

For detailed benchmark scripts, see `scripts/run_benchmarks.sh`.
