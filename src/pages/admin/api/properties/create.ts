import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { sanitizeProperty, syncChildren } from './_helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

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
    sanitized.published_at = new Date().toISOString();
  }

  const supabase = getAdminClient();
  const { data: inserted, error } = await supabase
    .from('properties')
    .insert(sanitized)
    .select()
    .single();
  if (error || !inserted) {
    console.error('[admin create] property insert error', error);
    return json(
      { error: `Insertion impossible : ${error?.message ?? 'erreur inconnue'}` },
      500,
    );
  }

  const propertyId = inserted.id;
  const childErr = await syncChildren(
    supabase,
    propertyId,
    lots,
    photos,
    transports,
    reports,
  );
  if (childErr) return json({ error: childErr }, 400);

  if (publish) {
    await triggerRebuild();
  }

  return json({ success: true, id: propertyId });
};

async function triggerRebuild() {
  const hook = import.meta.env.NETLIFY_BUILD_HOOK;
  if (!hook) return;
  try {
    await fetch(hook, { method: 'POST' });
  } catch (err) {
    console.error('[rebuild] failed');
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
