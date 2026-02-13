---
id: forecasting
title: Forecasting
sidebar_position: 2
---

# Forecasting

Soltix provides built-in time-series forecasting with 7 algorithms (6 statistical + 1 auto-selector) in Go, plus optional ML models via the soltix-ml Python service.

## Built-in Forecasters (Go)

| Algorithm | Type | Best For |
|-----------|------|----------|
| `sma` | Simple Moving Average | Stable, flat data |
| `exponential` | Exponential Smoothing | Data with noise |
| `linear` | Linear Regression | Data with clear trend |
| `holt_winters` | Triple Exponential Smoothing | Seasonal + trend data |
| `arima` | ARIMA(p,d,q) | Stationary or differenced data |
| `prophet` | Prophet-style decomposition | Complex seasonality (daily/weekly/yearly) |
| `auto` | Auto-selector | General use |

### Auto-Selection Logic

| Condition | Selected Algorithm |
|-----------|-------------------|
| Has seasonality + enough data | Holt-Winters |
| Has trend | Linear |
| ≥20 data points | Exponential |
| Small dataset | SMA |

## API

### Endpoints

| Method | Path |
|--------|------|
| GET | `/v1/databases/:db/collections/:col/forecast` |
| POST | `/v1/databases/:db/collections/:col/forecast` |

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `device_id` | — | Device IDs (required) |
| `start_time` | — | RFC3339 — historical data start (required) |
| `end_time` | — | RFC3339 — historical data end (required) |
| `field` | — | Single field to forecast |
| `fields` | — | Multiple fields (POST body) |
| `algorithm` | `auto` | `sma`, `exponential`, `holt_winters`, `linear`, `arima`, `prophet`, `auto`, `ml` |
| `horizon` | `24` | Number of periods to forecast |
| `seasonal_period` | `24` | For Holt-Winters |
| `data_interval` | `1h` | Data interval: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w` |
| `ml_algorithm` | — | When `algorithm=ml`: `random_forest` or `lstm` |

### Example

```bash
# Auto forecast for next 24 hours
curl "http://localhost:5555/v1/databases/mydb/collections/sensors/forecast?\
device_id=sensor-001&\
field=temperature&\
start_time=2026-01-01T00:00:00Z&\
end_time=2026-01-15T00:00:00Z&\
horizon=24&\
algorithm=auto" \
  -H "X-API-Key: your-api-key"
```

### Response

```json
{
  "results": [
    {
      "device_id": "sensor-001",
      "field": "temperature",
      "predictions": [
        {
          "timestamp": "2026-01-15T01:00:00Z",
          "value": 25.8,
          "lower_bound": 24.2,
          "upper_bound": 27.4
        }
      ],
      "model_info": {
        "algorithm": "holt_winters",
        "mape": 3.2,
        "mae": 0.8,
        "rmse": 1.1,
        "data_points": 336
      }
    }
  ]
}
```

## ML Models (soltix-ml)

For heavier-weight predictions, the optional **soltix-ml** Python service trains machine learning models:

| Model | Algorithm | Description |
|-------|-----------|-------------|
| Random Forest | scikit-learn RF | Ensemble method, warm start, sliding window features |
| LSTM | PyTorch LSTM | Neural network with normalization baked into ONNX graph |

### Training Pipeline

1. **Discovery**: Connect to Router → list databases, collections, devices
2. **Data**: Load 30 days of CSV data per device
3. **Features**: Sliding window of configurable size
4. **Training**: Both RF and LSTM for every `device × field`
5. **Export**: ONNX format (input: `(1, window_size)` float32, output: `(1, 1)` float32)
6. **Upload**: Multipart form upload to Router

### Using ML Forecasts

```bash
curl "http://localhost:5555/v1/databases/mydb/collections/sensors/forecast?\
device_id=sensor-001&\
field=temperature&\
algorithm=ml&\
ml_algorithm=lstm&\
horizon=24" \
  -H "X-API-Key: your-api-key"
```
