import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);
  const id = params.id;
  if (!id) return json({ error: 'ID manquant' }, 400);

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const { property, lots, photos, transports, reports, publish } = payload ?? {};
  const supabase = getAdminClient();

  const row = { ...property };
  delete row.id;
  delete row.notary_fees;
  delete row.total_project;
  delete row.created_at;
  delete row.updated_at;
  if (publish) {
    row.status = 'published';
    if (!property.published_at) row.published_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('properties')
    .update(row)
    .eq('id', id);
  if (updateError) {
    console.error('[admin update] update error', updateError);
    return json({ error: updateError.message }, 500);
  }

  await Promise.all([
    supabase.from('property_lots').delete().eq('property_id', id),
    supabase.from('property_photos').delete().eq('property_id', id),
    supabase.from('property_transports').delete().eq('property_id', id),
    supabase.from('property_annual_reports').delete().eq('property_id', id),
  ]);

  const lotRows = (lots ?? []).map((l: any, i: number) => ({
    property_id: id,
    name: l.name,
    surface: l.surface,
    rent_hc: l.rent_hc,
    charges: l.charges,
    status: l.status,
    sort_order: i,
  }));
  const photoRows = (photos ?? []).map((p: any, i: number) => ({
    property_id: id,
    url: p.url,
    source: p.source ?? 'url',
    label: p.label,
    is_primary: p.is_primary,
    sort_order: i,
  }));
  const transportRows = (transports ?? []).map((t: any, i: number) => ({
    property_id: id,
    name: t.name,
    transport_type: t.transport_type,
    destination: t.destination,
    time_label: t.time_label,
    sort_order: i,
  }));
  const reportRows = (reports ?? []).map((r: any) => ({
    property_id: id,
    year: r.year,
    occupancy_rate: r.occupancy_rate,
    total_rent_collected: r.total_rent_collected,
    unpaid_amount: r.unpaid_amount ?? 0,
  }));

  if (lotRows.length) await supabase.from('property_lots').insert(lotRows);
  if (photoRows.length) await supabase.from('property_photos').insert(photoRows);
  if (transportRows.length) await supabase.from('property_transports').insert(transportRows);
  if (reportRows.length) await supabase.from('property_annual_reports').insert(reportRows);

  if (publish) {
    const hook = import.meta.env.CLOUDFLARE_DEPLOY_HOOK;
    if (hook) {
      try {
        await fetch(hook, { method: 'POST' });
      } catch (err) {
        console.error('[rebuild] failed', err);
      }
    }
  }

  return json({ success: true, id });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
