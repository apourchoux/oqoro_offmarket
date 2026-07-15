import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';
import { isSameOrigin, normalizePathname } from './lib/security';
import { resolveAdminRole } from './lib/admin-users';

const ADMIN_PATH_PREFIX = '/admin';
const ADMIN_API_PREFIX = '/admin/api/';
const LOGIN_PATH = '/admin/login';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Périmètre réservé au rôle `admin` : la gestion des utilisateurs.
// Les opérateurs ont accès à tout le reste de l'admin.
const ADMIN_ONLY_PAGE_PREFIX = '/admin/utilisateurs';
const ADMIN_ONLY_API_PREFIX = '/admin/api/utilisateurs';

export const onRequest = defineMiddleware(async (context, next) => {
  const normalized = normalizePathname(context.url.pathname);

  if (!normalized.startsWith(ADMIN_PATH_PREFIX)) {
    return next();
  }

  if (normalized === LOGIN_PATH || normalized.startsWith('/admin/logout')) {
    return next();
  }

  // Garde CSRF centralisée sur TOUTE écriture de l'API admin. Ne dépend pas
  // du préflight CORS (request.json() ignore le Content-Type : un POST
  // cross-origin en text/plain porteur de JSON ne déclenche aucun préflight)
  // ni du seul cookie SameSite=Strict (un sous-domaine *.oqoro.com compromis
  // est « same-site »). On exige une origine same-host sur les méthodes non
  // sûres. Les endpoints publics (/api/*) restent hors de cette garde.
  if (
    normalized.startsWith(ADMIN_API_PREFIX) &&
    !SAFE_METHODS.has(context.request.method)
  ) {
    if (!isSameOrigin(context.request, context.request.headers.get('host'))) {
      return new Response(JSON.stringify({ error: 'Origine invalide' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const accessToken = context.cookies.get('sb-access-token')?.value;
  const refreshToken = context.cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) {
    return context.redirect(LOGIN_PATH);
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return context.redirect(LOGIN_PATH);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user || !data.user.email) {
    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
    return context.redirect(LOGIN_PATH);
  }

  // Autorisation + rôle : table admin_users (service role), ADMIN_EMAILS en
  // filet de sécurité. Fail-closed : aucun des deux = accès refusé.
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceClient = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;
  const role = await resolveAdminRole(
    serviceClient,
    import.meta.env.ADMIN_EMAILS,
    data.user.email,
  );
  if (!role) {
    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
    return context.redirect(`${LOGIN_PATH}?error=forbidden`);
  }

  // Verrou de rôle : la gestion des utilisateurs est réservée aux admins.
  if (role !== 'admin') {
    if (normalized.startsWith(ADMIN_ONLY_API_PREFIX)) {
      return new Response(
        JSON.stringify({ error: 'Réservé aux administrateurs' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (normalized.startsWith(ADMIN_ONLY_PAGE_PREFIX)) {
      return context.redirect('/admin');
    }
  }

  context.locals.user = {
    id: data.user.id,
    email: data.user.email,
    role,
  };

  const response = await next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
});
