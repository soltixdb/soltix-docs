---
id: streaming
title: Streaming API
sidebar_position: 4
---

# Streaming API

Soltix supports real-time data streaming via **Server-Sent Events (SSE)**. This allows clients to receive query results in chunks as they are processed.

## Endpoints

| Method | Path |
|--------|------|
| GET | `/v1/databases/:db/collections/:col/query/stream` |
| POST | `/v1/databases/:db/collections/:col/query/stream` |

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `device_id` | — | Comma-separated device IDs (required) |
| `start_time` | — | RFC3339 timestamp (required) |
| `end_time` | — | RFC3339 timestamp (required) |
| `fields` | — | Comma-separated field names |
| `chunk_size` | `1000` | Points per SSE chunk (range: 10–10,000) |
| `chunk_interval` | — | Time interval per chunk: `5m`, `15m`, `30m`, `1h`, `6h`, `12h`, `1d` |
| `interval` | — | Aggregation: `1m`, `5m`, `1h`, `1d`, `1mo`, `1y` |
| `aggregation` | `sum` | `sum`, `avg`, `min`, `max`, `count` |
| `downsampling` | `none` | `none`, `auto`, `lttb`, `minmax`, `avg`, `m4` |
| `downsampling_threshold` | `0` | Target point count |
| `anomaly_detection` | `none` | `none`, `zscore`, `iqr`, `moving_avg`, `auto` |
| `anomaly_threshold` | `3.0` | Anomaly sensitivity |
| `anomaly_field` | — | Field to detect anomalies on |
| `legacy` | `false` | Use legacy mode (load all then chunk) |

`chunk_size` and `chunk_interval` are **mutually exclusive**.

## Streaming Modes

### gRPC Streaming (Default)

True streaming from storage nodes via gRPC — data flows as it's read from disk.

### Legacy Mode (`legacy=true`)

Loads all data via gRPC first, then chunks at the HTTP layer. Useful for smaller datasets or when all data must be post-processed.

## Time Range Limits

Streaming has relaxed limits compared to regular queries:

| Interval | Max Range |
|----------|----------|
| Raw data | 30 days |
| 1h | 90 days |
| 1d | 1 year |
| 1mo | 10 years |

## Usage

### curl

```bash
curl -N "http://localhost:5555/v1/databases/mydb/collections/sensors/query/stream?\
device_id=sensor-001&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-02T00:00:00Z&\
chunk_size=500" \
  -H "X-API-Key: your-api-key"
```

### JavaScript (EventSource)

```javascript
const url = new URL("http://localhost:5555/v1/databases/mydb/collections/sensors/query/stream");
url.searchParams.set("device_id", "sensor-001");
url.searchParams.set("start_time", "2026-01-01T00:00:00Z");
url.searchParams.set("end_time", "2026-01-02T00:00:00Z");

const eventSource = new EventSource(url, {
  headers: { "X-API-Key": "your-api-key" }
});

eventSource.addEventListener("start", (e) => {
  console.log("Stream started", JSON.parse(e.data));
});

eventSource.addEventListener("data", (e) => {
  const chunk = JSON.parse(e.data);
  console.log("Chunk received:", chunk);
});

eventSource.addEventListener("done", (e) => {
  console.log("Stream complete", JSON.parse(e.data));
  eventSource.close();
});

eventSource.addEventListener("error", (e) => {
  console.error("Stream error", e);
  eventSource.close();
});
```

## SSE Event Types

| Event | Description |
|-------|-------------|
| `start` | Stream metadata (total chunks, query info) |
| `data` | Data chunk with results |
| `error` | Error information |
| `done` | Stream complete with summary (total points, duration) |

## Use Cases

- Real-time monitoring dashboards
- Large data export with progress tracking
- Live data visualization
- IoT device monitoring
