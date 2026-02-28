import type { KitEntry, KitBlock, VoiceEntry } from './types';

const KIT_BLOCK_SIZE = 3872; // 0x0F20
const VOICE_REGION_START = 0x154;
const VOICE_REGION_END = 0x9A8;

export function parseDkit(dv: DataView, chunkOffset: number, kitEntries: KitEntry[]): KitBlock[] {
  // DKIT data starts after 32-byte chunk header
  const dkitDataStart = chunkOffset + 0x20;
  const blocks: KitBlock[] = [];

  for (const kitEntry of kitEntries) {
    // Directory entries are 32 bytes each at dkitDataStart + dkitDirOffset
    const dirEntryBase = dkitDataStart + kitEntry.dkitDirOffset;
    if (dirEntryBase + 32 > dv.byteLength) continue;

    const seqId = dv.getUint32(dirEntryBase, false);
    const dataOffset = dv.getUint32(dirEntryBase + 8, false);

    // Kit data offset is relative to DKIT data section start
    // The directory occupies the first portion; kit data follows
    // dataOffset is relative to the DKIT data section
    const kitBase = dkitDataStart + dataOffset;
    if (kitBase + KIT_BLOCK_SIZE > dv.byteLength) continue;

    // Extract raw kit block
    const rawBlock = new Uint8Array(dv.buffer, kitBase, KIT_BLOCK_SIZE);

    // Parse voice entries from the voice region
    const voices = parseVoiceEntries(dv, kitBase, kitEntry);

    blocks.push({ seqId, voices, rawBlock: new Uint8Array(rawBlock) });
  }

  return blocks;
}

function parseVoiceEntries(dv: DataView, kitBase: number, _entry: KitEntry): VoiceEntry[] {
  const voices: VoiceEntry[] = [];
  const regionStart = kitBase + VOICE_REGION_START;
  const regionEnd = kitBase + VOICE_REGION_END;

  let pos = regionStart;
  while (pos + 26 <= regionEnd) {
    // Voice entry marker: 0x7C at pos, 0x3C at pos+10, 0x01 at pos+18
    if (
      dv.getUint8(pos) === 0x7C &&
      dv.getUint8(pos + 10) === 0x3C &&
      dv.getUint8(pos + 18) === 0x01
    ) {
      const padNumber = dv.getUint8(pos + 1);
      const zoneType = dv.getUint8(pos + 2);
      const velUpper = dv.getUint8(pos + 3);
      const midiNote = dv.getUint8(pos + 4);
      const velSensitivity = dv.getUint8(pos + 5);
      const volume = dv.getUint8(pos + 6);
      const pan = dv.getUint8(pos + 7);
      const effectRouting: [number, number] = [dv.getUint8(pos + 8), dv.getUint8(pos + 9)];
      const sends: [number, number, number, number, number] = [
        dv.getUint8(pos + 12),
        dv.getUint8(pos + 13),
        dv.getUint8(pos + 14),
        dv.getUint8(pos + 15),
        dv.getUint8(pos + 16),
      ];
      const flags = dv.getUint8(pos + 19);

      voices.push({
        padNumber,
        zoneType,
        velUpper,
        midiNote,
        velSensitivity,
        volume,
        pan,
        effectRouting,
        sends,
        flags,
        byteOffset: pos,
      });

      pos += 26;
    } else {
      pos += 1;
    }
  }

  return voices;
}
