import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { isSameOrigin } from '../../../../lib/security';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

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
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
    return json({ error: 'Nom de liste invalide' }, 400);
  }

  const supabase = getAdminClient();
  const { error } = await supabase
    .from('contact_lists')
    .update({ name: body.name.trim() })
    .eq('id', id);
  if (error) {
    console.error('[admin listes rename] error', error);
    return json({ error: `Mise à jour impossible : ${error.message}` }, 500);
  }
  return json({ success: true });
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  // Garde CSRF : requête sans body JSON, donc sans préflight CORS.
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return json({ error: 'Origine invalide' }, 403);
  }
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { error } = await supabase.from('contact_lists').delete().eq('id', id);
  if (error) {
    console.error('[admin listes delete] error', error);
    return json({ error: `Suppression impossible : ${error.message}` }, 500);
  }
  return json({ success: true });
};

