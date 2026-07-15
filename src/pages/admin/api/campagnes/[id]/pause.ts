import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { isSameOrigin } from '../../../../../lib/security';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

// Met en pause une campagne en cours d'envoi (sending → paused).
// Le worker relit le statut avant chaque batch et s'arrête proprement :
// les destinataires déjà servis gardent leur statut, les `pending` restants
// seront traités à la reprise (resume.ts).
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  // Garde CSRF : POST sans body JSON, donc sans préflight CORS.
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return json({ error: 'Origine invalide' }, 403);
  }
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'paused' })
    .eq('id', id)
    .eq('status', 'sending')
    .select();
  if (error) return json({ error: error.message }, 500);
  if (!data || data.length === 0) {
    return json({ error: "Cette campagne n'est pas en cours d'envoi" }, 409);
  }
  return json({ success: true, campaign: data[0] });
};
