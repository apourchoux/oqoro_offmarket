import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Destinataires d'une campagne filtrés par événement, paginés — alimente les
// tables « Contacts » des onglets du rapport (Délivrés / Ouverts / Cliqués /
// Désabonnés / Rejetés). Le filtre porte sur le timestamp d'événement (pas le
// statut) : un destinataire « clicked » reste compté dans les délivrés.
const EVENT_COLUMNS: Record<string, string> = {
  delivered: 'delivered_at',
  opened: 'opened_at',
  clicked: 'clicked_at',
  unsubscribed: 'unsubscribed_at',
  bounced: 'bounced_at',
};

export const GET: APIRoute = async ({ url, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const status = url.searchParams.get('status') ?? '';
  const column = EVENT_COLUMNS[status];
  if (!column) return json({ error: 'Statut invalide' }, 400);

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const from = (page - 1) * limit;

  const supabase = getAdminClient();
  const { data, count, error } = await supabase
    .from('campaign_recipients')
    .select(
      'email, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, unsubscribed_at, contacts(first_name, last_name)',
      { count: 'exact' },
    )
    .eq('campaign_id', id)
    .not(column, 'is', null)
    .order(column, { ascending: false })
    .range(from, from + limit - 1);
  if (error) {
    console.error('[admin campagnes recipients] error', error);
    return json({ error: error.message }, 500);
  }

  const total = count ?? 0;
  return json({
    data: data ?? [],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
};
