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
// `status` ne progresse que vers l'avant (un `opened` tardif n'écrase pas un
// `clicked`, un événement ne rétrograde jamais un état terminal).

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
  const type = event.type;
  if (!emailId || !type) {
    return new Response('OK', { status: 200 });
  }

  const supabase = getAdminClient();
  const { data: recipient } = await supabase
    .from('campaign_recipients')
    .select('id, status')
    .eq('resend_email_id', emailId)
    .maybeSingle();
  // Id inconnu = email transactionnel (leads) ou test : no-op.
  if (!recipient) {
    return new Response('OK', { status: 200 });
  }

  const occurredAt =
    event.created_at ?? event.data?.created_at ?? new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let nextStatus: RecipientStatus | null = null;

  switch (type) {
    case 'email.delivered':
      patch.delivered_at = occurredAt;
      nextStatus = 'delivered';
      break;
    case 'email.opened':
      patch.opened_at = occurredAt;
      nextStatus = 'opened';
      break;
    case 'email.clicked':
      patch.clicked_at = occurredAt;
      nextStatus = 'clicked';
      break;
    case 'email.bounced':
      patch.bounced_at = occurredAt;
      patch.error = event.data?.bounce?.message?.slice(0, 1000) ?? 'Bounce';
      nextStatus = 'bounced';
      break;
    case 'email.complained': {
      patch.complained_at = occurredAt;
      nextStatus = 'complained';
      // Suppression list : une plainte spam désabonne définitivement le contact.
      const { data: full } = await supabase
        .from('campaign_recipients')
        .select('contact_id')
        .eq('id', recipient.id)
        .maybeSingle();
      if (full?.contact_id) {
        await supabase
          .from('contacts')
          .update({ subscribed: false, unsubscribed_at: occurredAt })
          .eq('id', full.contact_id);
      }
      break;
    }
    default:
      return new Response('OK', { status: 200 });
  }

  // Ne pas écraser un timestamp déjà posé (ex. opened multiple : on garde la
  // première ouverture) ni rétrograder le statut.
  const current = recipient.status as RecipientStatus;
  if (
    nextStatus &&
    STATUS_RANK[nextStatus] > STATUS_RANK[current] &&
    STATUS_RANK[current] < 5
  ) {
    patch.status = nextStatus;
  }
  const timestampKey = Object.keys(patch).find((k) => k.endsWith('_at'));
  if (timestampKey) {
    const { data: existing } = await supabase
      .from('campaign_recipients')
      .select(timestampKey)
      .eq('id', recipient.id)
      .maybeSingle();
    if (existing && (existing as unknown as Record<string, unknown>)[timestampKey]) {
      delete patch[timestampKey];
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from('campaign_recipients')
      .update(patch)
      .eq('id', recipient.id);
    if (error) {
      console.error('[resend-webhook] update error', error);
    }
  }

  return new Response('OK', { status: 200 });
};
