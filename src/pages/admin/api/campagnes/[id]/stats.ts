import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Statut + agrégats d'une campagne — utilisé par le rafraîchissement live du
// rapport pendant un envoi (polling toutes les 5 s, comme Mailer).
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const [{ data: campaign }, { data: statsRows }] = await Promise.all([
    supabase
      .from('campaigns')
      .select(
        'id, status, error, total_recipients, sent_at, scheduled_at, sending_started_at, created_at',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('campaign_stats').select('*').eq('campaign_id', id),
  ]);
  if (!campaign) return json({ error: 'Campagne introuvable' }, 404);
  return json({ campaign, stats: statsRows?.[0] ?? null });
};
