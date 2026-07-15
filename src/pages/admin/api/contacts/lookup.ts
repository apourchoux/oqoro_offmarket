import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { json } from './_helpers';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Recherche un contact par email — alimente la barre « Prévisualiser avec un
// contact » de l'éditeur de design (substitution des variables avec les
// vraies données du contact).
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return json({ error: 'Email invalide' }, 400);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name, subscribed')
    .ilike('email', email)
    .maybeSingle();
  if (error) {
    console.error('[admin contacts lookup] error', error);
    return json({ error: error.message }, 500);
  }
  if (!data) return json({ error: 'Contact introuvable' }, 404);
  return json({ contact: data });
};
