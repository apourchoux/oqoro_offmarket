-- ══════════════════════════════════════════════
-- Migration 0013 — rendements calculés sur les loyers HORS CHARGES
-- À appliquer dans Supabase → SQL Editor → Run (après 0012).
--
-- `gross_yield` / `project_yield` étaient calculés sur le loyer CC
-- (rent_hc + charges), ce qui gonflait le « rendement brut » affiché.
-- Ils sont désormais calculés sur rent_hc seul (définition usuelle).
-- monthly_rent_cc / annual_rent_cc sont conservés (affichage du loyer CC,
-- calcul de cashflow) ; monthly_rent_hc / annual_rent_hc sont ajoutés en
-- fin de vue (create or replace view n'autorise que l'ajout en fin).
--
-- security_invoker est re-précisé : create or replace view remplace les
-- options de la vue (cf. 0009).
-- ══════════════════════════════════════════════

create or replace view public.property_financials
with (security_invoker = on) as
select
  p.id,
  p.sale_price,
  p.notary_fees,
  p.total_project,
  coalesce(sum(l.rent_hc + l.charges), 0) as monthly_rent_cc,
  coalesce(sum(l.rent_hc + l.charges), 0) * 12 as annual_rent_cc,
  case when p.sale_price > 0
    then round((coalesce(sum(l.rent_hc), 0)
      * 12 / p.sale_price * 100)::numeric, 2)
    else 0 end as gross_yield,
  case when p.total_project > 0
    then round((coalesce(sum(l.rent_hc), 0)
      * 12 / p.total_project * 100)::numeric, 2)
    else 0 end as project_yield,
  count(l.id) as total_lots,
  count(l.id) filter (where l.status = 'loue') as rented_lots,
  coalesce(sum(l.rent_hc), 0) as monthly_rent_hc,
  coalesce(sum(l.rent_hc), 0) * 12 as annual_rent_hc
from properties p
left join property_lots l on l.property_id = p.id
group by p.id;
