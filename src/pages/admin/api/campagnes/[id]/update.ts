import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { isSameOrigin } from '../../../../../lib/security';
import {
  UUID_REGEX,
  assertPropertyExists,
  json,
  validateCampaignFields,
} from '../_helpers';

export const prerender = false;

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

  const result = validateCampaignFields(body);
  if ('error' in result) return json({ error: result.error }, 400);
  const fields = result.fields;
  if (Object.keys(fields).length === 0) {
    return json({ error: 'Aucun champ à mettre à jour' }, 400);
  }

  const supabase = getAdminClient();
  if (typeof fields.property_id === 'string') {
    const propError = await assertPropertyExists(supabase, fields.property_id);
    if (propError) return json({ error: propError }, 400);
  }

  // Seuls les brouillons sont éditables : le filtre status fait office de
  // verrou (0 ligne modifiée = campagne déjà partie ou inexistante).
  // Exception : `name` et `folder` (métadonnées internes, sans effet sur le
  // contenu envoyé) restent renommables à tout statut — parité Mailer.
  const RENAME_ONLY_KEYS = ['name', 'folder'];
  const renameOnly = Object.keys(fields).every((k) => RENAME_ONLY_KEYS.includes(k));
  let query = supabase.from('campaigns').update(fields).eq('id', id);
  if (!renameOnly) query = query.eq('status', 'draft');
  const { data, error } = await query.select();
  if (error) {
    console.error('[admin campagnes update] error', error);
    return json({ error: `Mise à jour impossible : ${error.message}` }, 500);
  }
  if (!data || data.length === 0) {
    return json(
      { error: renameOnly ? 'Campagne introuvable' : 'Seuls les brouillons sont modifiables' },
      renameOnly ? 404 : 409,
    );
  }
  return json({ success: true, campaign: data[0] });
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
  // Brouillons et campagnes en échec supprimables ; une programmée doit être
  // annulée d'abord ; les envoyées restent (historique des stats).
  const { data, error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)
    .in('status', ['draft', 'failed'])
    .select();
  if (error) {
    console.error('[admin campagnes delete] error', error);
    return json({ error: `Suppression impossible : ${error.message}` }, 500);
  }
  if (!data || data.length === 0) {
    return json(
      { error: 'Seuls les brouillons et campagnes en échec sont supprimables' },
      409,
    );
  }
  return json({ success: true });
};
