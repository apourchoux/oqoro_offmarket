import type { APIRoute } from 'astro';
import { getAdminClient, hasAdminEnv } from '../../lib/supabase';
import { rateLimit } from '../../lib/security';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Désabonnement public par token. Deux appelants :
// - le formulaire de /desabonnement (POST form-urlencoded ou JSON) ;
// - le one-click RFC 8058 des clients email (POST sur l'URL du header
//   List-Unsubscribe, body `List-Unsubscribe=One-Click`).
// La réponse ne révèle jamais si le token existe (pas d'oracle).
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? 'unknown';
  const limit = rateLimit(`unsub:${ip}`, 10, 60_000);
  if (!limit.ok) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec) },
    });
  }

  let token: string | null = null;
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      token = typeof body.token === 'string' ? body.token : null;
    } else {
      // form-urlencoded (formulaire public et one-click RFC 8058 — le token
      // est alors dans la query string de l'URL List-Unsubscribe).
      const form = await request.formData().catch(() => null);
      token = (form?.get('token') as string | null) ?? null;
    }
  } catch {
    /* body illisible : on tente la query string */
  }
  if (!token) {
    token = new URL(request.url).searchParams.get('token');
  }

  if (token && UUID_REGEX.test(token) && hasAdminEnv()) {
    const supabase = getAdminClient();
    const { error } = await supabase
      .from('contacts')
      .update({ subscribed: false, unsubscribed_at: new Date().toISOString() })
      .eq('unsubscribe_token', token);
    if (error) {
      console.error('[unsubscribe] error', error);
    }
  }

  // Toujours succès : formulaire → redirection confirmation, one-click → 200.
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/html')) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/desabonnement?done=1' },
    });
  }
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
