import { useEffect, useRef, useState } from 'react';
import type { ContactList } from '../../lib/types';
import { detectDelimiter, normalizeHeader, parseCsv } from '../../lib/csv';

interface ListWithCount extends ContactList {
  member_count: number;
}

interface MemberRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  subscribed: boolean;
}

interface Props {
  initialLists: ListWithCount[];
}

type ImportField = 'email' | 'first_name' | 'last_name' | 'phone';
type ImportMapping = Record<ImportField, string>;

interface ImportResult {
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  errors: Array<{ line: number; reason: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Devine la colonne source d'un champ à partir des en-têtes (sans accents). */
function guessColumn(headers: string[], candidates: string[]): string {
  const norm = headers.map((h) => normalizeHeader(h));
  for (const cand of candidates) {
    const i = norm.indexOf(cand);
    if (i !== -1) return headers[i];
  }
  // Repli : correspondance partielle (ex. « adresse email »).
  for (const cand of candidates) {
    const i = norm.findIndex((h) => h.includes(cand));
    if (i !== -1) return headers[i];
  }
  return '';
}

export default function ListsTable({ initialLists }: Props) {
  const [lists, setLists] = useState(initialLists);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Panneau « Ajouter des contacts » du drawer : recherche serveur +
  // sélection multiple + création à la volée.
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<MemberRow[] | null>(null);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [addBusy, setAddBusy] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', email: '' });

  // ─── Import CSV par étapes (modale) ───
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importFileName, setImportFileName] = useState('');
  const [importHeaders, setImportHeaders] = useState<string[] | null>(null);
  const [importDataRows, setImportDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
  });
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!addOpen || searchQ.trim().length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/admin/api/contacts/search?q=${encodeURIComponent(searchQ.trim())}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        setResults(res.ok ? (data.contacts ?? []) : []);
      } catch {
        /* requête annulée */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addOpen, searchQ]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = search.trim()
    ? lists.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()))
    : lists;

  const openList = lists.find((l) => l.id === openListId) ?? null;

  async function createList() {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/admin/api/listes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Échec de la création');
        return;
      }
      setLists((current) => [{ ...data.list, member_count: 0 }, ...current]);
      setNewName('');
      setCreating(false);
    } catch (err) {
      alert('Échec de la création');
      console.error(err);
    }
  }

  async function renameList(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    setRenamingId(null);
    setLists((current) => current.map((l) => (l.id === id ? { ...l, name } : l)));
    try {
      const res = await fetch(`/admin/api/listes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('rename failed');
    } catch (err) {
      alert('Échec du renommage');
      console.error(err);
    }
  }

  async function deleteList(id: string) {
    if (!confirm('Supprimer cette liste ? Les contacts eux-mêmes ne sont pas supprimés.')) return;
    try {
      const res = await fetch(`/admin/api/listes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setLists((current) => current.filter((l) => l.id !== id));
      if (openListId === id) setOpenListId(null);
    } catch (err) {
      alert('Échec de la suppression');
      console.error(err);
    }
  }

  async function openMembers(id: string, opts?: { keepImport?: boolean }) {
    setOpenListId(id);
    setMembers(null);
    setAddOpen(false);
    setSearchQ('');
    setPickedIds(new Set());
    if (!opts?.keepImport) {
      setImportOpen(false);
      setImportResult(null);
    }
    try {
      const res = await fetch(`/admin/api/listes/${id}/members`);
      const data = await res.json();
      const rows: MemberRow[] = res.ok ? data.members : [];
      setMembers(rows);
      // Le compteur affiché suit la réalité (import concurrent, etc.).
      setLists((current) =>
        current.map((l) => (l.id === id ? { ...l, member_count: rows.length } : l)),
      );
    } catch {
      setMembers([]);
    }
  }

  /** Ouvre la modale d'import (étape 1 : choix du fichier). */
  function openImport() {
    setImportOpen(true);
    setImportStep(1);
    setImportFileName('');
    setImportHeaders(null);
    setImportDataRows([]);
    setMapping({ email: '', first_name: '', last_name: '', phone: '' });
    setImportError(null);
    setImportResult(null);
  }

  /** Étape 1 : lit le fichier, en extrait les colonnes et pré-remplit le mapping. */
  async function handleImportFile(file: File) {
    setImportError(null);
    setImportResult(null);
    setImportFileName(file.name);
    setImportHeaders(null);
    setImportDataRows([]);
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      if (!text.trim()) {
        setImportError('Le fichier est vide.');
        return;
      }
      const rows = parseCsv(text, detectDelimiter(text));
      const rawHeader = rows[0] ?? [];
      // Fichier « en-tête + lignes » classique ; on tolère une colonne d'emails
      // sans en-tête (l'unique colonne devient « Email »).
      const looksHeaderless =
        rawHeader.length === 1 && EMAIL_RE.test((rawHeader[0] ?? '').trim());
      const headers = looksHeaderless ? ['Email'] : rawHeader.map((h) => h.trim() || '(sans nom)');
      const dataRows = (looksHeaderless ? rows : rows.slice(1)).filter((r) =>
        r.some((c) => c.trim()),
      );

      if (dataRows.length === 0) {
        setImportError('Aucune ligne de données trouvée (en-tête seul ?).');
        return;
      }
      if (dataRows.length > 5000) {
        setImportError(`Trop de lignes : ${dataRows.length} (max 5000).`);
        return;
      }

      setImportHeaders(headers);
      setImportDataRows(dataRows);
      setMapping({
        email: guessColumn(headers, ['email', 'e-mail', 'mail', 'courriel']),
        first_name: guessColumn(headers, ['prenom', 'first_name', 'firstname', 'first']),
        last_name: guessColumn(headers, ['nom', 'last_name', 'lastname', 'name', 'last']),
        phone: guessColumn(headers, ['telephone', 'phone', 'tel', 'mobile', 'portable']),
      });
    } catch (err) {
      console.error(err);
      setImportError('Fichier illisible.');
    }
  }

  /** Aperçu de validation du mapping courant (emails valides / invalides). */
  function mapPreview(): { valid: number; invalid: number } {
    const iEmail = importHeaders && mapping.email ? importHeaders.indexOf(mapping.email) : -1;
    if (iEmail === -1) return { valid: 0, invalid: 0 };
    let valid = 0;
    let invalid = 0;
    const seen = new Set<string>();
    for (const cells of importDataRows) {
      const email = (cells[iEmail] ?? '').trim().toLowerCase();
      if (EMAIL_RE.test(email) && !seen.has(email)) {
        seen.add(email);
        valid += 1;
      } else {
        invalid += 1;
      }
    }
    return { valid, invalid };
  }

  /** Étape 3 : applique le mapping et envoie les contacts à la liste ouverte. */
  async function runImport() {
    if (!openListId || !importHeaders || importBusy) return;
    if (!mapping.email) {
      setImportError('Sélectionnez la colonne « Email ».');
      return;
    }
    const idx = (col: string) => (col ? importHeaders.indexOf(col) : -1);
    const iEmail = idx(mapping.email);
    const iFirst = idx(mapping.first_name);
    const iLast = idx(mapping.last_name);
    const iPhone = idx(mapping.phone);

    const contacts = importDataRows
      .filter((cells) => cells.some((c) => c.trim()))
      .map((cells) => ({
        email: (cells[iEmail] ?? '').trim(),
        first_name: iFirst === -1 ? '' : (cells[iFirst] ?? '').trim(),
        last_name: iLast === -1 ? '' : (cells[iLast] ?? '').trim(),
        phone: iPhone === -1 ? '' : (cells[iPhone] ?? '').trim(),
      }));

    if (contacts.length === 0) {
      setImportError('Aucune ligne à importer.');
      return;
    }

    setImportBusy(true);
    setImportError(null);
    setImportStep(3);
    try {
      const res = await fetch(`/admin/api/listes/${openListId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Échec de l'import");
        return;
      }
      const result: ImportResult = {
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        linked: data.linked ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      };
      setImportResult(result);
      setToast(`Import terminé — ${result.created} créé(s), ${result.updated} déjà connu(s)`);
      // Rafraîchit la liste ouverte (membres + compteur) sans fermer la modale.
      await openMembers(openListId, { keepImport: true });
    } catch (err) {
      console.error(err);
      setImportError("Échec de l'import");
    } finally {
      setImportBusy(false);
    }
  }

  /** Ajoute les contacts cochés (panneau de recherche) à la liste ouverte. */
  async function addPickedToList() {
    if (!openListId || pickedIds.size === 0 || addBusy) return;
    setAddBusy(true);
    try {
      const res = await fetch(`/admin/api/listes/${openListId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: [...pickedIds] }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Échec de l'ajout");
        return;
      }
      setPickedIds(new Set());
      setSearchQ('');
      await openMembers(openListId);
      setAddOpen(true);
    } catch (err) {
      alert("Échec de l'ajout");
      console.error(err);
    } finally {
      setAddBusy(false);
    }
  }

  /** Crée un contact à la volée puis l'ajoute à la liste ouverte. */
  async function createAndAdd(emailOverride?: string) {
    if (!openListId || addBusy) return;
    const { first_name, last_name } = newContact;
    const email = (newContact.email || emailOverride || '').trim();
    if (!first_name.trim() || !last_name.trim() || !email) {
      alert('Prénom, nom et email sont requis.');
      return;
    }
    setAddBusy(true);
    try {
      const createRes = await fetch('/admin/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim(),
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        alert(created.error ?? 'Création du contact impossible');
        return;
      }
      const addRes = await fetch(`/admin/api/listes/${openListId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: [created.contact.id] }),
      });
      if (!addRes.ok) {
        alert("Contact créé, mais échec de l'ajout à la liste");
        return;
      }
      setNewContact({ first_name: '', last_name: '', email: '' });
      setSearchQ('');
      await openMembers(openListId);
      setAddOpen(true);
    } catch (err) {
      alert('Création impossible');
      console.error(err);
    } finally {
      setAddBusy(false);
    }
  }

  /** Export CSV des membres de la liste ouverte (mêmes règles qu'Excel FR : BOM + ;). */
  function exportMembers() {
    if (!openList || !members || members.length === 0) return;
    const cell = (v: string | null | undefined) => {
      const s = v ?? '';
      return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ['prenom', 'nom', 'email', 'telephone', 'abonne'].join(';'),
      ...members.map((m) =>
        [cell(m.first_name), cell(m.last_name), cell(m.email), cell(m.phone), m.subscribed ? 'oui' : 'non'].join(';'),
      ),
    ];
    const blob = new Blob([`﻿${lines.join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${openList.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function removeMember(contactId: string) {
    if (!openListId) return;
    setMembers((current) => (current ?? []).filter((m) => m.id !== contactId));
    setLists((current) =>
      current.map((l) =>
        l.id === openListId ? { ...l, member_count: Math.max(0, l.member_count - 1) } : l,
      ),
    );
    try {
      const res = await fetch(`/admin/api/listes/${openListId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: [contactId] }),
      });
      if (!res.ok) throw new Error('remove failed');
    } catch (err) {
      alert('Échec du retrait');
      console.error(err);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="search"
          className="oq-input sm:max-w-xs"
          placeholder="Rechercher une liste…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="hidden sm:block sm:flex-1" />
        <button type="button" className="oq-btn-dark w-full sm:w-auto" onClick={() => setCreating(true)}>
          Créer une liste
        </button>
      </div>

      {creating && (
        <form
          className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center bg-white border border-oq-border rounded-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            createList();
          }}
        >
          <input
            className="oq-input sm:max-w-sm"
            placeholder="Nom de la liste (ex : Investisseurs Lyon)"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <button type="submit" className="oq-btn-dark">Créer</button>
            <button type="button" className="oq-btn-secondary" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-oq-border rounded-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-oq-muted">
            Aucune liste. Créez-en une puis ajoutez-y des contacts depuis
            l'onglet Contacts (sélection multiple).
          </div>
        ) : (
          <>
          {/* Mobile : cartes empilées */}
          <div className="md:hidden divide-y divide-oq-border">
            {filtered.map((list) => (
              <div key={list.id} className="p-4">
                {renamingId === list.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameList(list.id);
                    }}
                  >
                    <input
                      className="oq-input"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <button type="submit" className="oq-btn-secondary shrink-0">OK</button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => openMembers(list.id)}
                  >
                    <div className="font-semibold text-oq-black text-[15px]">{list.name}</div>
                    <div className="text-[13px] text-oq-muted mt-0.5">
                      {list.member_count} contact{list.member_count > 1 ? 's' : ''} · créée le{' '}
                      {new Date(list.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </button>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="oq-btn-secondary oq-btn-sm flex-1"
                    onClick={() => openMembers(list.id)}
                  >
                    Voir les contacts
                  </button>
                  <button
                    type="button"
                    className="oq-btn-secondary oq-btn-sm flex-1"
                    onClick={() => {
                      setRenamingId(list.id);
                      setRenameValue(list.name);
                    }}
                  >
                    Renommer
                  </button>
                  <button
                    type="button"
                    className="oq-btn-secondary oq-btn-sm !text-red-600"
                    onClick={() => deleteList(list.id)}
                  >
                    Suppr.
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop : table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-oq-muted bg-oq-bg">
                <th className="px-4 py-3 font-semibold">Nom</th>
                <th className="px-4 py-3 font-semibold text-right">Contacts</th>
                <th className="px-4 py-3 font-semibold">Créée le</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((list) => (
                <tr key={list.id} className="border-t border-oq-border hover:bg-oq-bg/50">
                  <td className="px-4 py-3 font-medium text-oq-black">
                    {renamingId === list.id ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          renameList(list.id);
                        }}
                      >
                        <input
                          className="oq-input max-w-xs"
                          value={renameValue}
                          autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                        />
                        <button type="submit" className="oq-btn-secondary oq-btn-sm">OK</button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="text-oq-black hover:text-brand-700"
                        onClick={() => openMembers(list.id)}
                      >
                        {list.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-oq-text">{list.member_count}</td>
                  <td className="px-4 py-3 text-oq-muted text-[13px]">
                    {new Date(list.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="text-[13px] text-oq-muted hover:text-oq-black mr-3"
                      onClick={() => {
                        setRenamingId(list.id);
                        setRenameValue(list.name);
                      }}
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      className="text-[13px] text-red-600 hover:text-red-700"
                      onClick={() => deleteList(list.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      {openList && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpenListId(null)}>
          <aside
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-oq-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-oq-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[18px] font-bold text-oq-black truncate">{openList.name}</h2>
                <p className="text-[13px] text-oq-muted mt-0.5">
                  {openList.member_count} contact{openList.member_count > 1 ? 's' : ''}
                </p>
              </div>
              {members !== null && members.length > 0 && (
                <button
                  type="button"
                  className="oq-btn-secondary oq-btn-sm shrink-0"
                  onClick={exportMembers}
                >
                  Exporter CSV
                </button>
              )}
              <button
                onClick={() => setOpenListId(null)}
                aria-label="Fermer"
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full hover:bg-oq-bg text-oq-muted text-[20px]"
              >
                ×
              </button>
            </div>
            <div className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {/* ─── Import CSV dans cette liste (modale par étapes) ─── */}
              <div className="mb-4">
                <button
                  type="button"
                  className="oq-btn-secondary w-full"
                  onClick={openImport}
                >
                  ↑ Importer un CSV
                </button>
              </div>

              {/* ─── Ajouter des contacts (recherche + sélection multiple) ─── */}
              <div className="mb-4">
                {!addOpen ? (
                  <button
                    type="button"
                    className="oq-btn-dark w-full"
                    onClick={() => setAddOpen(true)}
                  >
                    + Ajouter des contacts
                  </button>
                ) : (
                  <div className="border border-oq-border rounded-btn p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-oq-black">
                        Ajouter des contacts
                      </span>
                      <button
                        type="button"
                        className="text-[13px] text-oq-muted hover:text-oq-black"
                        onClick={() => {
                          setAddOpen(false);
                          setSearchQ('');
                          setPickedIds(new Set());
                        }}
                      >
                        Fermer
                      </button>
                    </div>
                    <input
                      type="search"
                      className="oq-input"
                      placeholder="Rechercher par nom ou email (2 caractères min.)…"
                      value={searchQ}
                      autoFocus
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                    {searchQ.trim().length >= 2 && results !== null && (
                      results.length > 0 ? (
                        <div className="space-y-1 max-h-56 overflow-y-auto">
                          {results.map((c) => {
                            const alreadyIn = (members ?? []).some((m) => m.id === c.id);
                            return (
                              <label
                                key={c.id}
                                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-btn text-[13px] ${
                                  alreadyIn ? 'opacity-50' : 'hover:bg-oq-bg cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={alreadyIn}
                                  checked={alreadyIn || pickedIds.has(c.id)}
                                  onChange={() =>
                                    setPickedIds((current) => {
                                      const next = new Set(current);
                                      if (next.has(c.id)) next.delete(c.id);
                                      else next.add(c.id);
                                      return next;
                                    })
                                  }
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="font-medium text-oq-black">
                                    {`${c.first_name} ${c.last_name}`.trim() || c.email}
                                  </span>
                                  <span className="text-oq-muted"> · {c.email}</span>
                                  {alreadyIn && (
                                    <span className="text-oq-muted"> (déjà dans la liste)</span>
                                  )}
                                  {!c.subscribed && (
                                    <span className="text-oq-muted"> (désabonné)</span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[13px] text-oq-muted">
                            Aucun contact trouvé. Créez-le à la volée :
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="oq-input"
                              placeholder="Prénom"
                              value={newContact.first_name}
                              onChange={(e) =>
                                setNewContact((f) => ({ ...f, first_name: e.target.value }))
                              }
                            />
                            <input
                              className="oq-input"
                              placeholder="Nom"
                              value={newContact.last_name}
                              onChange={(e) =>
                                setNewContact((f) => ({ ...f, last_name: e.target.value }))
                              }
                            />
                          </div>
                          <input
                            type="email"
                            className="oq-input"
                            placeholder="email@exemple.fr"
                            value={newContact.email || (searchQ.includes('@') ? searchQ.trim() : '')}
                            onChange={(e) =>
                              setNewContact((f) => ({ ...f, email: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="oq-btn-secondary oq-btn-sm w-full"
                            disabled={addBusy}
                            onClick={() =>
                              createAndAdd(searchQ.includes('@') ? searchQ.trim() : undefined)
                            }
                          >
                            {addBusy ? '…' : 'Créer le contact et l’ajouter'}
                          </button>
                        </div>
                      )
                    )}
                    {pickedIds.size > 0 && (
                      <button
                        type="button"
                        className="oq-btn-dark w-full"
                        disabled={addBusy}
                        onClick={addPickedToList}
                      >
                        {addBusy
                          ? 'Ajout…'
                          : `Ajouter ${pickedIds.size} contact${pickedIds.size > 1 ? 's' : ''} à la liste`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {members === null ? (
                <p className="text-oq-muted text-[14px]">Chargement…</p>
              ) : members.length === 0 ? (
                <p className="text-oq-muted text-[14px]">
                  Liste vide. Utilisez « + Ajouter des contacts » ci-dessus, ou
                  cochez des contacts dans l'onglet Contacts puis « Ajouter à
                  une liste ».
                </p>
              ) : (
                <ul className="divide-y divide-oq-border">
                  {members.map((m) => (
                    <li key={m.id} className="py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-oq-black truncate">
                          {m.first_name} {m.last_name}
                          {!m.subscribed && (
                            <span className="ml-2 text-[11px] text-oq-muted">(désabonné)</span>
                          )}
                        </div>
                        <div className="text-[12px] text-oq-muted truncate">{m.email}</div>
                      </div>
                      <button
                        type="button"
                        className="min-h-[44px] px-2 text-[13px] text-red-600 hover:text-red-700 whitespace-nowrap"
                        onClick={() => removeMember(m.id)}
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ─── Modale d'import CSV (étapes : fichier → mapping → résultat) ─── */}
      {openList && importOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setImportOpen(false)}
        >
          <div
            className="bg-white rounded-card border border-oq-border w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6 border-b border-oq-border flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-bold text-oq-black">Importer des contacts (CSV)</h3>
                <p className="text-[13px] text-oq-muted mt-0.5">
                  Ajoutez des contacts à « {openList.name} » depuis un fichier CSV.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-oq-bg text-oq-muted text-[20px]"
                onClick={() => setImportOpen(false)}
              >
                ×
              </button>
            </div>

            {/* Indicateur d'étapes */}
            <div className="px-5 sm:px-6 pt-4 flex items-center gap-2">
              {[
                { n: 1 as const, label: 'Fichier' },
                { n: 2 as const, label: 'Colonnes' },
                { n: 3 as const, label: 'Import' },
              ].map((s, i) => {
                const done = importStep > s.n || (s.n === 3 && Boolean(importResult));
                const active = importStep === s.n;
                return (
                  <div key={s.n} className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${
                          done
                            ? 'bg-green-600 text-white'
                            : active
                              ? 'bg-oq-black text-white'
                              : 'bg-oq-bg text-oq-muted'
                        }`}
                      >
                        {done ? '✓' : s.n}
                      </span>
                      <span
                        className={`text-[13px] ${active || done ? 'text-oq-black font-medium' : 'text-oq-muted'}`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < 2 && <div className="w-6 h-px bg-oq-border" />}
                  </div>
                );
              })}
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {/* ── Étape 1 : fichier ── */}
              {importStep === 1 && (
                <div className="space-y-3">
                  <label className="oq-label">Fichier CSV</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="block w-full text-[13px] text-oq-text file:mr-3 file:py-2 file:px-3 file:rounded-btn file:border file:border-oq-border file:bg-oq-bg file:text-oq-black file:text-[13px] file:font-medium file:cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                    }}
                  />
                  {importFileName && (
                    <p className="text-[12px] text-oq-black font-medium truncate">📄 {importFileName}</p>
                  )}
                  <p className="text-[12px] text-oq-muted leading-snug">
                    Séparateur « , » ou « ; » détecté automatiquement. Une colonne{' '}
                    <span className="font-medium">email</span> est requise ; un simple fichier
                    d'emails (une colonne) est aussi accepté.
                  </p>
                  {importError ? (
                    <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-btn text-[13px] text-red-700">
                      ✗ {importError}
                    </div>
                  ) : importHeaders ? (
                    <div className="px-3 py-2.5 bg-oq-green-soft border border-green-200 rounded-btn text-[13px] text-green-800">
                      ✓ Fichier validé — {importDataRows.length} ligne
                      {importDataRows.length > 1 ? 's' : ''} · {importHeaders.length} colonne
                      {importHeaders.length > 1 ? 's' : ''} détectée{importHeaders.length > 1 ? 's' : ''}.
                    </div>
                  ) : null}
                </div>
              )}

              {/* ── Étape 2 : mapping des colonnes ── */}
              {importStep === 2 && importHeaders && (
                <div className="space-y-3">
                  <p className="text-[13px] text-oq-text">
                    Associez les colonnes de votre fichier aux champs de contact.
                  </p>
                  <div className="space-y-2.5">
                    {(
                      [
                        { key: 'email', label: 'Email', required: true },
                        { key: 'first_name', label: 'Prénom', required: false },
                        { key: 'last_name', label: 'Nom', required: false },
                        { key: 'phone', label: 'Téléphone', required: false },
                      ] as Array<{ key: ImportField; label: string; required: boolean }>
                    ).map(({ key, label, required }) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-[13px] text-oq-text w-24 shrink-0">
                          {label}
                          {required && <span className="text-red-500"> *</span>}
                        </span>
                        <select
                          className="oq-input flex-1"
                          value={mapping[key]}
                          onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                        >
                          <option value="">{required ? '— Choisir —' : 'Ignorer'}</option>
                          {importHeaders.map((h, i) => (
                            <option key={`${h}-${i}`} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {/* Validation live du mapping */}
                  {(() => {
                    if (!mapping.email) {
                      return (
                        <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-btn text-[13px] text-amber-800">
                          Sélectionnez la colonne « Email » pour continuer.
                        </div>
                      );
                    }
                    const p = mapPreview();
                    return p.valid === 0 ? (
                      <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-btn text-[13px] text-red-700">
                        ✗ Aucun email valide dans la colonne choisie.
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 bg-oq-green-soft border border-green-200 rounded-btn text-[13px] text-green-800">
                        ✓ {p.valid} contact{p.valid > 1 ? 's' : ''} prêt{p.valid > 1 ? 's' : ''} à l'import
                        {p.invalid > 0 && (
                          <>
                            {' '}
                            · {p.invalid} ligne{p.invalid > 1 ? 's' : ''} ignorée
                            {p.invalid > 1 ? 's' : ''} (email invalide ou doublon)
                          </>
                        )}
                        .
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── Étape 3 : import / résultat ── */}
              {importStep === 3 && (
                <div className="space-y-3">
                  {importBusy ? (
                    <div className="py-8 text-center text-oq-muted text-[14px]">
                      Import en cours…
                    </div>
                  ) : importResult ? (
                    <div className="px-4 py-3 bg-oq-green-soft border border-green-200 rounded-btn text-[13px] text-green-800">
                      <p className="font-bold text-[14px] mb-1">✓ Import terminé</p>
                      <p>
                        <span className="font-bold">{importResult.created}</span> contact
                        {importResult.created > 1 ? 's' : ''} créé{importResult.created > 1 ? 's' : ''}
                      </p>
                      <p>
                        <span className="font-bold">{importResult.updated}</span> déjà connu
                        {importResult.updated > 1 ? 's' : ''} (ajouté{importResult.updated > 1 ? 's' : ''} à la liste)
                      </p>
                      <p>
                        <span className="font-bold">
                          {importResult.skipped + importResult.errors.length}
                        </span>{' '}
                        ignoré{importResult.skipped + importResult.errors.length > 1 ? 's' : ''} (emails
                        invalides ou doublons)
                      </p>
                      {importResult.errors.length > 0 && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-green-900/80">
                            Voir les {importResult.errors.length} erreur(s)
                          </summary>
                          <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                            {importResult.errors.slice(0, 50).map((er, i) => (
                              <li key={i} className="text-green-900/70">
                                ligne {er.line} : {er.reason}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ) : importError ? (
                    <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-btn text-[13px] text-red-700">
                      <p className="font-bold mb-0.5">✗ Échec de l'import</p>
                      <p>{importError}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Pied : navigation entre étapes */}
            <div className="p-5 sm:p-6 border-t border-oq-border flex justify-between gap-2">
              <div>
                {importStep === 2 && (
                  <button
                    type="button"
                    className="oq-btn-secondary"
                    onClick={() => {
                      setImportStep(1);
                      setImportError(null);
                    }}
                  >
                    ← Retour
                  </button>
                )}
                {importStep === 3 && !importBusy && (
                  <button type="button" className="oq-btn-secondary" onClick={openImport}>
                    Importer un autre fichier
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="oq-btn-secondary"
                  onClick={() => setImportOpen(false)}
                >
                  {importStep === 3 && importResult ? 'Terminer' : 'Fermer'}
                </button>
                {importStep === 1 && (
                  <button
                    type="button"
                    className="oq-btn-dark"
                    disabled={!importHeaders || Boolean(importError)}
                    onClick={() => setImportStep(2)}
                  >
                    Continuer →
                  </button>
                )}
                {importStep === 2 && (
                  <button
                    type="button"
                    className="oq-btn-dark"
                    disabled={!mapping.email || mapPreview().valid === 0 || importBusy}
                    onClick={runImport}
                  >
                    Importer {mapPreview().valid > 0 ? `(${mapPreview().valid})` : ''}
                  </button>
                )}
                {importStep === 3 && importError && !importBusy && (
                  <button
                    type="button"
                    className="oq-btn-dark"
                    onClick={() => {
                      setImportStep(2);
                      setImportError(null);
                    }}
                  >
                    Réessayer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast de confirmation ─── */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[60] max-w-xs px-4 py-3 bg-oq-black text-white rounded-card shadow-lg text-[13px] flex items-start gap-3">
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            aria-label="Fermer"
            className="text-white/70 hover:text-white"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
