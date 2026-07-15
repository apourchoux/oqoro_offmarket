import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { envAdminEmails } from '../../../../lib/admin-users';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'operateur'] as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Gestion des utilisateurs de l'admin. Réservé au rôle `admin` : le
// middleware bloque déjà /admin/api/utilisateurs/* pour les opérateurs —
// la vérification est répétée ici (défense en profondeur).
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs' }, 403);

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return json({ error: error.message }, 500);

  return json({
    users: data ?? [],
    // Admins « de secours » (variable d'env) : toujours acceptés, non
    // modifiables depuis l'UI.
    env_admins: envAdminEmails(import.meta.env.ADMIN_EMAILS),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName =
    typeof body.display_name === 'string' && body.display_name.trim()
      ? body.display_name.trim()
      : null;
  const role = body.role;
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return json({ error: 'Email invalide' }, 400);
  }
  if (displayName && displayName.length > 100) {
    return json({ error: 'Nom trop long (100 caractères max)' }, 400);
  }
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
    return json({ error: 'Rôle invalide (admin ou operateur)' }, 400);
  }
  if (password && (password.length < 8 || password.length > 72)) {
    return json({ error: 'Mot de passe : 8 à 72 caractères' }, 400);
  }

  const supabase = getAdminClient();

  // Création du compte de connexion Supabase Auth quand un mot de passe est
  // fourni. Sans mot de passe : on suppose qu'un compte Auth existe déjà
  // pour cet email (on ne fait qu'accorder l'accès à l'admin).
  let authUserId: string | null = null;
  if (password) {
    const { data: created, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) {
      const msg = authError.message ?? '';
      if (/already|exist/i.test(msg)) {
        return json(
          {
            error:
              'Un compte de connexion existe déjà pour cet email. ' +
              'Créez l’utilisateur SANS mot de passe (son mot de passe actuel restera valable), ' +
              'ou utilisez « Réinitialiser le mot de passe » après création.',
          },
          409,
        );
      }
      console.error('[admin utilisateurs create] auth error', authError);
      return json({ error: `Création du compte impossible : ${msg}` }, 500);
    }
    authUserId = created.user?.id ?? null;
  }

  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      email,
      display_name: displayName,
      role,
      auth_user_id: authUserId,
      created_by: locals.user.email,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return json({ error: 'Cet utilisateur existe déjà' }, 409);
    }
    console.error('[admin utilisateurs create] error', error);
    return json({ error: `Création impossible : ${error.message}` }, 500);
  }
  return json({
    success: true,
    user: data,
    auth_created: Boolean(authUserId),
  });
};
