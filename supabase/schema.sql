-- ══════════════════════════════════════════════
-- OQORO Off Market — Schéma complet
-- À exécuter dans le SQL editor Supabase
-- ══════════════════════════════════════════════

-- ─────────── BIENS ───────────
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  title text not null,
  address text,
  city text,
  postal_code text,
  neighborhood text,
  property_type text
    check (property_type in (
      'colocation_meublee','appartement_meuble','appartement_nu'
    )),
  total_surface numeric,
  nb_rooms integer,
  floor integer,
  description text,
  sale_price numeric not null,
  notary_rate numeric not null default 0.08,
  notary_fees numeric generated always as
    (round(sale_price * notary_rate)) stored,
  total_project numeric generated always as
    (round(sale_price * (1 + notary_rate))) stored,
  dpe_energy_class text
    check (dpe_energy_class in ('A','B','C','D','E','F','G')),
  dpe_energy_value numeric,
  dpe_ges_class text
    check (dpe_ges_class in ('A','B','C','D','E','F','G')),
  dpe_ges_value numeric,
  dpe_energy_cost numeric,
  heating_type text,
  latitude numeric,
  longitude numeric,
  management_type text
    check (management_type in ('solo', 'plus')),
  charges_included text[],
  oqoro_listing_url text,
  sale_listing_url text,
  matterport_url text,
  meta_title text,
  meta_description text,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────── LOTS ───────────
create table if not exists property_lots (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references properties(id) on delete cascade,
  name text not null,
  surface numeric,
  rent_hc numeric not null,
  charges numeric not null default 0,
  status text not null default 'vacant'
    check (status in ('loue', 'vacant', 'preavis')),
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ─────────── PHOTOS ───────────
create table if not exists property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references properties(id) on delete cascade,
  url text not null,
  source text default 'url'
    check (source in ('url', 'upload')),
  label text,
  is_primary boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ─────────── TRANSPORTS ───────────
create table if not exists property_transports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references properties(id) on delete cascade,
  name text not null,
  transport_type text,
  destination text,
  time_label text,
  sort_order integer default 0
);

-- ─────────── HISTORIQUE LOCATIF ───────────
create table if not exists property_annual_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references properties(id) on delete cascade,
  year integer not null,
  occupancy_rate numeric,
  total_rent_collected numeric,
  unpaid_amount numeric default 0,
  created_at timestamptz default now(),
  unique (property_id, year)
);

-- ─────────── LEADS ───────────
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  status text not null default 'new'
    check (status in ('new','contacted','converted','archived')),
  notes text,
  created_at timestamptz default now()
);

-- ─────────── INDEXES ───────────
create index if not exists idx_properties_status on properties(status);
create index if not exists idx_properties_slug on properties(slug);
create index if not exists idx_leads_property on leads(property_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_lots_property on property_lots(property_id);
create index if not exists idx_reports_property
  on property_annual_reports(property_id);
create index if not exists idx_photos_property on property_photos(property_id);
create index if not exists idx_transports_property
  on property_transports(property_id);

-- ─────────── VIEW FINANCIALS ───────────
create or replace view property_financials as
select
  p.id,
  p.sale_price,
  p.notary_fees,
  p.total_project,
  coalesce(sum(l.rent_hc + l.charges), 0) as monthly_rent_cc,
  coalesce(sum(l.rent_hc + l.charges), 0) * 12 as annual_rent_cc,
  case when p.sale_price > 0
    then round((coalesce(sum(l.rent_hc + l.charges), 0)
      * 12 / p.sale_price * 100)::numeric, 2)
    else 0 end as gross_yield,
  case when p.total_project > 0
    then round((coalesce(sum(l.rent_hc + l.charges), 0)
      * 12 / p.total_project * 100)::numeric, 2)
    else 0 end as project_yield,
  count(l.id) as total_lots,
  count(l.id) filter (where l.status = 'loue') as rented_lots
from properties p
left join property_lots l on l.property_id = p.id
group by p.id;

-- ─────────── TRIGGER updated_at ───────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_properties_updated_at on properties;
create trigger trg_properties_updated_at
  before update on properties
  for each row execute function set_updated_at();

-- ─────────── RLS ───────────
alter table properties enable row level security;
alter table property_lots enable row level security;
alter table property_photos enable row level security;
alter table property_transports enable row level security;
alter table property_annual_reports enable row level security;
alter table leads enable row level security;

drop policy if exists "public_read_properties" on properties;
create policy "public_read_properties" on properties
  for select using (status = 'published');

drop policy if exists "public_read_lots" on property_lots;
create policy "public_read_lots" on property_lots
  for select using (property_id in (
    select id from properties where status = 'published'));

drop policy if exists "public_read_photos" on property_photos;
create policy "public_read_photos" on property_photos
  for select using (property_id in (
    select id from properties where status = 'published'));

drop policy if exists "public_read_transports" on property_transports;
create policy "public_read_transports" on property_transports
  for select using (property_id in (
    select id from properties where status = 'published'));

drop policy if exists "public_read_reports" on property_annual_reports;
create policy "public_read_reports" on property_annual_reports
  for select using (property_id in (
    select id from properties where status = 'published'));

drop policy if exists "public_insert_leads" on leads;
create policy "public_insert_leads" on leads
  for insert with check (true);

-- ─────────── STORAGE BUCKET ───────────
-- À créer manuellement dans le dashboard Supabase:
--   Bucket: property-photos
--   Public: oui
--
-- Policies storage.objects:
--   select: bucket_id = 'property-photos'
--   insert/update/delete: auth.role() = 'authenticated'
