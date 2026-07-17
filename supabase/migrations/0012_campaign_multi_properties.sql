-- ══════════════════════════════════════════════
-- Migration 0012 — campagnes multi-biens (jusqu'à 3 biens à la suite)
-- À appliquer dans Supabase → SQL Editor → Run (après 0011).
--
-- `property_ids` : biens mis en avant, dans l'ordre d'affichage de l'email
-- (3 maximum, contrainte re-vérifiée côté API). `property_id` est conservé
-- et maintenu = premier élément, pour la compatibilité (jointure du titre
-- dans les listes, campagnes existantes, code historique).
-- ══════════════════════════════════════════════

alter table campaigns
  add column if not exists property_ids uuid[];

alter table campaigns
  drop constraint if exists campaigns_property_ids_max;
alter table campaigns
  add constraint campaigns_property_ids_max
    check (property_ids is null or array_length(property_ids, 1) <= 3);

-- Reprise des campagnes existantes : le bien unique devient un tableau à 1.
update campaigns
  set property_ids = array[property_id]
  where property_id is not null and property_ids is null;
