import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { isSameOrigin } from '../../../../../lib/security';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Reprend l'envoi d'une campagne en pause (paused → sending) puis re-déclenche
// le worker. Idempotent côté worker : seuls les destinataires encore `pending`
// sont traités, aucun email n'est doublé.
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

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'sending', error: null })
    .eq('id', id)
    .eq('status', 'paused')
    .select();
  if (error) return json({ error: error.message }, 500);
  if (!data || data.length === 0) {
    return json({ error: "Cette campagne n'est pas en pause" }, 409);
  }

  // Origine de CONFIANCE (jamais dérivée de la requête) — cf. send.ts.
  const origin =
    process.env.URL ||
    import.meta.env.PUBLIC_SITE_URL ||
    'https://offmarket.oqoro.com';
  try {
    const res = await fetch(
      `${origin}/.netlify/functions/send-campaign-background`,
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
    console.error('[admin campagnes resume] trigger error', err);
    // Retour en pause : l'admin peut retenter, rien n'est parti.
    await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', id)
      .eq('status', 'sending');
    return json({ error: "Impossible de relancer l'envoi en arrière-plan" }, 500);
  }

  return json({ success: true, campaign: data[0] });
};
