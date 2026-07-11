import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { audienceQuery, type AudienceTarget } from '../../../../lib/campaigns';
import { json, validateCampaignFields } from './_helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const result = validateCampaignFields({
    target_contact_type: body.target_contact_type ?? 'tous',
    target_zones: body.target_zones ?? null,
    target_list_ids: body.target_list_ids ?? null,
  });
  if ('error' in result) return json({ error: result.error }, 400);

  const supabase = getAdminClient();
  const { count, error } = await audienceQuery(
    supabase,
    result.fields as AudienceTarget,
    'id',
    { count: 'exact', head: true },
  );
  if (error) {
    console.error('[admin campagnes recipient-count] error', error);
    return json({ error: error.message }, 500);
  }
  return json({ count: count ?? 0 });
};
