import { useEffect, useRef, useState } from 'react';
import type { Campaign, CampaignStats, CampaignStatus } from '../../lib/types';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  CAMPAIGN_TARGET_TYPE_LABELS,
} from '../../lib/types';
import { formatRate } from '../../lib/format';
import { zonesSummary } from '../../lib/zones';

export interface ReportCampaign extends Campaign {
  property_title: string | null;
  property_slug: string | null;
}

interface Props {
  initialCampaign: ReportCampaign;
  initialStats: CampaignStats | null;
  /** Noms des listes ciblées (résolus côté serveur). */
  listNames: string[];
  /** HTML du contenu envoyé (custom ou rendu du bien), pour l'onglet Contenu. */
  contentHtml: string | null;
  /** Compteur d'audience courant (campagnes programmées). */
  audienceCount: { active: number; excluded: number } | null;
}

type TabKey =
  | 'overview'
  | 'deliverability'
  | 'opens'
  | 'clicks'
  | 'unsubs'
  | 'content';

interface RecipientRow {
  email: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  unsubscribed_at: string | null;
  contacts: { first_name: string; last_name: string } | null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString('fr-FR');
}

function Card({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-oq-border rounded-card p-4 sm:p-6">
      <h2 className="text-[16px] font-bold text-oq-black mb-1">{title}</h2>
      {description && <p className="text-[13px] text-oq-muted mb-3">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between text-[14px] py-1">
      <span className="text-oq-muted">{label}</span>
      <span className="font-medium text-oq-black text-left sm:text-right">{value}</span>
    </div>
  );
}

/**
 * Table de contacts filtrée par événement, paginée (20 / page) avec export
 * CSV — utilisée par les onglets Délivrabilité / Ouvertures / Clics /
 * Désinscriptions.
 */
function ContactsTable({
  campaignId,
  status,
  timestampField,
  timestampLabel,
}: {
  campaignId: string;
  status: string;
  timestampField: keyof RecipientRow;
  timestampLabel: string;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    data: RecipientRow[];
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/admin/api/campagnes/${campaignId}/recipients?status=${status}&page=${page}&limit=20`)
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, status, page]);

  return (
    <div className="bg-white border border-oq-border rounded-card overflow-hidden">
      <div className="px-4 py-3 border-b border-oq-border flex items-center justify-between gap-3">
        <div>
          <span className="text-[12px] uppercase tracking-wider text-oq-muted font-semibold">
            Contacts
          </span>
          {data && (
            <span className="text-[12px] text-oq-muted ml-2">
              {fmtNum(data.total)} au total
            </span>
          )}
        </div>
        {data && data.total > 0 && (
          <a
            href={`/admin/api/campagnes/${campaignId}/export?status=${status}`}
            className="oq-btn-secondary oq-btn-sm no-underline"
          >
            Exporter
          </a>
        )}
      </div>
      {loading && !data ? (
        <div className="p-8 text-center text-oq-muted text-[14px]">Chargement…</div>
      ) : !data || data.data.length === 0 ? (
        <div className="p-8 text-center text-oq-muted text-[14px]">Aucun contact</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[420px]">
              <thead>
                <tr className="text-left text-[12px] uppercase tracking-wider text-oq-muted bg-oq-bg">
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">{timestampLabel}</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="border-t border-oq-border">
                    <td className="px-4 py-3 font-medium text-oq-black whitespace-nowrap">
                      {r.contacts
                        ? `${r.contacts.first_name} ${r.contacts.last_name}`.trim() || '—'
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-oq-text break-all">{r.email}</td>
                    <td className="px-4 py-3 text-oq-muted whitespace-nowrap">
                      {fmtDate(r[timestampField] as string | null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-oq-border">
              <span className="text-[13px] text-oq-muted">
                Page {page} sur {data.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="oq-btn-secondary oq-btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  className="oq-btn-secondary oq-btn-sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClickedLinks({ campaignId }: { campaignId: string }) {
  const [links, setLinks] = useState<Array<{ url: string; count: number }> | null>(null);

  useEffect(() => {
    fetch(`/admin/api/campagnes/${campaignId}/clicks`)
      .then((res) => res.json())
      .then((d) => setLinks(d.links ?? []))
      .catch(() => setLinks([]));
  }, [campaignId]);

  return (
    <Card title="Liens cliqués">
      {links === null ? (
        <p className="text-[14px] text-oq-muted">Chargement…</p>
      ) : links.length === 0 ? (
        <p className="text-[14px] text-oq-muted">
          Aucun clic enregistré. (Le détail par lien n'est disponible que pour les campagnes
          envoyées après l'activation du suivi des liens.)
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <div
              key={l.url}
              className="flex items-center justify-between gap-3 p-2.5 border border-oq-border rounded-btn text-[13px]"
            >
              <span className="truncate text-oq-text" title={l.url}>
                {l.url}
              </span>
              <span className="shrink-0 inline-flex items-center text-[11px] font-bold px-2 py-1 rounded-full bg-oq-bg text-oq-text">
                {fmtNum(l.count)} clic{l.count > 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Rapport de campagne (parité Mailer) : onglets Vue d'ensemble /
 * Délivrabilité / Ouvertures / Clics / Désinscriptions / Contenu, timeline
 * d'historique, pause/reprise pendant l'envoi, export CSV et renommage
 * inline.
 */
export default function CampaignReport({
  initialCampaign,
  initialStats,
  listNames,
  contentHtml,
  audienceCount,
}: Props) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [stats, setStats] = useState(initialStats);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(initialCampaign.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');

  const status = campaign.status as CampaignStatus;
  const isSent = status === 'sent';
  const isSending = status === 'sending';
  const isPaused = status === 'paused';
  const isScheduled = status === 'scheduled';
  const isFailed = status === 'failed';
  const hasStats = Boolean(stats) && !isScheduled;

  const [tab, setTab] = useState<TabKey>('overview');

  // ─── Rafraîchissement live pendant l'envoi (5 s, comme Mailer) ───
  useEffect(() => {
    if (!isSending) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/admin/api/campagnes/${campaign.id}/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.campaign?.status && data.campaign.status !== status) {
          // Changement d'état (terminé, échec, pause) : recharge la page pour
          // rafraîchir les actions et les données serveur.
          window.location.reload();
        }
      } catch {
        /* réseau : on retentera au tick suivant */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [isSending, campaign.id, status]);

  async function action(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/admin/api/campagnes/${campaign.id}/${path}`, {
        method: 'POST',
        ...(body
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Action impossible');
        return;
      }
      window.location.reload();
    } catch (err) {
      console.error(err);
      setNotice('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    setEditingName(false);
    if (!trimmed || trimmed === campaign.name) {
      setNameValue(campaign.name);
      return;
    }
    try {
      const res = await fetch(`/admin/api/campagnes/${campaign.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Renommage impossible');
        setNameValue(campaign.name);
        return;
      }
      setCampaign((c) => ({ ...c, name: trimmed }));
    } catch {
      setNameValue(campaign.name);
    }
  }

  const audienceLine =
    listNames.length > 0
      ? listNames.join(', ')
      : `${CAMPAIGN_TARGET_TYPE_LABELS[campaign.target_contact_type]} · ${zonesSummary(campaign.target_zones)}`;

  const senderLine = campaign.from_email
    ? campaign.from_name
      ? `${campaign.from_name} <${campaign.from_email}>`
      : campaign.from_email
    : 'Expéditeur par défaut';

  const tabs: Array<{ key: TabKey; label: string }> = hasStats
    ? [
        { key: 'overview', label: "Vue d'ensemble" },
        { key: 'deliverability', label: 'Délivrabilité' },
        { key: 'opens', label: 'Ouvertures' },
        { key: 'clicks', label: 'Clics' },
        { key: 'unsubs', label: 'Désinscriptions' },
        { key: 'content', label: 'Contenu' },
      ]
    : [
        { key: 'overview', label: "Vue d'ensemble" },
        { key: 'content', label: 'Contenu' },
      ];

  const timeline = [
    { label: 'Création de la campagne', date: campaign.created_at, show: true },
    { label: 'Envoi programmé', date: campaign.scheduled_at, show: Boolean(campaign.scheduled_at) },
    {
      label: "Début de l'envoi",
      date: campaign.sending_started_at,
      show: Boolean(campaign.sending_started_at),
    },
    { label: 'Envoi terminé', date: campaign.sent_at, show: Boolean(campaign.sent_at) },
  ].filter((e) => e.show);

  const statCards = stats
    ? [
        {
          label: 'Délivrés',
          value: stats.delivered,
          rate: formatRate(stats.delivered, stats.sent),
        },
        { label: 'Ouvertures', value: stats.opened, rate: formatRate(stats.opened, stats.delivered) },
        { label: 'Clics', value: stats.clicked, rate: formatRate(stats.clicked, stats.delivered) },
        {
          label: 'Désinscriptions',
          value: stats.unsubscribed ?? 0,
          rate: formatRate(stats.unsubscribed ?? 0, stats.delivered),
        },
      ]
    : [];

  return (
    <div>
      {/* ─── En-tête ─── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
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
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') {
                    setNameValue(campaign.name);
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
                  {campaign.name}
                </h1>
                <span className="text-oq-muted opacity-0 group-hover:opacity-100 transition-opacity text-[14px]">
                  ✎
                </span>
              </button>
            )}
            <span
              className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${CAMPAIGN_STATUS_TONES[status]}`}
            >
              {CAMPAIGN_STATUS_LABELS[status]}
            </span>
          </div>
          {campaign.folder && (
            <div className="text-[13px] text-oq-muted mt-0.5">Dossier : {campaign.folder}</div>
          )}
          {isFailed && campaign.error && (
            <p className="text-[13px] text-red-600 mt-1">{campaign.error}</p>
          )}
          {isScheduled && campaign.scheduled_at && (
            <p className="text-[13px] text-oq-muted mt-1">
              Envoi programmé le {fmtDate(campaign.scheduled_at)}
            </p>
          )}
          {campaign.sent_at && (
            <p className="text-[13px] text-oq-muted mt-1">Envoyée le {fmtDate(campaign.sent_at)}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {isSent && (
            <a
              href={`/admin/api/campagnes/${campaign.id}/export`}
              className="oq-btn-secondary no-underline"
            >
              Exporter le rapport
            </a>
          )}
          {isScheduled && (
            <>
              <button
                type="button"
                className="oq-btn-secondary"
                disabled={busy}
                onClick={() => {
                  if (campaign.scheduled_at) {
                    const d = new Date(campaign.scheduled_at);
                    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16);
                    setScheduleValue(local);
                  }
                  setScheduleOpen(true);
                }}
              >
                Modifier la programmation
              </button>
              <button
                type="button"
                className="oq-btn-secondary"
                disabled={busy}
                onClick={() => action('schedule', { cancel: true })}
              >
                Annuler la programmation
              </button>
            </>
          )}
          {isSending && (
            <button
              type="button"
              className="oq-btn-secondary"
              disabled={busy}
              onClick={() => action('pause')}
            >
              ⏸ Mettre en pause
            </button>
          )}
          {isPaused && (
            <button
              type="button"
              className="oq-btn-dark"
              disabled={busy}
              onClick={() => action('resume')}
            >
              ▶ Reprendre l'envoi
            </button>
          )}
          {isFailed && (
            <button
              type="button"
              className="oq-btn-dark"
              disabled={busy}
              onClick={() => {
                if (confirm("Relancer l'envoi de cette campagne ? Seuls les destinataires encore en attente seront traités.")) {
                  action('send');
                }
              }}
            >
              Relancer l'envoi
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-5 px-4 py-3 bg-oq-bg border border-oq-border rounded-btn text-[13px] text-oq-text">
          {notice}
        </div>
      )}

      {isSending && (
        <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-btn text-[13px] text-amber-800">
          Envoi en cours — les statistiques se rafraîchissent automatiquement toutes les 5 secondes.
        </div>
      )}
      {isPaused && (
        <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-btn text-[13px] text-amber-800">
          Envoi en pause. Les destinataires restants seront traités à la reprise — aucun email ne
          sera envoyé deux fois.
        </div>
      )}

      {/* ─── Onglets ─── */}
      <div className="flex gap-1 bg-white border border-oq-border rounded-btn p-1 mb-6 overflow-x-auto [-webkit-overflow-scrolling:touch]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-btn text-[14px] whitespace-nowrap shrink-0 ${
              tab === t.key
                ? 'bg-oq-black text-white font-semibold'
                : 'text-oq-text hover:bg-oq-bg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Vue d'ensemble ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {hasStats && stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
              {statCards.map((c) => (
                <div key={c.label} className="bg-white border border-oq-border rounded-card p-4 sm:p-5">
                  <div className="text-[12px] uppercase tracking-wider text-oq-muted font-semibold">
                    {c.label}
                  </div>
                  <div className="text-[24px] sm:text-[28px] font-extrabold text-oq-black mt-1">
                    {fmtNum(c.value)}
                  </div>
                  <div className="text-[13px] text-oq-muted">{c.rate}</div>
                </div>
              ))}
            </div>
          )}

          <Card title="Détails de la campagne">
            <div className="divide-y divide-oq-border/60">
              <DetailRow label="Objet" value={campaign.subject || '—'} />
              {campaign.preview_text && (
                <DetailRow label="Texte d'aperçu" value={campaign.preview_text} />
              )}
              <DetailRow label="Expéditeur" value={senderLine} />
              {campaign.reply_to && <DetailRow label="Reply-to" value={campaign.reply_to} />}
              <DetailRow
                label={listNames.length > 0 ? 'Listes' : 'Audience'}
                value={audienceLine}
              />
              <DetailRow
                label="Contenu"
                value={
                  campaign.content_mode === 'custom' ? (
                    'HTML personnalisé'
                  ) : (
                    <>
                      Bien mis en avant
                      {campaign.property_title ? ` — ${campaign.property_title}` : ''}
                      {campaign.property_slug && (
                        <a
                          href={`/biens/${campaign.property_slug}`}
                          target="_blank"
                          className="text-[13px] ml-2"
                        >
                          Voir la fiche
                        </a>
                      )}
                    </>
                  )
                }
              />
              {isScheduled ? (
                <>
                  {audienceCount && (
                    <DetailRow
                      label="Destinataires actifs"
                      value={
                        <>
                          {fmtNum(audienceCount.active)}
                          {audienceCount.excluded > 0 && (
                            <span className="text-orange-600 ml-1">
                              ({fmtNum(audienceCount.excluded)} exclus)
                            </span>
                          )}
                        </>
                      }
                    />
                  )}
                  <DetailRow label="Envoi programmé" value={fmtDate(campaign.scheduled_at)} />
                </>
              ) : (
                <DetailRow label="Destinataires" value={fmtNum(campaign.total_recipients)} />
              )}
              <DetailRow label="Fournisseur" value="Resend" />
            </div>
          </Card>

          <Card title="Historique">
            <div className="relative">
              {timeline.map((event, index) => (
                <div key={event.label} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-oq-black shrink-0 mt-1" />
                    {index < timeline.length - 1 && <div className="w-0.5 h-8 bg-oq-border" />}
                  </div>
                  <div className="pb-5">
                    <p className="text-[14px] font-medium text-oq-black leading-none">
                      {event.label}
                    </p>
                    <p className="text-[13px] text-oq-muted mt-1">{fmtDate(event.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── Délivrabilité ─── */}
      {tab === 'deliverability' && stats && (
        <div className="space-y-4">
          <Card title="Délivrabilité">
            <div className="divide-y divide-oq-border/60">
              <DetailRow label="Envoyés" value={fmtNum(stats.sent)} />
              <DetailRow
                label="Délivrés"
                value={`${fmtNum(stats.delivered)} (${formatRate(stats.delivered, stats.sent)})`}
              />
              <DetailRow
                label="Bounces"
                value={`${fmtNum(stats.bounced)} (${formatRate(stats.bounced, stats.sent)})`}
              />
              <DetailRow label="Échecs d'envoi" value={fmtNum(stats.failed)} />
            </div>
          </Card>
          <ContactsTable
            campaignId={campaign.id}
            status="delivered"
            timestampField="delivered_at"
            timestampLabel="Délivré le"
          />
        </div>
      )}

      {/* ─── Ouvertures ─── */}
      {tab === 'opens' && stats && (
        <div className="space-y-4">
          <Card title="Ouvertures" description="Ouvertures uniques par destinataire.">
            <p className="text-[14px] text-oq-text">
              {fmtNum(stats.opened)} ouverture{stats.opened > 1 ? 's' : ''} unique
              {stats.opened > 1 ? 's' : ''} ({formatRate(stats.opened, stats.delivered)})
            </p>
          </Card>
          <ContactsTable
            campaignId={campaign.id}
            status="opened"
            timestampField="opened_at"
            timestampLabel="Ouvert le"
          />
        </div>
      )}

      {/* ─── Clics ─── */}
      {tab === 'clicks' && stats && (
        <div className="space-y-4">
          <ClickedLinks campaignId={campaign.id} />
          <ContactsTable
            campaignId={campaign.id}
            status="clicked"
            timestampField="clicked_at"
            timestampLabel="Cliqué le"
          />
        </div>
      )}

      {/* ─── Désinscriptions ─── */}
      {tab === 'unsubs' && stats && (
        <div className="space-y-4">
          <Card title="Désinscriptions">
            <p className="text-[14px] text-oq-text">
              {fmtNum(stats.unsubscribed ?? 0)} désinscription
              {(stats.unsubscribed ?? 0) > 1 ? 's' : ''} (
              {formatRate(stats.unsubscribed ?? 0, stats.delivered)})
            </p>
          </Card>
          <ContactsTable
            campaignId={campaign.id}
            status="unsubscribed"
            timestampField="unsubscribed_at"
            timestampLabel="Désinscrit le"
          />
        </div>
      )}

      {/* ─── Contenu ─── */}
      {tab === 'content' && (
        <Card
          title="Contenu de la campagne"
          description="Aperçu du contenu envoyé (variables remplacées par des données de démonstration)."
        >
          {contentHtml ? (
            <div className="border border-oq-border rounded-btn overflow-hidden">
              <iframe
                title="Aperçu du contenu"
                sandbox=""
                srcDoc={contentHtml}
                className="w-full bg-white"
                style={{ height: '600px', border: 'none' }}
              />
            </div>
          ) : (
            <p className="text-[14px] text-oq-muted">Aucun contenu disponible.</p>
          )}
        </Card>
      )}

      {/* ─── Modal re-programmation ─── */}
      {scheduleOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setScheduleOpen(false)}
        >
          <div
            className="bg-white rounded-card border border-oq-border p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-bold text-oq-black mb-1">Modifier la programmation</h3>
            <p className="text-[13px] text-oq-muted mb-4">
              Choisissez la nouvelle date et heure d'envoi.
            </p>
            <input
              type="datetime-local"
              className="oq-input mb-4"
              value={scheduleValue}
              onChange={(e) => setScheduleValue(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
              <button
                type="button"
                className="oq-btn-secondary"
                onClick={() => setScheduleOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="oq-btn-dark"
                disabled={!scheduleValue || busy}
                onClick={() =>
                  action('schedule', {
                    scheduled_at: new Date(scheduleValue).toISOString(),
                  })
                }
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
