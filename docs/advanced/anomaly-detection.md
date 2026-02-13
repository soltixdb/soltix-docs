---
id: anomaly-detection
title: Anomaly Detection
sidebar_position: 1
---

# Anomaly Detection

Soltix includes **built-in anomaly detection** applied as a post-processing step during queries. No separate service is required for statistical methods.

## Available Detectors

| Method | Description | Best For |
|--------|-------------|----------|
| `zscore` | Flags points beyond N standard deviations from mean. Also detects flatlines. | Normally distributed data |
| `iqr` | Flags points outside `[Q1 - k*IQR, Q3 + k*IQR]`. Robust to outliers. | Skewed distributions, data with many outliers |
| `moving_avg` | Compares each point to a local windowed average. | Trending or seasonal data |
| `auto` | Analyzes data characteristics and selects the best algorithm automatically. | General use |

### Auto-Selection Logic

The `auto` detector analyzes data characteristics:

| Condition | Selected Algorithm |
|-----------|-------------------|
| >5% outliers | IQR |
| Strong trend | Moving Average |
| Normal distribution | Z-Score |
| Default fallback | IQR |

Characteristics analyzed: `IsNormalDistribution`, `HasTrend`, `TrendStrength`, `OutlierPercentage`, `Variability`.

## Anomaly Types

| Type | Description |
|------|-------------|
| `spike` | Sudden increase above threshold |
| `drop` | Sudden decrease below threshold |
| `outlier` | Value outside expected range |
| `flatline` | No variation for extended period |

## Usage in Queries

Anomaly detection is configured directly in query parameters:

```bash
# Z-Score with threshold 2.5
curl "http://localhost:5555/v1/databases/mydb/collections/sensors/query?\
device_id=sensor-001&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z&\
anomaly_detection=zscore&\
anomaly_threshold=2.5" \
  -H "X-API-Key: your-api-key"

# Auto detection on a specific field
curl "http://localhost:5555/v1/databases/mydb/collections/sensors/query?\
device_id=sensor-001&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z&\
anomaly_detection=auto&\
anomaly_field=temperature" \
  -H "X-API-Key: your-api-key"
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `anomaly_detection` | `none` | `none`, `zscore`, `iqr`, `moving_avg`, `auto` |
| `anomaly_threshold` | `3.0` | Sensitivity (lower = more anomalies) |
| `anomaly_field` | (all) | Specific field to analyze (empty = all fields) |

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Threshold | 3.0 | Number of std devs (zscore) or IQR multiplier |
| Window Size | 10 | Points in moving average window |
| Min Data Points | 10 | Minimum points required for detection |

## Response Format

Anomalies are included in the query response:

```json
{
  "results": [...],
  "anomalies": [
    {
      "timestamp": "2026-01-01T14:30:00Z",
      "value": 95.2,
      "type": "spike",
      "field": "temperature",
      "expected_range": { "min": 20.0, "max": 35.0 }
    }
  ]
}
```

## ML-Based Detection (soltix-ml)

For advanced use cases, the optional **soltix-ml** Python service trains **Random Forest** and **LSTM** models per device×field combination. These models are exported as ONNX and uploaded to the Router for Go-side inference. See [Forecasting](./forecasting) for details on the ML service.
