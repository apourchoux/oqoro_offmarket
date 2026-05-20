import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';
import { normalizePathname } from './lib/security';

const ADMIN_PATH_PREFIX = '/admin';
const LOGIN_PATH = '/admin/login';

function getAdminEmails(): string[] {
  const raw = import.meta.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const normalized = normalizePathname(context.url.pathname);

  if (!normalized.startsWith(ADMIN_PATH_PREFIX)) {
    return next();
  }

  if (normalized === LOGIN_PATH || normalized.startsWith('/admin/logout')) {
    return next();
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

  const allowed = getAdminEmails();
  if (allowed.length > 0 && !allowed.includes(data.user.email.toLowerCase())) {
    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
    return context.redirect(`${LOGIN_PATH}?error=forbidden`);
  }

  context.locals.user = {
    id: data.user.id,
    email: data.user.email,
  };

  const response = await next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
});
