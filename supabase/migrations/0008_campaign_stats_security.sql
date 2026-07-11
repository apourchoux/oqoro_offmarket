-- ══════════════════════════════════════════════
-- Migration 0008 — durcissement de la vue campaign_stats
-- À appliquer dans Supabase → SQL Editor → Run (après 0006/0007).
--
-- Correctif d'audit sécurité : une vue Postgres créée sans `security_invoker`
-- s'exécute avec les droits de son propriétaire et CONTOURNE la RLS des tables
-- sous-jacentes. La vue `campaign_stats` (0006) exposait donc ses agrégats
-- (nombres d'envois/ouvertures/clics par campagne) à la clé anon, malgré la
-- RLS verrouillant campaign_recipients.
--
-- On la recrée en `security_invoker = on` (elle respecte désormais la RLS de
-- l'appelant : anon → rien, service role → tout) et on révoque explicitement
-- l'accès des rôles anon/authenticated. Aucune donnée PII n'était exposée
-- (la vue ne contient ni email ni identité), mais l'intention de la RLS est
-- rétablie.
-- ══════════════════════════════════════════════

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

revoke all on campaign_stats from anon, authenticated;
