import type { MtaFile, WaveEntry, WaveBlock } from './types';
import { parseEkit } from './ekit';
import { parseDkit } from './dkit';
import { parseEwav } from './ewav';
import { parseDwav } from './dwav';

export function parseMta(buffer: ArrayBuffer): MtaFile {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Validate YSFC magic at 0x30
  const magic = String.fromCharCode(bytes[0x30], bytes[0x31], bytes[0x32], bytes[0x33]);
  if (magic !== 'YSFC') {
    throw new Error(`Not a valid YSFC file (magic "${magic}" at 0x30)`);
  }

  // Read chunk directory at 0x80: 8-byte entries (4-char ID + 4-byte BE absolute offset)
  const chunkOffsets = new Map<string, number>();
  let dirPos = 0x80;
  while (dirPos + 8 <= buffer.byteLength) {
    const id = String.fromCharCode(bytes[dirPos], bytes[dirPos + 1], bytes[dirPos + 2], bytes[dirPos + 3]);
    const offset = dv.getUint32(dirPos + 4, false);
    if (id === '\xFF\xFF\xFF\xFF' || offset === 0xFFFFFFFF) break;
    // Stop if we've hit non-ASCII chunk IDs (end of directory)
    if (!/^[A-Z]{4}$/.test(id)) break;
    chunkOffsets.set(id, offset);
    dirPos += 8;
  }

  const ekitOffset = chunkOffsets.get('EKIT');
  const dkitOffset = chunkOffsets.get('DKIT');
  const ewavOffset = chunkOffsets.get('EWAV');
  const dwavOffset = chunkOffsets.get('DWAV');

  if (ekitOffset === undefined) throw new Error('EKIT chunk not found');
  if (dkitOffset === undefined) throw new Error('DKIT chunk not found');

  const kits = parseEkit(dv, ekitOffset);
  const kitBlocks = parseDkit(dv, dkitOffset, kits);

  let waves: WaveEntry[] = [];
  let waveBlocks: WaveBlock[] = [];
  if (ewavOffset !== undefined && dwavOffset !== undefined) {
    waves = parseEwav(dv, ewavOffset);
    waveBlocks = parseDwav(dv, dwavOffset, waves);
  }

  return { raw: buffer, kits, kitBlocks, waves, waveBlocks, chunkOffsets };
}
