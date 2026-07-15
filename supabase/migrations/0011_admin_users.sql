-- ══════════════════════════════════════════════
-- Migration 0011 — utilisateurs de l'admin (rôles admin / opérateur)
-- À appliquer dans Supabase → SQL Editor → Run (après 0010).
--
-- `admin_users` devient la source de vérité des accès à l'admin :
-- - `admin`     : accès complet, y compris la gestion des utilisateurs ;
-- - `operateur` : accès à tout SAUF la gestion des utilisateurs.
--
-- La variable d'environnement ADMIN_EMAILS reste un filet de sécurité :
-- ses emails sont toujours acceptés avec le rôle admin, même absents de la
-- table (impossible de se verrouiller dehors). L'authentification reste
-- portée par Supabase Auth (email + mot de passe) ; cette table ne stocke
-- AUCUN mot de passe, seulement l'autorisation et le rôle.
-- ══════════════════════════════════════════════

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  role text not null default 'operateur'
    check (role in ('admin','operateur')),
  -- Compte Supabase Auth associé (renseigné quand créé depuis l'admin —
  -- permet la réinitialisation du mot de passe et la suppression du compte).
  auth_user_id uuid,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table admin_users
  drop constraint if exists admin_users_email_length,
  drop constraint if exists admin_users_display_name_length;
alter table admin_users
  add constraint admin_users_email_length check (char_length(email) <= 254),
  add constraint admin_users_display_name_length
    check (display_name is null or char_length(display_name) <= 100);

-- Unicité insensible à la casse (même convention que contacts).
create unique index if not exists idx_admin_users_email_lower
  on admin_users (lower(email));

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
  before update on admin_users
  for each row execute function set_updated_at();

-- ─────────── RLS : service role uniquement (comme les autres tables admin) ───────────
alter table admin_users enable row level security;
