import { useState } from 'react';

// Formulaire « Créer une campagne » (parité Mailer) : nom + dossier optionnel,
// création immédiate d'un brouillon puis redirection vers l'assistant.
export default function CampaignCreate() {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!name.trim() || creating) return;
    setError('');
    setCreating(true);
    try {
      const res = await fetch('/admin/api/campagnes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          folder: folder.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur inconnue lors de la création');
        return;
      }
      window.location.href = `/admin/campagnes/${data.campaign.id}`;
    } catch (err) {
      console.error(err);
      setError('Erreur réseau lors de la création');
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      create();
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-[24px] sm:text-[28px] font-extrabold text-oq-black text-center mb-8">
        Créer une campagne
      </h1>

      <div className="bg-white border border-oq-border rounded-card p-6 sm:p-8">
        <h2 className="text-[16px] font-bold text-oq-black mb-5">Informations de base</h2>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-btn text-[13px] text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="oq-label">Nom de la campagne *</label>
            <input
              className="oq-input"
              placeholder="ex : Relance propriétaires Corse"
              maxLength={128}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
            />
            <p className="text-[12px] text-oq-muted mt-1">{name.length}/128 caractères</p>
          </div>

          <div>
            <label className="oq-label">Dossier (optionnel)</label>
            <input
              className="oq-input"
              placeholder="ex : Prospection"
              maxLength={100}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <a href="/admin/campagnes" className="oq-btn-secondary text-center">
              Annuler
            </a>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={!name.trim() || creating}
              onClick={create}
            >
              {creating ? 'Création…' : 'Créer la campagne'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
