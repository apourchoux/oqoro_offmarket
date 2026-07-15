import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { isSameOrigin } from '../../../../../lib/security';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Lance la resynchronisation des statuts depuis l'API Resend (bouton
// « Synchroniser » du rapport). Le travail réel — un appel API par
// destinataire, limité à 10 req/s — dépasse largement le budget d'une
// fonction SSR (~10 s) : il est délégué à la background function Netlify
// `resync-campaign-background` (202 immédiat, jusqu'à 15 min), comme l'envoi.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  // Garde CSRF : POST sans body JSON, donc sans préflight CORS.
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return json({ error: 'Origine invalide' }, 403);
  }
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const functionSecret = import.meta.env.CAMPAIGN_FUNCTION_SECRET;
  if (!functionSecret) {
    return json({ error: 'CAMPAIGN_FUNCTION_SECRET non configurée' }, 503);
  }
  if (!import.meta.env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY non configurée' }, 503);
  }

  const supabase = getAdminClient();
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return json({ error: 'Campagne introuvable' }, 404);
  if (!['sent', 'failed', 'paused'].includes(campaign.status)) {
    return json({ error: 'Cette campagne n’a pas encore été envoyée' }, 409);
  }

  // Nombre de destinataires dont le statut peut encore progresser — donne au
  // rapport une estimation de la durée (≈ 8 lookups/s côté worker).
  const { count } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .in('status', ['sent', 'delivered', 'opened'])
    .not('resend_email_id', 'is', null);
  if (!count) {
    return json({ success: true, queued: 0, message: 'Rien à synchroniser : tous les statuts sont à jour.' });
  }

  // Origine de CONFIANCE (jamais dérivée de la requête) — cf. send.ts.
  const origin =
    process.env.URL ||
    import.meta.env.PUBLIC_SITE_URL ||
    'https://offmarket.oqoro.com';
  try {
    const res = await fetch(
      `${origin}/.netlify/functions/resync-campaign-background`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-campaign-secret': functionSecret,
        },
        body: JSON.stringify({ campaign_id: id }),
      },
    );
    if (!res.ok && res.status !== 202) {
      throw new Error(`Background function HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[admin campagnes resync] trigger error', err);
    return json({ error: 'Impossible de déclencher la synchronisation' }, 500);
  }

  return json({ success: true, queued: count });
};
