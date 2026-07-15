import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Expéditeurs pré-enregistrés (cartes de l'étape Expéditeur du composer).
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('campaign_senders')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return json({ error: error.message }, 500);
  return json({ senders: data ?? [] });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const replyTo =
    typeof body.reply_to === 'string' && body.reply_to.trim()
      ? body.reply_to.trim().toLowerCase()
      : null;

  if (!name || name.length > 100 || /[\r\n<>]/.test(name)) {
    return json({ error: "Nom d'expéditeur invalide" }, 400);
  }
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return json({ error: "Email d'expéditeur invalide" }, 400);
  }
  if (replyTo && (replyTo.length > 254 || !EMAIL_REGEX.test(replyTo))) {
    return json({ error: 'Reply-to invalide' }, 400);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('campaign_senders')
    .insert({ name, email, reply_to: replyTo })
    .select()
    .single();
  if (error) return json({ error: `Création impossible : ${error.message}` }, 500);
  return json({ success: true, sender: data });
};
