import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { applySegmentFilter } from '../../../../../lib/campaigns';
import { isSameOrigin } from '../../../../../lib/security';
import { UUID_REGEX, assertPublishedProperty, json } from '../_helpers';

export const prerender = false;

// Taille de page pour contourner la limite PostgREST (1000 lignes/requête).
const PAGE_SIZE = 1000;

// Déclenche l'envoi d'une campagne :
// 1. claim atomique draft|failed → sending (anti double-clic, et relance
//    possible après échec : seuls les destinataires encore `pending` seront
//    traités par le worker) ;
// 2. snapshot du segment dans campaign_recipients ;
// 3. délégation de l'envoi à la background function Netlify (202 immédiat,
//    jusqu'à 15 min d'exécution — la fonction SSR Astro est limitée à ~10 s).
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

  // Claim atomique : seule la requête qui fait passer draft|failed → sending
  // continue. `failed` est réclamable pour permettre la relance.
  const { data: claimedRows, error: claimError } = await supabase
    .from('campaigns')
    .update({ status: 'sending', error: null })
    .eq('id', id)
    .in('status', ['draft', 'failed'])
    .select();
  const claimed = claimedRows?.[0];
  if (claimError || !claimed) {
    return json({ error: 'Campagne introuvable, déjà envoyée ou en cours' }, 409);
  }

  async function revertToDraft(): Promise<void> {
    await supabase.from('campaigns').update({ status: 'draft' }).eq('id', id);
  }

  if (!claimed.property_id) {
    await revertToDraft();
    return json({ error: "Sélectionnez un bien avant l'envoi" }, 400);
  }
  const propError = await assertPublishedProperty(supabase, claimed.property_id);
  if (propError) {
    await revertToDraft();
    return json({ error: propError }, 400);
  }

  // Snapshot de l'audience au moment de l'envoi, paginé pour dépasser la
  // limite PostgREST de 1000 lignes par requête (le compteur du composer est
  // exact ; le snapshot doit couvrir le même segment en entier).
  const contacts: Array<{ id: string; email: string }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: segmentError } = await applySegmentFilter(
      supabase
        .from('contacts')
        .select('id, email')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
      claimed.target_contact_type,
      claimed.target_zones,
    );
    if (segmentError) {
      await revertToDraft();
      console.error('[admin campagnes send] segment error', segmentError);
      return json({ error: segmentError.message }, 500);
    }
    contacts.push(...((page ?? []) as Array<{ id: string; email: string }>));
    if (!page || page.length < PAGE_SIZE) break;
  }
  if (contacts.length === 0) {
    await revertToDraft();
    return json({ error: 'Aucun destinataire dans ce segment' }, 400);
  }

  // Ré-envoi après échec partiel : la contrainte unique (campaign_id,
  // contact_id) fait le dédoublonnage, ignoreDuplicates préserve les lignes
  // existantes (déjà envoyées ou non).
  const rows = contacts.map((c) => ({
    campaign_id: id,
    contact_id: c.id,
    email: c.email,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('campaign_recipients')
      .upsert(rows.slice(i, i + 500), {
        onConflict: 'campaign_id,contact_id',
        ignoreDuplicates: true,
      });
    if (error) {
      await revertToDraft();
      console.error('[admin campagnes send] snapshot error', error);
      return json({ error: `Snapshot impossible : ${error.message}` }, 500);
    }
  }

  const { count } = await supabase
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id);
  const total = count ?? rows.length;
  await supabase.from('campaigns').update({ total_recipients: total }).eq('id', id);

  // Déclenche la background function (répond 202 immédiatement) sur l'origine
  // du déploiement courant (fonctionne aussi en deploy preview et netlify dev).
  const origin = new URL(request.url).origin;
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

  return json({ success: true, total });
};
