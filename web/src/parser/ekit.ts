import type { KitEntry } from './types';

export function parseEkit(dv: DataView, chunkOffset: number): KitEntry[] {
  // Skip 32-byte chunk header
  const dataStart = chunkOffset + 0x20;
  const entries: KitEntry[] = [];

  // 200 entries × 32 bytes each
  for (let i = 0; i < 200; i++) {
    const base = dataStart + i * 32;
    if (base + 32 > dv.byteLength) break;

    // Name: 16 bytes, null-padded
    let name = '';
    for (let j = 0; j < 16; j++) {
      const c = dv.getUint8(base + j);
      if (c === 0) break;
      name += String.fromCharCode(c);
    }

    const index = dv.getUint32(base + 16, false);
    const dataSize = dv.getUint32(base + 20, false);
    const dkitDirOffset = dv.getUint32(base + 24, false);
    const seqId = dv.getUint32(base + 28, false);

    entries.push({ name: name.trim(), index, dataSize, dkitDirOffset, seqId });
  }

  return entries;
}
