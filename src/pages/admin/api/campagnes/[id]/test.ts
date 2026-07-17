import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { getAdminClient } from '../../../../../lib/supabase';
import {
  campaignPropertyIds,
  loadCampaignPropertiesData,
} from '../../../../../lib/campaigns';
import {
  renderCampaignEmail,
  renderCustomEmail,
} from '../../../../../lib/campaign-email';
import { isSameOrigin } from '../../../../../lib/security';
import { UUID_REGEX, json } from '../_helpers';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://offmarket.oqoro.com';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEST_RECIPIENTS = 10;

// Envoie un email de test de la campagne. Par défaut à l'admin connecté ;
// un body JSON `{ emails: ["a@x.fr", ...] }` permet d'en viser jusqu'à 10
// (parité Mailer : adresses séparées par des virgules dans le modal).
// Aucun effet sur le statut de la campagne ni sur les destinataires.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  // Garde CSRF (couvre aussi l'appel sans body JSON, sans préflight CORS).
  if (!isSameOrigin(request, request.headers.get('host'))) {
    return json({ error: 'Origine invalide' }, 403);
  }
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) return json({ error: 'ID invalide' }, 400);

  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) return json({ error: 'RESEND_API_KEY non configurée' }, 503);

  // Destinataires du test : body optionnel (compat : sans body → admin).
  let recipients: string[] = [locals.user.email];
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      /* body vide toléré */
    }
    if (Array.isArray(body.emails) && body.emails.length > 0) {
      const cleaned = [
        ...new Set(
          body.emails
            .filter((e): e is string => typeof e === 'string')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      if (cleaned.length === 0 || cleaned.some((e) => e.length > 254 || !EMAIL_REGEX.test(e))) {
        return json({ error: 'Adresses de test invalides' }, 400);
      }
      if (cleaned.length > MAX_TEST_RECIPIENTS) {
        return json({ error: `${MAX_TEST_RECIPIENTS} adresses de test maximum` }, 400);
      }
      recipients = cleaned;
    }
  }

  const supabase = getAdminClient();
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return json({ error: 'Campagne introuvable' }, 404);

  let rendered: { html: string; text: string };
  if (campaign.content_mode === 'custom') {
    if (!campaign.custom_html?.trim()) {
      return json({ error: 'Le contenu HTML est vide' }, 400);
    }
    rendered = renderCustomEmail({
      html: campaign.custom_html,
      previewText: campaign.preview_text,
      contact: { first_name: 'Test', last_name: 'OQORO', email: locals.user.email },
      unsubscribeUrl: `${SITE_URL}/desabonnement`,
    });
  } else {
    const propertyIds = campaignPropertyIds(campaign);
    if (propertyIds.length === 0) {
      return json({ error: 'Sélectionnez un bien avant le test' }, 400);
    }
    const properties = await loadCampaignPropertiesData(supabase, propertyIds);
    if (properties.length === 0) return json({ error: 'Bien introuvable' }, 404);
    rendered = renderCampaignEmail({
      campaign: {
        subject: campaign.subject,
        intro_text: campaign.intro_text,
        preview_text: campaign.preview_text,
      },
      properties,
      contact: { first_name: 'Test' },
      siteUrl: SITE_URL,
      unsubscribeUrl: `${SITE_URL}/desabonnement`,
    });
  }

  const resend = new Resend(apiKey);
  const defaultFrom =
    import.meta.env.RESEND_FROM || 'OQORO Off Market <offmarket@oqoro.com>';
  const from = campaign.from_email
    ? campaign.from_name
      ? `${campaign.from_name} <${campaign.from_email}>`
      : campaign.from_email
    : defaultFrom;

  const { error } = await resend.emails.send({
    from,
    to: recipients,
    ...(campaign.reply_to ? { replyTo: campaign.reply_to } : {}),
    subject: `[TEST] ${campaign.subject || campaign.name}`,
    html: rendered.html,
    text: rendered.text,
  });
  if (error) {
    console.error('[admin campagnes test] resend error', error);
    return json({ error: `Envoi impossible : ${error.message}` }, 502);
  }
  return json({ success: true, to: recipients.join(', ') });
};
