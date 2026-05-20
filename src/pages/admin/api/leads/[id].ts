import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALUES = ['new', 'contacted', 'converted', 'archived'] as const;
const MAX_NOTES = 5000;

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
  if ('status' in body) {
    if (
      typeof body.status !== 'string' ||
      !(STATUS_VALUES as readonly string[]).includes(body.status)
    ) {
      return json({ error: 'Statut invalide' }, 400);
    }
    patch.status = body.status;
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return json({ error: 'Notes invalides' }, 400);
    }
    patch.notes =
      typeof body.notes === 'string' ? body.notes.slice(0, MAX_NOTES) : null;
  }
  if (Object.keys(patch).length === 0) {
    return json({ error: 'Aucun champ à mettre à jour' }, 400);
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) {
    console.error('[admin leads update] error');
    return json({ error: 'Mise à jour impossible' }, 500);
  }
  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
