import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { isValidDepartement } from '../../../../lib/zones';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_TYPES = ['proprietaire', 'investisseur', 'mixte'] as const;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const first_name = typeof body.first_name === 'string' ? body.first_name.trim() : '';
  const last_name = typeof body.last_name === 'string' ? body.last_name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!first_name || first_name.length > 100) return json({ error: 'Prénom invalide' }, 400);
  if (!last_name || last_name.length > 100) return json({ error: 'Nom invalide' }, 400);
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return json({ error: 'Email invalide' }, 400);
  }

  const insert: Record<string, unknown> = { first_name, last_name, email };

  if ('phone' in body && body.phone !== null && body.phone !== '') {
    if (typeof body.phone !== 'string' || body.phone.length > 50) {
      return json({ error: 'Téléphone invalide' }, 400);
    }
    insert.phone = body.phone.trim();
  }

  if ('contact_type' in body) {
    if (
      typeof body.contact_type !== 'string' ||
      !(CONTACT_TYPES as readonly string[]).includes(body.contact_type)
    ) {
      return json({ error: 'Type de contact invalide' }, 400);
    }
    insert.contact_type = body.contact_type;
  }

  if ('zones' in body) {
    if (
      !Array.isArray(body.zones) ||
      body.zones.some((z) => typeof z !== 'string' || !isValidDepartement(z))
    ) {
      return json({ error: 'Zones invalides' }, 400);
    }
    insert.zones = [...new Set(body.zones as string[])];
  }

  if ('notes' in body && body.notes !== null && body.notes !== '') {
    if (typeof body.notes !== 'string') return json({ error: 'Notes invalides' }, 400);
    insert.notes = body.notes.slice(0, 5000);
  }

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
