---
id: authentication
title: API Authentication
sidebar_position: 1
---

# API Authentication

Soltix Router supports API key authentication to protect all data endpoints. Authentication can be enabled or disabled via configuration.

## Configuration

```yaml
# configs/config.yaml
auth:
  enabled: true  # true = require API key, false = public access
  api_keys:
    - "e29771a2e3804fcb3068c159324a209e7ac9c4a707e31abeccf1bb0d8df0e6fd"
    - "3a884590dc830a7a83d6e485f93aed0cf09da89a42982a9092718bfa89c62d15"
```

**Requirements:**
- Minimum key length: **32 characters**
- Keys are validated on startup
- Uses O(1) map lookup for key validation
- Failed attempts are logged with masked key prefix (first 4 characters)

### Generate Secure API Keys

```bash
# Generate 64-character hex key
openssl rand -hex 32
```

## Authentication Methods

Three header formats are supported:

### Method 1: X-API-Key Header (Recommended)

```bash
curl -H "X-API-Key: your-secret-key" \
     http://localhost:5555/v1/databases
```

### Method 2: Authorization Bearer

```bash
curl -H "Authorization: Bearer your-secret-key" \
     http://localhost:5555/v1/databases
```

### Method 3: Authorization ApiKey

```bash
curl -H "Authorization: ApiKey your-secret-key" \
     http://localhost:5555/v1/databases
```

## Protected Endpoints

When `auth.enabled: true`, all `/v1/*` endpoints require authentication. The `/health` endpoint is always public.

## Disabling Authentication

Set `auth.enabled: false` to allow public access to all endpoints. This is useful for development and testing.

## Client Examples

### Python

```python
import requests

headers = {"X-API-Key": "your-secret-key"}
response = requests.get(
    "http://localhost:5555/v1/databases",
    headers=headers
)
```

### Go

```go
req, _ := http.NewRequest("GET", "http://localhost:5555/v1/databases", nil)
req.Header.Set("X-API-Key", "your-secret-key")
resp, err := http.DefaultClient.Do(req)
```

### JavaScript

```javascript
const response = await fetch("http://localhost:5555/v1/databases", {
  headers: { "X-API-Key": "your-secret-key" },
});
```

## Error Response

Unauthenticated requests return:

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key",
  "status": 401
}
```
