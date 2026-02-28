import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { WaveEntry, WaveBlock } from '../parser/types';
import { Waveform } from './Waveform';
import { readWavFile, toDosFilename } from '../utils/wav';

interface Props {
  waves: WaveEntry[];
  waveBlocks: WaveBlock[];
  onAdd: (entry: WaveEntry, block: WaveBlock) => void;
  onDelete: (seqId: number) => void;
}

export function WaveManager({ waves, waveBlocks, onAdd, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function blockForSeqId(seqId: number): WaveBlock | undefined {
    return waveBlocks.find((b) => b.seqId === seqId);
  }

  function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (evt) => {
      const buf = evt.target?.result as ArrayBuffer;
      if (!buf) return;
      try {
        const wav = readWavFile(buf);
        const filename = toDosFilename(file.name);
        const nextSeqId = waves.length > 0
          ? Math.max(...waves.map((w) => w.seqId)) + 1
          : 0xC9;
        const nextIndex = waves.length > 0
          ? Math.max(...waves.map((w) => w.index)) + 1
          : 0;

        const pcmBytes = wav.samples.length * 2;
        const dataSize = 64 + pcmBytes; // header + PCM (no trailing meta for new last item)

        const entry: WaveEntry = {
          filename,
          index: nextIndex,
          dataSize,
          dwavDirOffset: 0, // will be recalculated on write
          seqId: nextSeqId,
        };

        const block: WaveBlock = {
          seqId: nextSeqId,
          sampleRate: wav.sampleRate,
          samples: wav.samples,
          isLast: true,
        };

        onAdd(entry, block);
      } catch (err) {
        alert(`Cannot import WAV: ${(err as Error).message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="wave-manager">
      <div className="wave-manager-header">
        <h3>User Waves</h3>
        <button className="btn" onClick={() => inputRef.current?.click()}>
          + Upload WAV
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,.WAV"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {waves.length === 0 && (
        <div className="empty-state">No user waves in this file.</div>
      )}

      <div className="wave-list">
        {waves.map((wave) => {
          const block = blockForSeqId(wave.seqId);
          return (
            <div key={wave.seqId} className="wave-row">
              <div className="wave-meta">
                <span className="wave-name">{wave.filename}</span>
                <span className="wave-seqid">ID {wave.seqId}</span>
              </div>
              {block && block.samples.length > 0 ? (
                <Waveform block={block} />
              ) : (
                <div className="waveform-placeholder">No audio data</div>
              )}
              <button
                className="delete-btn"
                onClick={() => {
                  if (confirm(`Delete wave "${wave.filename}"?`)) {
                    onDelete(wave.seqId);
                  }
                }}
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
