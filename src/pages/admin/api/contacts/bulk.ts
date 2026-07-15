import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { UUID_REGEX, json } from './_helpers';

export const prerender = false;

const MAX_IDS = 5000;
const ACTIONS = ['unsubscribe', 'resubscribe'] as const;

// Actions groupées sur les contacts (parité Mailer) :
// POST { action: 'unsubscribe' | 'resubscribe', ids: uuid[] }.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const action = body.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return json({ error: 'Action invalide' }, 400);
  }
  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    body.ids.length > MAX_IDS ||
    body.ids.some((id) => typeof id !== 'string' || !UUID_REGEX.test(id))
  ) {
    return json({ error: 'Identifiants de contacts invalides' }, 400);
  }
  const ids = [...new Set(body.ids as string[])];

  const supabase = getAdminClient();
  const patch =
    action === 'unsubscribe'
      ? { subscribed: false, unsubscribed_at: new Date().toISOString() }
      : { subscribed: true, unsubscribed_at: null };
  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .in('id', ids)
    .select('id');
  if (error) {
    console.error('[admin contacts bulk] error', error);
    return json({ error: error.message }, 500);
  }
  return json({ success: true, updated: data?.length ?? 0 });
};
