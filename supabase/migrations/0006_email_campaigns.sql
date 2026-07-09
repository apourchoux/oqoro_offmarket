-- ══════════════════════════════════════════════
-- Migration 0006 — campagnes email (contacts, campagnes, destinataires)
-- À appliquer dans Supabase → SQL Editor → Run.
--
-- Ajoute la brique « campagnes email » de l'admin :
-- 1) `contacts` : base de propriétaires / investisseurs avec zones de
--    recherche (codes département) et gestion d'abonnement.
-- 2) `campaigns` : une campagne = un bien mis en avant + un ciblage
--    (type de contact × zones) + un message (objet, intro).
-- 3) `campaign_recipients` : snapshot des destinataires au moment de
--    l'envoi ; les timestamps d'événements (webhook Resend) sont la
--    source de vérité des statistiques.
-- 4) Vue `campaign_stats` : agrégats par campagne.
--
-- RLS : activée sans aucune policy (comme `leads` depuis 0003) — seul le
-- service role (API admin serveur + background function) lit et écrit.
-- ══════════════════════════════════════════════

-- ─────────── CONTACTS ───────────
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  contact_type text not null default 'proprietaire'
    check (contact_type in ('proprietaire','investisseur','mixte')),
  -- Zones de recherche : codes département français ('69','75','2A','971'...).
  -- Tableau vide = toute la France (le contact matche tout ciblage géographique).
  zones text[] not null default '{}',
  notes text,
  source text not null default 'manuel'
    check (source in ('manuel','import_csv','lead')),
  lead_id uuid references leads(id) on delete set null,
  subscribed boolean not null default true,
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Unicité insensible à la casse (aligne le dédoublonnage de l'import CSV).
create unique index if not exists idx_contacts_email_lower
  on contacts (lower(email));
create index if not exists idx_contacts_type on contacts(contact_type);
create index if not exists idx_contacts_zones on contacts using gin(zones);

-- Contraintes de taille (même esprit que 0003 sur leads).
alter table contacts
  drop constraint if exists contacts_email_length,
  drop constraint if exists contacts_first_name_length,
  drop constraint if exists contacts_last_name_length,
  drop constraint if exists contacts_phone_length,
  drop constraint if exists contacts_notes_length;

alter table contacts
  add constraint contacts_email_length check (char_length(email) <= 254),
  add constraint contacts_first_name_length check (char_length(first_name) <= 100),
  add constraint contacts_last_name_length check (char_length(last_name) <= 100),
  add constraint contacts_phone_length
    check (phone is null or char_length(phone) <= 50),
  add constraint contacts_notes_length
    check (notes is null or char_length(notes) <= 5000);

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

-- ─────────── CAMPAGNES ───────────
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- nom interne (liste admin)
  subject text not null default '',
  intro_text text,                          -- paragraphe éditable du template
  property_id uuid references properties(id) on delete set null,
  target_contact_type text not null default 'tous'
    check (target_contact_type in ('tous','proprietaire','investisseur')),
  -- null = toute la France ; sinon codes département ciblés.
  target_zones text[],
  status text not null default 'draft'
    check (status in ('draft','sending','sent','failed')),
  total_recipients integer not null default 0,
  error text,
  sent_at timestamptz,
  created_by text,                          -- email admin (locals.user.email)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_campaigns_status on campaigns(status);

alter table campaigns
  drop constraint if exists campaigns_name_length,
  drop constraint if exists campaigns_subject_length,
  drop constraint if exists campaigns_intro_length;

alter table campaigns
  add constraint campaigns_name_length check (char_length(name) <= 200),
  add constraint campaigns_subject_length check (char_length(subject) <= 300),
  add constraint campaigns_intro_length
    check (intro_text is null or char_length(intro_text) <= 5000);

drop trigger if exists trg_campaigns_updated_at on campaigns;
create trigger trg_campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- ─────────── DESTINATAIRES (snapshot au moment de l'envoi) ───────────
-- `status` = étape la plus avancée atteinte
-- (pending < sent < delivered < opened|clicked ;
--  bounced/complained/failed sont terminaux).
create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  email text not null,                      -- snapshot à l'envoi
  status text not null default 'pending'
    check (status in ('pending','sent','delivered','opened','clicked',
                      'bounced','complained','failed')),
  resend_email_id text,                     -- corrélation webhook Resend
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz default now(),
  unique (campaign_id, contact_id)
);

create index if not exists idx_recipients_campaign
  on campaign_recipients(campaign_id);
create index if not exists idx_recipients_resend_id
  on campaign_recipients(resend_email_id);

-- ─────────── VUE STATS ───────────
-- security_invoker : la vue s'exécute avec les droits de l'appelant, donc la
-- RLS de campaign_recipients s'applique (sinon anon pourrait lire les agrégats
-- via la vue, qui contournerait la RLS par défaut). Seul le service role lit.
create or replace view campaign_stats with (security_invoker = on) as
select
  campaign_id,
  count(*) as total,
  count(*) filter (where status = 'pending') as pending,
  count(*) filter (where sent_at is not null) as sent,
  count(*) filter (where delivered_at is not null) as delivered,
  count(*) filter (where opened_at is not null) as opened,
  count(*) filter (where clicked_at is not null) as clicked,
  count(*) filter (where bounced_at is not null) as bounced,
  count(*) filter (where complained_at is not null) as complained,
  count(*) filter (where status = 'failed') as failed
from campaign_recipients
group by campaign_id;

-- Ceinture + bretelles : retire l'accès des rôles non privilégiés à la vue.
revoke all on campaign_stats from anon, authenticated;

-- ─────────── RLS : service role uniquement ───────────
alter table contacts enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
-- Aucune policy : RLS active + zéro policy = tout refusé pour anon et
-- authenticated. Toutes les lectures/écritures passent par le service role.
