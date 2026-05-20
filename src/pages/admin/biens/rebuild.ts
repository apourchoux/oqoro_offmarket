import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../../lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return new Response('Forbidden', { status: 403 });
  }
  const hook = import.meta.env.NETLIFY_BUILD_HOOK;
  if (hook) {
    try {
      await fetch(hook, { method: 'POST' });
    } catch (err) {
      console.error('[rebuild] deploy hook failed');
    }
  }
  return redirect('/admin/biens?rebuild=triggered');
};
