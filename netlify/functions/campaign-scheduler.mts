// Fonction Netlify planifiée (cron toutes les 5 min) : déclenche les
// campagnes programmées arrivées à échéance. Pour chacune : claim atomique
// scheduled → sending, puis délégation à send-campaign-background (qui fait
// snapshot + envoi). Même contrat d'idempotence que l'endpoint admin /send.

import { createClient } from '@supabase/supabase-js';

export const config = {
  schedule: '*/5 * * * *',
};

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
  if (!due || due.length === 0) {
    return new Response('Nothing due', { status: 200 });
  }

  for (const campaign of due) {
    // Claim atomique : si une autre exécution l'a déjà pris, 0 ligne.
    const { data: claimed } = await supabase
      .from('campaigns')
      .update({ status: 'sending', error: null, scheduled_at: null })
      .eq('id', campaign.id)
      .eq('status', 'scheduled')
      .select();
    if (!claimed || claimed.length === 0) continue;

    try {
      const res = await fetch(
        `${siteUrl}/.netlify/functions/send-campaign-background`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-campaign-secret': functionSecret,
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        },
      );
      if (!res.ok && res.status !== 202) {
        throw new Error(`HTTP ${res.status}`);
      }
      console.log(`[campaign-scheduler] campagne ${campaign.id} déclenchée`);
    } catch (err) {
      console.error('[campaign-scheduler] trigger error', campaign.id, err);
      await supabase
        .from('campaigns')
        .update({
          status: 'failed',
          error: "Impossible de déclencher la fonction d'envoi (programmation)",
        })
        .eq('id', campaign.id);
    }
  }

  return new Response('OK', { status: 200 });
}
