import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ redirect }) => {
  const hook = import.meta.env.NETLIFY_BUILD_HOOK;
  if (hook) {
    try {
      await fetch(hook, { method: 'POST' });
    } catch (err) {
      console.error('[rebuild] deploy hook failed', err);
    }
  }
  return redirect('/admin/biens?rebuild=triggered');
};
