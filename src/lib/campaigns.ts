// Helpers partagés pour les campagnes email. Module pur (aucun accès env) :
// utilisé par les endpoints Astro ET la background function Netlify, pour
// garantir que le compteur de destinataires et l'envoi voient exactement le
// même segment.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CampaignTargetType,
  Property,
  PropertyFinancials,
} from './types';

/**
 * Applique le filtre de segment sur une requête `contacts` déjà construite
 * (le `.select(...)` reste à la charge de l'appelant).
 *
 * Règles :
 * - seuls les contacts abonnés sont ciblés ;
 * - un ciblage par type inclut les contacts `mixte` ;
 * - `zones` de ciblage null/vide = toute la France ;
 * - un contact dont `zones = '{}'` cherche partout → matche tout ciblage.
 */
export function applySegmentFilter<T>(
  query: T,
  targetType: CampaignTargetType,
  targetZones: string[] | null,
): T {
  let q: any = (query as any).eq('subscribed', true);
  if (targetType !== 'tous') {
    q = q.in('contact_type', [targetType, 'mixte']);
  }
  if (targetZones && targetZones.length > 0) {
    // `ov` = overlap (au moins un département en commun) ; `eq.{}` couvre les
    // contacts sans zone (= toute la France).
    q = q.or(`zones.ov.{${targetZones.join(',')}},zones.eq.{}`);
  }
  return q as T;
}

/**
 * Liste compacte des biens publiés pour le sélecteur du composer
 * (photo principale + prix + rendement brut).
 */
export async function listComposerProperties(supabase: SupabaseClient): Promise<
  Array<{
    id: string;
    title: string;
    city: string | null;
    photo_url: string | null;
    sale_price: number;
    gross_yield: number;
  }>
> {
  const { data: properties } = await supabase
    .from('properties')
    .select('id, title, city, sale_price')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (!properties || properties.length === 0) return [];

  const ids = properties.map((p: any) => p.id);
  const [{ data: financials }, { data: photos }] = await Promise.all([
    supabase.from('property_financials').select('id, gross_yield').in('id', ids),
    supabase
      .from('property_photos')
      .select('property_id, url, is_primary, sort_order')
      .in('property_id', ids),
  ]);

  return properties.map((p: any) => {
    const candidates = (photos ?? []).filter((ph: any) => ph.property_id === p.id);
    candidates.sort(
      (a: any, b: any) =>
        (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.sort_order - b.sort_order,
    );
    return {
      id: p.id,
      title: p.title,
      city: p.city,
      photo_url: candidates[0]?.url ?? null,
      sale_price: p.sale_price,
      gross_yield:
        (financials ?? []).find((f: any) => f.id === p.id)?.gross_yield ?? 0,
    };
  });
}

export interface CampaignPropertyData {
  property: Property;
  financials: PropertyFinancials | null;
  photoUrl: string | null;
}

/**
 * Charge le bien d'une campagne avec ses financials (vue property_financials)
 * et sa photo principale — les trois entrées du template email.
 */
export async function loadCampaignPropertyData(
  supabase: SupabaseClient<any, any, any, any, any>,
  propertyId: string,
): Promise<CampaignPropertyData | null> {
  const [{ data: property }, { data: financials }, { data: photos }] =
    await Promise.all([
      supabase.from('properties').select('*').eq('id', propertyId).maybeSingle(),
      supabase
        .from('property_financials')
        .select('*')
        .eq('id', propertyId)
        .maybeSingle(),
      supabase
        .from('property_photos')
        .select('url, is_primary, sort_order')
        .eq('property_id', propertyId)
        .order('sort_order', { ascending: true }),
    ]);
  if (!property) return null;
  const sorted = [...(photos ?? [])].sort(
    (a: any, b: any) =>
      (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.sort_order - b.sort_order,
  );
  return {
    property: property as Property,
    financials: (financials as PropertyFinancials) ?? null,
    photoUrl: sorted[0]?.url ?? null,
  };
}
