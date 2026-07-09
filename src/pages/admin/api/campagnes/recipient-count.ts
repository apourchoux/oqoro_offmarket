import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { applySegmentFilter } from '../../../../lib/campaigns';
import type { CampaignTargetType } from '../../../../lib/types';
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
  });
  if ('error' in result) return json({ error: result.error }, 400);

  const supabase = getAdminClient();
  const query = applySegmentFilter(
    supabase.from('contacts').select('id', { count: 'exact', head: true }),
    result.fields.target_contact_type as CampaignTargetType,
    result.fields.target_zones as string[] | null,
  );
  const { count, error } = await query;
  if (error) {
    console.error('[admin campagnes recipient-count] error', error);
    return json({ error: error.message }, 500);
  }
  return json({ count: count ?? 0 });
};
