-- ══════════════════════════════════════════════
-- Migration 0007 — campagnes email v2 (parité Mailer)
-- À appliquer dans Supabase → SQL Editor → Run (après 0006).
--
-- 1) `contact_lists` + `contact_list_members` : listes nommées réutilisables
--    comme audience de campagne (en plus du ciblage type × zones).
-- 2) `email_templates` : bibliothèque de modèles HTML (variables
--    {{first_name}}, {{last_name}}, {{email}}, {{unsubscribe_url}}).
-- 3) `campaigns` : expéditeur nommé + reply-to, texte d'aperçu (preheader),
--    programmation d'envoi (statut `scheduled` + `scheduled_at`),
--    contenu au choix : bien généré (`property`) ou HTML custom (`custom`).
-- ══════════════════════════════════════════════

-- ─────────── LISTES DE CONTACTS ───────────
create table if not exists contact_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table contact_lists
  drop constraint if exists contact_lists_name_length;
alter table contact_lists
  add constraint contact_lists_name_length check (char_length(name) <= 200);

drop trigger if exists trg_contact_lists_updated_at on contact_lists;
create trigger trg_contact_lists_updated_at
  before update on contact_lists
  for each row execute function set_updated_at();

create table if not exists contact_list_members (
  list_id uuid not null references contact_lists(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (list_id, contact_id)
);

create index if not exists idx_list_members_contact
  on contact_list_members(contact_id);

-- ─────────── TEMPLATES ───────────
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  html text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table email_templates
  drop constraint if exists email_templates_name_length,
  drop constraint if exists email_templates_html_length;
alter table email_templates
  add constraint email_templates_name_length check (char_length(name) <= 200),
  add constraint email_templates_html_length check (char_length(html) <= 500000);

drop trigger if exists trg_email_templates_updated_at on email_templates;
create trigger trg_email_templates_updated_at
  before update on email_templates
  for each row execute function set_updated_at();

-- ─────────── CAMPAGNES : expéditeur, preheader, programmation, contenu ───────────
alter table campaigns
  add column if not exists from_name text,
  add column if not exists from_email text,
  add column if not exists reply_to text,
  add column if not exists preview_text text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists content_mode text not null default 'property',
  add column if not exists custom_html text,
  -- null = ciblage segment (type × zones) ; sinon audience = union des listes.
  add column if not exists target_list_ids uuid[];

alter table campaigns
  drop constraint if exists campaigns_content_mode_check,
  drop constraint if exists campaigns_from_email_length,
  drop constraint if exists campaigns_reply_to_length,
  drop constraint if exists campaigns_preview_text_length,
  drop constraint if exists campaigns_custom_html_length;

alter table campaigns
  add constraint campaigns_content_mode_check
    check (content_mode in ('property','custom')),
  add constraint campaigns_from_email_length
    check (from_email is null or char_length(from_email) <= 254),
  add constraint campaigns_reply_to_length
    check (reply_to is null or char_length(reply_to) <= 254),
  add constraint campaigns_preview_text_length
    check (preview_text is null or char_length(preview_text) <= 300),
  add constraint campaigns_custom_html_length
    check (custom_html is null or char_length(custom_html) <= 500000);

-- Nouveau statut `scheduled` (envoi programmé, annulable → retour draft).
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns
  add constraint campaigns_status_check
    check (status in ('draft','scheduled','sending','sent','failed'));

create index if not exists idx_campaigns_scheduled
  on campaigns(scheduled_at) where status = 'scheduled';

-- ─────────── RLS : service role uniquement (comme 0006) ───────────
alter table contact_lists enable row level security;
alter table contact_list_members enable row level security;
alter table email_templates enable row level security;
