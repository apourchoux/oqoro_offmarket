import { useMemo, useRef, useState } from 'react';
import type { Contact, ContactType } from '../../lib/types';
import {
  CONTACT_SOURCE_LABELS,
  CONTACT_TYPE_LABELS,
} from '../../lib/types';
import { REGIONS, zonesSummary } from '../../lib/zones';
import ZonesPicker from './ZonesPicker';

interface Props {
  initialContacts: Contact[];
}

const TYPE_ORDER: ContactType[] = ['proprietaire', 'investisseur', 'mixte'];

const TYPE_TONES: Record<ContactType, { bg: string; border: string; label: string; badge: string }> = {
  proprietaire: { bg: 'bg-blue-50',    border: 'border-blue-300',    label: 'text-blue-700',    badge: 'bg-blue-100 text-blue-800' },
  investisseur: { bg: 'bg-violet-50',  border: 'border-violet-300',  label: 'text-violet-700',  badge: 'bg-violet-100 text-violet-800' },
  mixte:        { bg: 'bg-emerald-50', border: 'border-emerald-300', label: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
};

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  contact_type: 'proprietaire' as ContactType,
  zones: [] as string[],
  notes: '',
};

export default function ContactsTable({ initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [typeFilter, setTypeFilter] = useState<ContactType | 'unsubscribed' | 'all'>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let list = contacts;
    if (typeFilter === 'unsubscribed') list = list.filter((c) => !c.subscribed);
    else if (typeFilter !== 'all') list = list.filter((c) => c.contact_type === typeFilter);
    if (regionFilter !== 'all') {
      const region = REGIONS.find((r) => r.code === regionFilter);
      if (region) {
        list = list.filter(
          (c) => c.zones.length === 0 || c.zones.some((z) => region.departements.includes(z)),
        );
      }
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [contacts, typeFilter, regionFilter, search]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const result: Record<ContactType, number> & { unsubscribed: number } = {
      proprietaire: 0,
      investisseur: 0,
      mixte: 0,
      unsubscribed: 0,
    };
    for (const c of contacts) {
      result[c.contact_type] += 1;
      if (!c.subscribed) result.unsubscribed += 1;
    }
    return result;
  }, [contacts]);

  async function updateContact(id: string, patch: Partial<Contact>) {
    setContacts((current) => current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      const res = await fetch(`/admin/api/contacts/${id}`, {
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

  async function deleteContact(id: string) {
    if (!confirm('Supprimer définitivement ce contact ?')) return;
    try {
      const res = await fetch(`/admin/api/contacts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setContacts((current) => current.filter((c) => c.id !== id));
      setSelectedId(null);
    } catch (err) {
      alert('Échec de la suppression');
      console.error(err);
    }
  }

  async function createContact() {
    setSaving(true);
    try {
      const res = await fetch('/admin/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          phone: form.phone || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Échec de la création');
        return;
      }
      setContacts((current) => [data.contact, ...current]);
      setForm(EMPTY_FORM);
      setAdding(false);
    } catch (err) {
      alert('Échec de la création');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function importCsv(file: File) {
    setImportReport('Import en cours…');
    try {
      const res = await fetch('/admin/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: await file.text(),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportReport(data.error ?? "Échec de l'import");
        return;
      }
      const errLines = (data.errors ?? [])
        .map((e: { line: number; reason: string }) => `ligne ${e.line} : ${e.reason}`)
        .join(' · ');
      setImportReport(
        `${data.inserted} importé(s), ${data.skipped} doublon(s) ignoré(s)` +
          (errLines ? ` — erreurs : ${errLines}` : ''),
      );
      if (data.inserted > 0) {
        // Recharge la liste pour récupérer les lignes complètes (ids, tokens).
        window.location.reload();
      }
    } catch (err) {
      setImportReport("Échec de l'import");
      console.error(err);
    }
  }

  function exportCsv() {
    const headers = ['prenom', 'nom', 'email', 'telephone', 'type', 'zones', 'abonne', 'source'];
    const rows = filtered.map((c) => [
      c.first_name,
      c.last_name,
      c.email,
      c.phone ?? '',
      c.contact_type,
      c.zones.join('|'),
      c.subscribed ? 'oui' : 'non',
      CONTACT_SOURCE_LABELS[c.source],
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statCards: Array<{ key: ContactType | 'unsubscribed'; label: string; count: number; tone: (typeof TYPE_TONES)['proprietaire'] }> = [
    ...TYPE_ORDER.map((t) => ({
      key: t as ContactType | 'unsubscribed',
      label: CONTACT_TYPE_LABELS[t],
      count: counts[t],
      tone: TYPE_TONES[t],
    })),
    {
      key: 'unsubscribed',
      label: 'Désabonnés',
      count: counts.unsubscribed,
      tone: { bg: 'bg-gray-50', border: 'border-gray-300', label: 'text-gray-600', badge: 'bg-gray-100 text-gray-700' },
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map(({ key, label, count, tone }) => {
          const isActive = typeFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(isActive ? 'all' : key)}
              className={[
                'rounded-card border p-4 text-left transition-colors',
                isActive ? `${tone.bg} ${tone.border}` : 'bg-white border-oq-border hover:bg-oq-bg',
              ].join(' ')}
            >
              <div className={`text-[12px] uppercase tracking-wider font-semibold ${tone.label}`}>
                {label}
              </div>
              <div className="text-[28px] font-extrabold text-oq-black mt-1">{count}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          className="oq-input max-w-xs"
          placeholder="Rechercher (nom, email)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="oq-input w-auto"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          <option value="all">Toutes les zones</option>
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>{r.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importCsv(file);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="oq-btn-secondary">
          Importer CSV
        </button>
        <button type="button" onClick={exportCsv} className="oq-btn-secondary">
          Exporter CSV ({filtered.length})
        </button>
        <button type="button" onClick={() => setAdding(true)} className="oq-btn-dark">
          Ajouter un contact
        </button>
      </div>

      {importReport && (
        <div className="mb-4 px-4 py-3 bg-oq-bg border border-oq-border rounded-btn text-[13px] text-oq-text">
          {importReport}
          <button type="button" onClick={() => setImportReport(null)} className="ml-3 text-oq-muted">×</button>
        </div>
      )}

      <div className="bg-white border border-oq-border rounded-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-oq-muted">
            Aucun contact.
            <div className="text-[12px] mt-2">
              Format CSV attendu : prenom, nom, email, telephone, type, zones
              (codes département séparés par « | »).
            </div>
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-oq-muted bg-oq-bg">
                <th className="px-4 py-3 font-semibold">Nom</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Zones</th>
                <th className="px-4 py-3 font-semibold">Abonné</th>
                <th className="px-4 py-3 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr
                  key={contact.id}
                  className={`border-t border-oq-border cursor-pointer hover:bg-oq-bg/50 ${
                    selectedId === contact.id ? 'bg-oq-bg/80' : ''
                  }`}
                  onClick={() => setSelectedId(contact.id)}
                >
                  <td className="px-4 py-3 font-medium text-oq-black">
                    {contact.first_name} {contact.last_name}
                  </td>
                  <td className="px-4 py-3 text-oq-text">{contact.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${TYPE_TONES[contact.contact_type].badge}`}>
                      {CONTACT_TYPE_LABELS[contact.contact_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-oq-text text-[13px]">
                    {zonesSummary(contact.zones)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-badge px-2.5 py-0.5 text-[12px] font-semibold ${
                      contact.subscribed ? 'bg-oq-green-soft text-green-700' : 'bg-oq-bg text-oq-muted'
                    }`}>
                      {contact.subscribed ? 'Oui' : 'Non'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-oq-muted text-[13px]">
                    {CONTACT_SOURCE_LABELS[contact.source]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelectedId(null)}>
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
                {selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : '—'}
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Type</div>
                <select
                  className="oq-input"
                  value={selected.contact_type}
                  onChange={(e) => updateContact(selected.id, { contact_type: e.target.value as ContactType })}
                >
                  {TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>{CONTACT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Zones de recherche</div>
                <ZonesPicker
                  value={selected.zones}
                  onChange={(zones) => updateContact(selected.id, { zones })}
                />
              </div>
              <div>
                <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-1">Notes</div>
                <textarea
                  className="oq-input min-h-[100px]"
                  defaultValue={selected.notes ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== (selected.notes ?? '')) {
                      updateContact(selected.id, { notes: e.target.value });
                    }
                  }}
                />
              </div>
              <div className="pt-2 border-t border-oq-border space-y-3">
                <button
                  type="button"
                  className="oq-btn-secondary w-full"
                  onClick={() => updateContact(selected.id, { subscribed: !selected.subscribed })}
                >
                  {selected.subscribed ? 'Désabonner' : 'Réabonner'}
                </button>
                <button
                  type="button"
                  className="w-full text-[13px] text-red-600 hover:text-red-700"
                  onClick={() => deleteContact(selected.id)}
                >
                  Supprimer ce contact
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setAdding(false)}>
          <aside
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-oq-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-oq-border flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-oq-black">Nouveau contact</h2>
              <button onClick={() => setAdding(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-oq-bg text-oq-muted">×</button>
            </div>
            <form
              className="p-6 space-y-4 text-[14px]"
              onSubmit={(e) => {
                e.preventDefault();
                createContact();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="oq-label">Prénom *</label>
                  <input
                    className="oq-input"
                    required
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="oq-label">Nom *</label>
                  <input
                    className="oq-input"
                    required
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="oq-label">Email *</label>
                <input
                  type="email"
                  className="oq-input"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="oq-label">Téléphone</label>
                <input
                  className="oq-input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="oq-label">Type</label>
                <select
                  className="oq-input"
                  value={form.contact_type}
                  onChange={(e) => setForm({ ...form, contact_type: e.target.value as ContactType })}
                >
                  {TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>{CONTACT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="oq-label">Zones de recherche</label>
                <ZonesPicker value={form.zones} onChange={(zones) => setForm({ ...form, zones })} />
              </div>
              <div>
                <label className="oq-label">Notes</label>
                <textarea
                  className="oq-input min-h-[80px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <button type="submit" className="oq-btn-dark w-full" disabled={saving}>
                {saving ? 'Création…' : 'Créer le contact'}
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
