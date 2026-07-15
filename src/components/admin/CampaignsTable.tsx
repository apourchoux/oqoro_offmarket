import { useMemo, useState } from 'react';
import type { Campaign, CampaignStatus } from '../../lib/types';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  CAMPAIGN_TARGET_TYPE_LABELS,
} from '../../lib/types';
import { formatRate } from '../../lib/format';
import { zonesSummary } from '../../lib/zones';

export interface CampaignRow extends Campaign {
  property_title: string | null;
  stats: {
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  } | null;
  target_list_names: string[];
}

interface Props {
  initialCampaigns: CampaignRow[];
}

const STATUS_FILTERS: Array<CampaignStatus | 'all'> = [
  'all',
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
];

export default function CampaignsTable({ initialCampaigns }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = campaigns;
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          (c.property_title ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [campaigns, search, statusFilter]);

  async function duplicateCampaign(c: CampaignRow) {
    setBusy(c.id);
    try {
      const res = await fetch('/admin/api/campagnes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${c.name} (copie)`,
          subject: c.subject,
          preview_text: c.preview_text,
          intro_text: c.intro_text,
          ...(c.property_id ? { property_id: c.property_id } : {}),
          content_mode: c.content_mode,
          custom_html: c.custom_html,
          from_name: c.from_name,
          from_email: c.from_email,
          reply_to: c.reply_to,
          target_contact_type: c.target_contact_type,
          target_zones: c.target_zones,
          target_list_ids: c.target_list_ids,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Échec de la duplication');
        return;
      }
      window.location.href = `/admin/campagnes/${data.campaign.id}`;
    } catch (err) {
      alert('Échec de la duplication');
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Supprimer cette campagne ?')) return;
    setBusy(id);
    try {
      const res = await fetch(`/admin/api/campagnes/${id}/update`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Échec de la suppression');
        return;
      }
      setCampaigns((current) => current.filter((c) => c.id !== id));
    } catch (err) {
      alert('Échec de la suppression');
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  function audienceLabel(c: CampaignRow): { main: string; sub: string } {
    if (c.target_list_names.length > 0) {
      return {
        main: c.target_list_names.slice(0, 2).join(', ') +
          (c.target_list_names.length > 2 ? ` +${c.target_list_names.length - 2}` : ''),
        sub: 'Listes',
      };
    }
    return {
      main: CAMPAIGN_TARGET_TYPE_LABELS[c.target_contact_type],
      sub: zonesSummary(c.target_zones),
    };
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-4">
        <input
          type="search"
          className="oq-input sm:max-w-xs"
          placeholder="Rechercher une campagne…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="oq-input sm:w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | 'all')}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Tous les statuts' : CAMPAIGN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="hidden sm:block sm:flex-1" />
        <span className="text-[13px] text-oq-muted">
          {filtered.length} campagne{filtered.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-white border border-oq-border rounded-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-oq-muted mb-6">
              {campaigns.length === 0
                ? 'Aucune campagne pour le moment.'
                : 'Aucune campagne ne correspond à la recherche.'}
            </p>
            {campaigns.length === 0 && (
              <a href="/admin/campagnes/new" className="oq-btn-dark">
                Créer la première campagne
              </a>
            )}
          </div>
        ) : (
          <>
          {/* Mobile : cartes empilées */}
          <div className="lg:hidden divide-y divide-oq-border">
            {filtered.map((c) => {
              const audience = audienceLabel(c);
              const date = c.sent_at ?? c.scheduled_at ?? c.created_at;
              const hasStats = c.status !== 'draft' && c.status !== 'scheduled';
              return (
                <div key={c.id} className="p-4">
                  <a href={`/admin/campagnes/${c.id}`} className="block no-underline">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-oq-black text-[15px] leading-snug">
                        {c.name}
                      </span>
                      <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${CAMPAIGN_STATUS_TONES[c.status]}`}>
                        {CAMPAIGN_STATUS_LABELS[c.status]}
                      </span>
                    </div>
                    <div className="text-[13px] text-oq-muted mt-0.5 line-clamp-1">
                      {c.subject || audience.main}
                      {c.property_title ? ` · ${c.property_title}` : ''}
                    </div>
                    <div className="text-[13px] text-oq-muted mt-1">
                      {new Date(date).toLocaleString('fr-FR', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      {c.status === 'scheduled' && (
                        <span className="text-blue-700"> · envoi programmé</span>
                      )}
                    </div>
                    {hasStats && (
                      <div className="grid grid-cols-4 gap-2 mt-3 text-center bg-oq-bg rounded-btn px-2 py-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-oq-muted">Dest.</div>
                          <div className="text-[14px] font-bold text-oq-black">{c.total_recipients}</div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-oq-muted">Ouvert.</div>
                          <div className="text-[14px] font-bold text-oq-black">
                            {c.stats ? formatRate(c.stats.opened, c.stats.delivered) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-oq-muted">Clics</div>
                          <div className="text-[14px] font-bold text-oq-black">
                            {c.stats ? formatRate(c.stats.clicked, c.stats.delivered) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-oq-muted">Rejets</div>
                          <div className="text-[14px] font-bold text-oq-black">
                            {c.stats ? c.stats.bounced : '—'}
                          </div>
                        </div>
                      </div>
                    )}
                  </a>
                  <div className="flex gap-2 mt-3">
                    <a href={`/admin/campagnes/${c.id}`} className="oq-btn-secondary oq-btn-sm flex-1">
                      {c.status === 'draft' ? 'Éditer' : 'Ouvrir'}
                    </a>
                    <button
                      type="button"
                      className="oq-btn-secondary oq-btn-sm flex-1"
                      disabled={busy === c.id}
                      onClick={() => duplicateCampaign(c)}
                    >
                      Dupliquer
                    </button>
                    {(c.status === 'draft' || c.status === 'failed') && (
                      <button
                        type="button"
                        className="oq-btn-secondary oq-btn-sm !text-red-600"
                        disabled={busy === c.id}
                        onClick={() => deleteCampaign(c.id)}
                      >
                        Suppr.
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop : table */}
          <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-wider text-oq-muted bg-oq-bg">
                <th className="px-4 py-3 font-semibold">Campagne</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold text-right">Dest.</th>
                <th className="px-4 py-3 font-semibold text-right">Ouvert.</th>
                <th className="px-4 py-3 font-semibold text-right">Clics</th>
                <th className="px-4 py-3 font-semibold text-right">Rejets</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const audience = audienceLabel(c);
                const date = c.sent_at ?? c.scheduled_at ?? c.created_at;
                return (
                  <tr
                    key={c.id}
                    className="border-t border-oq-border hover:bg-oq-bg/50 cursor-pointer"
                    onClick={() => {
                      window.location.href = `/admin/campagnes/${c.id}`;
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-oq-black">{c.name}</div>
                      <div className="text-[12px] text-oq-muted">
                        {c.subject || audience.main}
                        {c.property_title ? ` · ${c.property_title}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${CAMPAIGN_STATUS_TONES[c.status]}`}>
                        {CAMPAIGN_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-oq-muted text-[13px] whitespace-nowrap">
                      {new Date(date).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {c.status === 'scheduled' && (
                        <div className="text-[11px] text-blue-700">envoi programmé</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-oq-text">
                      {c.status === 'draft' || c.status === 'scheduled' ? '—' : c.total_recipients}
                    </td>
                    <td className="px-4 py-3 text-right text-oq-text whitespace-nowrap">
                      {c.stats ? `${c.stats.opened} (${formatRate(c.stats.opened, c.stats.delivered)})` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-oq-text whitespace-nowrap">
                      {c.stats ? `${c.stats.clicked} (${formatRate(c.stats.clicked, c.stats.delivered)})` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-oq-text">
                      {c.stats ? c.stats.bounced : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="text-[13px] text-oq-muted hover:text-oq-black mr-3"
                        disabled={busy === c.id}
                        onClick={() => duplicateCampaign(c)}
                        title="Dupliquer"
                      >
                        Dupliquer
                      </button>
                      {(c.status === 'draft' || c.status === 'failed') && (
                        <button
                          type="button"
                          className="text-[13px] text-red-600 hover:text-red-700"
                          disabled={busy === c.id}
                          onClick={() => deleteCampaign(c.id)}
                          title="Supprimer"
                        >
                          Suppr.
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
