import { useState } from 'react';
import { REGIONS, zonesSummary } from '../../lib/zones';

interface Props {
  value: string[];
  onChange: (zones: string[]) => void;
  /** Libellé affiché quand aucune zone n'est cochée. */
  emptyLabel?: string;
}

/**
 * Picker de zones géographiques : régions dépliables en départements, une
 * région cochée = tous ses départements. Utilisé pour les zones de recherche
 * d'un contact et pour le ciblage d'une campagne.
 */
export default function ZonesPicker({
  value,
  onChange,
  emptyLabel = 'Aucune zone = toute la France',
}: Props) {
  const [openRegion, setOpenRegion] = useState<string | null>(null);
  const selected = new Set(value);

  function toggleDept(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next]);
  }

  function toggleRegion(regionCode: string) {
    const region = REGIONS.find((r) => r.code === regionCode);
    if (!region) return;
    const allSelected = region.departements.every((d) => selected.has(d));
    const next = new Set(selected);
    for (const d of region.departements) {
      if (allSelected) next.delete(d);
      else next.add(d);
    }
    onChange([...next]);
  }

  return (
    <div className="border border-oq-border rounded-btn overflow-hidden bg-white">
      <div className="px-3 py-2 bg-oq-bg text-[12px] text-oq-muted">
        {value.length === 0 ? emptyLabel : zonesSummary(value)}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-2 text-brand-700 font-semibold"
          >
            Tout effacer
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-oq-border">
        {REGIONS.map((region) => {
          const count = region.departements.filter((d) => selected.has(d)).length;
          const all = count === region.departements.length;
          const isOpen = openRegion === region.code;
          return (
            <div key={region.code}>
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = count > 0 && !all;
                  }}
                  onChange={() => toggleRegion(region.code)}
                />
                <button
                  type="button"
                  className="flex-1 text-left text-[13px] font-medium text-oq-black"
                  onClick={() => setOpenRegion(isOpen ? null : region.code)}
                >
                  {region.name}
                  {count > 0 && !all && (
                    <span className="text-oq-muted font-normal"> · {count}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenRegion(isOpen ? null : region.code)}
                  className="text-oq-muted text-[12px]"
                >
                  {isOpen ? '▲' : '▼'}
                </button>
              </div>
              {isOpen && (
                <div className="px-3 pb-2 grid grid-cols-2 gap-1">
                  {region.departements.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-[12px] text-oq-text">
                      <input
                        type="checkbox"
                        checked={selected.has(d)}
                        onChange={() => toggleDept(d)}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
