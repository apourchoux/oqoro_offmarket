import { useEffect, useState } from 'react';
import type { ContactList } from '../../lib/types';

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

  async function openMembers(id: string) {
    setOpenListId(id);
    setMembers(null);
    setAddOpen(false);
    setSearchQ('');
    setPickedIds(new Set());
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
    </div>
  );
}
