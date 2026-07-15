import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Listes auxquelles appartient un contact — alimente la section « Listes »
// du drawer de détail d'un contact. Les mutations passent par l'endpoint
// existant /admin/api/listes/{listId}/members ({ add | remove }).
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contact_list_members')
    .select('list_id')
    .eq('contact_id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ list_ids: (data ?? []).map((m: any) => m.list_id) });
};
