import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { isSameOrigin } from '../../../../../lib/security';
import { UUID_REGEX, assertPublishedProperty, json } from '../_helpers';

export const prerender = false;

// Déclenche l'envoi d'une campagne :
// 1. claim atomique draft|scheduled|failed → sending (anti double-clic ;
//    `failed` réclamable pour la relance — seuls les destinataires encore
//    `pending` seront traités) ;
// 2. délégation à la background function Netlify, qui fait le snapshot de
//    l'audience PUIS l'envoi (202 immédiat, jusqu'à 15 min — la fonction SSR
//    Astro est limitée à ~10 s).
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  // Garde CSRF : POST sans body JSON, donc sans préflight CORS (cf. rebuild.ts).
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

  const { data: claimedRows, error: claimError } = await supabase
    .from('campaigns')
    .update({ status: 'sending', error: null, scheduled_at: null })
    .eq('id', id)
    .in('status', ['draft', 'scheduled', 'failed'])
    .select();
  const claimed = claimedRows?.[0];
  if (claimError || !claimed) {
    return json({ error: 'Campagne introuvable, déjà envoyée ou en cours' }, 409);
  }

  async function revertToDraft(): Promise<void> {
    await supabase.from('campaigns').update({ status: 'draft' }).eq('id', id);
  }

  // Validation du contenu selon le mode.
  if (!claimed.subject?.trim()) {
    await revertToDraft();
    return json({ error: "Renseignez l'objet avant l'envoi" }, 400);
  }
  if (claimed.content_mode === 'custom') {
    if (!claimed.custom_html?.trim()) {
      await revertToDraft();
      return json({ error: "Le contenu HTML est vide" }, 400);
    }
  } else {
    if (!claimed.property_id) {
      await revertToDraft();
      return json({ error: "Sélectionnez un bien avant l'envoi" }, 400);
    }
    const propError = await assertPublishedProperty(supabase, claimed.property_id);
    if (propError) {
      await revertToDraft();
      return json({ error: propError }, 400);
    }
  }

  // Origine de CONFIANCE pour l'appel interne : jamais dérivée de la requête
  // (un `Host`/`X-Forwarded-Host` usurpé enverrait le CAMPAIGN_FUNCTION_SECRET
  // à un hôte attaquant). `process.env.URL` est l'adresse réelle du déploiement
  // fournie par Netlify (couvre aussi les deploy previews) ; PUBLIC_SITE_URL en
  // repli. Aligné sur campaign-scheduler.mts.
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
    console.error('[admin campagnes send] trigger error', err);
    await supabase
      .from('campaigns')
      .update({
        status: 'failed',
        error: "Impossible de déclencher la fonction d'envoi",
      })
      .eq('id', id);
    return json({ error: "Impossible de déclencher l'envoi en arrière-plan" }, 500);
  }

  return json({ success: true });
};
