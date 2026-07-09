import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { applySegmentFilter } from '../../../../../lib/campaigns';
import { UUID_REGEX, assertPublishedProperty, json } from '../_helpers';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://offmarket.oqoro.com';

// Déclenche l'envoi d'une campagne :
// 1. claim atomique draft → sending (anti double-clic) ;
// 2. snapshot du segment dans campaign_recipients ;
// 3. délégation de l'envoi à la background function Netlify (202 immédiat,
//    jusqu'à 15 min d'exécution — la fonction SSR Astro est limitée à ~10 s).
export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
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

  // Claim atomique : seule la requête qui fait passer draft → sending continue.
  const { data: claimed, error: claimError } = await supabase
    .from('campaigns')
    .update({ status: 'sending', error: null })
    .eq('id', id)
    .eq('status', 'draft')
    .select()
    .single();
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

  // Snapshot de l'audience au moment de l'envoi.
  const { data: contacts, error: segmentError } = await applySegmentFilter(
    supabase.from('contacts').select('id, email'),
    claimed.target_contact_type,
    claimed.target_zones,
  );
  if (segmentError) {
    await revertToDraft();
    console.error('[admin campagnes send] segment error', segmentError);
    return json({ error: segmentError.message }, 500);
  }
  if (!contacts || contacts.length === 0) {
    await revertToDraft();
    return json({ error: 'Aucun destinataire dans ce segment' }, 400);
  }

  // Ré-envoi après échec partiel : ne recrée pas les lignes existantes.
  const { data: existing } = await supabase
    .from('campaign_recipients')
    .select('contact_id')
    .eq('campaign_id', id);
  const known = new Set((existing ?? []).map((r: any) => r.contact_id));
  const rows = contacts
    .filter((c: any) => !known.has(c.id))
    .map((c: any) => ({ campaign_id: id, contact_id: c.id, email: c.email }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('campaign_recipients')
      .insert(rows.slice(i, i + 500));
    if (error) {
      await revertToDraft();
      console.error('[admin campagnes send] snapshot error', error);
      return json({ error: `Snapshot impossible : ${error.message}` }, 500);
    }
  }

  const total = known.size + rows.length;
  await supabase.from('campaigns').update({ total_recipients: total }).eq('id', id);

  // Déclenche la background function (répond 202 immédiatement).
  try {
    const res = await fetch(
      `${SITE_URL}/.netlify/functions/send-campaign-background`,
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
