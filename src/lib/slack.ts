// Notification Slack temps réel des leads Off Market (canal #oqo_transac).
//
// Transport : Incoming Webhook d'une app Slack dédiée (Slack → Your Apps →
// Incoming Webhooks → Add New Webhook to Workspace → canal #oqo_transac).
// L'URL obtenue va dans la variable d'environnement SLACK_LEADS_WEBHOOK_URL.
//
// Best-effort : l'envoi est déclenché dans la requête POST /api/leads (donc
// « en direct », sans cron ni file d'attente) mais aucune erreur Slack ne doit
// faire échouer l'enregistrement du lead — tout est loggué et avalé ici.

import type { Lead, Property } from './types';
import { formatEur } from './format';

// Slack coupe les webhooks lents ; au-delà on abandonne plutôt que de faire
// patienter le visiteur devant son formulaire.
const TIMEOUT_MS = 5000;

/** Libellés lisibles des `source` postées par les formulaires publics. */
const SOURCE_LABELS: Record<string, string> = {
  contact_modal: 'Formulaire fiche bien',
  alerte: 'Alerte nouveaux biens (accueil)',
  'empty-state': 'Accueil — aucun bien disponible',
};

/**
 * Échappe les 3 caractères réservés du mrkdwn Slack. Sans ça, un nom contenant
 * « <script> » ou « & » casse le rendu du message.
 */
function escapeSlack(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sourceLabel(source: string | null | undefined): string {
  const key = (source ?? '').trim();
  if (!key || key === 'unknown') return 'Non précisée';
  return SOURCE_LABELS[key] ?? key;
}

/**
 * Poste le lead dans Slack. Ne throw jamais : si le webhook n'est pas
 * configuré, la fonction ne fait rien (l'email de notification reste le canal
 * principal).
 */
export async function sendLeadSlackNotification(
  lead: Lead,
  property: Property | null,
  source?: string | null,
): Promise<void> {
  const webhookUrl =
    import.meta.env.SLACK_LEADS_WEBHOOK_URL || process.env.SLACK_LEADS_WEBHOOK_URL || '';
  if (!webhookUrl) return;

  const siteUrl =
    import.meta.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    'https://offmarket.oqoro.com';

  const fullName = `${lead.first_name} ${lead.last_name}`.trim();
  const adminUrl = `${siteUrl}/admin/leads`;

  const fields = [
    { type: 'mrkdwn', text: `*Nom*\n${escapeSlack(fullName)}` },
    { type: 'mrkdwn', text: `*Email*\n<mailto:${encodeURI(lead.email)}|${escapeSlack(lead.email)}>` },
    { type: 'mrkdwn', text: `*Téléphone*\n${escapeSlack(lead.phone)}` },
    { type: 'mrkdwn', text: `*Origine*\n${escapeSlack(sourceLabel(source))}` },
  ];

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🔔 Nouveau lead Off Market', emoji: true },
    },
    { type: 'section', fields },
  ];

  if (property) {
    const location = [property.address, property.city].filter(Boolean).join(', ');
    const propertyUrl = `${siteUrl}/biens/${property.slug}`;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Bien* · <${propertyUrl}|${escapeSlack(property.title)}>\n` +
          (location ? `${escapeSlack(location)}\n` : '') +
          `Prix de vente : *${escapeSlack(formatEur(property.sale_price))}*`,
      },
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_Demande générale — aucun bien associé._' },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Ouvrir dans l’admin', emoji: true },
        url: adminUrl,
        style: 'primary',
      },
      ...(property
        ? [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Voir le bien', emoji: true },
              url: `${siteUrl}/biens/${property.slug}`,
            },
          ]
        : []),
    ],
  });

  // Texte de repli : c'est lui qui s'affiche dans les notifications mobiles et
  // la liste des canaux, les blocks n'y sont pas rendus.
  const fallback = escapeSlack(
    property
      ? `Nouveau lead Off Market — ${fullName} · ${lead.email} · ${property.title}`
      : `Nouveau lead Off Market — ${fullName} · ${lead.email}`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fallback, blocks }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Slack renvoie la raison en text/plain (invalid_payload, channel_not_found…).
      const detail = await res.text().catch(() => '');
      console.error(`[slack] webhook HTTP ${res.status} ${detail}`.trim());
    }
  } catch (err) {
    console.error('[slack] webhook error', err);
  } finally {
    clearTimeout(timer);
  }
}
