-- ══════════════════════════════════════════════
-- Migration 0004 — taux d'occupation du quartier
-- À appliquer dans Supabase → SQL Editor → Run.
--
-- Remplace l'ancienne « occupation 12 m » de la fiche bien (qui était en fait
-- un point-in-time `rented_lots / total_lots`, donc à 0 % dès que le bien est
-- vidé pour la mise en vente) par une donnée de marché : le taux d'occupation
-- locatif moyen du quartier / de la zone.
--
-- Renseigné manuellement côté admin (source : observatoire local, INSEE, etc.).
-- ══════════════════════════════════════════════

alter table properties
  add column if not exists zone_occupancy_rate numeric(5, 2);

alter table properties
  drop constraint if exists properties_zone_occupancy_rate_range;

alter table properties
  add constraint properties_zone_occupancy_rate_range
    check (
      zone_occupancy_rate is null
      or (zone_occupancy_rate >= 0 and zone_occupancy_rate <= 100)
    );
