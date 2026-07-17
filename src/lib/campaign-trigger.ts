// Rattrapage des campagnes programmées en retard, déclenché au chargement
// des pages admin campagnes. Filet de sécurité du cron Netlify
// (campaign-scheduler, toutes les 5 min) : si le cron a raté une échéance
// (fonction en erreur, env manquante, incident Netlify), la campagne part
// dès qu'un admin ouvre la section Campagnes plutôt que de rester bloquée.
//
// Module SERVEUR Astro (import.meta.env) — ne pas importer depuis les
// fonctions Netlify (elles ont leur propre logique dans campaign-scheduler).

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Réclame (claim atomique scheduled → sending) et déclenche les campagnes
 * dont l'échéance est passée. Best-effort : toute erreur est loggée mais ne
 * bloque jamais le rendu de la page appelante.
 * @returns le nombre de campagnes déclenchées.
 */
export async function triggerDueScheduledCampaigns(
  supabase: SupabaseClient<any, any, any, any, any>,
): Promise<number> {
  const functionSecret = import.meta.env.CAMPAIGN_FUNCTION_SECRET;
  if (!functionSecret) return 0; // le worker refuserait l'appel de toute façon

  try {
    const { data: due } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(5);
    if (!due || due.length === 0) return 0;

    // Origine de CONFIANCE (jamais dérivée de la requête) — cf. send.ts.
    const origin =
      process.env.URL ||
      import.meta.env.PUBLIC_SITE_URL ||
      'https://offmarket.oqoro.com';

    let triggered = 0;
    for (const campaign of due) {
      // Claim atomique : si le cron (ou un autre admin) l'a déjà pris, 0 ligne.
      const { data: claimed } = await supabase
        .from('campaigns')
        .update({ status: 'sending', error: null, scheduled_at: null })
        .eq('id', campaign.id)
        .eq('status', 'scheduled')
        .select();
      if (!claimed || claimed.length === 0) continue;

      try {
        const res = await fetch(
          `${origin}/.netlify/functions/send-campaign-background`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-campaign-secret': functionSecret,
            },
            body: JSON.stringify({ campaign_id: campaign.id }),
          },
        );
        if (!res.ok && res.status !== 202) throw new Error(`HTTP ${res.status}`);
        triggered++;
        console.log(`[campaign-trigger] campagne ${campaign.id} déclenchée (rattrapage admin)`);
      } catch (err) {
        console.error('[campaign-trigger] trigger error', campaign.id, err);
        // Statut sending conservé : le watchdog du cron reprendra sous 30 min.
      }
    }
    return triggered;
  } catch (err) {
    console.error('[campaign-trigger] error', err);
    return 0;
  }
}
