import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

interface EditorCampaign {
  id: string;
  name: string;
  custom_html: string | null;
}

interface Props {
  campaign: EditorCampaign;
}

interface TemplateRow {
  id: string;
  name: string;
  html: string;
  updated_at: string;
}

interface PreviewContact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const VARIABLES = [
  { name: '{{first_name}}', label: 'Prénom' },
  { name: '{{last_name}}', label: 'Nom' },
  { name: '{{email}}', label: 'Email' },
  { name: '{{unsubscribe_url}}', label: 'Lien de désinscription' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { padding: 32px; text-align: center; background-color: #1a1a2e; color: #ffffff; }
    .content { padding: 32px; color: #333333; line-height: 1.6; }
    .footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999999; background-color: #f3f4f6; }
    .footer a { color: #666666; }
    h1 { margin: 0; font-size: 24px; }
    .btn { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Oqoro</h1>
    </div>
    <div class="content">
      <p>Bonjour {{first_name}},</p>
      <p>Votre contenu ici...</p>
      <p><a href="#" class="btn">En savoir plus</a></p>
    </div>
    <div class="footer">
      <p>Oqoro &mdash; Off Market</p>
      <p><a href="{{unsubscribe_url}}">Se désinscrire</a></p>
    </div>
  </div>
</body>
</html>`;

function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-card border border-oq-border p-6 w-full ${wide ? 'max-w-lg' : 'max-w-sm'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[17px] font-bold text-oq-black mb-1">{title}</h3>
        {description && <p className="text-[13px] text-oq-muted mb-4">{description}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * Éditeur de design plein écran (parité Mailer) : code HTML à gauche
 * (Monaco), aperçu live à droite avec bascule desktop/mobile, insertion de
 * variables, sauvegarde/chargement de templates, test multi-adresses et
 * prévisualisation avec les données d'un vrai contact.
 */
export default function DesignEditor({ campaign }: Props) {
  const [htmlContent, setHtmlContent] = useState(campaign.custom_html || DEFAULT_TEMPLATE);
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showVarMenu, setShowVarMenu] = useState(false);

  // Modals
  const [testOpen, setTestOpen] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [testing, setTesting] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const [loadTplOpen, setLoadTplOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [confirmTpl, setConfirmTpl] = useState<TemplateRow | null>(null);

  // Aperçu avec un vrai contact
  const [previewEmail, setPreviewEmail] = useState('');
  const [debouncedEmail, setDebouncedEmail] = useState('');
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [previewContact, setPreviewContact] = useState<PreviewContact | null>(null);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(previewEmail.trim().toLowerCase()), 400);
    return () => clearTimeout(t);
  }, [previewEmail]);

  const validPreviewEmail = EMAIL_REGEX.test(debouncedEmail);

  useEffect(() => {
    if (!validPreviewEmail) {
      setLookupState('idle');
      setPreviewContact(null);
      return;
    }
    const controller = new AbortController();
    setLookupState('loading');
    fetch(`/admin/api/contacts/lookup?email=${encodeURIComponent(debouncedEmail)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setPreviewContact(data.contact);
          setLookupState('found');
        } else {
          setPreviewContact(null);
          setLookupState('notfound');
        }
      })
      .catch(() => {
        /* requête annulée */
      });
    return () => controller.abort();
  }, [debouncedEmail, validPreviewEmail]);

  // Substitution des variables — reflète l'envoi réel : avec un vrai contact,
  // les champs vides restent vides ; sinon, données de démonstration.
  const usingContact = validPreviewEmail && lookupState === 'found' && previewContact;
  const pFirst = usingContact ? previewContact!.first_name || '' : 'Jean';
  const pLast = usingContact ? previewContact!.last_name || '' : 'Dupont';
  const pEmail = usingContact ? previewContact!.email : 'jean.dupont@exemple.fr';
  const previewHtml = htmlContent
    .replace(/\{\{\s*first_name\s*\}\}/g, pFirst)
    .replace(/\{\{\s*last_name\s*\}\}/g, pLast)
    .replace(/\{\{\s*email\s*\}\}/g, pEmail)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '#');

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(`/admin/api/campagnes/${campaign.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_html: htmlContent, content_mode: 'custom' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Échec de la sauvegarde');
        return false;
      }
      setSaved(true);
      setNotice(null);
      return true;
    } catch (err) {
      console.error(err);
      setNotice('Échec de la sauvegarde (réseau)');
      return false;
    } finally {
      setSaving(false);
    }
  }, [campaign.id, htmlContent]);

  async function saveAndExit() {
    if (await save()) {
      window.location.href = `/admin/campagnes/${campaign.id}`;
    }
  }

  function insertVariable(variable: string) {
    const editor = editorRef.current;
    if (editor) {
      const selection = editor.getSelection();
      editor.executeEdits('insert-variable', [
        {
          range: selection ?? {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
          text: variable,
          forceMoveMarkers: true,
        },
      ]);
      editor.focus();
      setHtmlContent(editor.getValue());
    } else {
      setHtmlContent((prev) => prev + variable);
    }
    setSaved(false);
    setShowVarMenu(false);
  }

  async function sendTest() {
    const emails = testEmails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    setTesting(true);
    try {
      // Sauvegarde le contenu courant avant le test.
      if (!(await save())) return;
      const res = await fetch(`/admin/api/campagnes/${campaign.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestOpen(false);
        setNotice(`Email de test envoyé à ${data.to}.`);
      } else {
        setNotice(data.error ?? 'Échec du test');
      }
    } catch (err) {
      console.error(err);
      setNotice('Échec du test');
    } finally {
      setTesting(false);
    }
  }

  async function saveAsTemplate() {
    if (!tplName.trim()) return;
    setSavingTpl(true);
    try {
      const res = await fetch('/admin/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tplName.trim(), html: htmlContent }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveTplOpen(false);
        setNotice(`Template « ${tplName.trim()} » enregistré.`);
        setTplName('');
      } else {
        setNotice(data.error ?? "Échec de l'enregistrement du template");
      }
    } catch (err) {
      console.error(err);
      setNotice("Échec de l'enregistrement du template");
    } finally {
      setSavingTpl(false);
    }
  }

  async function openLoadTemplates() {
    setLoadTplOpen(true);
    if (templates === null) {
      try {
        const res = await fetch('/admin/api/templates');
        const data = await res.json();
        setTemplates(res.ok ? (data.templates ?? []) : []);
      } catch {
        setTemplates([]);
      }
    }
  }

  function confirmLoadTemplate() {
    if (confirmTpl) {
      setHtmlContent(confirmTpl.html);
      setSaved(false);
    }
    setConfirmTpl(null);
    setLoadTplOpen(false);
  }

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <div className="flex flex-col border border-oq-border rounded-card bg-white overflow-hidden h-[calc(100vh-180px)] min-h-[560px]">
      {/* ─── Barre d'outils ─── */}
      <div className="flex items-center justify-between gap-2 border-b border-oq-border px-3 py-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={`/admin/campagnes/${campaign.id}`}
            className="oq-btn-secondary oq-btn-sm no-underline shrink-0"
            title="Retour à la campagne"
          >
            ←
          </a>
          <span className="font-bold text-[14px] text-oq-black truncate">{campaign.name}</span>
          {!saved && (
            <span className="text-[12px] text-oq-muted shrink-0">(non sauvegardé)</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Bascule desktop / mobile */}
          <div className="flex gap-1 bg-oq-bg rounded-btn p-1">
            <button
              type="button"
              onClick={() => setPreviewMode('desktop')}
              className={`px-2.5 py-1 rounded-btn text-[12px] ${previewMode === 'desktop' ? 'bg-white shadow-sm text-oq-black' : 'text-oq-muted'}`}
              title="Aperçu desktop"
            >
              🖥
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              className={`px-2.5 py-1 rounded-btn text-[12px] ${previewMode === 'mobile' ? 'bg-white shadow-sm text-oq-black' : 'text-oq-muted'}`}
              title="Aperçu mobile"
            >
              📱
            </button>
          </div>

          {/* Variables */}
          <div className="relative">
            <button
              type="button"
              className="oq-btn-secondary oq-btn-sm"
              onClick={() => setShowVarMenu((v) => !v)}
            >
              {'{x}'} <span className="hidden md:inline">Variables</span>
            </button>
            {showVarMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-oq-border rounded-btn shadow-lg z-50 overflow-hidden">
                {VARIABLES.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-oq-bg flex justify-between gap-3"
                    onClick={() => insertVariable(v.name)}
                  >
                    <span>{v.label}</span>
                    <span className="text-oq-muted font-mono text-[11px]">{v.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="oq-btn-secondary oq-btn-sm"
            onClick={() => setSaveTplOpen(true)}
          >
            <span className="hidden md:inline">Sauvegarder comme template</span>
            <span className="md:hidden">Tpl +</span>
          </button>
          <button type="button" className="oq-btn-secondary oq-btn-sm" onClick={openLoadTemplates}>
            <span className="hidden md:inline">Charger un template</span>
            <span className="md:hidden">Tpl ↓</span>
          </button>
          <button
            type="button"
            className="oq-btn-secondary oq-btn-sm"
            onClick={() => setTestOpen(true)}
          >
            Tester
          </button>
          <button
            type="button"
            className="oq-btn-secondary oq-btn-sm"
            disabled={saved || saving}
            onClick={save}
          >
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <button type="button" className="oq-btn-dark oq-btn-sm" onClick={saveAndExit}>
            Enregistrer &amp; Quitter
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-2 bg-oq-bg border-b border-oq-border text-[13px] text-oq-text">
          {notice}
        </div>
      )}

      {/* ─── Éditeur + aperçu ─── */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="w-full md:w-1/2 h-1/2 md:h-auto border-b md:border-b-0 md:border-r border-oq-border">
          <Editor
            height="100%"
            language="html"
            value={htmlContent}
            onChange={(value) => {
              setHtmlContent(value ?? '');
              setSaved(false);
            }}
            onMount={onMount}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
            }}
          />
        </div>

        <div className="w-full md:w-1/2 bg-oq-bg flex flex-col overflow-hidden">
          {/* Barre « prévisualiser avec un contact » */}
          <div className="flex items-center gap-2 border-b border-oq-border bg-white px-3 py-2">
            <span className="text-oq-muted shrink-0" aria-hidden="true">
              ✉
            </span>
            <input
              type="email"
              className="oq-input !py-1.5 text-[13px] flex-1 min-w-0"
              placeholder="Prévisualiser avec un contact (email)"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value)}
            />
            {validPreviewEmail && lookupState === 'loading' && (
              <span className="text-[12px] text-oq-muted whitespace-nowrap">Recherche…</span>
            )}
            {validPreviewEmail && lookupState === 'found' && previewContact && (
              <span className="text-[12px] text-emerald-600 whitespace-nowrap">
                ✓{' '}
                {previewContact.first_name || previewContact.last_name
                  ? `${previewContact.first_name} ${previewContact.last_name}`.trim()
                  : previewContact.email}
              </span>
            )}
            {validPreviewEmail && lookupState === 'notfound' && (
              <span className="text-[12px] text-amber-600 whitespace-nowrap">✗ Introuvable</span>
            )}
          </div>
          <div className="flex-1 flex justify-center p-4 overflow-auto">
            <div
              className="bg-white shadow-lg rounded-btn overflow-hidden max-w-full"
              style={{ width: previewMode === 'desktop' ? '600px' : '375px' }}
            >
              <iframe
                title="Aperçu de l'email"
                sandbox=""
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ height: '100%', minHeight: '600px' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal test ─── */}
      {testOpen && (
        <Modal
          title="Envoyer un email test"
          description="Séparez les adresses par des virgules (10 maximum)."
          onClose={() => setTestOpen(false)}
        >
          <input
            className="oq-input mb-4"
            placeholder="email1@exemple.fr, email2@exemple.fr"
            value={testEmails}
            onChange={(e) => setTestEmails(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
            <button type="button" className="oq-btn-secondary" onClick={() => setTestOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={!testEmails.trim() || testing}
              onClick={sendTest}
            >
              {testing ? 'Envoi…' : 'Envoyer le test'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Modal sauvegarde template ─── */}
      {saveTplOpen && (
        <Modal
          title="Sauvegarder comme template"
          description="Donnez un nom à votre template pour le retrouver facilement."
          onClose={() => {
            setSaveTplOpen(false);
            setTplName('');
          }}
        >
          <input
            className="oq-input mb-4"
            placeholder="Nom du template"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
            <button
              type="button"
              className="oq-btn-secondary"
              onClick={() => {
                setSaveTplOpen(false);
                setTplName('');
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={!tplName.trim() || savingTpl}
              onClick={saveAsTemplate}
            >
              {savingTpl ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Modal chargement template ─── */}
      {loadTplOpen && !confirmTpl && (
        <Modal
          title="Charger un template"
          description="Sélectionnez un template pour remplacer le contenu actuel de l'éditeur."
          onClose={() => setLoadTplOpen(false)}
          wide
        >
          <div className="space-y-2 max-h-80 overflow-y-auto mb-4">
            {templates === null ? (
              <p className="text-[13px] text-oq-muted text-center py-4">Chargement…</p>
            ) : templates.length === 0 ? (
              <p className="text-[13px] text-oq-muted text-center py-4">
                Aucun template disponible.{' '}
                <a href="/admin/campagnes/templates">Gérer les templates</a>
              </p>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="w-full text-left px-4 py-3 rounded-btn border border-oq-border hover:bg-oq-bg transition-colors flex items-center justify-between gap-3"
                  onClick={() => setConfirmTpl(t)}
                >
                  <span className="font-medium text-[14px] text-oq-black truncate">{t.name}</span>
                  <span className="text-[12px] text-oq-muted shrink-0">
                    {new Date(t.updated_at).toLocaleDateString('fr-FR')}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <button type="button" className="oq-btn-secondary" onClick={() => setLoadTplOpen(false)}>
              Fermer
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Modal confirmation chargement ─── */}
      {confirmTpl && (
        <Modal
          title="Confirmer le chargement"
          description={`Le contenu actuel de l'éditeur sera remplacé par le template « ${confirmTpl.name} ». Cette action est irréversible.`}
          onClose={() => setConfirmTpl(null)}
        >
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
            <button type="button" className="oq-btn-secondary" onClick={() => setConfirmTpl(null)}>
              Annuler
            </button>
            <button type="button" className="oq-btn-dark" onClick={confirmLoadTemplate}>
              Charger le template
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
