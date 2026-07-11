import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { UUID_REGEX, json, validateContactFields } from './_helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const result = validateContactFields(body);
  if ('error' in result) return json({ error: result.error }, 400);
  const insert = result.fields;

  if (!insert.first_name) return json({ error: 'Prénom requis' }, 400);
  if (!insert.last_name) return json({ error: 'Nom requis' }, 400);
  if (!insert.email) return json({ error: 'Email requis' }, 400);

  // Conversion depuis un lead : trace la provenance.
  if ('lead_id' in body && body.lead_id) {
    if (typeof body.lead_id !== 'string' || !UUID_REGEX.test(body.lead_id)) {
      return json({ error: 'Lead invalide' }, 400);
    }
    insert.lead_id = body.lead_id;
    insert.source = 'lead';
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contacts')
    .insert(insert)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return json({ error: 'Ce contact existe déjà (email en double)' }, 409);
    }
    console.error('[admin contacts create] error', error);
    return json({ error: `Création impossible : ${error.message}` }, 500);
  }
  return json({ success: true, contact: data });
};
