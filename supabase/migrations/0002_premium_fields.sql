-- Migration : champs premium pour la fiche bien
-- À appliquer dans Supabase → SQL Editor → Run.
-- Toutes les colonnes sont nullable : les composants front gardent un fallback
-- intelligent (estimations dérivées) tant que la valeur n'est pas renseignée.

alter table properties
  add column if not exists monthly_charges numeric(10, 2),
  add column if not exists yearly_property_tax numeric(10, 2),
  add column if not exists monthly_management_fee numeric(10, 2),
  add column if not exists oqoro_fees numeric(10, 2),
  add column if not exists market_data jsonb,
  add column if not exists agent jsonb;

-- market_data est un objet libre : les composants attendent éventuellement :
--   {
--     "price_per_m2": 5410,            // prix moyen au m² du quartier (€/m²)
--     "rent_per_m2": 17.5,             // loyer médian (€/m²/mois)
--     "yield_median": 5.2,             // rendement brut médian (%)
--     "tension": "Élevée · 3,2 candidats / annonce",
--     "relocation_delay": "11 jours",
--     "price_evolution_5y": 14.2,      // % sur 5 ans
--     "price_delta_12m": 2.1,          // % sur 12 mois (prix au m²)
--     "rent_delta_12m": 3.4            // % sur 12 mois (loyer médian)
--   }

-- agent est un objet :
--   {
--     "name": "Baptiste",
--     "role": "Conseiller Off Market",
--     "initials": "BC",
--     "phone": "+33755524224"
--   }

alter table property_transports
  add column if not exists category text
    check (category in ('transport', 'education', 'shopping', 'park', 'health', 'other'));

-- Indique les défauts pour les enregistrements existants : on suppose tous
-- les transports déjà saisis sont de catégorie 'transport' (ce qu'ils sont
-- effectivement aujourd'hui).
update property_transports set category = 'transport' where category is null;
