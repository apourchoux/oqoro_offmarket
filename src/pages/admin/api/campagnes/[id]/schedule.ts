import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Programme (ou déprogramme) l'envoi d'une campagne.
// POST { scheduled_at: ISO }  → draft → scheduled
// POST { cancel: true }       → scheduled → draft
// La fonction Netlify planifiée `campaign-scheduler` (toutes les 5 min)
// déclenche les campagnes arrivées à échéance.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const supabase = getAdminClient();

  if (body.cancel === true) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: 'draft', scheduled_at: null })
      .eq('id', id)
      .eq('status', 'scheduled')
      .select();
    if (error) return json({ error: error.message }, 500);
    if (!data || data.length === 0) {
      return json({ error: "Cette campagne n'est pas programmée" }, 409);
    }
    return json({ success: true, campaign: data[0] });
  }

  if (typeof body.scheduled_at !== 'string') {
    return json({ error: 'Date de programmation requise' }, 400);
  }
  const when = new Date(body.scheduled_at);
  if (Number.isNaN(when.getTime())) {
    return json({ error: 'Date invalide' }, 400);
  }
  if (when.getTime() < Date.now() + 60_000) {
    return json({ error: 'La date doit être dans le futur (au moins 1 minute)' }, 400);
  }

  // Une campagne doit être envoyable pour être programmée.
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('subject, content_mode, custom_html, property_id')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return json({ error: 'Campagne introuvable' }, 404);
  if (!campaign.subject?.trim()) {
    return json({ error: "Renseignez l'objet avant de programmer" }, 400);
  }
  if (campaign.content_mode === 'custom' && !campaign.custom_html?.trim()) {
    return json({ error: 'Le contenu HTML est vide' }, 400);
  }
  if (campaign.content_mode === 'property' && !campaign.property_id) {
    return json({ error: 'Sélectionnez un bien avant de programmer' }, 400);
  }

  // Programmable depuis draft (cas normal), scheduled (re-programmation) et
  // failed (relance différée — cohérent avec send.ts qui re-claim les failed).
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'scheduled', scheduled_at: when.toISOString(), error: null })
    .eq('id', id)
    .in('status', ['draft', 'scheduled', 'failed'])
    .select();
  if (error) return json({ error: error.message }, 500);
  if (!data || data.length === 0) {
    return json(
      { error: 'Cette campagne est en cours d’envoi ou déjà envoyée' },
      409,
    );
  }
  return json({ success: true, campaign: data[0] });
};
