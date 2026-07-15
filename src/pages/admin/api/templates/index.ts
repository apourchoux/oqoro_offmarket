import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { json } from '../_helpers';

export const prerender = false;

// Liste des templates (modal « Charger un template » de l'éditeur de design).
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, name, html, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ templates: data ?? [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
    return json({ error: 'Nom de template invalide' }, 400);
  }
  if (typeof body.html !== 'string' || body.html.length > 500000) {
    return json({ error: 'HTML invalide' }, 400);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('email_templates')
    .insert({ name: body.name.trim(), html: body.html })
    .select()
    .single();
  if (error) {
    console.error('[admin templates create] error', error);
    return json({ error: `Création impossible : ${error.message}` }, 500);
  }
  return json({ success: true, template: data });
};

