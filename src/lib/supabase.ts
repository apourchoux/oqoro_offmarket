import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Property,
  PropertyLot,
  PropertyPhoto,
  PropertyTransport,
  PropertyAnnualReport,
  PropertyFinancials,
  PropertyFull,
  Lead,
} from './types';

/**
 * Public (anon) client. Safe to use in the browser.
 * RLS policies enforce read-only access to `published` rows.
 * Returns null when env vars are missing (e.g. first CI build before
 * Netlify env vars are set) so pages can render gracefully.
 */
export function getPublicClient(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export function requirePublicClient(): SupabaseClient {
  const client = getPublicClient();
  if (!client) {
    throw new Error(
      'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY env vars',
    );
  }
  return client;
}

/**
 * Admin (service role) client. Server-only. Bypasses RLS.
 */
export function getAdminClient(): SupabaseClient {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export function hasAdminEnv(): boolean {
  return Boolean(
    import.meta.env.PUBLIC_SUPABASE_URL &&
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// ─────────── Helpers pour les pages publiques ───────────

export async function listPublishedProperties(): Promise<
  Array<{
    property: Property;
    financials: PropertyFinancials;
    primary_photo: PropertyPhoto | null;
  }>
> {
  const supabase = getPublicClient();
  if (!supabase) return [];
  const { data: properties, error } = await supabase
    .from('properties')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (error) throw error;
  if (!properties) return [];

  const ids = properties.map((p) => p.id);
  const [{ data: financials }, { data: photos }] = await Promise.all([
    supabase.from('property_financials').select('*').in('id', ids),
    supabase
      .from('property_photos')
      .select('*')
      .in('property_id', ids)
      .order('sort_order', { ascending: true }),
  ]);

  return properties.map((property) => {
    const fin = (financials ?? []).find((f) => f.id === property.id);
    const propPhotos = (photos ?? []).filter(
      (ph) => ph.property_id === property.id,
    );
    const primary =
      propPhotos.find((ph) => ph.is_primary) ?? propPhotos[0] ?? null;
    return {
      property: property as Property,
      financials: (fin as PropertyFinancials) ?? zeroFinancials(property.id),
      primary_photo: primary as PropertyPhoto | null,
    };
  });
}

export async function getPropertyFull(
  slug: string,
): Promise<PropertyFull | null> {
  const supabase = getPublicClient();
  if (!supabase) return null;
  const { data: property, error } = await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw error;
  if (!property) return null;

  const [lotsRes, photosRes, transportsRes, reportsRes, finRes] =
    await Promise.all([
      supabase
        .from('property_lots')
        .select('*')
        .eq('property_id', property.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('property_photos')
        .select('*')
        .eq('property_id', property.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('property_transports')
        .select('*')
        .eq('property_id', property.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('property_annual_reports')
        .select('*')
        .eq('property_id', property.id)
        .order('year', { ascending: false }),
      supabase
        .from('property_financials')
        .select('*')
        .eq('id', property.id)
        .maybeSingle(),
    ]);

  return {
    property: property as Property,
    lots: (lotsRes.data ?? []) as PropertyLot[],
    photos: (photosRes.data ?? []) as PropertyPhoto[],
    transports: (transportsRes.data ?? []) as PropertyTransport[],
    annual_reports: (reportsRes.data ?? []) as PropertyAnnualReport[],
    financials: (finRes.data as PropertyFinancials) ?? zeroFinancials(property.id),
  };
}

function zeroFinancials(id: string): PropertyFinancials {
  return {
    id,
    sale_price: 0,
    notary_fees: 0,
    total_project: 0,
    monthly_rent_cc: 0,
    annual_rent_cc: 0,
    gross_yield: 0,
    project_yield: 0,
    total_lots: 0,
    rented_lots: 0,
  };
}

export async function insertLead(lead: {
  property_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}): Promise<Lead> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single();
  if (error) throw error;
  return data as Lead;
}
