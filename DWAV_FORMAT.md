# DWAV Wave Data Format

Reverse-engineered format for user wave (sample) data in the Yamaha DTX Multi 12 `F.MTA` backup file.

## Overview

User-imported wave files are stored in the `DWAV` chunk of the YSFC-format `F.MTA` file. Audio is stored as **raw 16-bit signed big-endian PCM at 44100 Hz mono** — no compression.

The `EWAV` chunk contains the entry table (metadata/index), and `DWAV` contains the actual audio data.

---

## EWAV Entry Table

Located at file offset `0x1B60`. The chunk has a 32-byte header (`EWAV` + size + 0xFF padding), then one 32-byte entry per user wave:

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 16   | Filename, 8.3 DOS short format, space-padded (e.g. `KHATSC~1        `) |
| 16     | 4    | 0-based wave index (BE uint32) |
| 20     | 4    | `data_size`: byte count of wave block in DWAV, including 64-byte header (BE uint32) |
| 24     | 4    | `dwav_offset`: offset of DWAV *directory entry* relative to DWAV chunk start (BE uint32) |
| 28     | 4    | `seq_id`: 1-based sequence ID starting at 0xC9 (201) for user waves (BE uint32) |

**Example entries:**

| Filename    | Index | data_size | dwav_offset | seq_id |
|-------------|-------|-----------|-------------|--------|
| `KHATSC~1 ` | 0     | 0xEEF0    | 0x0020      | 0xC9   |
| `CYCDH_~1 ` | 1     | 0x1C690   | 0x0040      | 0xCA   |

---

## DWAV Chunk Layout

The DWAV chunk starts at file offset `0x0C22C0`. Its 32-byte chunk header is:
- Bytes 0–3: `DWAV` magic
- Bytes 4–7: total data size (BE uint32), e.g. `0x0002B5E0`
- Bytes 8–31: `0xFF` padding

DWAV data begins at `0x0C22E0` (immediately after the chunk header).

### Layout within DWAV data

```
[N × 32-byte directory entries]
[wave 1 metadata   (32 bytes)]  ← at (block1_start - 32)
[wave 1 block      (data_size bytes)]:
    [wave 1 header (64 bytes)]  ← block1_start = directory data_offset
    [wave 1 PCM    (variable)]
    [wave 2 metadata (32 bytes)]  ← LAST 32 bytes of wave 1's block
[wave 2 block      (data_size bytes)]:
    [wave 2 header (64 bytes)]
    [wave 2 PCM    (variable)]
    [wave 3 metadata (32 bytes)]  ← LAST 32 bytes of wave 2's block (if wave 3 exists)
...
[last wave block]:
    [last wave header (64 bytes)]
    [last wave PCM    (variable)]  ← no trailing metadata
```

**Key point:** The 32-byte metadata block for wave N+1 is embedded at the end of wave N's block. It is NOT audio — the audio naturally decays to silence well before these bytes.

---

## DWAV Directory Entries

N entries at the start of DWAV data, one per user wave, each 32 bytes:

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 4    | `seq_id` (BE uint32), matches EWAV seq_id |
| 4      | 4    | `0x00000000` (constant) |
| 8      | 4    | `data_offset`: byte offset of wave block start relative to DWAV data start (BE uint32) |
| 12     | 20   | `0xFF` padding |

The `data_offset` points to the start of the 64-byte wave header (not the 32-byte metadata that precedes it).

**Example:**

| seq_id | data_offset | Notes |
|--------|-------------|-------|
| 0xC9   | 0x0060      | KHATSC~1 block starts at DWAV_data + 0x60 |
| 0xCA   | 0xEF50      | CYCDH_~1 block starts at DWAV_data + 0xEF50 |

To get absolute file offsets, add DWAV data start (`0x0C22E0`):
- KHATSC~1: `0x0C22E0 + 0x0060 = 0x0C2340`
- CYCDH~1: `0x0C22E0 + 0xEF50 = 0x0D1230`

---

## Per-Wave Metadata Block (32 bytes)

Located 32 bytes before each wave's block start (i.e. at `data_offset - 0x20` within DWAV data). **Not counted in `data_size`.**

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 10   | Filename (same as EWAV entry, 8.3 format, space-padded) |
| 10     | 2    | `0x0000` |
| 12     | 2    | `0x0001` (possibly index or constant) |
| 14     | 6    | `0x000000000000` |
| 20     | 4    | `00 7F 01 7F` (parameter bytes, meaning TBD) |
| 24     | 4    | `7F 40 00 00` (parameter bytes, meaning TBD) |
| 28     | 3    | `3C 40 40` (0x3C=60 possibly root MIDI note, 0x40=64 center value) |
| 31     | 1    | 1-based wave index (0x01 for first wave, 0x02 for second, etc.) |

---

## Wave Header (64 bytes)

The first 64 bytes of each wave block, starting at `data_offset`.

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 4    | `00 00 05 01` — format/flags (constant across both observed waves; meaning TBD) |
| 4      | 4    | `00 00 0N 00` — varies per wave (0x08 for KHATSC~1, 0x09 for CYCDH_~1; meaning TBD) |
| 8      | 12   | `0x00` padding |
| 20     | 4    | Sample rate as BE uint32 (e.g. `0x0000AC44` = 44100 Hz) |
| 24     | 8    | `0x00` padding |
| 32     | 4    | Boundary/loop point in samples, BE uint32 (≈ PCM bytes / 32; meaning TBD) |
| 36     | 4    | Same value as offset 32 |
| 40     | 4    | `04 00 00 00` for KHATSC~1; `04 01 00 00` for CYCDH_~1 (meaning TBD) |
| 44     | 4    | `00 00 00 00` for KHATSC~1; `04 02 00 00` for CYCDH_~1 (meaning TBD) |
| 48     | 16   | `0x00` padding |

**Confirmed values from observed waves:**

| Field          | KHATSC~1            | CYCDH_~1            |
|----------------|---------------------|---------------------|
| bytes 0–3      | `00 00 05 01`       | `00 00 05 01`       |
| bytes 4–7      | `00 00 08 00`       | `00 00 09 00`       |
| sample rate    | 44100 Hz            | 44100 Hz            |
| loop/bound pt  | 1909 (0x0775)       | 1817 (0x0719)       |
| bytes 40–43    | `04 00 00 00`       | `04 01 00 00`       |
| bytes 44–47    | `00 00 00 00`       | `04 02 00 00`       |

---

## PCM Audio Data

Immediately follows the 64-byte wave header.

| Property       | Value                        |
|----------------|------------------------------|
| Encoding       | 16-bit signed big-endian PCM |
| Sample rate    | 44100 Hz                     |
| Channels       | 1 (mono)                     |
| Bit depth      | 16-bit                       |
| Byte order     | Big-endian                   |

### Computing actual sample count

The last 32 bytes of each non-final wave block are the *next* wave's metadata, not audio. The audio decays to silence well before these bytes so they are inaudible in practice, but for exact sample counts:

```
# For all waves except the last:
pcm_bytes  = data_size - 64 - 32
num_samples = pcm_bytes // 2

# For the last wave in the file:
pcm_bytes  = data_size - 64
num_samples = pcm_bytes // 2
```

**Observed wave sizes:**

| Wave        | data_size | Actual PCM bytes | Samples | Duration   |
|-------------|-----------|------------------|---------|------------|
| KHATSC~1    | 61168     | 61072            | 30536   | ~0.692 s   |
| CYCDH_~1    | 116368    | 116304           | 58152   | ~1.319 s   |

### Extracting samples in Python

```python
import struct

def read_wave(fmta_path, data_offset_abs, data_size, is_last_wave=False):
    """
    data_offset_abs: absolute file offset of the wave block start (= DWAV data start + directory data_offset)
    data_size: from EWAV entry
    """
    header_size = 64
    trailing_meta = 0 if is_last_wave else 32
    pcm_bytes = data_size - header_size - trailing_meta

    with open(fmta_path, 'rb') as f:
        # Read sample rate from header
        f.seek(data_offset_abs + 20)
        sample_rate = struct.unpack('>I', f.read(4))[0]

        # Read PCM data
        f.seek(data_offset_abs + header_size)
        raw = f.read(pcm_bytes)

    # Parse as big-endian signed 16-bit
    num_samples = len(raw) // 2
    samples = struct.unpack(f'>{num_samples}h', raw)
    return samples, sample_rate
```

### Writing a WAV file

```python
import struct, array

def extract_to_wav(fmta_path, data_offset_abs, data_size, out_path, is_last_wave=False):
    samples, sample_rate = read_wave(fmta_path, data_offset_abs, data_size, is_last_wave)

    # Convert big-endian samples to little-endian for WAV
    a = array.array('h', samples)
    a.byteswap()  # BE -> LE
    pcm_le = a.tobytes()

    num_channels = 1
    bits = 16
    data_size_wav = len(pcm_le)
    byte_rate = sample_rate * num_channels * bits // 8
    block_align = num_channels * bits // 8

    with open(out_path, 'wb') as f:
        f.write(struct.pack('<4sI4s', b'RIFF', 36 + data_size_wav, b'WAVE'))
        f.write(struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, num_channels,
                            sample_rate, byte_rate, block_align, bits))
        f.write(struct.pack('<4sI', b'data', data_size_wav))
        f.write(pcm_le)
```

---

## Unknown / TBD

- Wave header bytes 0–7: `00 00 05 01` and `00 00 0N 00` — format/flags meaning unknown
- Wave header bytes 32–39: boundary/loop point field — coincides with ≈ `floor(pcm_bytes / 32)` but exact meaning unconfirmed; possibly a Yamaha internal playback cursor unit
- Wave header bytes 40–47: per-wave parameters, incrementing pattern observed across waves
- Per-wave metadata bytes 20–30: parameter bytes (0x7F, 0x40, 0x3C etc.) — possibly root note, volume, pan

---

## Verified With

Analyzed from `F.MTA` (DTX Multi 12 full user data backup, YSFC format). Two user waves present:
- `KHATSC~1` (seq_id 0xC9) — short percussive sample, ~0.69s
- `CYCDH_~1` (seq_id 0xCA) — longer percussive sample, ~1.32s
