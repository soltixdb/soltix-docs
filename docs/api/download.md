---
id: download
title: Download API
sidebar_position: 5
---

# Download API

Soltix supports **async bulk data download** in CSV or JSON format. Downloads are processed in the background, allowing clients to poll for status and download completed files.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/databases/:db/collections/:col/download` | Create download request |
| GET | `/v1/download/status/:request_id` | Check download status |
| GET | `/v1/download/file/:request_id` | Download completed file |

## Create Download Request

```bash
curl -X POST http://localhost:5555/v1/databases/mydb/collections/sensors/download \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-01-31T23:59:59Z",
    "device_id": ["sensor-001", "sensor-002"],
    "fields": ["temperature", "humidity"],
    "format": "csv"
  }'
```

### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `start_time` | string | Yes | RFC3339 timestamp |
| `end_time` | string | Yes | RFC3339 timestamp |
| `device_id` | string[] | Yes | Device IDs |
| `fields` | string[] | No | Field filter (empty = all fields) |
| `interval` | string | No | Aggregation: `1m`, `5m`, `1h`, `1d`, `1mo`, `1y` |
| `aggregation` | string | No | `sum`, `avg`, `min`, `max`, `count` (default: `sum`) |
| `downsampling` | string | No | `none`, `auto`, `lttb`, `minmax`, `avg`, `m4` |
| `format` | string | No | `csv` (default) or `json` |
| `filename` | string | No | Custom filename |

**No time range limits** — async processing handles arbitrarily large datasets.

### Response

```json
{
  "request_id": "abc123-def456",
  "status": "pending",
  "message": "Download request created",
  "expires_at": "2026-02-01T00:00:00Z"
}
```

## Check Status

```bash
curl http://localhost:5555/v1/download/status/abc123-def456 \
  -H "X-API-Key: your-api-key"
```

### Response

```json
{
  "request_id": "abc123-def456",
  "status": "completed",
  "progress": 100,
  "total_rows": 86400,
  "file_size": 2048576,
  "filename": "mydb_sensors_20260101_20260131.csv",
  "download_url": "/v1/download/file/abc123-def456",
  "created_at": "2026-01-31T12:00:00Z",
  "completed_at": "2026-01-31T12:00:30Z"
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Request queued, not yet processing |
| `processing` | Currently generating the file |
| `completed` | File ready for download |
| `failed` | Error occurred during processing |
| `expired` | File expired and was removed |

## Download File

```bash
curl -o data.csv \
  http://localhost:5555/v1/download/file/abc123-def456 \
  -H "X-API-Key: your-api-key"
```

The file is streamed with `Transfer-Encoding: chunked`, so clients can process data as it arrives.

## Auto-Generated Filenames

If no custom filename is specified, the format is:

```
{database}_{collection}_{start_date}_{end_date}.{format}
```

Example: `mydb_sensors_20260101_20260131.csv`
