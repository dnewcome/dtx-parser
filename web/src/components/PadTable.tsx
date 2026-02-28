import { useState } from 'react';
import type { VoiceEntry } from '../parser/types';
import { noteLabel } from '../utils/midi';

interface Props {
  voices: VoiceEntry[];
  onEdit: (byteOffset: number, fieldOffset: number, value: number) => void;
}

const ZONE_LABELS: Record<number, string> = {
  0x00: 'head',
  0x01: 'rim',
  0x02: 'head-alt',
  0x03: 'edge',
  0x04: 'bell',
  0x10: 'HH-bow',
  0x11: 'HH-edge',
  0x20: 'bow',
  0x21: 'edge',
  0x40: 'HH-closed',
  0x41: 'HH-open',
  0x42: 'HH-half',
  0x43: 'HH-splash',
};

const FLAG_LABELS: Record<number, string> = {
  0x00: '',
  0x01: 'HH open',
  0x02: 'HH close',
  0x04: 'cymbal',
  0x05: 'HH edge',
};

function zoneLabel(z: number): string {
  return ZONE_LABELS[z] ?? `0x${z.toString(16).padStart(2, '0')}`;
}

function flagBadge(f: number): string {
  return FLAG_LABELS[f] ?? `0x${f.toString(16)}`;
}

interface EditCell {
  byteOffset: number;
  fieldOffset: number;
  value: number;
}

export function PadTable({ voices, onEdit }: Props) {
  const [editing, setEditing] = useState<EditCell | null>(null);
  const [editVal, setEditVal] = useState('');

  // Group voices by pad number
  const byPad = new Map<number, VoiceEntry[]>();
  for (const v of voices) {
    if (!byPad.has(v.padNumber)) byPad.set(v.padNumber, []);
    byPad.get(v.padNumber)!.push(v);
  }
  const pads = Array.from(byPad.keys()).sort((a, b) => a - b);

  function startEdit(byteOffset: number, fieldOffset: number, value: number) {
    setEditing({ byteOffset, fieldOffset, value });
    setEditVal(String(value));
  }

  function commitEdit() {
    if (!editing) return;
    const n = parseInt(editVal, 10);
    if (!isNaN(n) && n >= 0 && n <= 127) {
      onEdit(editing.byteOffset, editing.fieldOffset, n);
    }
    setEditing(null);
  }

  function editCell(byteOffset: number, fieldOffset: number, value: number) {
    const isThis = editing?.byteOffset === byteOffset && editing?.fieldOffset === fieldOffset;
    if (isThis) {
      return (
        <input
          className="inline-edit"
          value={editVal}
          autoFocus
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') setEditing(null);
          }}
          style={{ width: 48 }}
        />
      );
    }
    return (
      <span className="editable-cell" onClick={() => startEdit(byteOffset, fieldOffset, value)}>
        {value}
      </span>
    );
  }

  if (voices.length === 0) {
    return <div className="empty-state">No voice entries found in this kit.</div>;
  }

  return (
    <div className="pad-table-wrap">
      <table className="pad-table">
        <thead>
          <tr>
            <th>Pad</th>
            <th>Zone</th>
            <th>MIDI Note</th>
            <th>Vel Limit</th>
            <th>Volume</th>
            <th>Pan</th>
            <th>Sends</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {pads.map((padNum) => {
            const rows = byPad.get(padNum)!;
            return rows.map((v, ri) => (
              <tr key={`${padNum}-${ri}`} className={ri === 0 ? 'pad-group-first' : ''}>
                {ri === 0 && <td rowSpan={rows.length} className="pad-num-cell">Pad {padNum + 1}</td>}
                <td>{zoneLabel(v.zoneType)}</td>
                <td className="note-cell">{noteLabel(v.midiNote)}</td>
                <td>{editCell(v.byteOffset, 3, v.velUpper)}</td>
                <td>{editCell(v.byteOffset, 6, v.volume)}</td>
                <td>{editCell(v.byteOffset, 7, v.pan)}</td>
                <td className="sends-cell">{v.sends.join(' ')}</td>
                <td>
                  {flagBadge(v.flags) && (
                    <span className="flag-badge">{flagBadge(v.flags)}</span>
                  )}
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
