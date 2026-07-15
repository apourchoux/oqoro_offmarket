import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Export CSV du rapport d'une campagne. Sans `?status=`, exporte tous les
// destinataires ; avec `?status=delivered|opened|clicked|unsubscribed|bounced`,
// seulement ceux ayant l'événement correspondant.
const EVENT_COLUMNS: Record<string, string> = {
  delivered: 'delivered_at',
  opened: 'opened_at',
  clicked: 'clicked_at',
  unsubscribed: 'unsubscribed_at',
  bounced: 'bounced_at',
};

const PAGE = 1000; // limite PostgREST par requête
const MAX_ROWS = 100000; // garde-fou

function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const GET: APIRoute = async ({ url, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const status = url.searchParams.get('status');
  if (status && !EVENT_COLUMNS[status]) return json({ error: 'Statut invalide' }, 400);
  const column = status ? EVENT_COLUMNS[status] : null;

  const supabase = getAdminClient();
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return json({ error: 'Campagne introuvable' }, 404);

  const header = [
    'email', 'prenom', 'nom', 'statut', 'envoye_le', 'delivre_le',
    'ouvert_le', 'clique_le', 'rejete_le', 'desabonne_le', 'erreur',
  ];
  const lines = [header.join(';')];

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase
      .from('campaign_recipients')
      .select(
        'email, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, unsubscribed_at, error, contacts(first_name, last_name)',
      )
      .eq('campaign_id', id)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (column) query = query.not(column, 'is', null);
    const { data, error } = await query;
    if (error) {
      console.error('[admin campagnes export] error', error);
      return json({ error: error.message }, 500);
    }
    for (const r of (data ?? []) as any[]) {
      lines.push(
        [
          csvCell(r.email),
          csvCell(r.contacts?.first_name),
          csvCell(r.contacts?.last_name),
          csvCell(r.status),
          csvCell(r.sent_at),
          csvCell(r.delivered_at),
          csvCell(r.opened_at),
          csvCell(r.clicked_at),
          csvCell(r.bounced_at),
          csvCell(r.unsubscribed_at),
          csvCell(r.error),
        ].join(';'),
      );
    }
    if (!data || data.length < PAGE) break;
  }

  const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = status ? `_${status}` : '';
  // BOM UTF-8 : Excel FR ouvre le fichier avec les accents corrects.
  return new Response(`﻿${lines.join('\r\n')}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rapport_${safeName}${suffix}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
