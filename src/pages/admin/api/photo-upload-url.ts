import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';

export const prerender = false;

const BUCKET = 'property-photos';
const MAX_EXT_LEN = 8;

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
  if (!ext || ext.length > MAX_EXT_LEN) {
    return json({ error: 'Extension invalide' }, 400);
  }

  const path = `${crypto.randomUUID()}.${ext}`;

  const supabase = getAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[admin photo-upload-url] error', error);
    return json({ error: error?.message ?? 'Signed URL failed' }, 500);
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
