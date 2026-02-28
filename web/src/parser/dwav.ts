import type { WaveEntry, WaveBlock } from './types';

export function parseDwav(dv: DataView, chunkOffset: number, waveEntries: WaveEntry[]): WaveBlock[] {
  // DWAV data starts after 32-byte chunk header
  const dwavDataStart = chunkOffset + 0x20;
  const blocks: WaveBlock[] = [];

  for (let i = 0; i < waveEntries.length; i++) {
    const entry = waveEntries[i];
    const isLast = i === waveEntries.length - 1;

    // dwavDirOffset: offset of DWAV directory entry relative to DWAV chunk start (not data start)
    const dirEntryBase = chunkOffset + entry.dwavDirOffset;
    if (dirEntryBase + 32 > dv.byteLength) continue;

    const seqId = dv.getUint32(dirEntryBase, false);
    const dataOffset = dv.getUint32(dirEntryBase + 8, false);

    // dataOffset is relative to DWAV data section
    const blockStart = dwavDataStart + dataOffset;
    if (blockStart + 64 > dv.byteLength) continue;

    // 64-byte wave header at blockStart
    // Sample rate at offset 20 within header (BE uint32)
    const sampleRate = dv.getUint32(blockStart + 20, false);

    // PCM data starts at blockStart + 64
    // dataSize includes 64-byte header
    // For non-last waves: last 32 bytes of block = next wave's metadata (not audio)
    // dataSize counts from blockStart (64-byte header + PCM)
    const totalBytes = entry.dataSize;
    const headerBytes = 64;
    const trailingMetadata = isLast ? 0 : 32;
    const pcmBytes = totalBytes - headerBytes - trailingMetadata;

    if (pcmBytes < 2) {
      blocks.push({ seqId, sampleRate, samples: new Int16Array(0), isLast });
      continue;
    }

    // Decode 16-bit big-endian PCM → native endian Int16Array
    const pcmStart = blockStart + headerBytes;
    const sampleCount = Math.floor(pcmBytes / 2);
    const samples = new Int16Array(sampleCount);

    for (let s = 0; s < sampleCount; s++) {
      const bytePos = pcmStart + s * 2;
      if (bytePos + 2 > dv.byteLength) break;
      // Big-endian: high byte first
      const hi = dv.getUint8(bytePos);
      const lo = dv.getUint8(bytePos + 1);
      const value = (hi << 8) | lo;
      // Convert to signed 16-bit
      samples[s] = value > 0x7FFF ? value - 0x10000 : value;
    }

    blocks.push({ seqId, sampleRate, samples, isLast });
  }

  return blocks;
}

/**
 * Encode a native-endian Int16Array as big-endian PCM bytes.
 * Used when writing new user wave blocks.
 */
export function encodeBigEndianPcm(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] & 0xFFFF;
    out[i * 2] = (v >> 8) & 0xFF;
    out[i * 2 + 1] = v & 0xFF;
  }
  return out;
}
