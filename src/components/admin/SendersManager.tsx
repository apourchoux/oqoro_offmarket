import { useState } from 'react';
import type { CampaignSender } from '../../lib/types';

interface Props {
  initialSenders: CampaignSender[];
}

/**
 * Gestion des expéditeurs pré-enregistrés (onglet Configuration) : ils sont
 * proposés en cartes dans l'étape Expéditeur de l'assistant de campagne.
 */
export default function SendersManager({ initialSenders }: Props) {
  const [senders, setSenders] = useState(initialSenders);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addSender() {
    if (!name.trim() || !email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/admin/api/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          reply_to: replyTo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Création impossible');
        return;
      }
      setSenders((current) => [...current, data.sender]);
      setName('');
      setEmail('');
      setReplyTo('');
    } catch (err) {
      console.error(err);
      setError('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  async function removeSender(id: string) {
    if (!confirm('Supprimer cet expéditeur ?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/admin/api/senders/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Suppression impossible');
        return;
      }
      setSenders((current) => current.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
      setError('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-btn text-[13px] text-red-700">
          {error}
        </div>
      )}

      {senders.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-2 mb-4">
          {senders.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-2 p-3 border border-oq-border rounded-btn"
            >
              <div className="min-w-0">
                <div className="font-semibold text-oq-black text-[14px] truncate">{s.name}</div>
                <div className="text-[13px] text-brand-700 break-all">{s.email}</div>
                {s.reply_to && (
                  <div className="text-[12px] text-oq-muted break-all">
                    Reply-to : {s.reply_to}
                  </div>
                )}
                <div className="text-[12px] text-oq-muted">
                  resend · &lt;{s.email.split('@')[1] ?? ''}&gt;
                </div>
              </div>
              <button
                type="button"
                className="text-[13px] text-oq-muted hover:text-red-600 shrink-0"
                disabled={busy}
                onClick={() => removeSender(s.id)}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="oq-label">Nom</label>
          <input
            className="oq-input"
            placeholder="Christophe Souvras"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="oq-label">Email</label>
          <input
            type="email"
            className="oq-input"
            placeholder="christophe@app.oqoro.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="oq-label">Reply-to (optionnel)</label>
          <input
            type="email"
            className="oq-input"
            placeholder="christophe@oqoro.com"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3">
        <button
          type="button"
          className="oq-btn-secondary"
          disabled={!name.trim() || !email.trim() || busy}
          onClick={addSender}
        >
          {busy ? '…' : '+ Ajouter un expéditeur'}
        </button>
      </div>
      <p className="text-[12px] text-oq-muted mt-3">
        L'email doit appartenir à un domaine vérifié dans Resend (voir le diagnostic ci-dessus).
      </p>
    </div>
  );
}
