import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { assertPublishedProperty, json, validateCampaignFields } from './_helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const result = validateCampaignFields(body);
  if ('error' in result) return json({ error: result.error }, 400);
  const fields = result.fields;

  if (typeof fields.name !== 'string') {
    return json({ error: 'Nom de campagne requis' }, 400);
  }

  const supabase = getAdminClient();
  if (typeof fields.property_id === 'string') {
    const propError = await assertPublishedProperty(supabase, fields.property_id);
    if (propError) return json({ error: propError }, 400);
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...fields, created_by: locals.user.email })
    .select()
    .single();
  if (error) {
    console.error('[admin campagnes create] error', error);
    return json({ error: `Création impossible : ${error.message}` }, 500);
  }
  return json({ success: true, campaign: data });
};
