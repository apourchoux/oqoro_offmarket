// Background function Netlify — resynchronisation des statuts d'une campagne
// depuis l'API Resend (parité Mailer : bouton « Synchroniser » du rapport).
//
// Le webhook Resend est la source de vérité normale ; ce resync rattrape les
// événements perdus (webhook pas encore configuré au moment de l'envoi,
// indisponibilité prolongée, etc.) en interrogeant GET /emails/{id} pour
// chaque destinataire dont le statut peut encore progresser.
//
// Idempotent et conforme aux invariants du webhook : timestamps posés
// seulement s'ils sont absents, statut en progression uniquement (jamais de
// rétrogradation, les états terminaux sont conservés).

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { timingSafeEqual } from 'node:crypto';
import type { RecipientStatus } from '../../src/lib/types';

// Limite API Resend : 10 req/s — 120 ms de marge par appel.
const CALL_DELAY_MS = 120;
const PAGE = 1000;
// Garde-fou : ~10 min à 120 ms/appel, sous le plafond de 15 min de Netlify.
const MAX_LOOKUPS = 5000;

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

// last_event Resend → statut destinataire + colonne timestamp.
const EVENT_MAP: Record<string, { status: RecipientStatus; column: string }> = {
  delivered: { status: 'delivered', column: 'delivered_at' },
  delivery_delayed: { status: 'delivered', column: 'delivered_at' },
  opened: { status: 'opened', column: 'opened_at' },
  clicked: { status: 'clicked', column: 'clicked_at' },
  bounced: { status: 'bounced', column: 'bounced_at' },
  complained: { status: 'complained', column: 'complained_at' },
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const secret = process.env.CAMPAIGN_FUNCTION_SECRET;
  const provided = req.headers.get('x-campaign-secret') ?? '';
  if (!secret || !safeEqual(provided, secret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let campaignId: string;
  try {
    const body = await req.json();
    campaignId = body.campaign_id;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (
    typeof campaignId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      campaignId,
    )
  ) {
    return new Response('Bad Request', { status: 400 });
  }

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !serviceKey || !resendKey) {
    console.error('[resync-campaign] env manquante');
    return new Response('Server Misconfigured', { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const resend = new Resend(resendKey);

  try {
    // Seuls les destinataires dont le statut peut encore PROGRESSER sont
    // interrogés (sent/delivered/opened) : les états terminaux et `clicked`
    // n'ont rien à gagner d'un appel API.
    const rows: Array<{
      id: string;
      status: RecipientStatus;
      resend_email_id: string;
      delivered_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      bounced_at: string | null;
      complained_at: string | null;
    }> = [];
    for (let from = 0; rows.length < MAX_LOOKUPS; from += PAGE) {
      const { data, error } = await supabase
        .from('campaign_recipients')
        .select(
          'id, status, resend_email_id, delivered_at, opened_at, clicked_at, bounced_at, complained_at',
        )
        .eq('campaign_id', campaignId)
        .in('status', ['sent', 'delivered', 'opened'])
        .not('resend_email_id', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < PAGE) break;
    }
    const targets = rows.slice(0, MAX_LOOKUPS);

    let synced = 0;
    let errors = 0;
    const eventCounts: Record<string, number> = {};

    for (const r of targets) {
      await sleep(CALL_DELAY_MS);
      try {
        const { data, error } = await resend.emails.get(r.resend_email_id);
        if (error || !data) {
          errors++;
          continue;
        }
        const lastEvent = (data as { last_event?: string }).last_event ?? '';
        eventCounts[lastEvent] = (eventCounts[lastEvent] ?? 0) + 1;
        const mapped = EVENT_MAP[lastEvent];
        if (!mapped) continue;

        const now = new Date().toISOString();
        const patch: Record<string, unknown> = {};

        // Timestamps : première occurrence seulement, et les étapes
        // intermédiaires manquantes sont comblées (un `clicked` implique
        // delivered + opened, comme les événements webhook cumulés).
        const chain: Array<{ column: keyof typeof r; upTo: number }> = [
          { column: 'delivered_at', upTo: STATUS_RANK.delivered },
          { column: 'opened_at', upTo: STATUS_RANK.opened },
          { column: 'clicked_at', upTo: STATUS_RANK.clicked },
        ];
        for (const step of chain) {
          if (
            STATUS_RANK[mapped.status] >= step.upTo &&
            STATUS_RANK[mapped.status] < 5 &&
            !r[step.column]
          ) {
            patch[step.column] = now;
          }
        }
        if (
          (mapped.status === 'bounced' && !r.bounced_at) ||
          (mapped.status === 'complained' && !r.complained_at)
        ) {
          patch[mapped.column] = now;
        }

        // Statut : progression uniquement (garde atomique dans le prédicat,
        // même logique que le webhook).
        if (STATUS_RANK[mapped.status] > STATUS_RANK[r.status]) {
          const below = (Object.keys(STATUS_RANK) as RecipientStatus[]).filter(
            (s) => STATUS_RANK[s] < STATUS_RANK[mapped.status] && STATUS_RANK[s] < 5,
          );
          const { error: statusError } = await supabase
            .from('campaign_recipients')
            .update({ status: mapped.status, ...patch })
            .eq('id', r.id)
            .in('status', below);
          if (statusError) {
            errors++;
            continue;
          }
          synced++;
        } else if (Object.keys(patch).length > 0) {
          const { error: patchError } = await supabase
            .from('campaign_recipients')
            .update(patch)
            .eq('id', r.id);
          if (patchError) {
            errors++;
            continue;
          }
          synced++;
        }
      } catch (err) {
        errors++;
        console.error('[resync-campaign] lookup error', r.resend_email_id, err);
      }
    }

    console.log(
      `[resync-campaign] ${campaignId} terminé : ${targets.length} interrogé(s), ` +
        `${synced} mis à jour, ${errors} erreur(s), événements : ${JSON.stringify(eventCounts)}` +
        (rows.length > MAX_LOOKUPS ? ` (tronqué à ${MAX_LOOKUPS})` : ''),
    );
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[resync-campaign] crash', err);
    return new Response('Internal Error', { status: 500 });
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
