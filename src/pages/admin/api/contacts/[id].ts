import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { isValidDepartement } from '../../../../lib/zones';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTACT_TYPES = ['proprietaire', 'investisseur', 'mixte'] as const;
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

  if ('first_name' in body) {
    if (typeof body.first_name !== 'string' || !body.first_name.trim() || body.first_name.length > 100) {
      return json({ error: 'Prénom invalide' }, 400);
    }
    patch.first_name = body.first_name.trim();
  }
  if ('last_name' in body) {
    if (typeof body.last_name !== 'string' || !body.last_name.trim() || body.last_name.length > 100) {
      return json({ error: 'Nom invalide' }, 400);
    }
    patch.last_name = body.last_name.trim();
  }
  if ('phone' in body) {
    if (body.phone !== null && (typeof body.phone !== 'string' || body.phone.length > 50)) {
      return json({ error: 'Téléphone invalide' }, 400);
    }
    patch.phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  }
  if ('contact_type' in body) {
    if (
      typeof body.contact_type !== 'string' ||
      !(CONTACT_TYPES as readonly string[]).includes(body.contact_type)
    ) {
      return json({ error: 'Type de contact invalide' }, 400);
    }
    patch.contact_type = body.contact_type;
  }
  if ('zones' in body) {
    if (
      !Array.isArray(body.zones) ||
      body.zones.some((z) => typeof z !== 'string' || !isValidDepartement(z))
    ) {
      return json({ error: 'Zones invalides' }, 400);
    }
    patch.zones = [...new Set(body.zones as string[])];
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return json({ error: 'Notes invalides' }, 400);
    }
    patch.notes = typeof body.notes === 'string' ? body.notes.slice(0, MAX_NOTES) : null;
  }
  if ('subscribed' in body) {
    if (typeof body.subscribed !== 'boolean') {
      return json({ error: 'Abonnement invalide' }, 400);
    }
    patch.subscribed = body.subscribed;
    patch.unsubscribed_at = body.subscribed ? null : new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: 'Aucun champ à mettre à jour' }, 400);
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from('contacts').update(patch).eq('id', id);
  if (error) {
    console.error('[admin contacts update] error', error);
    return json({ error: `Mise à jour impossible : ${error.message}` }, 500);
  }
  return json({ success: true });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) {
    console.error('[admin contacts delete] error', error);
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
