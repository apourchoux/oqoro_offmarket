-- ══════════════════════════════════════════════
-- Migration 0009 — corrections des alertes de sécurité Supabase (advisor)
-- À appliquer dans Supabase → SQL Editor → Run.
--
-- Ces trois points sont ANTÉRIEURS aux campagnes email (cœur du site) et
-- corrigés sans toucher au fonctionnel :
--
-- 1. [ERROR] Vue `property_financials` en SECURITY DEFINER → contourne la RLS
--    et expose les financials des biens NON publiés à la clé anon. On la
--    bascule en `security_invoker` : elle respecte alors la RLS de l'appelant.
--    - anon : les policies `published`-only de properties/property_lots
--      s'appliquent → seuls les biens publiés remontent (comportement déjà
--      utilisé par le site public, aucune régression) ;
--    - service role (admin) : bypass RLS → voit tout, comme avant.
--
-- 2. [WARN] Fonction `set_updated_at` sans search_path fixe → on l'épingle
--    (le corps n'utilise que now() de pg_catalog, aucun impact fonctionnel).
--
-- 3. [WARN] Bucket public `property-photos` : deux policies SELECT publiques
--    permettent de LISTER tous les fichiers. L'accès aux images par URL
--    publique ne nécessite PAS ces policies (bucket public), et le code ne
--    liste jamais le bucket (lecture par URL stockée en base, upload par URL
--    signée). On retire donc le listing ; upload/update/delete conservés.
-- ══════════════════════════════════════════════

-- 1. Vue financials : respecte la RLS de l'appelant.
alter view public.property_financials set (security_invoker = on);

-- 2. search_path fixe sur la fonction de trigger.
alter function public.set_updated_at() set search_path = '';

-- 3. Retire le listing public du bucket (accès URL publique conservé).
drop policy if exists "Public read property-photos" on storage.objects;
drop policy if exists "property_photos_public_read" on storage.objects;
