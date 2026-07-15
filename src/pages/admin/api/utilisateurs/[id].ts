import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '../../../../lib/supabase';
import { envAdminEmails, type AdminUser } from '../../../../lib/admin-users';
import { isSameOrigin } from '../../../../lib/security';

export const prerender = false;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['admin', 'operateur'] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Retrouve l'id Supabase Auth d'un email (utilisateurs ajoutés sans mot de
 * passe : le compte Auth préexistait, on n'a pas son id). Parcourt les pages
 * de l'API admin — borné à 10 pages de 200.
 */
async function findAuthUserId(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Garde anti-verrouillage : refuse l'opération si elle supprimerait le
 * DERNIER admin (aucun autre admin en table ET aucun admin de secours en
 * variable d'env).
 */
async function wouldRemoveLastAdmin(
  supabase: SupabaseClient,
  row: AdminUser,
): Promise<boolean> {
  if (row.role !== 'admin') return false;
  if (envAdminEmails(import.meta.env.ADMIN_EMAILS).length > 0) return false;
  const { count } = await supabase
    .from('admin_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .neq('id', row.id);
  return (count ?? 0) === 0;
}

// Modification d'un utilisateur : rôle, nom affiché, réinitialisation du
// mot de passe. Réservé aux admins (middleware + re-vérification ici).
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs' }, 403);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const supabase = getAdminClient();
  const { data: rowData } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!rowData) return json({ error: 'Utilisateur introuvable' }, 404);
  const row = rowData as AdminUser;

  const patch: Record<string, unknown> = {};

  if ('role' in body) {
    const role = body.role;
    if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
      return json({ error: 'Rôle invalide' }, 400);
    }
    if (role !== row.role && role === 'operateur') {
      // Auto-rétrogradation interdite : un admin ne peut pas se retirer ses
      // propres droits (sinon plus personne pour les rendre).
      if (row.email.toLowerCase() === locals.user.email.toLowerCase()) {
        return json({ error: 'Vous ne pouvez pas retirer vos propres droits admin' }, 400);
      }
      if (await wouldRemoveLastAdmin(supabase, row)) {
        return json({ error: 'Impossible de rétrograder le dernier admin' }, 400);
      }
    }
    patch.role = role;
  }

  if ('display_name' in body) {
    if (body.display_name !== null && typeof body.display_name !== 'string') {
      return json({ error: 'Nom invalide' }, 400);
    }
    const name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (name.length > 100) return json({ error: 'Nom trop long (100 caractères max)' }, 400);
    patch.display_name = name || null;
  }

  // Réinitialisation du mot de passe via l'API admin Supabase Auth.
  if ('password' in body) {
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return json({ error: 'Mot de passe : 8 à 72 caractères' }, 400);
    }
    let authUserId = row.auth_user_id;
    if (!authUserId) {
      authUserId = await findAuthUserId(supabase, row.email);
      if (authUserId) patch.auth_user_id = authUserId;
    }
    if (!authUserId) {
      return json(
        { error: 'Compte de connexion introuvable pour cet email — créez-le d’abord côté Supabase Auth' },
        404,
      );
    }
    const { error: pwError } = await supabase.auth.admin.updateUserById(authUserId, {
      password,
    });
    if (pwError) {
      console.error('[admin utilisateurs password] error', pwError);
      return json({ error: `Réinitialisation impossible : ${pwError.message}` }, 500);
    }
  }

  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase
      .from('admin_users')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[admin utilisateurs update] error', error);
      return json({ error: `Mise à jour impossible : ${error.message}` }, 500);
    }
    return json({ success: true, user: data });
  }
  return json({ success: true, user: row });
};

// Révocation d'un utilisateur : retire l'accès à l'admin, et supprime aussi
// son compte de connexion Supabase Auth quand il avait été créé pour ça
// (sauf si l'email figure dans ADMIN_EMAILS — le filet de sécurité prime).
export const DELETE: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs' }, 403);
  // Garde CSRF : requête sans body JSON, donc sans préflight CORS.
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return json({ error: 'Origine invalide' }, 403);
  }
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const supabase = getAdminClient();
  const { data: rowData } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!rowData) return json({ error: 'Utilisateur introuvable' }, 404);
  const row = rowData as AdminUser;

  if (row.email.toLowerCase() === locals.user.email.toLowerCase()) {
    return json({ error: 'Vous ne pouvez pas supprimer votre propre compte' }, 400);
  }
  if (await wouldRemoveLastAdmin(supabase, row)) {
    return json({ error: 'Impossible de supprimer le dernier admin' }, 400);
  }

  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) {
    console.error('[admin utilisateurs delete] error', error);
    return json({ error: `Suppression impossible : ${error.message}` }, 500);
  }

  // Nettoyage du compte de connexion : best-effort — même si ça échoue,
  // l'accès est déjà révoqué (le middleware refuse tout email hors table).
  const isEnvAdmin = envAdminEmails(import.meta.env.ADMIN_EMAILS).includes(
    row.email.toLowerCase(),
  );
  if (row.auth_user_id && !isEnvAdmin) {
    const { error: authError } = await supabase.auth.admin.deleteUser(row.auth_user_id);
    if (authError) {
      console.error('[admin utilisateurs delete] auth cleanup error', authError);
    }
  }

  return json({ success: true });
};
