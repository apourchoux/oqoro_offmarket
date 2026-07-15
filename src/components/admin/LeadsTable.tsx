import { useMemo, useState } from 'react';
import type { Lead, LeadStatus } from '../../lib/types';
import { LEAD_STATUS_LABELS } from '../../lib/types';

interface Props {
  initialLeads: Array<Lead & { property_title?: string | null }>;
}

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'converted', 'archived'];

const STATUS_TONES: Record<LeadStatus, { bg: string; border: string; label: string; badge: string }> = {
  new:       { bg: 'bg-blue-50',   border: 'border-blue-300',   label: 'text-blue-700',   badge: 'bg-blue-100 text-blue-800' },
  contacted: { bg: 'bg-amber-50',  border: 'border-amber-300',  label: 'text-amber-700',  badge: 'bg-amber-100 text-amber-800' },
  converted: { bg: 'bg-emerald-50',border: 'border-emerald-300',label: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-800' },
  archived:  { bg: 'bg-gray-50',   border: 'border-gray-300',   label: 'text-gray-600',   badge: 'bg-gray-100 text-gray-700' },
};

const QUICK_ACTIONS: Partial<Record<LeadStatus, { next: LeadStatus; label: string }>> = {
  new: { next: 'contacted', label: 'Marquer contacté' },
  contacted: { next: 'converted', label: 'Marquer converti' },
};

export default function LeadsTable({ initialLeads }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return leads;
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  async function updateLead(id: string, patch: Partial<Lead>) {
    setLeads((current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      const res = await fetch(`/admin/api/leads/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      alert('Échec de la mise à jour');
      console.error(err);
    }
  }

  async function convertToContact(lead: Lead) {
    setConverting(lead.id);
    try {
      const res = await fetch('/admin/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          lead_id: lead.id,
        }),
      });
      if (res.status === 409) {
        alert('Ce lead est déjà dans les contacts (email en double).');
        return;
      }
      if (!res.ok) throw new Error('Create failed');
      alert('Contact créé — retrouvez-le dans Campagnes → Contacts.');
    } catch (err) {
      alert('Échec de la conversion en contact');
      console.error(err);
    } finally {
      setConverting(null);
    }
  }

  function exportCsv() {
    const headers = ['Date', 'Prénom', 'Nom', 'Email', 'Téléphone', 'Bien', 'Statut'];
    const rows = filtered.map((l) => [
      new Date(l.created_at).toLocaleDateString('fr-FR'),
      l.first_name,
      l.last_name,
      l.email,
      l.phone,
      l.property_title ?? '',
      LEAD_STATUS_LABELS[l.status],
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts: Record<LeadStatus, number> = {
    new: 0, contacted: 0, converted: 0, archived: 0,
  };
  for (const l of leads) counts[l.status] += 1;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATUS_ORDER.map((s) => {
          const isActive = statusFilter === s;
          const tone = STATUS_TONES[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(isActive ? 'all' : s)}
              className={[
                'rounded-card border p-4 text-left transition-colors',
                isActive ? `${tone.bg} ${tone.border}` : 'bg-white border-oq-border hover:bg-oq-bg',
              ].join(' ')}
            >
              <div className={`text-[12px] uppercase tracking-wider font-semibold ${tone.label}`}>
                {LEAD_STATUS_LABELS[s]}
              </div>
              <div className="text-[28px] font-extrabold text-oq-black mt-1">{counts[s]}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {statusFilter !== 'all' && (
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className="min-h-[44px] text-[13px] text-oq-muted hover:text-oq-black"
          >
            ← Tous les statuts
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={exportCsv} className="oq-btn-secondary w-full sm:w-auto">
          Exporter CSV ({filtered.length})
        </button>
      </div>

      <div className="bg-white border border-oq-border rounded-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-oq-muted">Aucun lead.</div>
        ) : (
          <>
          {/* Mobile : cartes empilées, tap = ouvre le détail */}
          <div className="md:hidden divide-y divide-oq-border">
            {filtered.map((lead) => (
              <div key={lead.id} className="p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelectedId(lead.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-oq-black text-[15px]">
                      {lead.first_name} {lead.last_name}
                    </span>
                    <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${STATUS_TONES[lead.status].badge}`}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </div>
                  <div className="text-[14px] text-oq-text mt-1 break-all">{lead.email}</div>
                  {lead.phone && (
                    <div className="text-[13px] text-oq-muted">{lead.phone}</div>
                  )}
                  <div className="flex items-center justify-between gap-3 mt-1.5 text-[13px] text-oq-muted">
                    <span className="truncate">{lead.property_title ?? '—'}</span>
                    <span className="shrink-0">
                      {new Date(lead.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </button>
                {QUICK_ACTIONS[lead.status] && (
                  <button
                    type="button"
                    onClick={() => updateLead(lead.id, { status: QUICK_ACTIONS[lead.status]!.next })}
                    className="oq-btn-secondary oq-btn-sm w-full mt-3 !text-brand-700 font-semibold"
                  >
                    {QUICK_ACTIONS[lead.status]!.label} →
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* Desktop : table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-oq-muted bg-oq-bg">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Nom</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Bien</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  className={`border-t border-oq-border cursor-pointer hover:bg-oq-bg/50 ${
                    selectedId === lead.id ? 'bg-oq-bg/80' : ''
                  }`}
                  onClick={() => setSelectedId(lead.id)}
                >
                  <td className="px-4 py-3 text-oq-muted text-[13px] whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 font-medium text-oq-black">
                    {lead.first_name} {lead.last_name}
                  </td>
                  <td className="px-4 py-3 text-oq-text">
                    <div>{lead.email}</div>
                    <div className="text-[12px] text-oq-muted">{lead.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-oq-text text-[13px]">
                    {lead.property_title ?? '—'}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_TONES[lead.status].badge}`}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[12px]" onClick={(e) => e.stopPropagation()}>
                    {QUICK_ACTIONS[lead.status] ? (
                      <button
                        type="button"
                        onClick={() => updateLead(lead.id, { status: QUICK_ACTIONS[lead.status]!.next })}
                        className="text-brand-700 hover:text-brand-800 font-semibold whitespace-nowrap"
                      >
                        {QUICK_ACTIONS[lead.status]!.label} →
                      </button>
                    ) : (
                      <span className="text-oq-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedId(null)}
        >
          <aside
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-oq-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-oq-border flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-oq-black min-w-0 truncate">
                {selected.first_name} {selected.last_name}
              </h2>
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Fermer"
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full hover:bg-oq-bg text-oq-muted text-[20px]"
              >
                ×
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 text-[14px] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Email</div>
                <a href={`mailto:${selected.email}`}>{selected.email}</a>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Téléphone</div>
                <a href={`tel:${selected.phone}`}>{selected.phone}</a>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Bien</div>
                <div>{selected.property_title ?? '—'}</div>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Statut</div>
                <select
                  className="oq-input"
                  value={selected.status}
                  onChange={(e) => updateLead(selected.id, { status: e.target.value as LeadStatus })}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Notes</div>
                <textarea
                  className="oq-input min-h-[140px]"
                  defaultValue={selected.notes ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== (selected.notes ?? '')) {
                      updateLead(selected.id, { notes: e.target.value });
                    }
                  }}
                />
              </div>
              <div className="pt-2 border-t border-oq-border">
                <button
                  type="button"
                  className="oq-btn-secondary w-full"
                  disabled={converting === selected.id}
                  onClick={() => convertToContact(selected)}
                >
                  {converting === selected.id ? 'Conversion…' : 'Convertir en contact'}
                </button>
                <p className="text-[12px] text-oq-muted mt-2">
                  Ajoute ce lead à la base de contacts des campagnes email.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
