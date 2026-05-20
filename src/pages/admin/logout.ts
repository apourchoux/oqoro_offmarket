import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return new Response('Forbidden', { status: 403 });
  }
  cookies.delete('sb-access-token', { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });
  return redirect('/admin/login');
};
