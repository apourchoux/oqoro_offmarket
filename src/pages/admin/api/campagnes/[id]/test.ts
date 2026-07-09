import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { getAdminClient } from '../../../../../lib/supabase';
import { loadCampaignPropertyData } from '../../../../../lib/campaigns';
import { renderCampaignEmail } from '../../../../../lib/campaign-email';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://offmarket.oqoro.com';

// Envoie un email de test de la campagne à l'admin connecté. Aucun effet sur
// le statut de la campagne ni sur les destinataires.
export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) return json({ error: 'RESEND_API_KEY non configurée' }, 503);

  const supabase = getAdminClient();
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return json({ error: 'Campagne introuvable' }, 404);
  if (!campaign.property_id) {
    return json({ error: 'Sélectionnez un bien avant le test' }, 400);
  }

  const data = await loadCampaignPropertyData(supabase, campaign.property_id);
  if (!data) return json({ error: 'Bien introuvable' }, 404);

  const { html, text } = renderCampaignEmail({
    campaign: { subject: campaign.subject, intro_text: campaign.intro_text },
    property: data.property,
    financials: data.financials,
    photoUrl: data.photoUrl,
    contact: { first_name: 'Test' },
    siteUrl: SITE_URL,
    unsubscribeUrl: `${SITE_URL}/desabonnement`,
  });

  const resend = new Resend(apiKey);
  const from =
    import.meta.env.RESEND_FROM || 'OQORO Off Market <offmarket@oqoro.com>';
  const { error } = await resend.emails.send({
    from,
    to: locals.user.email,
    subject: `[TEST] ${campaign.subject || campaign.name}`,
    html,
    text,
  });
  if (error) {
    console.error('[admin campagnes test] resend error', error);
    return json({ error: `Envoi impossible : ${error.message}` }, 502);
  }
  return json({ success: true, to: locals.user.email });
};
