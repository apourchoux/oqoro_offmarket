// Background function Netlify (suffixe `-background` : répond 202
// immédiatement, s'exécute jusqu'à 15 min) — snapshot de l'audience puis
// envoi d'une campagne email par batchs Resend de 100.
//
// Bundlée par esbuild Netlify (PAS par Vite) : uniquement `process.env`, et
// uniquement des imports purs depuis src/lib (aucun `import.meta.env`).
//
// Idempotente : le snapshot est un upsert ignoreDuplicates, et l'envoi ne
// traite que les destinataires `pending` ; un re-POST après crash reprend
// l'envoi sans doubler les emails déjà partis.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { timingSafeEqual } from 'node:crypto';
import {
  renderCampaignEmail,
  renderCustomEmail,
} from '../../src/lib/campaign-email';
import {
  audienceQuery,
  campaignPropertyIds,
  loadCampaignPropertiesData,
  type CampaignPropertyData,
} from '../../src/lib/campaigns';
import type { Campaign, Contact } from '../../src/lib/types';

const BATCH_SIZE = 100; // maximum de l'API batch Resend
const BATCH_DELAY_MS = 600; // limite Resend : 2 requêtes/s
const SNAPSHOT_PAGE = 1000; // limite PostgREST par requête

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
    console.error('[send-campaign] env manquante');
    return new Response('Server Misconfigured', { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const resend = new Resend(resendKey);
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://offmarket.oqoro.com';

  try {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    // Seule une campagne "sending" (claim posé par l'endpoint admin ou le
    // scheduler) s'envoie.
    if (!campaign || campaign.status !== 'sending') {
      return new Response('Nothing to do', { status: 200 });
    }
    const typedCampaign = campaign as Campaign;

    // Expéditeur : campagne si renseigné, sinon défaut global.
    const defaultFrom =
      process.env.RESEND_FROM || 'OQORO Off Market <offmarket@oqoro.com>';
    const from = typedCampaign.from_email
      ? typedCampaign.from_name
        ? `${typedCampaign.from_name} <${typedCampaign.from_email}>`
        : typedCampaign.from_email
      : defaultFrom;

    // Contenu : bien(s) généré(s) ou HTML custom.
    let propertiesData: CampaignPropertyData[] = [];
    if (typedCampaign.content_mode !== 'custom') {
      const propertyIds = campaignPropertyIds(typedCampaign);
      if (propertyIds.length === 0) {
        await markFailed(supabase, campaignId, 'Campagne sans bien associé');
        return new Response('OK', { status: 200 });
      }
      propertiesData = await loadCampaignPropertiesData(supabase, propertyIds);
      if (propertiesData.length !== propertyIds.length) {
        await markFailed(supabase, campaignId, 'Bien introuvable');
        return new Response('OK', { status: 200 });
      }
      // Revérifié au moment RÉEL de l'envoi : un bien peut avoir été dépublié
      // entre la programmation et l'échéance du cron.
      const unpublished = propertiesData.find(
        (p) => p.property.status !== 'published',
      );
      if (unpublished) {
        await markFailed(
          supabase,
          campaignId,
          `Le bien « ${unpublished.property.title} » n'est plus publié`,
        );
        return new Response('OK', { status: 200 });
      }
    } else if (!typedCampaign.custom_html?.trim()) {
      await markFailed(supabase, campaignId, 'Contenu HTML vide');
      return new Response('OK', { status: 200 });
    }

    // ─── Snapshot de l'audience (paginé, idempotent) ───
    for (let fromRow = 0; ; fromRow += SNAPSHOT_PAGE) {
      const { data: page, error: pageError } = await audienceQuery(
        supabase,
        typedCampaign,
        'id, email',
      )
        .order('id', { ascending: true })
        .range(fromRow, fromRow + SNAPSHOT_PAGE - 1);
      if (pageError) throw pageError;
      const rows = ((page ?? []) as Array<{ id: string; email: string }>).map(
        (c) => ({ campaign_id: campaignId, contact_id: c.id, email: c.email }),
      );
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('campaign_recipients')
          .upsert(rows, {
            onConflict: 'campaign_id,contact_id',
            ignoreDuplicates: true,
          });
        if (upsertError) throw upsertError;
      }
      if (!page || page.length < SNAPSHOT_PAGE) break;
    }

    const { count: totalRecipients, error: countError } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);
    // Un échec du count n'est PAS une audience vide : on remonte la vraie
    // erreur (catch global → failed + relance possible).
    if (countError) throw countError;
    if (!totalRecipients) {
      await markFailed(supabase, campaignId, 'Aucun destinataire dans ce segment');
      return new Response('OK', { status: 200 });
    }
    await supabase
      .from('campaigns')
      .update({
        total_recipients: totalRecipients,
        // Timeline d'historique : premier démarrage d'envoi uniquement (une
        // reprise après pause/crash ne réécrit pas la date d'origine).
        ...(typedCampaign.sending_started_at
          ? {}
          : { sending_started_at: new Date().toISOString() }),
      })
      .eq('id', campaignId);

    // ─── Envoi par pages de destinataires `pending` ───
    let sentCount = 0;
    let failedCount = 0;

    // Chaque ligne traitée quitte le statut pending (sent ou failed), donc la
    // requête suivante renvoie la suite — pas de troncature à la limite
    // PostgREST, et une reprise après crash repart où l'envoi s'était arrêté.
    //
    // Invariant critique : toute transition HORS de pending doit réussir. Si
    // une mise à jour échoue et qu'une ligne reste pending, la boucle la
    // re-sélectionne et RE-ENVERRAIT l'email → doublons en boucle. Chaque
    // update est donc vérifiée et fatale (throw → catch → failed, reprise
    // possible), et un garde anti-stagnation borne le nombre d'itérations.
    let iterations = 0;
    const maxIterations = Math.ceil(totalRecipients / BATCH_SIZE) + 5;
    for (;;) {
      if (++iterations > maxIterations) {
        throw new Error(
          `Boucle d'envoi anormale (${iterations} itérations pour ${totalRecipients} destinataires) — arrêt de sécurité`,
        );
      }
      // Pause demandée depuis l'admin (sending → paused) : arrêt propre AVANT
      // le batch suivant. Les destinataires déjà servis gardent leur statut,
      // les `pending` restants seront traités à la reprise (resume → worker,
      // idempotent). Ne surtout pas marquer sent/failed ici.
      const { data: current } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .maybeSingle();
      if (current?.status !== 'sending') {
        console.log(
          `[send-campaign] ${campaignId} interrompu (statut ${current?.status ?? 'inconnu'}) après ${sentCount} envoi(s)`,
        );
        return new Response('Paused', { status: 200 });
      }

      const { data: recipients, error: fetchError } = await supabase
        .from('campaign_recipients')
        .select(
          'id, email, contacts(first_name, last_name, email, unsubscribe_token, subscribed)',
        )
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);
      if (fetchError) throw fetchError;

      const chunk = (recipients ?? []) as unknown as Array<{
        id: string;
        email: string;
        contacts: Pick<
          Contact,
          'first_name' | 'last_name' | 'email' | 'unsubscribe_token' | 'subscribed'
        > | null;
      }>;
      if (chunk.length === 0) break;

      // Revérifie l'abonnement à l'instant de l'envoi (un contact a pu se
      // désabonner entre le snapshot et l'envoi effectif).
      const sendable = chunk.filter((r) => r.contacts?.subscribed);
      const skipped = chunk.filter((r) => !r.contacts?.subscribed);
      if (skipped.length > 0) {
        failedCount += skipped.length;
        const { error: skipError } = await supabase
          .from('campaign_recipients')
          .update({ status: 'failed', error: 'Contact désabonné' })
          .in('id', skipped.map((r) => r.id));
        if (skipError) throw skipError; // sinon ces lignes restent pending
      }
      if (sendable.length === 0) continue;

      const payload = sendable.map((r) => {
        const token = r.contacts!.unsubscribe_token;
        // Lien visible (footer) : page de confirmation. Header one-click
        // RFC 8058 : le endpoint POST directement. `c` = campagne d'origine,
        // pour attribuer le désabonnement dans les statistiques.
        const unsubscribeUrl = `${siteUrl}/desabonnement?token=${token}&c=${campaignId}`;
        const oneClickUrl = `${siteUrl}/api/unsubscribe?token=${token}&c=${campaignId}`;

        const { html, text } =
          typedCampaign.content_mode === 'custom'
            ? renderCustomEmail({
                html: typedCampaign.custom_html!,
                previewText: typedCampaign.preview_text,
                contact: {
                  first_name: r.contacts!.first_name,
                  last_name: r.contacts!.last_name,
                  email: r.contacts!.email,
                },
                unsubscribeUrl,
              })
            : renderCampaignEmail({
                campaign: {
                  subject: typedCampaign.subject,
                  intro_text: typedCampaign.intro_text,
                  preview_text: typedCampaign.preview_text,
                },
                properties: propertiesData,
                contact: { first_name: r.contacts!.first_name },
                siteUrl,
                unsubscribeUrl,
              });

        return {
          from,
          to: r.email,
          subject: typedCampaign.subject || typedCampaign.name,
          ...(typedCampaign.reply_to ? { replyTo: typedCampaign.reply_to } : {}),
          html,
          text,
          headers: {
            'List-Unsubscribe': `<${oneClickUrl}>, <mailto:offmarket@oqoro.com?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });

      const { data, error } = await resend.batch.send(payload);
      if (error || !data) {
        failedCount += sendable.length;
        console.error('[send-campaign] batch error', error);
        const { error: failError } = await supabase
          .from('campaign_recipients')
          .update({
            status: 'failed',
            error: (error?.message ?? 'Erreur batch Resend').slice(0, 1000),
          })
          .in('id', sendable.map((r) => r.id));
        if (failError) throw failError; // sinon ces lignes restent pending
      } else {
        // Les emails SONT partis : ces lignes doivent impérativement quitter
        // `pending`, sinon la boucle les renvoie. On enregistre le statut
        // (avec resend_email_id pour la corrélation webhook), on réessaie une
        // fois les échecs, et si ça persiste on abandonne (throw) plutôt que
        // de risquer un renvoi.
        sentCount += sendable.length;
        const now = new Date().toISOString();
        const updates = await Promise.all(
          sendable.map((r, idx) =>
            supabase
              .from('campaign_recipients')
              .update({
                status: 'sent',
                sent_at: now,
                resend_email_id: data.data[idx]?.id ?? null,
              })
              .eq('id', r.id)
              .then(({ error: e }) => ({ r, idx, e })),
          ),
        );
        let stillFailing = updates.filter((u) => u.e);
        if (stillFailing.length > 0) {
          await sleep(500);
          stillFailing = (
            await Promise.all(
              stillFailing.map(({ r, idx }) =>
                supabase
                  .from('campaign_recipients')
                  .update({
                    status: 'sent',
                    sent_at: now,
                    resend_email_id: data.data[idx]?.id ?? null,
                  })
                  .eq('id', r.id)
                  .then(({ error: e }) => ({ r, idx, e })),
              ),
            )
          ).filter((u) => u.e);
        }
        if (stillFailing.length > 0) {
          throw new Error(
            `Emails envoyés mais statut non enregistré pour ${stillFailing.length} destinataire(s) — arrêt pour éviter un renvoi`,
          );
        }
      }

      await sleep(BATCH_DELAY_MS);
    }

    if (sentCount > 0 || failedCount === 0) {
      // ≥1 envoyé, ou plus rien en pending (reprise après envoi complet).
      await supabase
        .from('campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaignId);
    } else {
      await markFailed(
        supabase,
        campaignId,
        `Aucun email envoyé (${failedCount} échec${failedCount > 1 ? 's' : ''})`,
      );
    }

    console.log(
      `[send-campaign] ${campaignId} terminé : ${sentCount} envoyé(s), ${failedCount} échec(s)`,
    );
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('[send-campaign] crash', err);
    await markFailed(
      supabase,
      campaignId,
      err instanceof Error ? err.message : 'Erreur inconnue',
    );
    return new Response('Internal Error', { status: 500 });
  }
}

async function markFailed(
  supabase: SupabaseClient<any, any, any, any, any>,
  campaignId: string,
  message: string,
): Promise<void> {
  await supabase
    .from('campaigns')
    .update({ status: 'failed', error: message.slice(0, 1000) })
    .eq('id', campaignId);
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
