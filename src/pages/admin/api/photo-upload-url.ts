import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { isAllowedPhotoExt, isAllowedPhotoMime } from '../../../lib/security';

export const prerender = false;

const BUCKET = 'property-photos';

interface Payload {
  contentType?: string;
  ext?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const ext = (payload.ext ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!isAllowedPhotoExt(ext)) {
    return json({ error: 'Extension non autorisée' }, 400);
  }

  const contentType = (payload.contentType ?? '').toLowerCase().trim();
  if (contentType && !isAllowedPhotoMime(contentType)) {
    return json({ error: 'Type MIME non autorisé' }, 400);
  }

  const path = `${crypto.randomUUID()}.${ext}`;

  const supabase = getAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[admin photo-upload-url] error');
    return json({ error: 'Signed URL failed' }, 500);
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: publicData.publicUrl,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
