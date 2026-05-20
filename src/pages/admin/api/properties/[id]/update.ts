import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { sanitizeProperty, syncChildren } from '../_helpers';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const { property, lots, photos, transports, reports, publish } = payload ?? {};
  if (!property?.title || !property?.slug) {
    return json({ error: 'Titre et slug requis' }, 400);
  }

  const sanitized = sanitizeProperty(property);
  if (publish) {
    sanitized.status = 'published';
    if (!property.published_at) {
      sanitized.published_at = new Date().toISOString();
    }
  }

  const supabase = getAdminClient();
  const { error: updateError } = await supabase
    .from('properties')
    .update(sanitized)
    .eq('id', id);
  if (updateError) {
    console.error('[admin update] update error', updateError);
    return json(
      { error: `Mise à jour impossible : ${updateError.message}` },
      500,
    );
  }

  const childErr = await syncChildren(
    supabase,
    id,
    lots,
    photos,
    transports,
    reports,
  );
  if (childErr) return json({ error: childErr }, 400);

  if (publish) {
    const hook = import.meta.env.NETLIFY_BUILD_HOOK;
    if (hook) {
      try {
        await fetch(hook, { method: 'POST' });
      } catch (err) {
        console.error('[rebuild] failed');
      }
    }
  }

  return json({ success: true, id });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
