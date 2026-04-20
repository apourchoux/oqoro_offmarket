import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';

export const prerender = false;

const ALLOWED: Array<'status' | 'notes'> = ['status', 'notes'];

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id) return json({ error: 'ID manquant' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return json({ error: 'Aucun champ à mettre à jour' }, 400);
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
