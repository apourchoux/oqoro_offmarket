import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';

export const prerender = false;

const BUCKET = 'property-photos';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Fichier manquant' }, 400);

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${crypto.randomUUID()}.${ext.toLowerCase()}`;

  const supabase = getAdminClient();
  const buffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
  if (error) {
    console.error('[admin upload] error', error);
    return json({ error: error.message }, 500);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return json({ url: data.publicUrl });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
