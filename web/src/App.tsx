import { useState, useCallback } from 'react';
import './App.css';
import type { MtaFile, KitBlock, WaveEntry, WaveBlock } from './parser/types';
import { parseMta } from './parser/mta';
import { writeMta, writeMtaWithWaveChanges } from './writer/mta';
import { DropZone } from './components/DropZone';
import { BankView } from './components/BankView';
import { KitView } from './components/KitView';

export default function App() {
  const [mtaFile, setMtaFile] = useState<MtaFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKit, setSelectedKit] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [wavesDirty, setWavesDirty] = useState(false);
  const [filename] = useState('F.MTA');

  function handleFile(buffer: ArrayBuffer) {
    try {
      const parsed = parseMta(buffer);
      setMtaFile(parsed);
      setError(null);
      const firstNamed = parsed.kits.findIndex((k) => k.name.length > 0);
      setSelectedKit(firstNamed >= 0 ? firstNamed : 0);
      setDirty(false);
      setWavesDirty(false);
    } catch (err) {
      setError((err as Error).message);
      setMtaFile(null);
    }
  }

  // Voice field edit: patch rawBlock in kitBlocks and raw buffer
  const handleVoiceEdit = useCallback((byteOffset: number, fieldOffset: number, value: number) => {
    setMtaFile((prev) => {
      if (!prev) return prev;

      const newRaw = prev.raw.slice(0);
      const rawBytes = new Uint8Array(newRaw);
      rawBytes[byteOffset + fieldOffset] = value;

      const newKitBlocks: KitBlock[] = prev.kitBlocks.map((block) => {
        // Check if any voice in this block has this byteOffset
        const voiceIdx = block.voices.findIndex((v) => v.byteOffset === byteOffset);
        if (voiceIdx < 0) return block;

        const voice = block.voices[voiceIdx];
        const newVoices = block.voices.map((v, i) => {
          if (i !== voiceIdx) return v;
          const updated = { ...v };
          switch (fieldOffset) {
            case 3: updated.velUpper = value; break;
            case 4: updated.midiNote = value; break;
            case 6: updated.volume = value; break;
            case 7: updated.pan = value; break;
          }
          return updated;
        });

        // Patch rawBlock: find voice position within the block
        const newRawBlock = new Uint8Array(block.rawBlock);
        for (let i = 0; i + 26 <= newRawBlock.length; i++) {
          if (
            newRawBlock[i] === 0x7C &&
            newRawBlock[i + 10] === 0x3C &&
            newRawBlock[i + 18] === 0x01 &&
            newRawBlock[i + 1] === voice.padNumber &&
            newRawBlock[i + 2] === voice.zoneType &&
            newRawBlock[i + 3] === voice.velUpper &&
            newRawBlock[i + 4] === voice.midiNote
          ) {
            newRawBlock[i + fieldOffset] = value;
            break;
          }
        }

        return { ...block, voices: newVoices, rawBlock: newRawBlock };
      });

      return { ...prev, raw: newRaw, kitBlocks: newKitBlocks };
    });
    setDirty(true);
  }, []);

  const handleWaveAdd = useCallback((entry: WaveEntry, block: WaveBlock) => {
    setMtaFile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        waves: [...prev.waves, entry],
        waveBlocks: [...prev.waveBlocks, block],
      };
    });
    setDirty(true);
    setWavesDirty(true);
  }, []);

  const handleWaveDelete = useCallback((seqId: number) => {
    setMtaFile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        waves: prev.waves.filter((w) => w.seqId !== seqId),
        waveBlocks: prev.waveBlocks.filter((b) => b.seqId !== seqId),
      };
    });
    setDirty(true);
    setWavesDirty(true);
  }, []);

  function handleSave() {
    if (!mtaFile) return;
    let buf: ArrayBuffer;
    if (wavesDirty) {
      buf = writeMtaWithWaveChanges(mtaFile, mtaFile.waves, mtaFile.waveBlocks);
    } else {
      buf = writeMta(mtaFile);
    }
    downloadBuffer(buf, filename);
    setDirty(false);
    setWavesDirty(false);
  }

  const kit = selectedKit !== null ? mtaFile?.kits[selectedKit] : undefined;
  const kitBlock = selectedKit !== null && kit
    ? mtaFile?.kitBlocks.find((b) => b.seqId === kit.seqId)
    : undefined;

  if (!mtaFile) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>DTX Multi 12 Editor</h1>
        </header>
        <main className="drop-main">
          {error && <div className="error-banner">{error}</div>}
          <DropZone onFile={handleFile} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>DTX Multi 12 Editor</h1>
        <div className="header-actions">
          <span className="filename-label">{filename}</span>
          <button className="btn secondary" onClick={() => { setMtaFile(null); setDirty(false); setWavesDirty(false); }}>
            Close
          </button>
          <button className="btn primary" onClick={handleSave} disabled={!dirty}>
            {dirty ? 'Save MTA *' : 'Save MTA'}
          </button>
        </div>
      </header>

      <div className="workspace">
        <BankView
          kits={mtaFile.kits}
          selectedIndex={selectedKit}
          onSelect={setSelectedKit}
        />

        <div className="kit-area">
          {kit && kitBlock ? (
            <KitView
              kitEntry={kit}
              kitBlock={kitBlock}
              waves={mtaFile.waves}
              waveBlocks={mtaFile.waveBlocks}
              onVoiceEdit={handleVoiceEdit}
              onWaveAdd={handleWaveAdd}
              onWaveDelete={handleWaveDelete}
            />
          ) : (
            <div className="empty-state center">Select a kit from the bank.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadBuffer(buf: ArrayBuffer, name: string) {
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
