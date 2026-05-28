-- ══════════════════════════════════════════════
-- Migration 0005 — bien mis en avant sur la home
-- À appliquer dans Supabase → SQL Editor → Run.
--
-- Remplace la sélection automatique « dernier bien publié » par un opt-in
-- manuel côté admin (case « Mettre en avant »). Plusieurs biens peuvent
-- être cochés simultanément ; la home en tire un au hasard à chaque
-- chargement.
-- ══════════════════════════════════════════════

alter table properties
  add column if not exists is_featured boolean not null default false;

create index if not exists idx_properties_featured
  on properties (is_featured)
  where is_featured = true;
