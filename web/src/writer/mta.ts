import type { MtaFile, WaveEntry, WaveBlock } from '../parser/types';
import { encodeBigEndianPcm } from '../parser/dwav';

/**
 * Write a modified MtaFile back to ArrayBuffer.
 * Strategy:
 * - For voice field edits: bytes are already patched in kitBlocks[].rawBlock;
 *   copy raw, patch kit block bytes at known positions.
 * - For wave additions: rebuild EWAV and DWAV chunks, splice into new buffer.
 */
export function writeMta(file: MtaFile): ArrayBuffer {
  // Start with a copy of the original raw buffer
  const out = file.raw.slice(0);
  const outBytes = new Uint8Array(out);

  // Patch kit blocks back into the buffer
  const dkitOffset = file.chunkOffsets.get('DKIT');
  if (dkitOffset !== undefined) {
    const dkitDataStart = dkitOffset + 0x20;
    for (let i = 0; i < file.kitBlocks.length; i++) {
      const block = file.kitBlocks[i];
      const entry = file.kits[i];
      if (!entry) continue;

      const dirEntryBase = dkitDataStart + entry.dkitDirOffset;
      const dirDv = new DataView(out, dirEntryBase, 12);
      const dataOffset = dirDv.getUint32(8, false);
      const kitBase = dkitDataStart + dataOffset;

      if (kitBase + block.rawBlock.length <= out.byteLength) {
        outBytes.set(block.rawBlock, kitBase);
      }
    }
  }

  return out;
}

/**
 * Build a new EWAV chunk from the wave entries array.
 * Returns the chunk bytes (32-byte header + entries).
 */
export function buildEwavChunk(waves: WaveEntry[]): Uint8Array {
  const entryCount = waves.length;
  const dataSize = entryCount * 32;
  const totalSize = 0x20 + dataSize;
  const chunk = new Uint8Array(totalSize).fill(0xFF);
  const dv = new DataView(chunk.buffer);

  // Write chunk header: "EWAV" + size (BE) + 0xFF padding
  chunk[0] = 0x45; chunk[1] = 0x57; chunk[2] = 0x41; chunk[3] = 0x56; // "EWAV"
  dv.setUint32(4, dataSize, false);
  // Remaining header bytes already 0xFF

  for (let i = 0; i < waves.length; i++) {
    const base = 0x20 + i * 32;
    const w = waves[i];

    // Filename: 16 bytes, null-padded
    for (let j = 0; j < 16; j++) {
      chunk[base + j] = j < w.filename.length ? w.filename.charCodeAt(j) : 0;
    }
    dv.setUint32(base + 16, w.index, false);
    dv.setUint32(base + 20, w.dataSize, false);
    dv.setUint32(base + 24, w.dwavDirOffset, false);
    dv.setUint32(base + 28, w.seqId, false);
  }

  return chunk;
}

interface WaveChunkData {
  entry: WaveEntry;
  block: WaveBlock;
}

/**
 * Build a new DWAV chunk from wave blocks.
 * Returns { chunk: Uint8Array, updatedEntries: WaveEntry[] } with corrected offsets.
 */
export function buildDwavChunk(wavePairs: WaveChunkData[]): { chunk: Uint8Array; updatedEntries: WaveEntry[] } {
  const dirEntries = wavePairs.length;
  const dirSize = dirEntries * 32;

  // First pass: calculate data offsets for each wave block
  // Each block: 32-byte name metadata + 64-byte wave header + PCM + (32-byte next metadata, embedded in last 32 bytes)
  const dataOffsets: number[] = [];
  const dataSizes: number[] = [];
  let cursor = dirSize; // data follows directory

  for (let i = 0; i < wavePairs.length; i++) {
    const { block } = wavePairs[i];
    const isLast = i === wavePairs.length - 1;
    const pcmBytes = encodeBigEndianPcm(block.samples).length;
    const headerBytes = 64;
    const trailingMeta = isLast ? 0 : 32;
    const dataSize = headerBytes + pcmBytes + trailingMeta;

    // dataOffset is relative to DWAV data section (after 32-byte chunk header)
    // Block starts at cursor (within data section), preceded by 32-byte name metadata
    dataOffsets.push(cursor + 32); // point past the 32-byte metadata
    dataSizes.push(dataSize);
    cursor += 32 + dataSize;
  }

  const totalDataSize = cursor;
  const totalSize = 0x20 + totalDataSize;
  const chunk = new Uint8Array(totalSize).fill(0xFF);
  const dv = new DataView(chunk.buffer);

  // Write chunk header: "DWAV" + size (BE)
  chunk[0] = 0x44; chunk[1] = 0x57; chunk[2] = 0x41; chunk[3] = 0x56; // "DWAV"
  dv.setUint32(4, totalDataSize, false);

  // Write directory entries (32 bytes each)
  const updatedEntries: WaveEntry[] = [];
  for (let i = 0; i < wavePairs.length; i++) {
    const { entry, block } = wavePairs[i];
    const base = 0x20 + i * 32;

    dv.setUint32(base, block.seqId, false);
    dv.setUint32(base + 4, 0, false);
    dv.setUint32(base + 8, dataOffsets[i], false);
    // Remaining 20 bytes already 0xFF

    // dwavDirOffset for EWAV = offset of this dir entry relative to DWAV chunk start
    // Directory is right after chunk header (0x20), entry i is at 0x20 + i*32
    const correctedDirOffset = 0x20 + i * 32;

    updatedEntries.push({
      ...entry,
      dataSize: dataSizes[i],
      dwavDirOffset: correctedDirOffset,
    });
  }

  // Write wave data blocks
  for (let i = 0; i < wavePairs.length; i++) {
    const { entry, block } = wavePairs[i];
    const pcmBig = encodeBigEndianPcm(block.samples);

    // Block position in chunk: 0x20 (chunk header) + dataOffsets[i] (relative to data section) - 32 (precedes block)
    const metaPos = 0x20 + dataOffsets[i] - 32;
    const headerPos = 0x20 + dataOffsets[i];

    // 32-byte name metadata (filename, null-padded)
    for (let j = 0; j < 16; j++) {
      chunk[metaPos + j] = j < entry.filename.length ? entry.filename.charCodeAt(j) : 0;
    }
    // Remaining 16 bytes of metadata: zeros

    // 64-byte wave header
    const wh = new Uint8Array(64);
    const whDv = new DataView(wh.buffer);
    // offset 0-3: format constant
    wh[0] = 0x00; wh[1] = 0x00; wh[2] = 0x05; wh[3] = 0x01;
    // offset 20-23: sample rate BE
    whDv.setUint32(20, block.sampleRate, false);
    // offset 32-39: loop point estimate = floor(pcmBytes / 32)
    const loopPt = Math.floor(pcmBig.length / 32);
    whDv.setUint32(32, loopPt, false);
    whDv.setUint32(36, loopPt, false);
    chunk.set(wh, headerPos);

    // PCM data
    chunk.set(pcmBig, headerPos + 64);
  }

  return { chunk, updatedEntries };
}

/**
 * Full rebuild: patch the EWAV and DWAV sections into a new buffer.
 * Called when waves are added or deleted.
 */
export function writeMtaWithWaveChanges(
  file: MtaFile,
  newWaves: WaveEntry[],
  newWaveBlocks: WaveBlock[]
): ArrayBuffer {
  const ewavOffset = file.chunkOffsets.get('EWAV');
  const dwavOffset = file.chunkOffsets.get('DWAV');

  if (ewavOffset === undefined || dwavOffset === undefined) {
    return writeMta(file);
  }

  const wavePairs = newWaves.map((entry, i) => ({
    entry,
    block: newWaveBlocks[i],
  }));

  const { chunk: newDwavChunk, updatedEntries } = buildDwavChunk(wavePairs);
  const newEwavChunk = buildEwavChunk(updatedEntries);

  // Build new buffer: everything before EWAV + new EWAV + data between EWAV end and DWAV + new DWAV + data after DWAV
  const origBytes = new Uint8Array(file.raw);

  // Find old EWAV and DWAV chunk sizes (from original data)
  const origDv = new DataView(file.raw);
  const oldEwavSize = 0x20 + origDv.getUint32(ewavOffset + 4, false);
  const oldDwavSize = 0x20 + origDv.getUint32(dwavOffset + 4, false);

  const beforeEwav = origBytes.slice(0, ewavOffset);
  const betweenEwavDwav = origBytes.slice(ewavOffset + oldEwavSize, dwavOffset);
  const afterDwav = origBytes.slice(dwavOffset + oldDwavSize);

  const newBuffer = new Uint8Array(
    beforeEwav.length + newEwavChunk.length +
    betweenEwavDwav.length + newDwavChunk.length +
    afterDwav.length
  );

  let pos = 0;
  newBuffer.set(beforeEwav, pos); pos += beforeEwav.length;
  newBuffer.set(newEwavChunk, pos); pos += newEwavChunk.length;
  newBuffer.set(betweenEwavDwav, pos); pos += betweenEwavDwav.length;
  newBuffer.set(newDwavChunk, pos); pos += newDwavChunk.length;
  newBuffer.set(afterDwav, pos);

  // Update chunk directory offsets for EWAV, DWAV, and any chunks after DWAV
  const result = newBuffer.buffer;
  const resultDv = new DataView(result);

  // Recalculate new offsets
  const newEwavOffset = ewavOffset;
  const newDwavOffset = ewavOffset + newEwavChunk.length + betweenEwavDwav.length;

  // Update directory at 0x80
  let dirPos = 0x80;
  while (dirPos + 8 <= result.byteLength) {
    const id = String.fromCharCode(
      newBuffer[dirPos], newBuffer[dirPos + 1],
      newBuffer[dirPos + 2], newBuffer[dirPos + 3]
    );
    if (!/^[A-Z]{4}$/.test(id)) break;

    if (id === 'EWAV') {
      resultDv.setUint32(dirPos + 4, newEwavOffset, false);
    } else if (id === 'DWAV') {
      resultDv.setUint32(dirPos + 4, newDwavOffset, false);
    } else {
      // Chunks after DWAV need offset adjustment
      const origChunkOffset = new DataView(file.raw).getUint32(dirPos + 4, false);
      if (origChunkOffset > dwavOffset) {
        const delta = (newEwavChunk.length - oldEwavSize) + (newDwavChunk.length - oldDwavSize);
        resultDv.setUint32(dirPos + 4, origChunkOffset + delta, false);
      }
    }

    dirPos += 8;
  }

  return result;
}
