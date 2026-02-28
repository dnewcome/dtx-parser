export interface MtaFile {
  raw: ArrayBuffer;
  kits: KitEntry[];
  kitBlocks: KitBlock[];
  waves: WaveEntry[];
  waveBlocks: WaveBlock[];
  chunkOffsets: Map<string, number>; // chunk ID -> absolute file offset
}

export interface KitEntry {
  name: string;
  index: number;
  seqId: number;
  dkitDirOffset: number;
  dataSize: number;
}

export interface KitBlock {
  seqId: number;
  voices: VoiceEntry[];
  rawBlock: Uint8Array; // full 3872 bytes
}

export interface VoiceEntry {
  padNumber: number;
  zoneType: number;
  velUpper: number;
  midiNote: number;
  velSensitivity: number;
  volume: number;
  pan: number;
  effectRouting: [number, number];
  sends: [number, number, number, number, number];
  flags: number;
  byteOffset: number; // absolute offset in raw ArrayBuffer
}

export interface WaveEntry {
  filename: string;
  index: number;
  dataSize: number;
  dwavDirOffset: number;
  seqId: number;
}

export interface WaveBlock {
  seqId: number;
  sampleRate: number;
  samples: Int16Array;
  isLast: boolean;
}
