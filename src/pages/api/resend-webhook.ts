import type { APIRoute } from 'astro';
import { getAdminClient } from '../../lib/supabase';
import { verifyResendWebhook } from '../../lib/resend-webhook';
import type { RecipientStatus } from '../../lib/types';

export const prerender = false;

// Webhook Resend (événements de délivrabilité des campagnes).
// À configurer : Dashboard Resend → Webhooks → https://…/api/resend-webhook
// avec les événements delivered / opened / clicked / bounced / complained,
// et le signing secret dans RESEND_WEBHOOK_SECRET.
//
// Les timestamps sont la source de vérité des stats (vue campaign_stats) ;
// `status` ne progresse que vers l'avant (un `delivered` en retard n'écrase
// pas un `clicked`, rien ne rétrograde un état terminal) — la garde est dans
// le prédicat de l'UPDATE, donc atomique même si deux événements arrivent en
// parallèle.

const STATUS_RANK: Record<RecipientStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
};

const TIMESTAMP_COLUMN: Partial<Record<string, keyof RecipientRow>> = {
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'bounced_at',
  'email.complained': 'complained_at',
};

const NEXT_STATUS: Partial<Record<string, RecipientStatus>> = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

interface RecipientRow {
  id: string;
  contact_id: string;
  status: RecipientStatus;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('Webhook not configured', { status: 503 });
  }

  // La signature porte sur les octets bruts : lire le body en texte.
  const rawBody = await request.text();
  const valid = verifyResendWebhook(
    secret,
    {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    rawBody,
  );
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: {
    type?: string;
    created_at?: string;
    data?: { email_id?: string; created_at?: string; bounce?: { message?: string } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  const emailId = event.data?.email_id;
  const type = event.type ?? '';
  const timestampColumn = TIMESTAMP_COLUMN[type];
  if (!emailId || !timestampColumn) {
    return new Response('OK', { status: 200 });
  }

  const supabase = getAdminClient();
  const select =
    'id, contact_id, status, delivered_at, opened_at, clicked_at, bounced_at, complained_at';

  let { data: recipient } = await supabase
    .from('campaign_recipients')
    .select(select)
    .eq('resend_email_id', emailId)
    .maybeSingle();

  // Course possible : un événement (bounce quasi immédiat) peut arriver avant
  // que le worker ait persisté le resend_email_id du batch. Une courte
  // attente + relecture couvre cette fenêtre.
  if (!recipient) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    ({ data: recipient } = await supabase
      .from('campaign_recipients')
      .select(select)
      .eq('resend_email_id', emailId)
      .maybeSingle());
  }
  // Id toujours inconnu = email transactionnel (leads) ou test : no-op.
  if (!recipient) {
    return new Response('OK', { status: 200 });
  }
  const row = recipient as unknown as RecipientRow;

  const occurredAt =
    event.created_at ?? event.data?.created_at ?? new Date().toISOString();

  // Timestamp : première occurrence seulement (ex. ouvertures multiples).
  if (!row[timestampColumn]) {
    const patch: Record<string, unknown> = { [timestampColumn]: occurredAt };
    if (type === 'email.bounced') {
      patch.error = event.data?.bounce?.message?.slice(0, 1000) ?? 'Bounce';
    }
    const { error } = await supabase
      .from('campaign_recipients')
      .update(patch)
      .eq('id', row.id)
      .is(timestampColumn, null);
    if (error) {
      console.error('[resend-webhook] timestamp update error', error);
    }
  }

  // Statut : progression uniquement, garde dans le prédicat (atomique).
  const nextStatus = NEXT_STATUS[type]!;
  const below = (Object.keys(STATUS_RANK) as RecipientStatus[]).filter(
    (s) => STATUS_RANK[s] < STATUS_RANK[nextStatus] && STATUS_RANK[s] < 5,
  );
  const { error: statusError } = await supabase
    .from('campaign_recipients')
    .update({ status: nextStatus })
    .eq('id', row.id)
    .in('status', below);
  if (statusError) {
    console.error('[resend-webhook] status update error', statusError);
  }

  // Suppression list : une plainte spam désabonne définitivement le contact.
  if (type === 'email.complained' && row.contact_id) {
    await supabase
      .from('contacts')
      .update({ subscribed: false, unsubscribed_at: occurredAt })
      .eq('id', row.contact_id);
  }

  return new Response('OK', { status: 200 });
};
