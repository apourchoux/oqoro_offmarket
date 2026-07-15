import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { json } from './_helpers';

export const prerender = false;

const MAX_RESULTS = 50;

// Recherche de contacts par nom ou email (min. 2 caractères) — alimente le
// panneau « Ajouter des contacts » d'une liste. Recherche côté serveur :
// fonctionne quel que soit le volume de la base.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  const raw = (url.searchParams.get('q') ?? '').trim();
  if (raw.length < 2 || raw.length > 100) {
    return json({ contacts: [] });
  }
  // Neutralise les métacaractères du filtre PostgREST (virgule, parenthèses
  // découpent l'expression `or=`) et des motifs LIKE.
  const q = raw.replace(/[,()%_]/g, ' ').trim();
  if (q.length < 2) return json({ contacts: [] });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, subscribed')
    .or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(MAX_RESULTS);
  if (error) {
    console.error('[admin contacts search] error', error);
    return json({ error: error.message }, 500);
  }
  return json({ contacts: data ?? [] });
};
