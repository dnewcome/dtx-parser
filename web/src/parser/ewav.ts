import type { WaveEntry } from './types';

export function parseEwav(dv: DataView, chunkOffset: number): WaveEntry[] {
  // Skip 32-byte chunk header
  const dataStart = chunkOffset + 0x20;
  const entries: WaveEntry[] = [];

  // Read entries until we hit all-FF or end of reasonable space
  // Each entry is 32 bytes: filename(16) + index(4) + dataSize(4) + dwavDirOffset(4) + seqId(4)
  let pos = dataStart;
  const maxEntries = 256;

  for (let i = 0; i < maxEntries; i++) {
    if (pos + 32 > dv.byteLength) break;
    if (dv.getUint8(pos) === 0xFF) break;

    let filename = '';
    for (let j = 0; j < 16; j++) {
      const c = dv.getUint8(pos + j);
      if (c === 0) break;
      filename += String.fromCharCode(c);
    }
    if (!filename) break;

    const index = dv.getUint32(pos + 16, false);
    const dataSize = dv.getUint32(pos + 20, false);
    const dwavDirOffset = dv.getUint32(pos + 24, false);
    const seqId = dv.getUint32(pos + 28, false);

    entries.push({ filename: filename.trim(), index, dataSize, dwavDirOffset, seqId });
    pos += 32;
  }

  return entries;
}
