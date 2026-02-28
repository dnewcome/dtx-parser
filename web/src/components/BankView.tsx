import type { KitEntry } from '../parser/types';

interface Props {
  kits: KitEntry[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function BankView({ kits, selectedIndex, onSelect }: Props) {
  return (
    <div className="bank-view">
      <div className="bank-header">BANK</div>
      <div className="bank-list">
        {kits.map((kit, i) => {
          const isNamed = kit.name.length > 0;
          const isSelected = selectedIndex === i;
          return (
            <div
              key={i}
              className={`bank-slot${isSelected ? ' selected' : ''}${isNamed ? ' named' : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className="slot-num">U{String(i + 1).padStart(3, '0')}</span>
              <span className="slot-name">{kit.name || '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
