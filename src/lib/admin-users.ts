// Résolution des accès et rôles de l'admin. Source de vérité : la table
// `admin_users` (gérée depuis /admin/utilisateurs), avec ADMIN_EMAILS en
// filet de sécurité — ses emails sont toujours admins, même absents de la
// table, pour qu'une fausse manipulation ne verrouille jamais l'admin.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminRole = 'admin' | 'operateur';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Admin',
  operateur: 'Opérateur',
};

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: AdminRole;
  auth_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Emails admin « de secours » définis par la variable d'env ADMIN_EMAILS. */
export function envAdminEmails(rawEnv: string | undefined): string[] {
  return (rawEnv ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Rôle d'un email, ou null si l'accès est refusé.
 * Ordre : ADMIN_EMAILS (toujours admin) puis table admin_users.
 * Fail-closed : env vide + table vide (ou illisible) = personne n'entre.
 */
export async function resolveAdminRole(
  supabase: SupabaseClient<any, any, any, any, any> | null,
  rawEnvEmails: string | undefined,
  email: string,
): Promise<AdminRole | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  if (envAdminEmails(rawEnvEmails).includes(normalized)) {
    return 'admin';
  }

  if (!supabase) return null;
  const { data, error } = await supabase
    .from('admin_users')
    .select('role')
    .ilike('email', normalized)
    .maybeSingle();
  if (error) {
    // Table absente (migration pas encore appliquée) ou erreur : on refuse
    // plutôt que d'ouvrir — les emails ADMIN_EMAILS passent toujours au-dessus.
    console.error('[admin-users] lookup error', error.message);
    return null;
  }
  if (data?.role === 'admin' || data?.role === 'operateur') {
    return data.role;
  }
  return null;
}
