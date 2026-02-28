/**
 * Parse a standard WAV file (PCM only).
 * Returns samples as native-endian Int16Array plus sample rate.
 * Throws descriptive errors if format is unsupported.
 */
export interface WavData {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export function readWavFile(buffer: ArrayBuffer): WavData {
  const dv = new DataView(buffer);

  // RIFF header
  const riff = readFourCC(dv, 0);
  if (riff !== 'RIFF') throw new Error('Not a WAV file (missing RIFF header)');
  const wave = readFourCC(dv, 8);
  if (wave !== 'WAVE') throw new Error('Not a WAV file (missing WAVE identifier)');

  // Find fmt and data chunks
  let pos = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (pos + 8 <= buffer.byteLength) {
    const id = readFourCC(dv, pos);
    const size = dv.getUint32(pos + 4, true); // little-endian

    if (id === 'fmt ') {
      audioFormat = dv.getUint16(pos + 8, true);
      channels = dv.getUint16(pos + 10, true);
      sampleRate = dv.getUint32(pos + 12, true);
      bitsPerSample = dv.getUint16(pos + 22, true);
    } else if (id === 'data') {
      dataOffset = pos + 8;
      dataSize = size;
    }

    pos += 8 + size + (size % 2); // chunks are word-aligned
  }

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV format: ${audioFormat} (only PCM = 1 is supported)`);
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Only 16-bit WAV files are supported (got ${bitsPerSample}-bit)`);
  }
  if (sampleRate !== 44100) {
    throw new Error(`Sample rate must be 44100 Hz (got ${sampleRate} Hz). Please resample the file before importing.`);
  }
  if (channels !== 1) {
    throw new Error(`Only mono (1 channel) WAV files are supported (got ${channels} channels). Please convert to mono before importing.`);
  }
  if (dataOffset < 0) {
    throw new Error('WAV data chunk not found');
  }

  const sampleCount = Math.floor(dataSize / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = dv.getInt16(dataOffset + i * 2, true); // WAV is little-endian
  }

  return { samples, sampleRate, channels, bitsPerSample };
}

function readFourCC(dv: DataView, offset: number): string {
  return String.fromCharCode(
    dv.getUint8(offset),
    dv.getUint8(offset + 1),
    dv.getUint8(offset + 2),
    dv.getUint8(offset + 3)
  );
}

/**
 * Convert native-endian Int16Array to big-endian PCM Uint8Array (for DTX storage).
 */
export function encodeAsBigEndianPcm(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] & 0xFFFF;
    out[i * 2] = (v >> 8) & 0xFF;
    out[i * 2 + 1] = v & 0xFF;
  }
  return out;
}

/**
 * Truncate a filename to 8.3 DOS format (uppercase, first 8 chars + ~1 suffix).
 */
export function toDosFilename(name: string): string {
  // Remove extension
  const dotIdx = name.lastIndexOf('.');
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const truncated = base.replace(/[^A-Z0-9_]/gi, '').toUpperCase().slice(0, 6);
  return `${truncated}~1`;
}
