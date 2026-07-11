import { useMemo, useState } from 'react';
import type { EmailTemplate } from '../../lib/types';
import { TEMPLATE_VARIABLES } from '../../lib/campaign-email';

interface Props {
  // null = nouveau template.
  initialTemplate: EmailTemplate | null;
}

const STARTER_HTML = `<html lang="fr">
<body style="margin:0;padding:0;background:#F2F2F7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px">
        <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33334A">

          <p style="margin:0 0 16px">Bonjour {{first_name}},</p>

          <p style="margin:0 0 16px">Votre message ici.</p>

          <p style="margin:24px 0 0;font-size:12px;color:#9A9AAF">
            Vous recevez cet email de la part d'OQORO.
            <a href="{{unsubscribe_url}}" style="color:#77778C">Se désabonner</a>
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// Aperçu : mêmes substitutions que le rendu serveur, avec un contact fictif.
function previewHtml(html: string): string {
  return html
    .replace(/\{\{\s*first_name\s*\}\}/g, 'Jean')
    .replace(/\{\{\s*last_name\s*\}\}/g, 'Dupont')
    .replace(/\{\{\s*email\s*\}\}/g, 'jean.dupont@exemple.fr')
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '#');
}

export default function TemplateEditor({ initialTemplate }: Props) {
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? null);
  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [html, setHtml] = useState(initialTemplate?.html ?? STARTER_HTML);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rendered = useMemo(() => previewHtml(html), [html]);

  function insertVariable(token: string) {
    const textarea = document.getElementById('template-html') as HTMLTextAreaElement | null;
    if (!textarea) {
      setHtml((current) => current + token);
      setDirty(true);
      return;
    }
    const start = textarea.selectionStart ?? html.length;
    const end = textarea.selectionEnd ?? html.length;
    const next = html.slice(0, start) + token + html.slice(end);
    setHtml(next);
    setDirty(true);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(): Promise<boolean> {
    if (!name.trim()) {
      setNotice('Donnez un nom au template avant de sauvegarder.');
      return false;
    }
    setSaving(true);
    try {
      const url = templateId
        ? `/admin/api/templates/${templateId}`
        : '/admin/api/templates';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), html }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Échec de la sauvegarde');
        return false;
      }
      if (!templateId && data.template) {
        setTemplateId(data.template.id);
        window.history.replaceState(null, '', `/admin/campagnes/templates/${data.template.id}`);
      }
      setDirty(false);
      setNotice('Template enregistré.');
      return true;
    } catch (err) {
      console.error(err);
      setNotice('Échec de la sauvegarde');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndQuit() {
    if (await save()) {
      window.location.href = '/admin/campagnes/templates';
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          className="oq-input max-w-sm font-semibold"
          placeholder="Nom du template"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        <div className="flex gap-1 bg-white border border-oq-border rounded-btn p-1">
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            className={`px-3 py-1 rounded-btn text-[13px] ${device === 'desktop' ? 'bg-oq-black text-white' : 'text-oq-text hover:bg-oq-bg'}`}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            className={`px-3 py-1 rounded-btn text-[13px] ${device === 'mobile' ? 'bg-oq-black text-white' : 'text-oq-text hover:bg-oq-bg'}`}
          >
            Mobile
          </button>
        </div>
        <div className="flex-1" />
        {notice && <span className="text-[13px] text-oq-muted">{notice}</span>}
        <button type="button" className="oq-btn-secondary" disabled={saving || !dirty} onClick={save}>
          {saving ? 'Enregistrement…' : 'Sauvegarder'}
        </button>
        <button type="button" className="oq-btn-dark" disabled={saving} onClick={saveAndQuit}>
          Enregistrer &amp; quitter
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-[13px]">
        <span className="text-oq-muted">Variables :</span>
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            className="px-2 py-1 bg-white border border-oq-border rounded-btn font-mono text-[12px] hover:bg-oq-bg"
            title={v.label}
            onClick={() => insertVariable(v.token)}
          >
            {v.token}
          </button>
        ))}
        <span className="text-oq-muted text-[12px]">
          (cliquer pour insérer au curseur — le lien de désabonnement est ajouté
          automatiquement s'il manque)
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <textarea
          id="template-html"
          className="oq-input font-mono text-[13px] leading-relaxed min-h-[70vh] whitespace-pre"
          spellCheck={false}
          value={html}
          onChange={(e) => {
            setHtml(e.target.value);
            setDirty(true);
          }}
        />
        <div className="bg-white border border-oq-border rounded-card overflow-hidden lg:sticky lg:top-6">
          <div className="px-4 py-2 border-b border-oq-border text-[12px] uppercase tracking-wider text-oq-muted font-semibold flex items-center justify-between">
            <span>Aperçu ({device === 'desktop' ? 'desktop' : 'mobile 375 px'})</span>
          </div>
          <div className="bg-oq-bg flex justify-center">
            <iframe
              title="Aperçu du template"
              sandbox=""
              srcDoc={rendered}
              className={`h-[70vh] bg-white ${device === 'mobile' ? 'w-[375px]' : 'w-full'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
