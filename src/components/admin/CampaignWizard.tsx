import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Campaign,
  CampaignContentMode,
  CampaignSender,
  CampaignTargetType,
} from '../../lib/types';
import { CAMPAIGN_TARGET_TYPE_LABELS } from '../../lib/types';
import { formatEur, formatPercent } from '../../lib/format';
import ZonesPicker from './ZonesPicker';

export interface ComposerProperty {
  id: string;
  title: string;
  city: string | null;
  photo_url: string | null;
  sale_price: number;
  gross_yield: number;
}

export interface ComposerList {
  id: string;
  name: string;
  member_count: number;
}

interface Props {
  initialCampaign: Campaign;
  properties: ComposerProperty[];
  lists: ComposerList[];
  senders: CampaignSender[];
  /** Expéditeur par défaut (RESEND_FROM), affiché quand from_email est vide. */
  defaultFrom: string;
}

const TARGET_TYPES: CampaignTargetType[] = ['tous', 'proprietaire', 'investisseur'];

function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-2 rounded-btn text-[13px] border transition-colors ${
            value === o.value
              ? 'bg-oq-black text-white border-oq-black'
              : 'bg-white text-oq-text border-oq-border hover:bg-oq-bg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StepIcon({ done, index }: { done: boolean; index: number }) {
  return done ? (
    <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[13px] font-bold shrink-0">
      ✓
    </span>
  ) : (
    <span className="w-7 h-7 rounded-full bg-oq-bg text-oq-muted flex items-center justify-center text-[13px] font-bold shrink-0">
      {index}
    </span>
  );
}

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

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/**
 * Assistant de campagne (brouillon) — parité Mailer : stepper cliquable,
 * sections Expéditeur / Destinataires / Objet / Design, sauvegarde
 * automatique débouncée, test multi-adresses, programmation et modal de
 * confirmation d'envoi avec récapitulatif.
 */
export default function CampaignWizard({
  initialCampaign,
  properties,
  lists,
  senders,
  defaultFrom,
}: Props) {
  const campaignId = initialCampaign.id;

  // ─── Champs éditables ───
  const [name, setName] = useState(initialCampaign.name);
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(initialCampaign.subject ?? '');
  const [previewText, setPreviewText] = useState(initialCampaign.preview_text ?? '');
  const [introText, setIntroText] = useState(initialCampaign.intro_text ?? '');
  // Biens mis en avant (3 max), dans l'ordre de sélection = ordre dans l'email.
  const [propertyIds, setPropertyIds] = useState<string[]>(
    initialCampaign.property_ids?.length
      ? initialCampaign.property_ids
      : initialCampaign.property_id
        ? [initialCampaign.property_id]
        : [],
  );
  const [contentMode, setContentMode] = useState<CampaignContentMode>(
    initialCampaign.content_mode ?? 'property',
  );
  const customHtml = initialCampaign.custom_html ?? '';
  const [fromName, setFromName] = useState(initialCampaign.from_name ?? '');
  const [fromEmail, setFromEmail] = useState(initialCampaign.from_email ?? '');
  const [replyTo, setReplyTo] = useState(initialCampaign.reply_to ?? '');
  const [audienceMode, setAudienceMode] = useState<'listes' | 'segment'>(
    initialCampaign.target_zones?.length ||
      (initialCampaign.target_contact_type ?? 'tous') !== 'tous'
      ? 'segment'
      : 'listes',
  );
  const [targetListIds, setTargetListIds] = useState<string[]>(
    initialCampaign.target_list_ids ?? [],
  );
  const [targetType, setTargetType] = useState<CampaignTargetType>(
    initialCampaign.target_contact_type ?? 'tous',
  );
  const [targetZones, setTargetZones] = useState<string[]>(initialCampaign.target_zones ?? []);

  // ─── État transverse ───
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [excludedCount, setExcludedCount] = useState<number>(0);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmails, setTestEmails] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [sendOpen, setSendOpen] = useState(false);

  const effectiveListIds = audienceMode === 'listes' ? targetListIds : [];
  const effectiveZones = audienceMode === 'segment' ? targetZones : [];
  const effectiveType = audienceMode === 'segment' ? targetType : 'tous';
  // Mode listes sans liste cochée = audience VIDE (surtout pas toute la base).
  const emptyListAudience = audienceMode === 'listes' && targetListIds.length === 0;

  // ─── Sauvegarde automatique (débouncée 600 ms) ───
  const payloadRef = useRef<Record<string, unknown>>({});
  payloadRef.current = {
    name,
    subject,
    preview_text: previewText || null,
    intro_text: introText || null,
    property_ids: propertyIds.length > 0 ? propertyIds : null,
    content_mode: contentMode,
    from_name: fromName || null,
    from_email: fromEmail || null,
    reply_to: replyTo || null,
    target_contact_type: effectiveType,
    target_zones: effectiveZones.length > 0 ? effectiveZones : null,
    target_list_ids: effectiveListIds.length > 0 ? effectiveListIds : null,
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromise = useRef<Promise<boolean> | null>(null);

  const doSave = useCallback(async (): Promise<boolean> => {
    setSaveState('saving');
    try {
      const res = await fetch(`/admin/api/campagnes/${campaignId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadRef.current),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveState('error');
        setNotice(data.error ?? 'Échec de la sauvegarde');
        return false;
      }
      setSaveState('saved');
      return true;
    } catch (err) {
      console.error(err);
      setSaveState('error');
      setNotice('Échec de la sauvegarde (réseau)');
      return false;
    }
  }, [campaignId]);

  const markDirty = useCallback(() => {
    setSaveState('dirty');
    setNotice(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePromise.current = doSave();
    }, 600);
  }, [doSave]);

  /** Force la persistance immédiate (avant test / envoi / programmation). */
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (savePromise.current) await savePromise.current;
    return doSave();
  }, [doSave]);

  // ─── Étapes ───
  const designDone =
    contentMode === 'custom' ? customHtml.trim().length > 0 : propertyIds.length > 0;
  const steps = useMemo(
    () => [
      { key: 'expediteur', label: 'Expéditeur', done: Boolean(fromEmail.trim() || defaultFrom) },
      { key: 'destinataires', label: 'Destinataires', done: (recipientCount ?? 0) > 0 },
      { key: 'objet', label: 'Objet', done: subject.trim().length > 0 },
      { key: 'design', label: 'Design', done: designDone },
    ],
    [fromEmail, defaultFrom, recipientCount, subject, designDone],
  );
  const completedSteps = steps.filter((s) => s.done).length;
  const readyToSend = steps.every((s) => s.done);

  const sectionRefs = {
    expediteur: useRef<HTMLDivElement>(null),
    destinataires: useRef<HTMLDivElement>(null),
    objet: useRef<HTMLDivElement>(null),
    design: useRef<HTMLDivElement>(null),
  };
  function scrollToSection(key: keyof typeof sectionRefs) {
    sectionRefs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Compteur de destinataires live (debounce 400 ms) ───
  const audienceKey = JSON.stringify({
    type: effectiveType,
    zones: effectiveZones,
    listIds: effectiveListIds,
    empty: emptyListAudience,
  });
  useEffect(() => {
    if (emptyListAudience) {
      setRecipientCount(0);
      setExcludedCount(0);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/admin/api/campagnes/recipient-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            target_contact_type: effectiveType,
            target_zones: effectiveZones.length > 0 ? effectiveZones : null,
            target_list_ids: effectiveListIds.length > 0 ? effectiveListIds : null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setRecipientCount(data.count);
          setExcludedCount(data.excluded ?? 0);
        }
      } catch {
        /* requête annulée ou réseau : on garde l'ancien compteur */
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);

  // ─── Aperçu live du mode « bien » (debounce 600 ms) ───
  const propertyIdsKey = propertyIds.join(',');
  useEffect(() => {
    if (contentMode !== 'property' || propertyIds.length === 0) {
      setPreviewHtml(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/admin/api/campagnes/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            content_mode: 'property',
            property_ids: propertyIds,
            subject,
            intro_text: introText || null,
            preview_text: previewText || null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setPreviewHtml(data.html);
        }
      } catch {
        /* ignore */
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentMode, propertyIdsKey, subject, introText, previewText]);

  // ─── Actions ───
  async function sendTest() {
    const emails = testEmails
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    if (!(await flushSave())) return;
    setTesting(true);
    try {
      const res = await fetch(`/admin/api/campagnes/${campaignId}/test`, {
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

  async function confirmSend() {
    if (!(await flushSave())) return;
    setSending(true);
    try {
      const res = await fetch(`/admin/api/campagnes/${campaignId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSendOpen(false);
        setNotice(data.error ?? "Échec de l'envoi");
        return;
      }
      window.location.href = `/admin/campagnes/${campaignId}`;
    } catch (err) {
      console.error(err);
      setNotice("Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  async function scheduleCampaign() {
    if (!scheduleValue) return;
    if (!(await flushSave())) return;
    try {
      const res = await fetch(`/admin/api/campagnes/${campaignId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: new Date(scheduleValue).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Échec de la programmation');
        setScheduleOpen(false);
        return;
      }
      window.location.href = `/admin/campagnes/${campaignId}`;
    } catch (err) {
      console.error(err);
      setNotice('Échec de la programmation');
    }
  }

  function toggleList(id: string) {
    setTargetListIds((current) =>
      current.includes(id) ? current.filter((l) => l !== id) : [...current, id],
    );
    markDirty();
  }

  function selectSender(s: CampaignSender) {
    setFromName(s.name);
    setFromEmail(s.email);
    if (s.reply_to) setReplyTo(s.reply_to);
    markDirty();
  }

  async function openDesigner() {
    // Persiste l'état courant avant de quitter la page.
    await flushSave();
    window.location.href = `/admin/campagnes/${campaignId}/design`;
  }

  const selectedLists = lists.filter((l) => targetListIds.includes(l.id));
  const availableLists = lists.filter((l) => !targetListIds.includes(l.id));
  const fromDisplay = fromEmail.trim()
    ? fromName.trim()
      ? `${fromName.trim()} <${fromEmail.trim()}>`
      : fromEmail.trim()
    : defaultFrom || '—';

  const saveLabel =
    saveState === 'saving'
      ? 'Enregistrement…'
      : saveState === 'dirty'
        ? 'Modifications en attente…'
        : saveState === 'error'
          ? 'Échec de la sauvegarde'
          : 'Enregistré ✓';

  return (
    <div>
      {/* ─── En-tête : retour, nom éditable, badge, actions ─── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-5">
        <div className="min-w-0">
          <a
            href="/admin/campagnes"
            className="inline-flex items-center min-h-[32px] text-[13px] text-oq-muted hover:text-oq-black no-underline"
          >
            ← Retour aux campagnes
          </a>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {editingName ? (
              <input
                ref={nameInputRef}
                className="text-[22px] sm:text-[24px] font-extrabold text-oq-black bg-transparent border-b-2 border-oq-black outline-none min-w-0"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  setEditingName(false);
                  if (name.trim()) markDirty();
                  else setName(initialCampaign.name);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setName(initialCampaign.name);
                    setEditingName(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="group flex items-center gap-2 text-left min-w-0"
                onClick={() => {
                  setEditingName(true);
                  setTimeout(() => nameInputRef.current?.focus(), 0);
                }}
                title="Renommer la campagne"
              >
                <h1 className="text-[22px] sm:text-[24px] font-extrabold text-oq-black break-words min-w-0">
                  {name}
                </h1>
                <span className="text-oq-muted opacity-0 group-hover:opacity-100 transition-opacity text-[14px]">
                  ✎
                </span>
              </button>
            )}
            <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 bg-gray-100 text-gray-700">
              Brouillon
            </span>
            <span
              className={`text-[12px] shrink-0 ${saveState === 'error' ? 'text-red-600' : 'text-oq-muted'}`}
            >
              {saveLabel}
            </span>
          </div>
          {initialCampaign.folder && (
            <div className="text-[13px] text-oq-muted mt-0.5">
              Dossier : {initialCampaign.folder}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3 shrink-0">
          <button
            type="button"
            className="oq-btn-secondary"
            disabled={testing || !designDone}
            onClick={() => setTestOpen(true)}
          >
            Envoyer un test
          </button>
          <button
            type="button"
            className="oq-btn-secondary"
            disabled={!readyToSend}
            onClick={() => setScheduleOpen(true)}
          >
            Programmer
          </button>
          <button
            type="button"
            className="oq-btn-dark"
            disabled={sending || !readyToSend}
            onClick={() => setSendOpen(true)}
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="mb-5 px-4 py-3 bg-oq-bg border border-oq-border rounded-btn text-[13px] text-oq-text">
          {notice}
        </div>
      )}

      {/* ─── Stepper sticky cliquable ─── */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border border-oq-border rounded-card px-4 sm:px-6 py-4 mb-6">
        <div className="text-[13px] mb-3">
          {readyToSend ? (
            <span className="text-emerald-700 font-semibold">Prêt à envoyer</span>
          ) : (
            <span className="text-oq-muted">{completedSteps}/4 étapes complètes</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:items-center sm:gap-2">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center gap-2 sm:flex-1 min-w-0">
              <button
                type="button"
                className="flex items-center gap-2 group min-w-0"
                onClick={() => scrollToSection(step.key as keyof typeof sectionRefs)}
              >
                <StepIcon done={step.done} index={i + 1} />
                <span
                  className={`text-[14px] font-medium truncate group-hover:text-oq-black ${
                    step.done ? 'text-oq-black' : 'text-oq-muted'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div
                  className={`hidden sm:block flex-1 h-px ${step.done ? 'bg-emerald-300' : 'bg-oq-border'}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6 max-w-4xl">
        {/* ─── 1. Expéditeur ─── */}
        <section
          ref={sectionRefs.expediteur}
          className="scroll-mt-28 bg-white border border-oq-border rounded-card p-4 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <StepIcon done={steps[0].done} index={1} />
            <h2 className="text-[16px] font-bold text-oq-black">Expéditeur</h2>
          </div>

          {senders.length > 0 && (
            <div>
              <label className="oq-label">Expéditeur</label>
              <div className="grid sm:grid-cols-2 gap-2">
                {senders.map((s) => {
                  const selected =
                    fromEmail.trim().toLowerCase() === s.email.toLowerCase() &&
                    fromName.trim() === s.name;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSender(s)}
                      className={`flex flex-col gap-0.5 p-3 border rounded-btn text-left transition-colors ${
                        selected
                          ? 'border-brand-600 bg-brand-600/5'
                          : 'border-oq-border hover:border-brand-600/50'
                      }`}
                    >
                      <span className="font-semibold text-oq-black text-[14px]">{s.name}</span>
                      <span className="text-[13px] text-brand-700">{s.email}</span>
                      <span className="text-[12px] text-oq-muted">
                        resend · &lt;{s.email.split('@')[1] ?? ''}&gt;
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-oq-muted mt-2">
                Gérez les expéditeurs pré-enregistrés dans l'onglet{' '}
                <a href="/admin/campagnes/configuration">Configuration</a>.
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="oq-label">Nom d'expéditeur</label>
              <input
                className="oq-input"
                placeholder="Ex : Christophe Souvras"
                value={fromName}
                onChange={(e) => {
                  setFromName(e.target.value);
                  markDirty();
                }}
              />
            </div>
            <div>
              <label className="oq-label">Email d'expéditeur</label>
              <input
                type="email"
                className="oq-input"
                placeholder={defaultFrom || 'expediteur@domaine-verifie.fr'}
                value={fromEmail}
                onChange={(e) => {
                  setFromEmail(e.target.value);
                  markDirty();
                }}
              />
            </div>
          </div>
          <div>
            <label className="oq-label">Reply-to (optionnel)</label>
            <input
              type="email"
              className="oq-input"
              placeholder="Les réponses arriveront sur cette adresse"
              value={replyTo}
              onChange={(e) => {
                setReplyTo(e.target.value);
                markDirty();
              }}
            />
          </div>
          <p className="text-[12px] text-oq-muted">
            Laissez vide pour utiliser l'expéditeur par défaut{defaultFrom ? ` (${defaultFrom})` : ''}.
            L'email doit appartenir à un domaine vérifié dans Resend.
          </p>
        </section>

        {/* ─── 2. Destinataires ─── */}
        <section
          ref={sectionRefs.destinataires}
          className="scroll-mt-28 bg-white border border-oq-border rounded-card p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <StepIcon done={steps[1].done} index={2} />
            <h2 className="text-[16px] font-bold text-oq-black">Destinataires</h2>
          </div>

          <div className="mb-4">
            <PillToggle
              options={[
                { value: 'listes', label: 'Par listes' },
                { value: 'segment', label: 'Par segment (type × zones)' },
              ]}
              value={audienceMode}
              onChange={(mode) => {
                setAudienceMode(mode);
                markDirty();
              }}
            />
          </div>

          {audienceMode === 'listes' ? (
            <div className="space-y-3">
              {selectedLists.length === 0 && (
                <div className="flex items-center gap-2 text-[13px] text-oq-muted bg-oq-bg px-3 py-3 rounded-btn">
                  <span aria-hidden="true">👥</span>
                  <span>
                    Aucune liste ajoutée. Sélectionnez une liste existante ou{' '}
                    <a href="/admin/campagnes/listes">créez-en une nouvelle</a>.
                  </span>
                </div>
              )}
              {selectedLists.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-2 p-3 border border-oq-border rounded-btn"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <a
                      href="/admin/campagnes/listes"
                      className="text-[14px] font-medium text-brand-700 truncate"
                    >
                      {l.name}
                    </a>
                    <span className="text-[13px] text-oq-muted shrink-0">
                      {l.member_count.toLocaleString('fr-FR')} contact{l.member_count > 1 ? 's' : ''}
                    </span>
                    {l.member_count === 0 && (
                      <a
                        href="/admin/campagnes/listes"
                        className="inline-flex items-center gap-1 text-[11px] text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full no-underline shrink-0"
                      >
                        ⚠ Ajouter des contacts
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-[13px] text-oq-muted hover:text-red-600 shrink-0"
                    onClick={() => toggleList(l.id)}
                  >
                    Retirer
                  </button>
                </div>
              ))}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="oq-input flex-1"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) toggleList(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">Ajouter une liste…</option>
                  {availableLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.member_count.toLocaleString('fr-FR')})
                    </option>
                  ))}
                </select>
                <a
                  href="/admin/campagnes/listes"
                  className="oq-btn-secondary oq-btn-sm text-center whitespace-nowrap"
                >
                  + Nouvelle liste
                </a>
              </div>
              {selectedLists.length > 0 && (
                <div className="flex items-center gap-2 text-[13px] pt-1">
                  <span className="font-semibold text-oq-black">
                    {recipientCount === null
                      ? '…'
                      : `${recipientCount.toLocaleString('fr-FR')} destinataire${(recipientCount ?? 0) > 1 ? 's' : ''} actif${(recipientCount ?? 0) > 1 ? 's' : ''}`}
                  </span>
                  {excludedCount > 0 && (
                    <span className="text-orange-600">
                      ({excludedCount.toLocaleString('fr-FR')} exclu{excludedCount > 1 ? 's' : ''})
                    </span>
                  )}
                </div>
              )}
              <p className="text-[12px] text-oq-muted">
                Plusieurs listes = union des contacts (sans doublon). Les désabonnés sont
                automatiquement exclus.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4">
                <PillToggle
                  options={TARGET_TYPES.map((t) => ({
                    value: t,
                    label: CAMPAIGN_TARGET_TYPE_LABELS[t],
                  }))}
                  value={targetType}
                  onChange={(t) => {
                    setTargetType(t);
                    markDirty();
                  }}
                />
              </div>
              <div className="text-[12px] uppercase tracking-wider text-oq-muted mb-2">
                Zone géographique
              </div>
              <ZonesPicker
                value={targetZones}
                onChange={(zones) => {
                  setTargetZones(zones);
                  markDirty();
                }}
                emptyLabel="Aucune zone cochée = toute la France"
              />
              <div className="flex items-center gap-2 text-[13px] pt-3">
                <span className="font-semibold text-oq-black">
                  {recipientCount === null
                    ? '…'
                    : `${recipientCount.toLocaleString('fr-FR')} destinataire${(recipientCount ?? 0) > 1 ? 's' : ''} actif${(recipientCount ?? 0) > 1 ? 's' : ''}`}
                </span>
                {excludedCount > 0 && (
                  <span className="text-orange-600">
                    ({excludedCount.toLocaleString('fr-FR')} exclu{excludedCount > 1 ? 's' : ''})
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ─── 3. Objet ─── */}
        <section
          ref={sectionRefs.objet}
          className="scroll-mt-28 bg-white border border-oq-border rounded-card p-4 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <StepIcon done={steps[2].done} index={3} />
            <h2 className="text-[16px] font-bold text-oq-black">Objet de la campagne</h2>
          </div>
          <div>
            <label className="oq-label">Objet</label>
            <input
              className="oq-input"
              placeholder="Objet de l'email"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                markDirty();
              }}
            />
          </div>
          <div>
            <label className="oq-label">Texte d'aperçu (preview text)</label>
            <input
              className="oq-input"
              placeholder="Texte d'aperçu visible dans la boîte de réception"
              value={previewText}
              onChange={(e) => {
                setPreviewText(e.target.value);
                markDirty();
              }}
            />
          </div>
        </section>

        {/* ─── 4. Design ─── */}
        <section
          ref={sectionRefs.design}
          className="scroll-mt-28 bg-white border border-oq-border rounded-card p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <StepIcon done={steps[3].done} index={4} />
            <h2 className="text-[16px] font-bold text-oq-black">Design</h2>
          </div>

          <div className="mb-4">
            <PillToggle
              options={[
                { value: 'property', label: 'Bien mis en avant' },
                { value: 'custom', label: 'HTML personnalisé' },
              ]}
              value={contentMode}
              onChange={(mode) => {
                setContentMode(mode);
                markDirty();
              }}
            />
          </div>

          {contentMode === 'property' ? (
            <div className="space-y-4">
              <p className="text-[13px] text-oq-muted -mt-1">
                Sélectionnez <span className="font-semibold text-oq-black">1 à 3 biens</span> —
                ils apparaîtront à la suite dans l'email, dans l'ordre de sélection.
                <span className="ml-2 font-semibold text-oq-black">
                  {propertyIds.length}/3 sélectionné{propertyIds.length > 1 ? 's' : ''}
                </span>
              </p>
              {properties.length === 0 ? (
                <p className="text-oq-muted text-[14px]">
                  Aucun bien publié. Publiez un bien ou passez en HTML personnalisé.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {properties.map((p) => {
                    const position = propertyIds.indexOf(p.id);
                    const checked = position !== -1;
                    const full = propertyIds.length >= 3 && !checked;
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 p-3 border rounded-btn transition-colors ${
                          checked
                            ? 'border-brand-600 bg-brand-600/5'
                            : full
                              ? 'border-oq-border opacity-50'
                              : 'border-oq-border hover:bg-oq-bg cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={full}
                          onChange={() => {
                            setPropertyIds((current) =>
                              checked
                                ? current.filter((id) => id !== p.id)
                                : current.length >= 3
                                  ? current
                                  : [...current, p.id],
                            );
                            markDirty();
                          }}
                        />
                        {p.photo_url ? (
                          <img src={p.photo_url} alt="" className="w-12 h-12 rounded-btn object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-btn bg-oq-bg" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-oq-black text-[14px] truncate">{p.title}</div>
                          <div className="text-[12px] text-oq-muted">
                            {p.city ?? '—'} · {formatEur(p.sale_price)}
                            {p.gross_yield > 0 && (
                              <span className="text-oq-orange font-semibold">
                                {' '}· {formatPercent(p.gross_yield)}
                              </span>
                            )}
                          </div>
                        </div>
                        {checked && (
                          <span
                            className="w-6 h-6 rounded-full bg-oq-black text-white flex items-center justify-center text-[12px] font-bold shrink-0"
                            title={`Position ${position + 1} dans l'email`}
                          >
                            {position + 1}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              <div>
                <label className="oq-label">Texte d'introduction</label>
                <textarea
                  className="oq-input min-h-[90px]"
                  placeholder="Laissez vide pour le texte par défaut."
                  value={introText}
                  onChange={(e) => {
                    setIntroText(e.target.value);
                    markDirty();
                  }}
                />
              </div>
              {previewHtml && (
                <div className="border border-oq-border rounded-btn overflow-hidden">
                  <div className="px-3 py-2 bg-oq-bg text-[12px] uppercase tracking-wider text-oq-muted font-semibold">
                    Aperçu de l'email
                  </div>
                  <iframe
                    title="Aperçu de l'email"
                    sandbox=""
                    srcDoc={previewHtml}
                    className="w-full h-[420px] bg-white"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                className={customHtml.trim() ? 'oq-btn-secondary' : 'oq-btn-dark'}
                onClick={openDesigner}
              >
                {customHtml.trim() ? 'Modifier le design' : 'Démarrer la conception'}
              </button>
              <p className="text-[12px] text-oq-muted">
                L'éditeur plein écran permet d'écrire le HTML, d'insérer des variables, de
                charger un template et de prévisualiser avec un vrai contact.
              </p>
            </div>
          )}
        </section>
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

      {/* ─── Modal programmation ─── */}
      {scheduleOpen && (
        <Modal
          title="Programmer l'envoi"
          description="La campagne partira automatiquement à la date choisie (précision ± 5 minutes)."
          onClose={() => setScheduleOpen(false)}
        >
          <input
            type="datetime-local"
            className="oq-input mb-4"
            value={scheduleValue}
            onChange={(e) => setScheduleValue(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
            <button type="button" className="oq-btn-secondary" onClick={() => setScheduleOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={!scheduleValue}
              onClick={scheduleCampaign}
            >
              Programmer
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Modal confirmation d'envoi (récapitulatif) ─── */}
      {sendOpen && (
        <Modal
          title="Confirmer l'envoi"
          description="Vérifiez les détails avant de lancer l'envoi. Cette action est définitive."
          onClose={() => setSendOpen(false)}
          wide
        >
          <div className="space-y-3 mb-5">
            <div className="p-3 bg-oq-bg rounded-btn">
              <div className="text-[11px] uppercase tracking-wider text-oq-muted font-semibold">
                Expéditeur
              </div>
              <div className="text-[14px] font-medium text-oq-black truncate">{fromDisplay}</div>
              {replyTo && (
                <div className="text-[12px] text-oq-muted">Reply-to : {replyTo}</div>
              )}
            </div>
            <div className="p-3 bg-oq-bg rounded-btn">
              <div className="text-[11px] uppercase tracking-wider text-oq-muted font-semibold">
                Objet
              </div>
              <div className="text-[14px] font-medium text-oq-black">{subject || '—'}</div>
              {previewText && (
                <div className="text-[12px] text-oq-muted truncate">{previewText}</div>
              )}
            </div>
            <div className="p-3 bg-oq-bg rounded-btn">
              <div className="text-[11px] uppercase tracking-wider text-oq-muted font-semibold">
                Destinataires
              </div>
              <div className="text-[14px] font-medium text-oq-black">
                {audienceMode === 'listes'
                  ? selectedLists.map((l) => l.name).join(', ') || '—'
                  : `${CAMPAIGN_TARGET_TYPE_LABELS[targetType]}${targetZones.length > 0 ? ` · ${targetZones.length} zone${targetZones.length > 1 ? 's' : ''}` : ' · toute la France'}`}
              </div>
              {(recipientCount ?? 0) > 0 ? (
                <div className="text-[12px] text-oq-muted">
                  {(recipientCount ?? 0).toLocaleString('fr-FR')} contact{(recipientCount ?? 0) > 1 ? 's' : ''} actif{(recipientCount ?? 0) > 1 ? 's' : ''}
                  {excludedCount > 0 && ` (${excludedCount.toLocaleString('fr-FR')} exclus)`}
                </div>
              ) : (
                <div className="text-[12px] text-red-600 font-medium">
                  Aucun destinataire actif — envoi impossible
                </div>
              )}
            </div>
            <div className="p-3 bg-oq-bg rounded-btn">
              <div className="text-[11px] uppercase tracking-wider text-oq-muted font-semibold">
                Contenu
              </div>
              <div className="text-[14px] font-medium text-oq-black">
                {contentMode === 'custom'
                  ? 'HTML personnalisé'
                  : `${propertyIds.length > 1 ? `${propertyIds.length} biens mis en avant` : 'Bien mis en avant'}${
                      propertyIds.length > 0
                        ? ` — ${propertyIds
                            .map((id) => properties.find((p) => p.id === id)?.title)
                            .filter(Boolean)
                            .join(', ')}`
                        : ''
                    }`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
            <button type="button" className="oq-btn-secondary" onClick={() => setSendOpen(false)}>
              Revenir à l'édition
            </button>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={sending || (recipientCount ?? 0) === 0}
              onClick={confirmSend}
            >
              {sending ? 'Envoi en cours…' : "Confirmer l'envoi"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
