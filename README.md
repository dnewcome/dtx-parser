# Yamaha DTX Multi 12 — File Format Reverse Engineering

Work in progress. Goal: understand the backup file format well enough to build a kit/patch editor, so kits can be edited without using the device LCD.

---

## Files

### `8H39OS_.PGM` (8,257,792 bytes)

This is a **firmware image**, not a user patch file. The header identifies it as an installer file for the DTXM12.

```
00000000: 496e 7374 616c 6c65 7246 696c 6520 2020  InstallerFile
00000010: 4454 584d 3132 2020 2020 2020 2020 2020  DTXM12
00000050: 5665 7220 3030 2e30 3020 3030 3030 3030  Ver 00.00 000000
```

It contains a pointer/offset table at 0x8100 and the device OS code starting around 0x8780. Not useful for kit editing.

---

### `F.MTA` (976,416 bytes)

This is a **complete user data backup** in **YSFC format** (Yamaha Standard File Container). This is the file to parse and edit. The filename `F.MTA` likely stands for Factory (or Full) Master Total All.

```
00000000: 2038 4833 3920 414c 4c20 2020 2020 2020   8H39 ALL
00000010: 5665 7220 3031 2e30 3020 2020 2020 2020  Ver 01.00
00000030: 5953 4643 ...                             YSFC
```

---

## F.MTA Format (YSFC)

YSFC (Yamaha Standard File Container) is a chunked binary format also used by the Motif, MOXF, and Montage synth families.

### Top-Level Layout

| Offset | Size | Content |
|--------|------|---------|
| 0x0000 | 32   | File header: model ID + version string |
| 0x0030 | 4    | Magic: `YSFC` |
| 0x0080 | 96   | Chunk directory (8-byte entries, terminated by zeros) |
| varies |      | Chunk data (each chunk at its directory-listed offset) |

### Chunk Directory (at 0x0080)

Each entry is 8 bytes: 4-byte ASCII ID + 4-byte absolute file offset (big-endian).

| ID     | File Offset | Data Size  | Description           |
|--------|-------------|------------|-----------------------|
| `EROT` | 0x000200    | 0x0040     | Root entry template   |
| `EKIT` | 0x000240    | 0x1920     | Kit entry directory   |
| `EWAV` | 0x001B60    | 0x0060     | Wave entry directory  |
| `EPTN` | 0x001BC0    | 0x0040     | Pattern entry directory |
| `ETRG` | 0x001C00    | 0x0160     | Trigger entry directory |
| `EUTL` | 0x001D60    | 0x0140     | Utility entry directory |
| `DROT` | 0x001DA0    | 0x1B00     | Root data             |
| `DKIT` | 0x0038A0    | 0x0BEA20   | Kit parameter data    |
| `DWAV` | 0x0C22C0    | 0x02B5E0   | Wave/sample data      |
| `DPTN` | 0x0ED8A0    | 0x0110     | Pattern data          |
| `DTRG` | 0x0ED9B0    | 0x0B60     | Trigger data          |
| `DUTL` | 0x0EE510    | 0x0110     | Utility data          |

The `E` prefix chunks are entry/directory tables; the `D` prefix chunks hold the actual data blocks they reference.

### Chunk Header

Every chunk starts with a 32-byte header:

```
[4 bytes] chunk ID (e.g. "DKIT")
[4 bytes] data size, big-endian uint32 (not counting this 32-byte header)
[24 bytes] 0xFF padding
```

Chunk data immediately follows at `chunk_offset + 0x20`.

---

## Kit Structure

### EKIT — Kit Entry Directory

Located at 0x0240. Contains 200 entries (one per user kit slot), each **32 bytes**:

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 16   | Kit name, null-padded ASCII (e.g. `Oak Custom `) |
| 16     | 4    | 0-based kit index, big-endian uint32 |
| 20     | 4    | Constant `0x00000F1C` (3868 — kit data size) |
| 24     | 4    | Offset of this kit's DKIT directory entry, big-endian uint32 |
| 28     | 4    | Sequential ID (1-based), big-endian uint32 (range: 0x01–0xC8) |

Kit 0 ("Oak Custom") is the only named kit in the sample file; all others are "User Kit".

### DKIT — Kit Data

Located at 0x38A0. DKIT data section starts at 0x38C0.

**Structure of the data section:**

1. **Kit directory**: a table of 32-byte entries, one per kit. Each entry points to the kit's data block:

   | Offset | Size | Description |
   |--------|------|-------------|
   | 0      | 4    | Sequential ID (same as EKIT seq_id) |
   | 4      | 4    | Always 0x00000000 |
   | 8      | 4    | Data offset of kit block within DKIT data section |
   | 12     | 20   | 0xFF padding |

2. **Kit data blocks**: each block is **0x0F20 (3872) bytes**. Kit 0 data is at absolute offset **0x51E0**.

   To find a kit's data:
   ```
   dkit_data_start = 0x38C0
   dir_entry_offset = EKIT[kit].data_dir_offset   # e.g. 0x0020 for kit 0
   dir_entry = dkit_data_start + dir_entry_offset
   kit_data_offset = read_uint32_be(dir_entry + 8)
   kit_data = dkit_data_start + kit_data_offset
   ```

---

## Kit Data Block (3872 bytes)

### Section 1: Header (0x000–0x153)

Kit-level parameters. Not fully decoded. Notable bytes:

```
0x0000: 00 00 00 09   -- unknown (count? 9 = number of active pads?)
0x0004: 00 07 00 07   -- unknown parameters
0x0008: 00 17 00 34   -- unknown parameters
```

The first 0x60 bytes appear to be global kit settings (tempo, effects routing, etc.).

Bytes 0x60–0x153 contain what appear to be "empty" voice slot placeholders — 16-byte repeating patterns with `00 01 01 00 00 00 64 40 00 00 28 00` that may represent unassigned pad voices with default volume/pan.

### Section 2: Voice Entries (0x154–~0x9A7)

82 voice entries, each **24 bytes**, each starting with `0x7C`. These map trigger zones to instrument sounds with per-voice parameters.

```
Byte  0:    0x7C  -- entry marker
Byte  1:    pad number (0-based, 0–13 observed)
Byte  2:    zone type / trigger code (see Zone Types below)
Byte  3:    instrument high byte  \  together select the
Byte  4:    instrument low byte   /  instrument/voice (encoding TBD)
Byte  5:    velocity curve / sensitivity parameter
Byte  6:    volume (0–127)
Byte  7:    pan (0–127; 64 = center, 0 = hard left, 127 = hard right)
            NOTE: 0x00 observed in many entries that appear to be center —
            center encoding may be pad-type dependent
Byte  8:    effect routing byte 1 (0x12 typical; 0x11/0x13/0x14 for special)
Byte  9:    effect routing byte 2 (0x60 typical; 0x13/0x38/0x28 for special)
Byte 10:    0x3C (constant)
Byte 11:    0x00 (constant)
Byte 12:    effect send 1 level (64 = default)
Byte 13:    effect send 2 level (64 = default)
Byte 14:    effect send 3 level (64 = default)
Byte 15:    effect send 4 level (64 = default)
Byte 16:    effect send 5 level (64 = default)
Byte 17:    0x00 (constant)
Byte 18:    0x01 (constant)
Byte 19:    flags (see Flags below)
Bytes 20–23: additional parameters (often 0x00)
```

#### Zone Types (Byte 2)

Byte 2 identifies which trigger zone of a pad this voice entry handles. The same physical pad can appear multiple times with different zone types for:
- Head vs rim hits
- Hi-hat: many zones for different pedal positions (closed, half-open, open, foot splash, etc.)
- Velocity layers (not yet confirmed)

High zone type values (0x40+) seem to correspond to hi-hat articulations. Zone types 0x01 and 0x02 appear to be rim and head respectively for tom/snare pads.

#### Flags (Byte 19)

| Value | Meaning |
|-------|---------|
| 0x00  | Normal |
| 0x01  | Hi-hat open articulation |
| 0x02  | Hi-hat close articulation |
| 0x04  | Unknown (observed on crash cymbals) |
| 0x05  | Unknown (observed on hi-hat edge) |

#### Instrument Bytes 3–4

The encoding for the instrument selection (which drum sound to play) is **not yet decoded**. Observed values range across the full 0x00–0x7F range in both bytes. The DTX Multi 12 has ~691 built-in voices plus user WAV slots. A full voice list from the MIDI reference manual would be needed to map these bytes to voice names.

### Section 3: Effect Chain and Remaining Data (0x9A8–end)

Not yet fully decoded. Contains:

- A repeating 24-byte structure `00 00 08 00 18 00 00 01 ...` (may be effect/EQ parameters per pad)
- A table at ~0xBE0: incrementing 4-byte values `00 04 00 04 00 08 00 04 ...` (likely MIDI note or pad assignments)
- Additional kit-level configuration

---

## Wave Structure

### EWAV — Wave Entry Directory

Located at 0x1B60. Contains one entry per user-loaded WAV file, each **32 bytes**:

| Offset | Size | Description |
|--------|------|-------------|
| 0      | 16   | Filename in 8.3 DOS format (e.g. `KHATSC~1  `) |
| 16     | 4    | 0-based wave index |
| 20     | 4    | Data size in DWAV |
| 24     | 4    | Offset of DWAV directory entry |
| 28     | 4    | Sequential ID (range starts at 0xC9 = 201, after kit IDs) |

Two user waves in the sample file:
- `KHATSC~1` — seq_id 0xC9 (201)
- `CYCDH_~1` — seq_id 0xCA (202)

### DWAV — Wave Data

Located at 0x0C22C0. The data section contains:
1. A directory table (32-byte entries, same pattern as DKIT)
2. Wave data blocks — stored in **Yamaha's proprietary sample encoding**, not raw PCM

Each wave directory entry has a metadata block at its data offset containing the filename, sample parameters (tuning, loop points, etc.) followed by the encoded audio data.

---

## Trigger Structure

### ETRG / DTRG

Trigger settings define pad sensitivity, gain, and detection behavior — separate from kit voice assignments. Each trigger entry is **0xFA (250) bytes** of data. Sequential IDs start at 0xCC (204).

Not yet decoded in detail.

---

## Sequential ID Ranges

The YSFC format uses sequential IDs across all entity types:

| Range (hex) | Range (dec) | Type |
|-------------|-------------|------|
| 0x01–0xC8   | 1–200       | User kits |
| 0xC9–0xCA   | 201–202     | User waves (in this file) |
| 0xCC+       | 204+        | Trigger settings |

---

## Open Questions

1. **Instrument byte encoding** (bytes 3–4 of voice entries): what is the mapping from these two bytes to voice names? Need the DTX Multi 12 MIDI implementation chart or voice list.

2. **Kit header structure** (bytes 0x000–0x153): which bytes control tempo, effects type, effects parameters, master volume, etc.?

3. **Effect chain data** (after 0x9A8): what are the individual effect parameters and how are they laid out?

4. **Wave data encoding**: is the proprietary sample format documented anywhere, or can it be converted to/from standard WAV?

5. **DPTN / Pattern data**: is this the drum pattern sequencer data? What does its structure look like?

6. **How does the device read back F.MTA?** USB stick transfer is triggered by the device menu. Can a modified F.MTA be written back via the same mechanism?

---

## Tools Used

```bash
# Hex dump with zero-line suppression
xxd F.MTA | grep -v " 0000 0000 0000 0000 0000 0000 0000 0000"

# Find ASCII strings in binary
strings F.MTA | grep -v '^\s*$'

# Find English dictionary words in firmware
comm -12 <(sort /usr/share/dict/words) <(strings 8H39OS_.PGM | sort)
```
