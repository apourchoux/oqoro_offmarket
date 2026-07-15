import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// URLs cliquées d'une campagne, agrégées par lien (onglet « Clics » du
// rapport). L'agrégation se fait ici : PostgREST ne fait pas de GROUP BY sans
// RPC, et le volume par campagne reste modeste (borné à 10 000 clics).
const MAX_CLICK_ROWS = 10000;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('campaign_clicks')
    .select('url')
    .eq('campaign_id', id)
    .limit(MAX_CLICK_ROWS);
  if (error) {
    console.error('[admin campagnes clicks] error', error);
    return json({ error: error.message }, 500);
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ url: string }>) {
    counts.set(row.url, (counts.get(row.url) ?? 0) + 1);
  }
  const links = [...counts.entries()]
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count);

  return json({ links, truncated: (data?.length ?? 0) >= MAX_CLICK_ROWS });
};
