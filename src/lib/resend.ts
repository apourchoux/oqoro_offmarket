import { Resend } from 'resend';
import type { Lead, Property } from './types';
import { formatEur } from './format';
import { escapeHtml } from './campaign-email';

function getResend(): Resend | null {
  const key = import.meta.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const FROM = import.meta.env.RESEND_FROM || 'OQORO Off Market <offmarket@oqoro.com>';
const TO = import.meta.env.LEAD_NOTIFICATION_TO || 'offmarket@oqoro.com';
const CC = import.meta.env.LEAD_NOTIFICATION_CC || '';
const SITE_URL = import.meta.env.PUBLIC_SITE_URL || 'https://offmarket.oqoro.com';

export async function sendLeadNotification(
  lead: Lead,
  property: Property | null,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const subject = property
    ? `Nouveau lead — ${property.address ?? property.title} — ${lead.first_name} ${lead.last_name}`
    : `Nouveau lead — ${lead.first_name} ${lead.last_name}`;

  const adminUrl = `${SITE_URL}/admin/leads`;
  const propertyLine = property
    ? `<p><strong>Bien :</strong> ${escapeHtml(property.title)}<br/>${escapeHtml(property.address ?? '')} · ${escapeHtml(property.city ?? '')}<br/>Prix : ${formatEur(property.sale_price)}</p>`
    : '<p><em>Demande générale (pas de bien associé)</em></p>';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
      <h2 style="color:#1A1A2E;margin-top:0">Nouveau lead Off Market</h2>
      <p><strong>${escapeHtml(lead.first_name)} ${escapeHtml(lead.last_name)}</strong></p>
      <p>
        Email : <a href="mailto:${encodeURIComponent(lead.email)}">${escapeHtml(lead.email)}</a><br/>
        Téléphone : <a href="tel:${encodeURIComponent(lead.phone)}">${escapeHtml(lead.phone)}</a>
      </p>
      ${propertyLine}
      <p style="margin-top:24px">
        <a href="${adminUrl}" style="display:inline-block;background:#1A1A2E;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px">
          Voir dans l'admin
        </a>
      </p>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to: TO,
    ...(CC ? { cc: CC } : {}),
    subject,
    html,
  });
}

export async function sendLeadConfirmation(
  lead: Lead,
  property: Property | null,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const addressLine = property
    ? `${property.title}${property.address ? ` — ${property.address}` : ''}${property.city ? `, ${property.city}` : ''}`
    : 'votre demande';

  const subject = property
    ? `Votre demande — ${property.address ?? property.title}`
    : 'Votre demande';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
      <h2 style="color:#1A1A2E;margin-top:0">Demande bien reçue</h2>
      <p>Bonjour ${escapeHtml(lead.first_name)},</p>
      <p>
        Nous avons bien reçu votre demande d'information concernant <strong>${escapeHtml(addressLine)}</strong>.
      </p>
      <p>
        Un membre de notre équipe transaction vous recontactera sous 24-48h
        avec le dossier complet et les modalités de visite.
      </p>
      <p style="color:#888;font-size:13px;margin-top:32px">
        OQORO Off Market · offmarket@oqoro.com
      </p>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to: lead.email,
    subject,
    html,
  });
}
