import { useMemo, useState } from 'react';
import type { Lead, LeadStatus } from '../../lib/types';
import { LEAD_STATUS_LABELS } from '../../lib/types';

interface Props {
  initialLeads: Array<Lead & { property_title?: string | null }>;
}

const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'converted', 'archived'];

export default function LeadsTable({ initialLeads }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          className="oq-input max-w-[200px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
        >
          <option value="all">Tous les statuts</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button type="button" onClick={exportCsv} className="oq-btn-secondary">
          Exporter CSV
        </button>
      </div>

      <div className="bg-white border border-oq-border rounded-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-oq-muted">Aucun lead.</div>
        ) : (
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
                    <select
                      className="text-[13px] border border-oq-border rounded-btn px-2 py-1 bg-white"
                      value={lead.status}
                      onChange={(e) => updateLead(lead.id, { status: e.target.value as LeadStatus })}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right text-oq-muted text-[13px]">→</td>
                </tr>
              ))}
            </tbody>
          </table>
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
            <div className="p-6 border-b border-oq-border flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-oq-black">
                {selected.first_name} {selected.last_name}
              </h2>
              <button onClick={() => setSelectedId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-oq-bg text-oq-muted">×</button>
            </div>
            <div className="p-6 space-y-4 text-[14px]">
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
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
