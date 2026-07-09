import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { isSameOrigin } from '../../../../lib/security';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
      return json({ error: 'Nom de template invalide' }, 400);
    }
    patch.name = body.name.trim();
  }
  if ('html' in body) {
    if (typeof body.html !== 'string' || body.html.length > 500000) {
      return json({ error: 'HTML invalide' }, 400);
    }
    patch.html = body.html;
  }
  if (Object.keys(patch).length === 0) {
    return json({ error: 'Aucun champ à mettre à jour' }, 400);
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from('email_templates').update(patch).eq('id', id);
  if (error) {
    console.error('[admin templates update] error', error);
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
  const { error } = await supabase.from('email_templates').delete().eq('id', id);
  if (error) {
    console.error('[admin templates delete] error', error);
    return json({ error: `Suppression impossible : ${error.message}` }, 500);
  }
  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
