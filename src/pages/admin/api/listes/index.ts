import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

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
  const { data, error } = await supabase
    .from('contact_lists')
    .insert({ name: body.name.trim() })
    .select()
    .single();
  if (error) {
    console.error('[admin listes create] error', error);
    return json({ error: `Création impossible : ${error.message}` }, 500);
  }
  return json({ success: true, list: data });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
