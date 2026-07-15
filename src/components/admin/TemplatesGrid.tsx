import { useState } from 'react';
import type { EmailTemplate } from '../../lib/types';
import { BASE_TEMPLATES } from '../../lib/base-templates';

interface Props {
  initialTemplates: EmailTemplate[];
}

export default function TemplatesGrid({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [busy, setBusy] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  /** Amorce la bibliothèque avec les 3 modèles de base (parité Mailer). */
  async function seedBaseTemplates() {
    setSeeding(true);
    try {
      const created: EmailTemplate[] = [];
      for (const t of BASE_TEMPLATES) {
        const res = await fetch('/admin/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error ?? "Échec de l'ajout des modèles de base");
          break;
        }
        created.push(data.template);
      }
      if (created.length > 0) {
        setTemplates((current) => [...created, ...current]);
      }
    } catch (err) {
      alert("Échec de l'ajout des modèles de base");
      console.error(err);
    } finally {
      setSeeding(false);
    }
  }

  async function duplicateTemplate(t: EmailTemplate) {
    setBusy(t.id);
    try {
      const res = await fetch('/admin/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${t.name} (copie)`, html: t.html }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Échec de la duplication');
        return;
      }
      setTemplates((current) => [data.template, ...current]);
    } catch (err) {
      alert('Échec de la duplication');
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Supprimer ce template ?')) return;
    setBusy(id);
    try {
      const res = await fetch(`/admin/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setTemplates((current) => current.filter((t) => t.id !== id));
    } catch (err) {
      alert('Échec de la suppression');
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="bg-white border border-oq-border rounded-card p-16 text-center">
        <p className="text-oq-muted mb-6">
          Aucun template. Créez un modèle HTML réutilisable pour vos campagnes
          (variables : {'{{first_name}}'}, {'{{last_name}}'}, {'{{email}}'},{' '}
          {'{{unsubscribe_url}}'}).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            className="oq-btn-dark"
            disabled={seeding}
            onClick={seedBaseTemplates}
          >
            {seeding ? 'Ajout…' : 'Ajouter les modèles de base'}
          </button>
          <a href="/admin/campagnes/templates/new" className="oq-btn-secondary">
            Créer un template vierge
          </a>
        </div>
        <p className="text-[12px] text-oq-muted mt-4">
          3 modèles prêts à l'emploi : Email simple, Email avec CTA, Email texte pur.
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
      {templates.map((t) => (
        <div key={t.id} className="bg-white border border-oq-border rounded-card overflow-hidden flex flex-col">
          <a
            href={`/admin/campagnes/templates/${t.id}`}
            className="block h-56 overflow-hidden bg-oq-bg relative no-underline"
          >
            <iframe
              title={t.name}
              sandbox=""
              srcDoc={t.html}
              tabIndex={-1}
              className="w-[200%] h-[448px] origin-top-left scale-50 pointer-events-none bg-white"
            />
            <span className="absolute inset-0" />
          </a>
          <div className="p-4 border-t border-oq-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-oq-black text-[15px] truncate">{t.name}</div>
              <div className="text-[12px] text-oq-muted">
                {new Date(t.updated_at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={`/admin/campagnes/templates/${t.id}`}
                className="min-h-[44px] px-2 inline-flex items-center text-[13px] text-oq-muted hover:text-oq-black no-underline"
                title="Éditer"
              >
                Éditer
              </a>
              <button
                type="button"
                className="min-h-[44px] px-2 text-[13px] text-oq-muted hover:text-oq-black"
                disabled={busy === t.id}
                onClick={() => duplicateTemplate(t)}
                title="Dupliquer"
              >
                Dupliquer
              </button>
              <button
                type="button"
                className="min-h-[44px] px-2 text-[13px] text-red-600 hover:text-red-700"
                disabled={busy === t.id}
                onClick={() => deleteTemplate(t.id)}
                title="Supprimer"
              >
                Suppr.
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
