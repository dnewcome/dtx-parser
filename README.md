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

It contains a pointer/offset table at 0x8100 and the device OS code starting around 0x8780.

The firmware also contains the **built-in voice name table** starting at 0x3FD6E0. Voice names are 11-byte null-padded ASCII strings, contiguous across 15 categories totalling 1076 voices:

| Category | Firmware Offset | Count | Examples |
|----------|----------------|-------|---------|
| `Kk` (Kick)     | 0x3FD6E0 | 91  | OakCustom, HardRock1, HipHop BD1 |
| `Sn` (Snare)    | 0x3FDAC9 | 128 | OakCustom, MapleCtm, T-9 SD2 |
| `Tm` (Tom)      | 0x3FE049 | 77  | OakCtm H, RX5 Tom1 |
| `Cy` (Cymbal)   | 0x3FE398 | 52  | Thin16Eg, Splash3, Brite20Bow |
| `HH` (Hi-Hat)   | 0x3FE5D4 | 48  | Brite Cl, Brite FtCl, T-8 Cl1 |
| `EP` (E-Perc)   | 0x3FE7E4 | 88  | Anlg Clap1, Static |
| `Cu` (Cussion)  | 0x3FEBAC | 104 | Cowbell5, Conga O-S |
| `Br` (Brazil)   | 0x3FF024 | 56  | Chafchas2 |
| `In` (Indian)   | 0x3FF28C | 63  | Djembe2 Mt |
| `Jp` (Japan)    | 0x3FF541 | 31  | Taiko1 Don, Tsuzumi |
| `Af` (Africa)   | 0x3FF696 | 63  | Djembe1 |
| `Or` (Orient)   | 0x3FF94B | 80  | WindChimeD |
| `E1`            | 0x3FFCBB | 45  | BigGun, ReceiptBel |
| `E2`            | 0x3FFEAA | 64  | ScratchR&B, Franken |
| `E3`            | 0x40016A | 86  | CompterVo, Ainote 1 |

Voice entry format: `fw[offset + i*11 : offset + i*11 + 10].rstrip(b'\x00')`. Index 0 in each category is `"no assign"`.

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

Kit-level parameters. Not fully decoded.

**Bytes 0x000–0x05F**: Global kit settings. Differ between kits with different voice assignments. Notable:
- `0x0000`: Unknown count field (9 in "Oak Custom", 21 in blank "User Kit")
- `0x001B`: Contains MIDI note values matching datalist pad assignments (e.g., 48 = C2/48 for a tom)

**Bytes 0x060–0x153**: 16 repeated 14-byte blocks containing `00 01 01 00 00 00 64 40 00 00 28 00`. Nearly identical across all kits (only one byte differs between "Oak Custom" and blank). These appear to be empty/default voice slot placeholders with default volume/velocity settings.

### Section 2: Voice Entries (0x154–0x9A7)

82 voice entries, each **26 bytes**, each starting with `0x7C`. These map trigger zones to MIDI output notes and per-voice sound parameters.

```
Byte  0:    0x7C  -- entry marker
Byte  1:    pad number (0-based, 0–13 observed)
Byte  2:    zone type / trigger code (see Zone Types below)
Byte  3:    upper velocity limit (0–127; 100 = default)
Byte  4:    MIDI output note number (0–127; see Note below)
Byte  5:    trigger velocity sensitivity parameter
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
Byte 19:    articulation flags (see Flags below)
Bytes 20–25: mostly 0x00; byte 20 = 0x01 on some hi-hat/snare entries
```

**Byte 4 — MIDI Output Note**: The MIDI note the device transmits on channel 10 when this pad zone is struck. All zones of the same physical pad typically share the same note. Examples from "Oak Custom":
- Kick pad: note 36 (C1 = GM Bass Drum 1)
- Hi-hat foot close: note 44 (G#1 = GM Pedal Hi-Hat)
- Snare rim: note 40 (E1)

This byte is **not** an index into the firmware voice table. Firmware voice `Kk[36]` is "Dist BD2", not "OakCustom" — confirming byte 4 is a MIDI note, not a voice index.

**Blank "User Kit" default**: All 82 entries identical with `pad=0, zone=0, b3=100, b4=64, vol=0` — all silent, unassigned.

#### Zone Types (Byte 2)

Byte 2 identifies which trigger zone of a pad this voice entry handles. The same physical pad can appear multiple times with different zone types for:
- Head vs rim hits
- Hi-hat: many zones for different pedal positions (closed, half-open, open, foot splash, etc.)

High zone type values (0x40+) correspond to hi-hat articulations. Zone types 0x01 and 0x02 appear to be rim and head respectively for tom/snare pads.

#### Articulation Flags (Byte 19)

| Value | Meaning |
|-------|---------|
| 0x00  | Normal |
| 0x01  | Hi-hat open articulation |
| 0x02  | Hi-hat close articulation |
| 0x04  | Unknown (observed on crash cymbals) |
| 0x05  | Unknown (observed on hi-hat edge) |

#### Voice Selection — NOT YET FOUND

The voice selection (which internal drum sample plays, e.g. "Kk 1 OakCustom") is **not encoded in the 26-byte voice entries**. Bytes 3–4 encode velocity and MIDI note, not a voice index. The voice assignment must be stored elsewhere in the kit block — most likely in the kit header (0x000–0x05F) or section 3, but the exact encoding is not yet decoded.

The datalist (`dtxm12_datalist.pdf`) shows voice assignments per pad in the form `Cat No VoiceName` (e.g., `Kk 1 OakCustom`), where `Cat` is the 2-letter category and `No` is the 1-based index within that category in the firmware voice table.

### Section 3: Effect Chain and Remaining Data (0x9A8–0x0F1F)

Two distinct sub-sections:

**0x9A8–0x0C3F** (664 bytes): Not yet decoded. Contains a repeating structure with values like `00 00 08 00 18 00 00 01 ...`. Approximately 20 bytes differ between "Oak Custom" and a blank kit in this region, in a pattern suggesting per-pad parameters.

**0x0C40–0x0F1F** (736 bytes): 92 repeating **8-byte entries** of the form:
```
03 00 7F 00 00 00 09 XX
```
Where `XX` varies per entry. In "Oak Custom", 14 of these `XX` bytes differ from a blank kit. The differing values are MIDI note numbers matching kit assignments from the datalist (e.g., 36, 38, 40, 42, 44, 46, 56, 92, 94). The `09` in byte 6 likely refers to MIDI channel 10 (0-indexed = 9, the standard drum channel). The function of this table is not yet fully understood — it may be a per-note MIDI parameter table or redundant MIDI note assignment storage.

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

1. **Voice selection encoding**: Where in the 3872-byte kit block is the instrument category + number stored (e.g., "Kk 1 OakCustom" for a kick pad)? Not in the voice entries. Candidates: kit header 0x000–0x05F, or section 3 (0x9A8–0x0C3F). **This is the main blocker for building an editor.**

2. **Best approach to crack it**: Save a kit on the device, make a single voice change (e.g., change kick from OakCustom to HardRock1), save to USB, then diff the two `.MTA` files. The changed byte(s) reveal the encoding.

3. **Kit header structure** (bytes 0x000–0x05F): which bytes control kit name, tempo, effects type, effects parameters, master volume, etc.? Some bytes contain MIDI note values matching pad assignments, suggesting possible MIDI-note-keyed parameter storage.

4. **Section 3 first block** (0x9A8–0x0C3F): what are the per-pad parameters in this region?

5. **Section 3 8-byte table** (0x0C40–0x0F1F): what does each of the 92 entries represent? The `03 00 7F 00 00 00 09 XX` pattern with `XX` = MIDI note numbers suggests a per-note MIDI channel 10 assignment or parameter table.

6. **Wave data encoding**: is the proprietary sample format documented anywhere, or can it be converted to/from standard WAV?

7. **DPTN / Pattern data**: is this the drum pattern sequencer data? What does its structure look like?

8. **Round-trip verification**: Can a modified F.MTA be written back to the device via the same USB menu? What validation does the device perform?

---

## Tools Used

```bash
# Hex dump with zero-line suppression
xxd F.MTA | grep -v " 0000 0000 0000 0000 0000 0000 0000 0000"

# Find ASCII strings in binary
strings F.MTA | grep -v '^\s*$'

# Find English dictionary words in firmware
comm -12 <(sort /usr/share/dict/words) <(strings 8H39OS_.PGM | sort)

# Extract PDF text with layout preservation (handles multi-column tables)
pdftotext -layout dtxm12_datalist.pdf /tmp/dtx_datalist_layout.txt

# Python: read a kit block
with open('F.MTA', 'rb') as f:
    data = f.read()

DKIT_DATA = 0x38C0
def get_kit(idx):
    dir_entry = DKIT_DATA + idx * 32
    off = int.from_bytes(data[dir_entry+8:dir_entry+12], 'big')
    return data[DKIT_DATA+off:DKIT_DATA+off+0x0F20]

# Python: find voice entries in a kit block
kit = get_kit(0)
entries = []
for pos in range(len(kit) - 26):
    if (kit[pos] == 0x7C and kit[pos+10] == 0x3C and
        kit[pos+11] == 0x00 and kit[pos+18] == 0x01):
        entries.append(kit[pos:pos+26])
```
