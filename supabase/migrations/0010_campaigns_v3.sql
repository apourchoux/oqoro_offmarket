-- ══════════════════════════════════════════════
-- Migration 0010 — campagnes v3 (parité Mailer complète)
-- À appliquer dans Supabase → SQL Editor → Run (après 0009).
--
-- 1) `campaigns` : dossier de rangement, pause/reprise d'envoi
--    (statuts `paused` et `cancelled`), timestamp de début d'envoi
--    (`sending_started_at`, pour la timeline d'historique).
-- 2) `campaign_recipients.unsubscribed_at` : désabonnements attribués à la
--    campagne qui les a provoqués (l'URL de désabonnement porte l'id).
-- 3) `campaign_clicks` : chaque clic avec son URL (webhook Resend) —
--    alimente l'onglet « Liens cliqués » du rapport.
-- 4) `campaign_senders` : expéditeurs pré-enregistrés proposés en cartes
--    dans l'étape Expéditeur du composer.
-- 5) Vue `campaign_stats` : ajoute le compteur `unsubscribed`.
-- ══════════════════════════════════════════════

-- ─────────── CAMPAGNES : dossier, pause, historique ───────────
alter table campaigns
  add column if not exists folder text,
  add column if not exists sending_started_at timestamptz;

alter table campaigns
  drop constraint if exists campaigns_folder_length;
alter table campaigns
  add constraint campaigns_folder_length
    check (folder is null or char_length(folder) <= 100);

-- Nouveaux statuts : `paused` (envoi suspendu, reprenable) et `cancelled`
-- (parité Mailer — réservé aux évolutions futures).
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns
  add constraint campaigns_status_check
    check (status in ('draft','scheduled','sending','paused','sent','failed','cancelled'));

create index if not exists idx_campaigns_folder
  on campaigns(folder) where folder is not null;

-- ─────────── DESTINATAIRES : désabonnement attribué ───────────
alter table campaign_recipients
  add column if not exists unsubscribed_at timestamptz;

-- ─────────── CLICS PAR LIEN ───────────
create table if not exists campaign_clicks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  recipient_id uuid references campaign_recipients(id) on delete cascade,
  url text not null,
  clicked_at timestamptz default now()
);

alter table campaign_clicks
  drop constraint if exists campaign_clicks_url_length;
alter table campaign_clicks
  add constraint campaign_clicks_url_length check (char_length(url) <= 2048);

create index if not exists idx_campaign_clicks_campaign
  on campaign_clicks(campaign_id);

-- Idempotence des rejeux de webhook : un même clic (destinataire + URL +
-- timestamp Resend) n'est enregistré qu'une fois.
create unique index if not exists idx_campaign_clicks_dedup
  on campaign_clicks(recipient_id, url, clicked_at);

-- ─────────── EXPÉDITEURS PRÉ-ENREGISTRÉS ───────────
create table if not exists campaign_senders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  reply_to text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table campaign_senders
  drop constraint if exists campaign_senders_name_length,
  drop constraint if exists campaign_senders_email_length,
  drop constraint if exists campaign_senders_reply_to_length;
alter table campaign_senders
  add constraint campaign_senders_name_length check (char_length(name) <= 100),
  add constraint campaign_senders_email_length check (char_length(email) <= 254),
  add constraint campaign_senders_reply_to_length
    check (reply_to is null or char_length(reply_to) <= 254);

drop trigger if exists trg_campaign_senders_updated_at on campaign_senders;
create trigger trg_campaign_senders_updated_at
  before update on campaign_senders
  for each row execute function set_updated_at();

-- ─────────── VUE STATS : + désabonnements ───────────
-- `create or replace` n'accepte que l'AJOUT de colonnes en fin de liste :
-- `unsubscribed` est donc ajoutée après `failed`.
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
  count(*) filter (where status = 'failed') as failed,
  count(*) filter (where unsubscribed_at is not null) as unsubscribed
from campaign_recipients
group by campaign_id;

revoke all on campaign_stats from anon, authenticated;

-- ─────────── RLS : service role uniquement (comme 0006/0007) ───────────
alter table campaign_clicks enable row level security;
alter table campaign_senders enable row level security;
