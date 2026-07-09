import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { loadCampaignPropertyData } from '../../../../lib/campaigns';
import {
  renderCampaignEmail,
  renderCustomEmail,
} from '../../../../lib/campaign-email';
import { UUID_REGEX, json } from './_helpers';

export const prerender = false;

const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://offmarket.oqoro.com';

const PREVIEW_CONTACT = {
  first_name: 'Prénom',
  last_name: 'Nom',
  email: 'contact@exemple.fr',
};

// Rend l'aperçu HTML de l'email (contact fictif, lien de désabonnement
// inerte). Body : { content_mode, custom_html?, property_id?, subject?,
// intro_text?, preview_text? }.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const previewText =
    typeof body.preview_text === 'string' ? body.preview_text.slice(0, 300) : null;

  if (body.content_mode === 'custom') {
    if (typeof body.custom_html !== 'string' || !body.custom_html.trim()) {
      return json({ error: 'Contenu HTML vide' }, 400);
    }
    const { html } = renderCustomEmail({
      html: body.custom_html.slice(0, 500000),
      previewText,
      contact: PREVIEW_CONTACT,
      unsubscribeUrl: '#',
    });
    return json({ html });
  }

  const propertyId = body.property_id;
  if (typeof propertyId !== 'string' || !UUID_REGEX.test(propertyId)) {
    return json({ error: 'Bien requis pour l’aperçu' }, 400);
  }
  const intro =
    typeof body.intro_text === 'string' ? body.intro_text.slice(0, 5000) : null;
  const subject = typeof body.subject === 'string' ? body.subject.slice(0, 300) : '';

  const supabase = getAdminClient();
  const data = await loadCampaignPropertyData(supabase, propertyId);
  if (!data) return json({ error: 'Bien introuvable' }, 404);

  const { html } = renderCampaignEmail({
    campaign: { subject, intro_text: intro, preview_text: previewText },
    property: data.property,
    financials: data.financials,
    photoUrl: data.photoUrl,
    contact: { first_name: PREVIEW_CONTACT.first_name },
    siteUrl: SITE_URL,
    unsubscribeUrl: '#',
  });
  return json({ html });
};
