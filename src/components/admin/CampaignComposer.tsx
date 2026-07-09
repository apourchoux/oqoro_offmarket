import { useEffect, useMemo, useState } from 'react';
import type {
  Campaign,
  CampaignContentMode,
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

export interface ComposerTemplate {
  id: string;
  name: string;
  html: string;
}

interface Props {
  properties: ComposerProperty[];
  lists: ComposerList[];
  templates: ComposerTemplate[];
  initialCampaign?: Campaign | null;
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
          className={`px-3 py-1.5 rounded-btn text-[13px] border transition-colors ${
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
    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[13px] font-bold shrink-0">
      ✓
    </span>
  ) : (
    <span className="w-6 h-6 rounded-full bg-oq-bg text-oq-muted flex items-center justify-center text-[13px] font-bold shrink-0">
      {index}
    </span>
  );
}

export default function CampaignComposer({
  properties,
  lists,
  templates,
  initialCampaign = null,
  defaultFrom,
}: Props) {
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaign?.id ?? null);
  const [name, setName] = useState(initialCampaign?.name ?? '');
  const [subject, setSubject] = useState(initialCampaign?.subject ?? '');
  const [previewText, setPreviewText] = useState(initialCampaign?.preview_text ?? '');
  const [introText, setIntroText] = useState(initialCampaign?.intro_text ?? '');
  const [propertyId, setPropertyId] = useState<string | null>(initialCampaign?.property_id ?? null);
  const [contentMode, setContentMode] = useState<CampaignContentMode>(
    initialCampaign?.content_mode ?? 'property',
  );
  const [customHtml, setCustomHtml] = useState(initialCampaign?.custom_html ?? '');
  const [fromName, setFromName] = useState(initialCampaign?.from_name ?? '');
  const [fromEmail, setFromEmail] = useState(initialCampaign?.from_email ?? '');
  const [replyTo, setReplyTo] = useState(initialCampaign?.reply_to ?? '');
  const [audienceMode, setAudienceMode] = useState<'listes' | 'segment'>(
    initialCampaign?.target_list_ids?.length ? 'listes' : 'segment',
  );
  const [targetListIds, setTargetListIds] = useState<string[]>(
    initialCampaign?.target_list_ids ?? [],
  );
  const [targetType, setTargetType] = useState<CampaignTargetType>(
    initialCampaign?.target_contact_type ?? 'tous',
  );
  const [targetZones, setTargetZones] = useState<string[]>(initialCampaign?.target_zones ?? []);

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');

  const effectiveListIds = audienceMode === 'listes' ? targetListIds : [];
  const effectiveZones = audienceMode === 'segment' ? targetZones : [];
  const effectiveType = audienceMode === 'segment' ? targetType : 'tous';
  // Mode listes sans liste cochée = audience VIDE (surtout pas toute la base).
  const emptyListAudience = audienceMode === 'listes' && targetListIds.length === 0;
  const audienceKey = JSON.stringify({
    type: effectiveType,
    zones: effectiveZones,
    listIds: effectiveListIds,
    empty: emptyListAudience,
  });

  // ─── Étapes du wizard ───
  const steps = useMemo(() => {
    const designDone =
      contentMode === 'custom' ? customHtml.trim().length > 0 : Boolean(propertyId);
    return [
      { label: 'Expéditeur', done: Boolean(fromEmail.trim() || defaultFrom) },
      { label: 'Destinataires', done: (recipientCount ?? 0) > 0 },
      { label: 'Objet', done: subject.trim().length > 0 },
      { label: 'Design', done: designDone },
    ];
  }, [contentMode, customHtml, propertyId, fromEmail, defaultFrom, recipientCount, subject]);
  const completedSteps = steps.filter((s) => s.done).length;
  const readyToSend = steps.every((s) => s.done);

  // ─── Compteur de destinataires live (debounce 400 ms sur le ciblage) ───
  useEffect(() => {
    if (emptyListAudience) {
      setRecipientCount(0);
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

  // ─── Aperçu live (debounce 600 ms sur le contenu) ───
  useEffect(() => {
    if (contentMode === 'property' && !propertyId) {
      setPreviewHtml(null);
      return;
    }
    if (contentMode === 'custom' && !customHtml.trim()) {
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
            content_mode: contentMode,
            custom_html: contentMode === 'custom' ? customHtml : undefined,
            property_id: contentMode === 'property' ? propertyId : undefined,
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
  }, [contentMode, customHtml, propertyId, subject, introText, previewText]);

  function markDirty() {
    setDirty(true);
    setNotice(null);
  }

  function buildPayload() {
    return {
      name,
      subject,
      preview_text: previewText || null,
      intro_text: introText || null,
      ...(propertyId ? { property_id: propertyId } : {}),
      content_mode: contentMode,
      custom_html: contentMode === 'custom' ? customHtml || null : null,
      from_name: fromName || null,
      from_email: fromEmail || null,
      reply_to: replyTo || null,
      target_contact_type: effectiveType,
      target_zones: effectiveZones.length > 0 ? effectiveZones : null,
      target_list_ids: effectiveListIds.length > 0 ? effectiveListIds : null,
    };
  }

  async function saveDraft(): Promise<string | null> {
    if (!name.trim()) {
      setNotice('Donnez un nom interne à la campagne avant de sauvegarder.');
      return null;
    }
    setSaving(true);
    try {
      const url = campaignId
        ? `/admin/api/campagnes/${campaignId}/update`
        : '/admin/api/campagnes/create';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Échec de la sauvegarde');
        return null;
      }
      setCampaignId(data.campaign.id);
      setDirty(false);
      setNotice('Brouillon enregistré.');
      return data.campaign.id as string;
    } catch (err) {
      console.error(err);
      setNotice('Échec de la sauvegarde');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function ensureSaved(): Promise<string | null> {
    return dirty || !campaignId ? saveDraft() : campaignId;
  }

  async function sendTest() {
    const id = await ensureSaved();
    if (!id) return;
    setTesting(true);
    try {
      const res = await fetch(`/admin/api/campagnes/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setNotice(res.ok ? `Email de test envoyé à ${data.to}.` : data.error ?? 'Échec du test');
    } catch (err) {
      console.error(err);
      setNotice('Échec du test');
    } finally {
      setTesting(false);
    }
  }

  async function sendCampaign() {
    const id = await ensureSaved();
    if (!id) return;
    const count = recipientCount ?? 0;
    if (!readyToSend || count === 0) {
      setNotice('Complétez les 4 étapes avant l’envoi.');
      return;
    }
    if (
      !confirm(
        `Envoyer cette campagne à ${count} destinataire${count > 1 ? 's' : ''} ? ` +
          'Cette action est définitive.',
      )
    ) {
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/admin/api/campagnes/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Échec de l'envoi");
        return;
      }
      window.location.href = `/admin/campagnes/${id}`;
    } catch (err) {
      console.error(err);
      setNotice("Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  async function scheduleCampaign() {
    const id = await ensureSaved();
    if (!id) return;
    if (!scheduleValue) {
      setNotice('Choisissez une date et une heure.');
      return;
    }
    try {
      const res = await fetch(`/admin/api/campagnes/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: new Date(scheduleValue).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Échec de la programmation');
        return;
      }
      window.location.href = `/admin/campagnes/${id}`;
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

  function loadTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    if (customHtml.trim() && !confirm('Remplacer le contenu HTML actuel par ce template ?')) {
      return;
    }
    setCustomHtml(template.html);
    markDirty();
  }

  async function saveAsTemplate() {
    if (!customHtml.trim()) return;
    const templateName = prompt('Nom du nouveau template :', name || 'Nouveau template');
    if (!templateName?.trim()) return;
    try {
      const res = await fetch('/admin/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), html: customHtml }),
      });
      const data = await res.json();
      setNotice(res.ok ? `Template « ${templateName.trim()} » enregistré.` : data.error);
    } catch (err) {
      console.error(err);
      setNotice("Échec de l'enregistrement du template");
    }
  }

  return (
    <div>
      {/* ─── En-tête : nom + actions ─── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          className="oq-input max-w-md font-semibold"
          placeholder="Nom interne de la campagne"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            markDirty();
          }}
        />
        <div className="flex-1" />
        <button type="button" className="oq-btn-secondary" disabled={saving} onClick={saveDraft}>
          {saving ? 'Enregistrement…' : dirty || !campaignId ? 'Enregistrer' : 'Enregistré ✓'}
        </button>
        <button
          type="button"
          className="oq-btn-secondary"
          disabled={testing || !steps[3].done}
          onClick={sendTest}
        >
          {testing ? 'Envoi du test…' : 'Envoyer un test'}
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
          onClick={sendCampaign}
        >
          {sending ? 'Envoi…' : `Envoyer${recipientCount ? ` (${recipientCount})` : ''}`}
        </button>
      </div>

      {notice && (
        <div className="mb-5 px-4 py-3 bg-oq-bg border border-oq-border rounded-btn text-[13px] text-oq-text">
          {notice}
        </div>
      )}

      {/* ─── Barre de progression ─── */}
      <div className="bg-white border border-oq-border rounded-card px-6 py-4 mb-6">
        <div className="text-[13px] text-oq-muted mb-3">
          {completedSteps}/4 étapes complètes
        </div>
        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2 flex-1 min-w-0">
              <StepIcon done={step.done} index={i + 1} />
              <span className={`text-[14px] font-medium truncate ${step.done ? 'text-oq-black' : 'text-oq-muted'}`}>
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${step.done ? 'bg-emerald-300' : 'bg-oq-border'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
          {/* ─── 1. Expéditeur ─── */}
          <section className="bg-white border border-oq-border rounded-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <StepIcon done={steps[0].done} index={1} />
              <h2 className="text-[16px] font-bold text-oq-black">Expéditeur</h2>
            </div>
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
              L'email doit appartenir à un domaine vérifié dans Resend (voir l'onglet Configuration).
            </p>
          </section>

          {/* ─── 2. Destinataires ─── */}
          <section className="bg-white border border-oq-border rounded-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <StepIcon done={steps[1].done} index={2} />
                <h2 className="text-[16px] font-bold text-oq-black">Destinataires</h2>
              </div>
              <span className="text-[13px] font-semibold text-brand-700 bg-brand-600/10 px-3 py-1 rounded-full">
                {recipientCount === null ? '…' : `${recipientCount} destinataire${recipientCount > 1 ? 's' : ''} actif${recipientCount > 1 ? 's' : ''}`}
              </span>
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
              lists.length === 0 ? (
                <p className="text-[14px] text-oq-muted">
                  Aucune liste.{' '}
                  <a href="/admin/campagnes/listes">Créez-en une</a> puis
                  ajoutez-y des contacts depuis l'onglet Contacts.
                </p>
              ) : (
                <div className="space-y-2">
                  {lists.map((l) => (
                    <label
                      key={l.id}
                      className={`flex items-center gap-3 p-3 border rounded-btn cursor-pointer transition-colors ${
                        targetListIds.includes(l.id)
                          ? 'border-brand-600 bg-brand-600/5'
                          : 'border-oq-border hover:bg-oq-bg'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={targetListIds.includes(l.id)}
                        onChange={() => toggleList(l.id)}
                      />
                      <span className="flex-1 text-[14px] font-medium text-oq-black">{l.name}</span>
                      <span className="text-[12px] text-oq-muted">{l.member_count} contact{l.member_count > 1 ? 's' : ''}</span>
                    </label>
                  ))}
                  <p className="text-[12px] text-oq-muted">
                    Plusieurs listes = union des contacts (sans doublon). Les
                    désabonnés sont automatiquement exclus.
                  </p>
                </div>
              )
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
              </div>
            )}
          </section>

          {/* ─── 3. Objet ─── */}
          <section className="bg-white border border-oq-border rounded-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <StepIcon done={steps[2].done} index={3} />
              <h2 className="text-[16px] font-bold text-oq-black">Objet de la campagne</h2>
            </div>
            <div>
              <label className="oq-label">Objet *</label>
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
          <section className="bg-white border border-oq-border rounded-card p-6">
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
                {properties.length === 0 ? (
                  <p className="text-oq-muted text-[14px]">
                    Aucun bien publié. Publiez un bien ou passez en HTML personnalisé.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {properties.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 p-3 border rounded-btn cursor-pointer transition-colors ${
                          propertyId === p.id
                            ? 'border-brand-600 bg-brand-600/5'
                            : 'border-oq-border hover:bg-oq-bg'
                        }`}
                      >
                        <input
                          type="radio"
                          name="property"
                          checked={propertyId === p.id}
                          onChange={() => {
                            setPropertyId(p.id);
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
                      </label>
                    ))}
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
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="oq-input w-auto"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) loadTemplate(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Charger un template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="oq-btn-secondary oq-btn-sm"
                    disabled={!customHtml.trim()}
                    onClick={saveAsTemplate}
                  >
                    Sauvegarder comme template
                  </button>
                  <a
                    href="/admin/campagnes/templates"
                    className="text-[13px] text-oq-muted hover:text-oq-black no-underline"
                  >
                    Gérer les templates →
                  </a>
                </div>
                <textarea
                  className="oq-input font-mono text-[13px] leading-relaxed min-h-[320px] whitespace-pre"
                  spellCheck={false}
                  placeholder="<html>… Variables : {{first_name}}, {{last_name}}, {{email}}, {{unsubscribe_url}}"
                  value={customHtml}
                  onChange={(e) => {
                    setCustomHtml(e.target.value);
                    markDirty();
                  }}
                />
                <p className="text-[12px] text-oq-muted">
                  Variables disponibles : {'{{first_name}}'}, {'{{last_name}}'},{' '}
                  {'{{email}}'}, {'{{unsubscribe_url}}'}. Un lien de
                  désabonnement est ajouté automatiquement s'il manque.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* ─── Aperçu ─── */}
        <div className="lg:sticky lg:top-6">
          <div className="bg-white border border-oq-border rounded-card overflow-hidden">
            <div className="px-4 py-3 border-b border-oq-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] uppercase tracking-wider text-oq-muted font-semibold">
                  Aperçu de l'email
                </div>
                {subject && (
                  <div className="text-oq-black font-bold text-[14px] truncate">{subject}</div>
                )}
                {previewText && (
                  <div className="text-oq-muted text-[12px] truncate">{previewText}</div>
                )}
              </div>
              <div className="flex gap-1 bg-oq-bg rounded-btn p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-2.5 py-1 rounded-btn text-[12px] ${previewDevice === 'desktop' ? 'bg-white shadow-sm text-oq-black' : 'text-oq-muted'}`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-2.5 py-1 rounded-btn text-[12px] ${previewDevice === 'mobile' ? 'bg-white shadow-sm text-oq-black' : 'text-oq-muted'}`}
                >
                  Mobile
                </button>
              </div>
            </div>
            {previewHtml ? (
              <div className="bg-oq-bg flex justify-center">
                <iframe
                  title="Aperçu de l'email"
                  sandbox=""
                  srcDoc={previewHtml}
                  className={`h-[720px] bg-white ${previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'}`}
                />
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-oq-muted text-[14px] p-8 text-center">
                {contentMode === 'property'
                  ? "Sélectionnez un bien pour voir l'aperçu de l'email."
                  : "Saisissez du HTML (ou chargez un template) pour voir l'aperçu."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Modal de programmation ─── */}
      {scheduleOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setScheduleOpen(false)}
        >
          <div
            className="bg-white rounded-card border border-oq-border p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-bold text-oq-black mb-1">Programmer l'envoi</h3>
            <p className="text-[13px] text-oq-muted mb-4">
              La campagne partira automatiquement à la date choisie (précision ± 5 minutes).
            </p>
            <input
              type="datetime-local"
              className="oq-input mb-4"
              value={scheduleValue}
              onChange={(e) => setScheduleValue(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
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
          </div>
        </div>
      )}
    </div>
  );
}
