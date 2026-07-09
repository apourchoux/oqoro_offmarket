import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../../_helpers';

export const prerender = false;

const MAX_BATCH = 2000;

// GET : membres de la liste (500 premiers, pour le drawer d'édition).
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_list_members')
    .select('contact_id, contacts(id, first_name, last_name, email, subscribed)')
    .eq('list_id', id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return json({ error: error.message }, 500);

  const members = (data ?? [])
    .map((m: any) => m.contacts)
    .filter(Boolean);
  return json({ members });
};

// POST { add?: uuid[], remove?: uuid[] } : gère l'appartenance à la liste.
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

  const add = validateIds(body.add);
  const remove = validateIds(body.remove);
  if (add === null || remove === null) {
    return json({ error: 'Identifiants de contacts invalides' }, 400);
  }
  if (add.length === 0 && remove.length === 0) {
    return json({ error: 'Rien à faire' }, 400);
  }

  const supabase = getAdminClient();

  if (add.length > 0) {
    const rows = add.map((contact_id) => ({ list_id: id, contact_id }));
    const { error } = await supabase
      .from('contact_list_members')
      .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true });
    if (error) {
      console.error('[admin listes members add] error', error);
      return json({ error: error.message }, 500);
    }
  }
  if (remove.length > 0) {
    const { error } = await supabase
      .from('contact_list_members')
      .delete()
      .eq('list_id', id)
      .in('contact_id', remove);
    if (error) {
      console.error('[admin listes members remove] error', error);
      return json({ error: error.message }, 500);
    }
  }

  return json({ success: true, added: add.length, removed: remove.length });
};

function validateIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    value.length > MAX_BATCH ||
    value.some((v) => typeof v !== 'string' || !UUID_REGEX.test(v))
  ) {
    return null;
  }
  return [...new Set(value as string[])];
}

