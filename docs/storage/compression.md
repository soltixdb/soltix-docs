---
id: compression
title: Compression
sidebar_position: 5
---

# Adaptive Compression

Soltix uses a **two-layer compression pipeline**: type-specific column encoders followed by Snappy block compression. Each column type gets the optimal encoding algorithm.

## Compression Pipeline

```
Raw values → Column Encoder (type-specific) → Snappy Compress → Disk
Disk → Snappy Decompress → Column Decoder → Typed values
```

## Column Encoders

| Data Type | Encoder | Algorithm | Typical Ratio |
|-----------|---------|-----------|---------------|
| float64 | GorillaEncoder | Facebook Gorilla XOR bit-packing — identical values use 1 bit, similar values ~11 bits (~1.37 bytes/value vs 8 raw) | 3-5x |
| int64 / timestamps | DeltaEncoder | Delta + ZigZag + Varint — stores differences between consecutive values | 8-10x |
| string | DictionaryEncoder | Builds unique-string dictionary, stores varint indices. Uses linear scan for fewer than 32 entries, map for larger sets | 5-10x |
| bool | BoolEncoder | Bitmap — 1 bit per value (null mask + value mask), 8 bools per byte | 64x |

All column chunks are then wrapped with **Snappy** block compression for additional size reduction.

## Type Auto-Detection

Column types are **automatically inferred** from data via `InferColumnType()`. The `GetEncoder()` function returns the appropriate encoder:

```go
func GetEncoder(colType ColumnType) ColumnEncoder {
    switch colType {
    case ColumnTypeFloat64:  return NewGorillaEncoder()
    case ColumnTypeInt64:    return NewDeltaEncoder()
    case ColumnTypeString:   return NewDictionaryEncoder()
    case ColumnTypeBool:     return NewBoolEncoder()
    default:                 return NewGorillaEncoder()
    }
}
```

## Zero-Allocation Decode Paths

For high-performance queries, type-specific decoder interfaces avoid `[]interface{}` boxing allocations:

- `Float64Decoder.DecodeFloat64()` → `[]float64`
- `Int64Decoder.DecodeInt64()` → `[]int64`
- `StringDecoder.DecodeStrings()` → `[]string`
- `BoolDecoder.DecodeBool()` → `[]bool`

## When Compression Applies

| Stage | Compressed? | Notes |
|-------|------------|-------|
| WAL | No | Protobuf-encoded for fast writes |
| MemoryStore | No | Uncompressed for fast access |
| Disk (V6 Part files) | Yes | Column encoder + Snappy per column chunk |
| Aggregation files | Yes | Column encoder + Snappy per column chunk |

## Compression Ratios

| Data Type | Ratio |
|-----------|-------|
| Numeric (float64) | 3-5x |
| Timestamps (int64) | 8-10x |
| String fields | 5-10x |
| Boolean fields | up to 64x |
| Overall | 4-6x |
