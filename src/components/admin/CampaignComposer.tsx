import { useEffect, useState } from 'react';
import type { Campaign, CampaignTargetType } from '../../lib/types';
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

interface Props {
  properties: ComposerProperty[];
  initialCampaign?: Campaign | null;
}

const TARGET_TYPES: CampaignTargetType[] = ['tous', 'proprietaire', 'investisseur'];

export default function CampaignComposer({ properties, initialCampaign = null }: Props) {
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaign?.id ?? null);
  const [name, setName] = useState(initialCampaign?.name ?? '');
  const [subject, setSubject] = useState(initialCampaign?.subject ?? '');
  const [introText, setIntroText] = useState(initialCampaign?.intro_text ?? '');
  const [propertyId, setPropertyId] = useState<string | null>(initialCampaign?.property_id ?? null);
  const [targetType, setTargetType] = useState<CampaignTargetType>(
    initialCampaign?.target_contact_type ?? 'tous',
  );
  const [targetZones, setTargetZones] = useState<string[]>(initialCampaign?.target_zones ?? []);

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Compteur de destinataires live (debounce 400 ms sur le ciblage).
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/admin/api/campagnes/recipient-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            target_contact_type: targetType,
            target_zones: targetZones.length > 0 ? targetZones : null,
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
  }, [targetType, targetZones]);

  // Aperçu live (debounce 600 ms sur bien + message).
  useEffect(() => {
    if (!propertyId) {
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
            property_id: propertyId,
            subject,
            intro_text: introText || null,
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
  }, [propertyId, subject, introText]);

  function markDirty() {
    setDirty(true);
    setNotice(null);
  }

  function buildPayload() {
    return {
      name,
      subject,
      intro_text: introText || null,
      ...(propertyId ? { property_id: propertyId } : {}),
      target_contact_type: targetType,
      target_zones: targetZones.length > 0 ? targetZones : null,
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

  async function sendTest() {
    const id = dirty || !campaignId ? await saveDraft() : campaignId;
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
    const id = dirty || !campaignId ? await saveDraft() : campaignId;
    if (!id) return;
    if (!propertyId) {
      setNotice('Sélectionnez un bien avant l’envoi.');
      return;
    }
    const count = recipientCount ?? 0;
    if (count === 0) {
      setNotice('Aucun destinataire dans ce segment.');
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

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <div className="space-y-6">
        {/* ─── 1. Bien mis en avant ─── */}
        <section className="bg-white border border-oq-border rounded-card p-6">
          <h2 className="text-[16px] font-bold text-oq-black mb-4">1. Bien mis en avant</h2>
          {properties.length === 0 ? (
            <p className="text-oq-muted text-[14px]">
              Aucun bien publié. Publiez un bien avant de créer une campagne.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {properties.map((p) => (
                <label
                  key={p.id}
                  className={[
                    'flex items-center gap-3 p-3 border rounded-btn cursor-pointer transition-colors',
                    propertyId === p.id
                      ? 'border-brand-600 bg-brand-600/5'
                      : 'border-oq-border hover:bg-oq-bg',
                  ].join(' ')}
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
        </section>

        {/* ─── 2. Audience ─── */}
        <section className="bg-white border border-oq-border rounded-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold text-oq-black">2. Audience</h2>
            <span className="text-[13px] font-semibold text-brand-700 bg-brand-600/10 px-3 py-1 rounded-full">
              {recipientCount === null ? '…' : `≈ ${recipientCount} destinataire${recipientCount > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex gap-2 mb-4">
            {TARGET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTargetType(t);
                  markDirty();
                }}
                className={[
                  'px-3 py-1.5 rounded-btn text-[13px] border transition-colors',
                  targetType === t
                    ? 'bg-oq-black text-white border-oq-black'
                    : 'bg-white text-oq-text border-oq-border hover:bg-oq-bg',
                ].join(' ')}
              >
                {CAMPAIGN_TARGET_TYPE_LABELS[t]}
              </button>
            ))}
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
          <p className="text-[12px] text-oq-muted mt-2">
            Les contacts sans zone de recherche (toute la France) sont inclus
            dans tous les ciblages géographiques.
          </p>
        </section>

        {/* ─── 3. Message ─── */}
        <section className="bg-white border border-oq-border rounded-card p-6 space-y-4">
          <h2 className="text-[16px] font-bold text-oq-black">3. Message</h2>
          <div>
            <label className="oq-label">Nom interne *</label>
            <input
              className="oq-input"
              placeholder="Ex : Lancement T3 Lyon 7e — investisseurs IDF"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
            />
          </div>
          <div>
            <label className="oq-label">Objet de l'email *</label>
            <input
              className="oq-input"
              placeholder="Ex : Off-market : T3 rénové à Lyon 7e, 6,2 % brut"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                markDirty();
              }}
            />
          </div>
          <div>
            <label className="oq-label">Texte d'introduction</label>
            <textarea
              className="oq-input min-h-[100px]"
              placeholder="Laissez vide pour le texte par défaut."
              value={introText}
              onChange={(e) => {
                setIntroText(e.target.value);
                markDirty();
              }}
            />
          </div>
        </section>

        {/* ─── 4. Actions ─── */}
        <section className="bg-white border border-oq-border rounded-card p-6">
          <h2 className="text-[16px] font-bold text-oq-black mb-4">4. Envoi</h2>
          {notice && (
            <div className="mb-4 px-4 py-3 bg-oq-bg border border-oq-border rounded-btn text-[13px] text-oq-text">
              {notice}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="oq-btn-secondary" disabled={saving} onClick={saveDraft}>
              {saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}
            </button>
            <button
              type="button"
              className="oq-btn-secondary"
              disabled={testing || !propertyId}
              onClick={sendTest}
            >
              {testing ? 'Envoi du test…' : "M'envoyer un test"}
            </button>
            <button
              type="button"
              className="oq-btn-dark"
              disabled={sending || !propertyId || (recipientCount ?? 0) === 0}
              onClick={sendCampaign}
            >
              {sending ? 'Envoi…' : `Envoyer${recipientCount ? ` (${recipientCount})` : ''}`}
            </button>
          </div>
          {campaignId && (
            <p className="text-[12px] text-oq-muted mt-3">
              Brouillon enregistré{dirty ? ' — modifications non sauvegardées' : ''}.
            </p>
          )}
        </section>
      </div>

      {/* ─── Aperçu ─── */}
      <div className="lg:sticky lg:top-6">
        <div className="bg-white border border-oq-border rounded-card overflow-hidden">
          <div className="px-4 py-3 border-b border-oq-border text-[12px] uppercase tracking-wider text-oq-muted font-semibold">
            Aperçu de l'email
            {subject && (
              <span className="block normal-case tracking-normal text-oq-black font-bold text-[14px] mt-1">
                {subject}
              </span>
            )}
          </div>
          {previewHtml ? (
            <iframe
              title="Aperçu de l'email"
              sandbox=""
              srcDoc={previewHtml}
              className="w-full h-[720px] bg-oq-bg"
            />
          ) : (
            <div className="h-[400px] flex items-center justify-center text-oq-muted text-[14px] p-8 text-center">
              Sélectionnez un bien pour voir l'aperçu de l'email.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
