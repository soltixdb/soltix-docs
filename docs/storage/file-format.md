---
id: file-format
title: Storage File Format
sidebar_position: 4
---

# V6 Storage File Format

Soltix uses a custom binary columnar format (V6) optimized for time-series data. V6 stores all columns in a single part file with a footer-based index for direct seeks.

## V6 Part File Structure

```
┌──────────────────────────────────────┐
│ Header (64 bytes)                    │
│   Magic number, version, flags       │
├──────────────────────────────────────┤
│ Column Chunk: device0._time          │  ← Delta encoded + Snappy
│ Column Chunk: device0.field1         │  ← Gorilla/Delta/Dict/Bool + Snappy
│ Column Chunk: device0.field2         │
│ Column Chunk: device0._inserted_at   │  ← Delta encoded + Snappy (LWW)
│ Column Chunk: device1._time          │
│ Column Chunk: device1.field1         │
│ Column Chunk: device1._inserted_at   │
│ ...                                  │
├──────────────────────────────────────┤
│ Footer                               │
│   ├── ColumnIndex[]                  │  ← Array of V6ColumnEntry
│   ├── FieldDictionary                │  ← [_time, field0, field1, ...]
│   ├── FieldTypes                     │  ← ColumnType per field
│   ├── DeviceIndex                    │  ← Device name list
│   └── RowCountPerDevice              │
├──────────────────────────────────────┤
│ FooterSize (4 bytes)                 │
│ FooterOffset (8 bytes)               │  ← Last 8 bytes of file
└──────────────────────────────────────┘
```

## Column Index Entry

Each column chunk is indexed with a `V6ColumnEntry`:

```go
type V6ColumnEntry struct {
    DeviceIdx  uint32  // Index into device list
    FieldIdx   uint32  // 0 = _time, 1..N = user fields, last = _inserted_at
    Offset     int64   // Byte offset in file
    Size       uint32  // Compressed size in bytes
    RowCount   uint32  // Number of values
    ColumnType uint8   // Float64, Int64, String, Bool
}
```

### Internal Columns

The field dictionary contains two **internal columns** that are not exposed in query results:

| Index | Name | Type | Purpose |
|-------|------|------|---------|
| 0 | `_time` | int64 | Business timestamp (when the measurement was taken) |
| N+1 | `_inserted_at` | int64 | Ingestion timestamp for [last-write-wins](./last-write-wins) deduplication |

User fields occupy indices `1..N` in the field dictionary.

## Two-Tier Metadata

Outside of part files, metadata is stored at two levels:

### Global Metadata (`_metadata.idx`)

Per date directory. Contains:
- Field list with types
- Device Group (DG) manifests
- Device → DG mapping
- Min/max timestamps for time-range pruning

### DG Metadata (`dg_XXXX/_metadata.idx`)

Per device group. Contains:
- Part file names
- Part manifests (min/max timestamps per part)
- Device → Part mapping

## Directory Structure

```
data/
├── group_{gid}/
│   └── {database}/
│       └── {collection}/
│           └── {year}/{month}/{date}/
│               ├── _metadata.idx
│               ├── dg_0000/
│               │   ├── _metadata.idx
│               │   ├── part_0000.bin
│               │   └── part_0001.bin
│               └── dg_0001/
│                   ├── _metadata.idx
│                   └── part_0000.bin
```

## Compression Pipeline

Each column chunk goes through a two-layer compression:

```
Raw values → Column Encoder → Snappy Compress → Disk
```

| Column Type | Encoder | Algorithm |
|-------------|---------|----------|
| float64 | GorillaEncoder | XOR bit-packing (~1.37 bytes/value) |
| int64 | DeltaEncoder | Delta + ZigZag + Varint |
| string | DictionaryEncoder | Unique-string dictionary + varint indices |
| bool | BoolEncoder | Bitmap (1 bit per value) |

## Data Types

| Type | Raw Size | Description |
|------|----------|-------------|
| Float64 | 8 bytes | Sensor values, metrics |
| Int64 | 8 bytes | Timestamps, counters |
| String | variable | Device IDs, labels, status codes |
| Bool | 1 byte | Status flags |

## V6 vs Previous Versions

| Feature | V5 (old) | V6 (current) |
|---------|----------|---------------|
| Column Groups | `cg_XXXX/` directories (max 50 fields each) | Eliminated — all columns in one file |
| `_time` column | Duplicated in every CG file | Single `_time` per device per part |
| File I/O per query | `O(fields/50)` file opens | Single file open per part |
| Metadata | 3-tier (global → DG → CG) | 2-tier (global → DG) |
| Footer | None | Footer-based index for direct seeks |
