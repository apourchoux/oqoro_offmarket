-- ══════════════════════════════════════════════
-- Migration 0003 — durcissement sécurité
-- À appliquer dans Supabase → SQL Editor → Run.
--
-- 1) Retire la policy d'insertion publique sur `leads` : l'API serveur écrit
--    via la service role (qui bypass RLS), aucune raison d'exposer une
--    voie d'insertion à la clé anon (utilisable depuis le navigateur).
-- 2) Restreint l'écriture sur le bucket `property-photos` à la service role
--    uniquement. Les uploads se font via signed URL générée par l'API admin
--    (cf. `src/pages/admin/api/photo-upload-url.ts`).
-- 3) Ré-affirme les policies de lecture publique sur les photos publiées.
-- ══════════════════════════════════════════════

-- ─────────── 1. Leads : plus d'INSERT anon ───────────
drop policy if exists "public_insert_leads" on leads;

-- Optionnel : politique de lecture explicite vide pour signaler l'intention.
-- (RLS active + aucune policy = tout est refusé pour anon.)

-- ─────────── 2. Storage : verrouillage des écritures ───────────
-- On supprime les éventuelles policies trop permissives créées historiquement
-- via le dashboard ("Allow authenticated uploads", "Authenticated write", etc.)
-- puis on installe une policy unique de lecture publique du bucket. Les
-- INSERT/UPDATE/DELETE restent sans policy => seul le service_role peut
-- écrire (il bypass RLS).

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%authenticated%'
        or policyname ilike '%public%insert%'
        or policyname ilike '%public%update%'
        or policyname ilike '%public%delete%'
        or policyname ilike '%anon%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

drop policy if exists "property_photos_public_read" on storage.objects;
create policy "property_photos_public_read" on storage.objects
  for select using (bucket_id = 'property-photos');

-- Aucune policy INSERT/UPDATE/DELETE = aucun rôle anon/authenticated ne peut
-- écrire. Le service_role bypass RLS et continue de fonctionner via l'API
-- admin (signed upload URLs).

-- ─────────── 3. Contrainte de format minimale sur les leads ───────────
-- Refuse les emails > 254 chars (RFC 5321), les noms > 100, téléphones > 50.
-- Empêche un appelant qui contournerait l'API serveur d'insérer des payloads
-- géants.
alter table leads
  drop constraint if exists leads_email_length,
  drop constraint if exists leads_first_name_length,
  drop constraint if exists leads_last_name_length,
  drop constraint if exists leads_phone_length;

alter table leads
  add constraint leads_email_length check (char_length(email) <= 254),
  add constraint leads_first_name_length check (char_length(first_name) <= 100),
  add constraint leads_last_name_length check (char_length(last_name) <= 100),
  add constraint leads_phone_length check (char_length(phone) <= 50);

-- ─────────── 4. Contraintes sur les URL externes des biens ───────────
-- Refuse `javascript:`, `data:`, etc. au niveau base — défense en profondeur
-- au cas où l'API admin (whitelist + safeHttpUrl) serait contournée.
alter table properties
  drop constraint if exists properties_oqoro_listing_url_scheme,
  drop constraint if exists properties_sale_listing_url_scheme,
  drop constraint if exists properties_matterport_url_scheme;

alter table properties
  add constraint properties_oqoro_listing_url_scheme
    check (oqoro_listing_url is null or oqoro_listing_url ~* '^https?://'),
  add constraint properties_sale_listing_url_scheme
    check (sale_listing_url is null or sale_listing_url ~* '^https?://'),
  add constraint properties_matterport_url_scheme
    check (matterport_url is null or matterport_url ~* '^https?://');

alter table property_photos
  drop constraint if exists property_photos_url_scheme;

alter table property_photos
  add constraint property_photos_url_scheme
    check (url ~* '^https?://');
