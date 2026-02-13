---
id: query
title: Query API
sidebar_position: 5
---

# Query API

Soltix supports both GET and POST query endpoints. POST is recommended for complex queries with many device IDs or when you prefer JSON bodies over URL parameters.

## Endpoints

```
GET  /v1/databases/:database/collections/:collection/query
POST /v1/databases/:database/collections/:collection/query
```

## Query Parameters

### GET — URL Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start_time` | string | Yes | — | Start of time range (RFC 3339) |
| `end_time` | string | Yes | — | End of time range (RFC 3339) |
| `ids` | string | Yes | — | Comma-separated device IDs |
| `fields` | string | No | all fields | Comma-separated field names to return |
| `limit` | int | No | 0 (no limit) | Max data points per device |
| `interval` | string | No | — | Aggregation interval: `1m`, `5m`, `1h`, `1d`, `1mo`, `1y` |
| `aggregation` | string | No | `sum` | Aggregation function (used with `interval`) |
| `downsampling` | string | No | `none` | Downsampling algorithm |
| `downsampling_threshold` | int | No | 0 (auto) | Target point count for downsampling |
| `anomaly_detection` | string | No | `none` | Anomaly detection algorithm |
| `anomaly_threshold` | float | No | 3.0 | Sensitivity threshold |
| `anomaly_field` | string | No | all fields | Specific field to check for anomalies |

### POST — JSON Body

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-01-02T00:00:00Z",
  "ids": ["sensor-001", "sensor-002"],
  "fields": ["temperature", "humidity"],
  "limit": 1000,
  "interval": "1h",
  "aggregation": "avg",
  "downsampling": "lttb",
  "downsampling_threshold": 500,
  "anomaly_detection": "zscore",
  "anomaly_threshold": 2.5,
  "anomaly_field": "temperature"
}
```

Same parameters as GET. `ids` is an array of strings instead of comma-separated.

## Response Format

**200 OK**

```json
{
  "database": "mydb",
  "collection": "sensors",
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-01-02T00:00:00Z",
  "results": [
    {
      "id": "sensor-001",
      "times": [
        "2026-01-01T00:00:00Z",
        "2026-01-01T01:00:00Z",
        "2026-01-01T02:00:00Z"
      ],
      "temperature": [25.5, 26.0, 25.8],
      "humidity": [60.2, 61.0, 59.5]
    },
    {
      "id": "sensor-002",
      "times": [
        "2026-01-01T00:00:00Z",
        "2026-01-01T01:00:00Z"
      ],
      "temperature": [22.1, 22.3],
      "humidity": [55.0, 54.8]
    }
  ]
}
```

Results use a **columnar format**: each device has a `times` array and parallel arrays for each field. This is more compact than row-based format for time-series data.

## Aggregation

When `interval` is specified, raw data is aggregated into time buckets.

### Supported Intervals

| Interval | Description | Max Time Range |
|----------|-------------|----------------|
| `1m` | 1 minute | 7 days |
| `5m` | 5 minutes | 7 days |
| `1h` | 1 hour | 7 days |
| `1d` | 1 day | 90 days |
| `1mo` | 1 month | 3 years |
| `1y` | 1 year | No limit |

### Supported Functions

| Function | Description |
|----------|-------------|
| `sum` | Sum of values in each bucket (default) |
| `avg` | Average of values |
| `min` | Minimum value |
| `max` | Maximum value |
| `count` | Number of data points |

### Example — Hourly Average

```
GET /v1/databases/mydb/collections/sensors/query
  ?start_time=2026-01-01T00:00:00Z
  &end_time=2026-01-02T00:00:00Z
  &ids=sensor-001
  &interval=1h
  &aggregation=avg
```

## Downsampling

Reduces the number of data points while preserving the visual shape of the data. Applied **after** aggregation (if any).

| Algorithm | Description |
|-----------|-------------|
| `none` | No downsampling (default) |
| `auto` | Automatically selects the best algorithm based on data characteristics |
| `lttb` | Largest Triangle Three Buckets — best for visual fidelity |
| `minmax` | Preserves min and max values per bucket |
| `avg` | Average downsampling |
| `m4` | Min, Max, First, Last per bucket — good for OHLC-style data |

Use `downsampling_threshold` to control the target number of output points. When set to `0`, the system determines an appropriate threshold automatically.

## Anomaly Detection

Inline anomaly detection can be enabled on any query. Anomalies are returned in a separate `anomalies` array alongside the results.

| Algorithm | Description |
|-----------|-------------|
| `none` | Disabled (default) |
| `zscore` | Z-Score — flags values beyond N standard deviations |
| `iqr` | Interquartile Range — flags values outside Q1 - 1.5×IQR to Q3 + 1.5×IQR |
| `moving_avg` | Moving Average — flags values deviating from a rolling window |
| `auto` | Automatically selects the best algorithm based on data distribution |

`anomaly_threshold` controls sensitivity (default: `3.0`). Lower values detect more anomalies.

### Response with Anomalies

When anomalies are detected, an `anomalies` array is included in the response:

```json
{
  "database": "mydb",
  "collection": "sensors",
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-01-02T00:00:00Z",
  "results": [
    {
      "id": "sensor-001",
      "times": ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z", "2026-01-01T02:00:00Z"],
      "temperature": [25.5, 26.0, 99.5]
    }
  ],
  "anomalies": [
    {
      "time": "2026-01-01T02:00:00Z",
      "device_id": "sensor-001",
      "field": "temperature",
      "value": 99.5,
      "expected": {"min": 20.0, "max": 30.0},
      "score": 4.2,
      "type": "high",
      "algorithm": "zscore"
    }
  ]
}
```

## Post-Processing Pipeline

When multiple features are enabled on a single query, they are applied in this order:

1. **Anomaly detection** — runs on the full dataset first
2. **Downsampling** — reduces point count
3. **Timezone conversion** — adjusts timestamps

## Validation Rules

| Rule | HTTP Status | Error Code |
|------|-------------|------------|
| Missing `ids` | 400 | `INVALID_REQUEST` |
| Missing `start_time` or `end_time` | 400 | `INVALID_REQUEST` |
| Invalid RFC 3339 timestamp | 400 | `INVALID_REQUEST` |
| `end_time` before `start_time` | 400 | `INVALID_REQUEST` |
| Invalid `interval` value | 400 | `INVALID_REQUEST` |
| Time range exceeds interval limit | 400 | `INVALID_REQUEST` |
| Invalid `aggregation` function | 400 | `INVALID_REQUEST` |
| Invalid `downsampling` algorithm | 400 | `INVALID_REQUEST` |
| Negative `limit` | 400 | `INVALID_REQUEST` |
| Collection not found | 404 | `COLLECTION_NOT_FOUND` |
| Query execution error | 500 | `QUERY_FAILED` |
| Invalid POST body | 400 | `INVALID_JSON` |

## Error Response Format

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "start_time and end_time are required",
    "path": "/v1/databases/mydb/collections/sensors/query"
  }
}
```

## cURL Examples

### Basic query

```bash
curl "http://localhost:8080/v1/databases/mydb/collections/sensors/query?\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z&\
ids=sensor-001,sensor-002" \
  -H "X-API-Key: your-api-key"
```

### Query with aggregation

```bash
curl "http://localhost:8080/v1/databases/mydb/collections/sensors/query?\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z&\
ids=sensor-001&\
interval=1h&\
aggregation=avg&\
fields=temperature,humidity" \
  -H "X-API-Key: your-api-key"
```

### POST query with anomaly detection

```bash
curl -X POST http://localhost:8080/v1/databases/mydb/collections/sensors/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-01-02T00:00:00Z",
    "ids": ["sensor-001"],
    "fields": ["temperature"],
    "downsampling": "lttb",
    "downsampling_threshold": 500,
    "anomaly_detection": "zscore",
    "anomaly_threshold": 2.5
  }'
```

### Query with limit and specific fields

```bash
curl "http://localhost:8080/v1/databases/mydb/collections/sensors/query?\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z&\
ids=sensor-001&\
fields=temperature&\
limit=100" \
  -H "X-API-Key: your-api-key"
```
