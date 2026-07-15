import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../../_helpers';

export const prerender = false;

const MAX_BATCH = 2000;

// GET : TOUS les membres de la liste (paginé en interne — PostgREST plafonne
// à ~1000 lignes par requête ; garde-fou à 50 000).
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const PAGE = 1000;
  const MAX_MEMBERS = 50000;
  const members: unknown[] = [];
  for (let from = 0; from < MAX_MEMBERS; from += PAGE) {
    const { data, error } = await supabase
      .from('contact_list_members')
      .select('contact_id, contacts(id, first_name, last_name, email, phone, subscribed)')
      .eq('list_id', id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    members.push(...(data ?? []).map((m: any) => m.contacts).filter(Boolean));
    if (!data || data.length < PAGE) break;
  }
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

