// Fonction Netlify planifiée (cron toutes les 5 min) :
// 1. déclenche les campagnes programmées arrivées à échéance (claim atomique
//    scheduled → sending, puis délégation à send-campaign-background qui fait
//    snapshot + envoi — même contrat d'idempotence que l'endpoint /send) ;
// 2. watchdog : re-déclenche les campagnes restées en `sending` sans activité
//    depuis 30 min (worker tué net : timeout 15 min, OOM, redéploiement, ou
//    invocation 202 jamais exécutée). Le worker est idempotent — il ne
//    retraite que les destinataires `pending`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const config = {
  schedule: '*/5 * * * *',
};

// Marge large : une background function vit 15 min max, et le worker touche
// `updated_at` (via total_recipients) en début d'exécution.
const STALE_SENDING_MINUTES = 30;

export default async function handler(): Promise<Response> {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const functionSecret = process.env.CAMPAIGN_FUNCTION_SECRET;
  // `URL` est fournie par Netlify à l'exécution (URL principale du site).
  const siteUrl = process.env.URL || process.env.PUBLIC_SITE_URL;
  if (!supabaseUrl || !serviceKey || !functionSecret || !siteUrl) {
    console.error('[campaign-scheduler] env manquante');
    return new Response('Server Misconfigured', { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ─── 1. Campagnes programmées arrivées à échéance ───
  const { data: due, error } = await supabase
    .from('campaigns')
    .select('id, name, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .limit(20);
  if (error) {
    console.error('[campaign-scheduler] read error', error);
    return new Response('Error', { status: 500 });
  }

  for (const campaign of due ?? []) {
    // Claim atomique : si une autre exécution l'a déjà pris, 0 ligne.
    const { data: claimed } = await supabase
      .from('campaigns')
      .update({ status: 'sending', error: null, scheduled_at: null })
      .eq('id', campaign.id)
      .eq('status', 'scheduled')
      .select();
    if (!claimed || claimed.length === 0) continue;
    await triggerWorker(supabase, siteUrl, functionSecret, campaign.id, 'programmation');
  }

  // ─── 2. Watchdog : campagnes `sending` inactives depuis 30 min ───
  const staleBefore = new Date(
    Date.now() - STALE_SENDING_MINUTES * 60_000,
  ).toISOString();
  const { data: stale } = await supabase
    .from('campaigns')
    .select('id, name, updated_at')
    .eq('status', 'sending')
    .lt('updated_at', staleBefore)
    .limit(10);

  for (const campaign of stale ?? []) {
    console.warn(
      `[campaign-scheduler] campagne ${campaign.id} bloquée en sending depuis ${campaign.updated_at} — relance`,
    );
    // Touch updated_at pour ne pas re-déclencher à chaque cron pendant la
    // reprise ; le worker ne retraite que les destinataires pending.
    await supabase
      .from('campaigns')
      .update({ error: null })
      .eq('id', campaign.id)
      .eq('status', 'sending');
    await triggerWorker(supabase, siteUrl, functionSecret, campaign.id, 'watchdog');
  }

  return new Response('OK', { status: 200 });
}

async function triggerWorker(
  supabase: SupabaseClient<any, any, any, any, any>,
  siteUrl: string,
  functionSecret: string,
  campaignId: string,
  origin: string,
): Promise<void> {
  try {
    const res = await fetch(
      `${siteUrl}/.netlify/functions/send-campaign-background`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-campaign-secret': functionSecret,
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      },
    );
    if (!res.ok && res.status !== 202) {
      throw new Error(`HTTP ${res.status}`);
    }
    console.log(`[campaign-scheduler] campagne ${campaignId} déclenchée (${origin})`);
  } catch (err) {
    console.error(`[campaign-scheduler] trigger error (${origin})`, campaignId, err);
    await supabase
      .from('campaigns')
      .update({
        status: 'failed',
        error: `Impossible de déclencher la fonction d'envoi (${origin})`,
      })
      .eq('id', campaignId);
  }
}
