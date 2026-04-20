import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const { property, lots, photos, transports, reports, publish } = payload ?? {};
  if (!property?.title || !property?.slug) {
    return json({ error: 'Titre et slug requis' }, 400);
  }

  const supabase = getAdminClient();
  const propertyRow = buildPropertyRow(property, publish);

  const { data: inserted, error } = await supabase
    .from('properties')
    .insert(propertyRow)
    .select()
    .single();
  if (error || !inserted) {
    console.error('[admin create] property insert error', error);
    return json({ error: error?.message ?? 'Erreur insertion' }, 500);
  }

  const propertyId = inserted.id;

  await syncChildren(supabase, propertyId, lots, photos, transports, reports);

  if (publish) {
    await triggerRebuild();
  }

  return json({ success: true, id: propertyId });
};

function buildPropertyRow(property: any, publish: boolean) {
  const row = { ...property };
  delete row.id;
  delete row.notary_fees;
  delete row.total_project;
  delete row.created_at;
  delete row.updated_at;
  if (publish) {
    row.status = 'published';
    row.published_at = new Date().toISOString();
  }
  return row;
}

async function syncChildren(
  supabase: ReturnType<typeof getAdminClient>,
  propertyId: string,
  lots: any[] = [],
  photos: any[] = [],
  transports: any[] = [],
  reports: any[] = [],
) {
  const lotRows = lots.map((l, i) => ({
    property_id: propertyId,
    name: l.name,
    surface: l.surface,
    rent_hc: l.rent_hc,
    charges: l.charges,
    status: l.status,
    sort_order: i,
  }));
  const photoRows = photos.map((p, i) => ({
    property_id: propertyId,
    url: p.url,
    source: p.source ?? 'url',
    label: p.label,
    is_primary: p.is_primary,
    sort_order: i,
  }));
  const transportRows = transports.map((t, i) => ({
    property_id: propertyId,
    name: t.name,
    transport_type: t.transport_type,
    destination: t.destination,
    time_label: t.time_label,
    sort_order: i,
  }));
  const reportRows = reports.map((r) => ({
    property_id: propertyId,
    year: r.year,
    occupancy_rate: r.occupancy_rate,
    total_rent_collected: r.total_rent_collected,
    unpaid_amount: r.unpaid_amount ?? 0,
  }));

  if (lotRows.length) await supabase.from('property_lots').insert(lotRows);
  if (photoRows.length) await supabase.from('property_photos').insert(photoRows);
  if (transportRows.length) await supabase.from('property_transports').insert(transportRows);
  if (reportRows.length) await supabase.from('property_annual_reports').insert(reportRows);
}

async function triggerRebuild() {
  const hook = import.meta.env.CLOUDFLARE_DEPLOY_HOOK;
  if (!hook) return;
  try {
    await fetch(hook, { method: 'POST' });
  } catch (err) {
    console.error('[rebuild] failed', err);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
