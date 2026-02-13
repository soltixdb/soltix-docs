---
id: downsampling
title: Downsampling
sidebar_position: 2
---

# Downsampling

Downsampling reduces the number of data points returned in query results while preserving visual fidelity. It is applied as a **post-processing step** in the Router after query results are merged.

## Algorithms

| Mode | Algorithm | Description | Points per Bucket |
|------|-----------|-------------|-------------------|
| `none` | — | No downsampling | All |
| `auto` | Auto-detect | Selects best algorithm based on data spikiness | Varies |
| `lttb` | Largest-Triangle-Three-Buckets | Best visual fidelity for smooth data | 1 |
| `minmax` | Min-Max per bucket | Preserves peaks and valleys | 2 |
| `avg` | Average per bucket | Fast, computed averaged values | 1 |
| `m4` | First-Min-Max-Last | Best shape preservation | 4 |

## Auto Mode

When `downsampling=auto`, the system analyzes data characteristics to select the best algorithm:

1. Calculates a **spikiness score** (0–1) based on:
   - Absolute deviation > 2σ from mean
   - Derivative spikes (rate of change > 1σ)

2. Selects algorithm based on data size and spikiness:

| Condition | Algorithm |
|-----------|----------|
| >100K points + spiky (>0.2) | MinMax |
| >100K points + smooth | Average |
| Spikiness > 0.2 | MinMax |
| Spikiness > 0.1 | M4 |
| Smooth data | LTTB |

Default auto threshold: **1,000 points**.

## Usage in Queries

Downsampling is configured via query parameters:

```bash
# Auto downsampling to 500 points
curl "http://localhost:5555/v1/.../query?\
device_id=sensor-001&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-02-01T00:00:00Z&\
downsampling=auto&\
downsampling_threshold=500" \
  -H "X-API-Key: your-api-key"

# Explicit LTTB downsampling
curl "http://localhost:5555/v1/.../query?\
downsampling=lttb&\
downsampling_threshold=1000" \
  -H "X-API-Key: your-api-key"
```

## Downsampling vs Aggregation

These are different concepts in Soltix:

| Feature | Aggregation | Downsampling |
|---------|------------|-------------|
| **When** | Pre-computed on flush | Applied at query time |
| **Where** | Storage service | Router post-processing |
| **Purpose** | Speed up time-range queries | Reduce response size for visualization |
| **Levels** | Fixed: 1h, 1d, 1M, 1y | Configurable threshold |
| **Output** | sum, avg, min, max, count | Original or reduced data points |
