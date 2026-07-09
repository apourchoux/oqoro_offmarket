// Template HTML des campagnes email. Module PUR : aucun accès à
// `import.meta.env` (tout est injecté via CampaignEmailInput) car il est
// importé à la fois par les endpoints Astro (bundle Vite) et par la
// background function Netlify (bundle esbuild, `process.env`).

import type {
  Campaign,
  Contact,
  Property,
  PropertyFinancials,
} from './types';
import { PROPERTY_TYPE_LABELS } from './types';
import { formatEur } from './format';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface CampaignEmailInput {
  campaign: Pick<Campaign, 'subject' | 'intro_text'>;
  property: Property;
  financials: PropertyFinancials | null;
  photoUrl: string | null;
  contact: Pick<Contact, 'first_name'>;
  siteUrl: string;
  unsubscribeUrl: string;
}

const DEFAULT_INTRO =
  'Nous avons sélectionné pour vous une nouvelle opportunité ' +
  "d'investissement locatif off-market, avant sa mise sur le marché.";

const BRAND = '#1A1A2E';

/**
 * Rend l'email « bien mis en avant » d'une campagne : layout table 600 px,
 * styles inline (compatibilité clients email), version texte en fallback.
 * Toute donnée interpolée passe par escapeHtml ; les URLs sont construites
 * côté serveur uniquement (slug + token).
 */
export function renderCampaignEmail(input: CampaignEmailInput): {
  html: string;
  text: string;
} {
  const { campaign, property, financials, photoUrl, contact, siteUrl, unsubscribeUrl } = input;

  const propertyUrl = `${siteUrl}/biens/${property.slug}`;
  const intro = campaign.intro_text?.trim() || DEFAULT_INTRO;
  const introHtml = escapeHtml(intro).replace(/\n/g, '<br/>');

  const typeLabel = property.property_type
    ? PROPERTY_TYPE_LABELS[property.property_type]
    : null;
  const cityLine = [property.city, property.postal_code ? `(${property.postal_code})` : null]
    .filter(Boolean)
    .join(' ');
  const badges = [
    typeLabel,
    property.total_surface ? `${property.total_surface} m²` : null,
    financials && financials.total_lots > 0
      ? `${financials.total_lots} lot${financials.total_lots > 1 ? 's' : ''}`
      : null,
  ].filter(Boolean) as string[];

  const figures: Array<{ label: string; value: string }> = [
    { label: 'Prix', value: formatEur(property.sale_price) },
  ];
  if (financials && financials.monthly_rent_cc > 0) {
    figures.push({
      label: 'Loyer mensuel CC',
      value: formatEur(financials.monthly_rent_cc),
    });
  }
  if (financials && financials.gross_yield > 0) {
    figures.push({
      label: 'Rentabilité brute',
      value: `${financials.gross_yield.toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      })} %`,
    });
  }

  const figureCells = figures
    .map(
      (f) => `
        <td align="center" style="padding:14px 8px;border:1px solid #ECECF1;border-radius:10px;background:#F8F8FB">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#77778C;font-weight:700">${escapeHtml(f.label)}</div>
          <div style="font-size:18px;font-weight:800;color:${BRAND};margin-top:4px">${escapeHtml(f.value)}</div>
        </td>
        <td style="width:8px"></td>`,
    )
    .join('');

  const badgesHtml = badges
    .map(
      (b) =>
        `<span style="display:inline-block;background:#F0F0F6;color:#55556B;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-right:6px">${escapeHtml(b)}</span>`,
    )
    .join('');

  const photoBlock = photoUrl
    ? `<tr><td><a href="${propertyUrl}"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(property.title)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;border-radius:12px 12px 0 0" /></a></td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F2F2F7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F7">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

        <tr><td style="background:${BRAND};border-radius:12px 12px 0 0;padding:18px 28px">
          <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:0.02em">OQORO</span>
          <span style="color:#8A8AA3;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;margin-left:10px">Off Market</span>
        </td></tr>

        <tr><td style="background:#fff;padding:28px 28px 8px 28px;color:#33334A;font-size:15px;line-height:1.6">
          <p style="margin:0 0 12px 0">Bonjour ${escapeHtml(contact.first_name)},</p>
          <p style="margin:0 0 20px 0">${introHtml}</p>
        </td></tr>

        <tr><td style="background:#fff;padding:0 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECECF1;border-radius:12px;overflow:hidden">
            ${photoBlock}
            <tr><td style="padding:20px">
              <div style="font-size:19px;font-weight:800;color:${BRAND};line-height:1.3">${escapeHtml(property.title)}</div>
              ${cityLine ? `<div style="font-size:14px;color:#77778C;margin-top:4px">${escapeHtml(cityLine)}</div>` : ''}
              ${badgesHtml ? `<div style="margin-top:12px">${badgesHtml}</div>` : ''}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>${figureCells}</tr></table>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
                <td style="background:${BRAND};border-radius:10px">
                  <a href="${propertyUrl}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:15px;font-weight:700;text-decoration:none">Découvrir ce bien</a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:24px 28px 28px 28px">
          <p style="margin:0;font-size:12px;color:#9A9AAF;line-height:1.6">
            OQORO Off Market · offmarket@oqoro.com<br/>
            Vous recevez cet email car vous êtes inscrit à nos opportunités off-market.
            <a href="${unsubscribeUrl}" style="color:#77778C">Se désabonner</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textFigures = figures.map((f) => `- ${f.label} : ${f.value}`).join('\n');
  const text = [
    `Bonjour ${contact.first_name},`,
    '',
    intro,
    '',
    property.title,
    cityLine,
    badges.join(' · '),
    '',
    textFigures,
    '',
    `Découvrir ce bien : ${propertyUrl}`,
    '',
    '—',
    'OQORO Off Market · offmarket@oqoro.com',
    'Vous recevez cet email car vous êtes inscrit à nos opportunités off-market.',
    `Se désabonner : ${unsubscribeUrl}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { html, text };
}
