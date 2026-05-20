import type { SupabaseClient } from '@supabase/supabase-js';
import { safeHttpUrl } from '../../../../lib/security';

const STATUS_VALUES = ['draft', 'published'] as const;
const PROPERTY_TYPE_VALUES = [
  'colocation_meublee',
  'appartement_meuble',
  'appartement_nu',
] as const;
const MANAGEMENT_TYPE_VALUES = ['solo', 'plus'] as const;
const DPE_VALUES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const LOT_STATUS_VALUES = ['loue', 'vacant', 'preavis'] as const;
const TRANSPORT_CATEGORY_VALUES = [
  'transport',
  'education',
  'shopping',
  'park',
  'health',
  'other',
] as const;
const CHARGES_VALUES = [
  'eau',
  'electricite',
  'gaz',
  'internet',
  'menage',
  'assurance',
  'taxe_ordures',
] as const;

// Limites souples — empêchent un payload de 10 Mo d'arriver en base via une
// route admin. Les valeurs sont alignées sur ce que la fiche front affiche
// raisonnablement.
const MAX_TEXT_SHORT = 200;
const MAX_TEXT_MED = 500;
const MAX_TEXT_LONG = 10_000;
const MAX_URL = 2048;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function strRequired(v: unknown, max: number): string {
  const s = str(v, max);
  return s ?? '';
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

function numRequired(v: unknown, fallback = 0): number {
  return num(v) ?? fallback;
}

function intOrNull(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

function enumOrNull<T extends string>(v: unknown, values: readonly T[]): T | null {
  if (typeof v !== 'string') return null;
  return (values as readonly string[]).includes(v) ? (v as T) : null;
}

function urlOrNull(v: unknown): string | null {
  const s = str(v, MAX_URL);
  return s ? safeHttpUrl(s) : null;
}

function chargesArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.filter(
    (x): x is string => typeof x === 'string' && (CHARGES_VALUES as readonly string[]).includes(x),
  );
  return ok.length > 0 ? Array.from(new Set(ok)) : null;
}

function jsonObjectOrNull(v: unknown, maxKeys = 30): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>).slice(0, maxKeys);
  if (entries.length === 0) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [k, val] of entries) {
    if (typeof k !== 'string' || k.length > 64) continue;
    if (typeof val === 'string') cleaned[k] = val.slice(0, MAX_TEXT_MED);
    else if (typeof val === 'number' && Number.isFinite(val)) cleaned[k] = val;
    else if (typeof val === 'boolean') cleaned[k] = val;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export interface SanitizedProperty {
  slug: string;
  status: 'draft' | 'published';
  title: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  neighborhood: string | null;
  property_type: (typeof PROPERTY_TYPE_VALUES)[number] | null;
  total_surface: number | null;
  nb_rooms: number | null;
  floor: number | null;
  description: string | null;
  sale_price: number;
  notary_rate: number;
  dpe_energy_class: (typeof DPE_VALUES)[number] | null;
  dpe_energy_value: number | null;
  dpe_ges_class: (typeof DPE_VALUES)[number] | null;
  dpe_ges_value: number | null;
  dpe_energy_cost: number | null;
  heating_type: string | null;
  latitude: number | null;
  longitude: number | null;
  management_type: (typeof MANAGEMENT_TYPE_VALUES)[number] | null;
  charges_included: string[] | null;
  oqoro_listing_url: string | null;
  sale_listing_url: string | null;
  matterport_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  monthly_charges: number | null;
  yearly_property_tax: number | null;
  monthly_management_fee: number | null;
  oqoro_fees: number | null;
  market_data: Record<string, unknown> | null;
  agent: Record<string, unknown> | null;
  zone_occupancy_rate: number | null;
  published_at?: string | null;
}

/**
 * Whitelist stricte des colonnes que l'API admin accepte. Toute clé non listée
 * est silencieusement ignorée — protège des mass-assignments lors de l'ajout
 * d'une colonne sensible dans la table `properties`.
 */
export function sanitizeProperty(input: any): SanitizedProperty {
  const slugRaw = strRequired(input?.slug, 120);
  return {
    slug: slugify(slugRaw),
    status: enumOrNull(input?.status, STATUS_VALUES) ?? 'draft',
    title: strRequired(input?.title, MAX_TEXT_SHORT),
    address: str(input?.address, MAX_TEXT_SHORT),
    city: str(input?.city, MAX_TEXT_SHORT),
    postal_code: str(input?.postal_code, 16),
    neighborhood: str(input?.neighborhood, MAX_TEXT_SHORT),
    property_type: enumOrNull(input?.property_type, PROPERTY_TYPE_VALUES),
    total_surface: num(input?.total_surface),
    nb_rooms: intOrNull(input?.nb_rooms),
    floor: intOrNull(input?.floor),
    description: str(input?.description, MAX_TEXT_LONG),
    sale_price: numRequired(input?.sale_price, 0),
    notary_rate: numRequired(input?.notary_rate, 0.08),
    dpe_energy_class: enumOrNull(input?.dpe_energy_class, DPE_VALUES),
    dpe_energy_value: num(input?.dpe_energy_value),
    dpe_ges_class: enumOrNull(input?.dpe_ges_class, DPE_VALUES),
    dpe_ges_value: num(input?.dpe_ges_value),
    dpe_energy_cost: num(input?.dpe_energy_cost),
    heating_type: str(input?.heating_type, MAX_TEXT_SHORT),
    latitude: num(input?.latitude),
    longitude: num(input?.longitude),
    management_type: enumOrNull(input?.management_type, MANAGEMENT_TYPE_VALUES),
    charges_included: chargesArray(input?.charges_included),
    oqoro_listing_url: urlOrNull(input?.oqoro_listing_url),
    sale_listing_url: urlOrNull(input?.sale_listing_url),
    matterport_url: urlOrNull(input?.matterport_url),
    meta_title: str(input?.meta_title, MAX_TEXT_SHORT),
    meta_description: str(input?.meta_description, MAX_TEXT_MED),
    monthly_charges: num(input?.monthly_charges),
    yearly_property_tax: num(input?.yearly_property_tax),
    monthly_management_fee: num(input?.monthly_management_fee),
    oqoro_fees: num(input?.oqoro_fees),
    market_data: jsonObjectOrNull(input?.market_data),
    agent: jsonObjectOrNull(input?.agent, 10),
    zone_occupancy_rate: pct(input?.zone_occupancy_rate),
  };
}

function sanitizeLot(input: any, sortOrder: number, propertyId: string) {
  return {
    property_id: propertyId,
    name: strRequired(input?.name, MAX_TEXT_SHORT),
    surface: num(input?.surface),
    rent_hc: numRequired(input?.rent_hc, 0),
    charges: numRequired(input?.charges, 0),
    status: enumOrNull(input?.status, LOT_STATUS_VALUES) ?? 'vacant',
    sort_order: sortOrder,
  };
}

function sanitizePhoto(input: any, sortOrder: number, propertyId: string) {
  const url = urlOrNull(input?.url);
  if (!url) return null;
  return {
    property_id: propertyId,
    url,
    source: input?.source === 'upload' ? 'upload' : 'url',
    label: str(input?.label, MAX_TEXT_SHORT),
    is_primary: Boolean(input?.is_primary),
    sort_order: sortOrder,
  };
}

function sanitizeTransport(input: any, sortOrder: number, propertyId: string) {
  return {
    property_id: propertyId,
    name: strRequired(input?.name, MAX_TEXT_SHORT),
    transport_type: str(input?.transport_type, MAX_TEXT_SHORT),
    destination: str(input?.destination, MAX_TEXT_SHORT),
    time_label: str(input?.time_label, 64),
    category: enumOrNull(input?.category, TRANSPORT_CATEGORY_VALUES),
    sort_order: sortOrder,
  };
}

function sanitizeReport(input: any, propertyId: string) {
  const year = intOrNull(input?.year);
  if (year === null || year < 1900 || year > 3000) return null;
  return {
    property_id: propertyId,
    year,
    occupancy_rate: num(input?.occupancy_rate),
    total_rent_collected: num(input?.total_rent_collected),
    unpaid_amount: numRequired(input?.unpaid_amount, 0),
  };
}

export async function syncChildren(
  supabase: SupabaseClient,
  propertyId: string,
  lots: unknown,
  photos: unknown,
  transports: unknown,
  reports: unknown,
): Promise<string | null> {
  await Promise.all([
    supabase.from('property_lots').delete().eq('property_id', propertyId),
    supabase.from('property_photos').delete().eq('property_id', propertyId),
    supabase.from('property_transports').delete().eq('property_id', propertyId),
    supabase.from('property_annual_reports').delete().eq('property_id', propertyId),
  ]);

  const lotRows = (Array.isArray(lots) ? lots : [])
    .slice(0, 50)
    .map((l, i) => sanitizeLot(l, i, propertyId));
  const photoRows = (Array.isArray(photos) ? photos : [])
    .slice(0, 100)
    .map((p, i) => sanitizePhoto(p, i, propertyId))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const transportRows = (Array.isArray(transports) ? transports : [])
    .slice(0, 50)
    .map((t, i) => sanitizeTransport(t, i, propertyId));
  const reportRows = (Array.isArray(reports) ? reports : [])
    .slice(0, 50)
    .map((r) => sanitizeReport(r, propertyId))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (lotRows.length) {
    const { error } = await supabase.from('property_lots').insert(lotRows);
    if (error) {
      console.error('[admin sync] lots');
      return 'Erreur lots';
    }
  }
  if (photoRows.length) {
    const { error } = await supabase.from('property_photos').insert(photoRows);
    if (error) {
      console.error('[admin sync] photos');
      return 'Erreur photos';
    }
  }
  if (transportRows.length) {
    const { error } = await supabase.from('property_transports').insert(transportRows);
    if (error) {
      console.error('[admin sync] transports');
      return 'Erreur transports';
    }
  }
  if (reportRows.length) {
    const { error } = await supabase.from('property_annual_reports').insert(reportRows);
    if (error) {
      console.error('[admin sync] reports');
      return 'Erreur rapports';
    }
  }
  return null;
}
