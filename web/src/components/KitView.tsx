import { useState } from 'react';
import type { KitEntry, KitBlock, WaveEntry, WaveBlock } from '../parser/types';
import { PadTable } from './PadTable';
import { WaveManager } from './WaveManager';

interface Props {
  kitEntry: KitEntry;
  kitBlock: KitBlock;
  waves: WaveEntry[];
  waveBlocks: WaveBlock[];
  onVoiceEdit: (byteOffset: number, fieldOffset: number, value: number) => void;
  onWaveAdd: (entry: WaveEntry, block: WaveBlock) => void;
  onWaveDelete: (seqId: number) => void;
}

type Tab = 'pads' | 'waves';

export function KitView({
  kitEntry, kitBlock, waves, waveBlocks,
  onVoiceEdit, onWaveAdd, onWaveDelete,
}: Props) {
  const [tab, setTab] = useState<Tab>('pads');

  return (
    <div className="kit-view">
      <div className="kit-header">
        <h2>{kitEntry.name || '(unnamed)'}</h2>
        <span className="kit-id">U{String(kitEntry.index + 1).padStart(3, '0')} · seq {kitEntry.seqId}</span>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn${tab === 'pads' ? ' active' : ''}`}
          onClick={() => setTab('pads')}
        >
          Pads
        </button>
        <button
          className={`tab-btn${tab === 'waves' ? ' active' : ''}`}
          onClick={() => setTab('waves')}
        >
          Waves ({waves.length})
        </button>
      </div>

      <div className="tab-content">
        {tab === 'pads' && (
          <PadTable voices={kitBlock.voices} onEdit={onVoiceEdit} />
        )}
        {tab === 'waves' && (
          <WaveManager
            waves={waves}
            waveBlocks={waveBlocks}
            onAdd={onWaveAdd}
            onDelete={onWaveDelete}
          />
        )}
      </div>
    </div>
  );
}
