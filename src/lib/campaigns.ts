// Helpers partagés pour les campagnes email. Module pur (aucun accès env) :
// utilisé par les endpoints Astro ET la background function Netlify, pour
// garantir que le compteur de destinataires et l'envoi voient exactement le
// même segment.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Campaign,
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

export type AudienceTarget = Pick<
  Campaign,
  'target_contact_type' | 'target_zones' | 'target_list_ids'
>;

/**
 * Construit la requête d'audience d'une campagne — LE point unique utilisé
 * par le compteur du composer ET le snapshot du worker, pour garantir que
 * les deux voient exactement le même ensemble de contacts.
 *
 * Deux modes exclusifs :
 * - `target_list_ids` non vide → union des membres abonnés des listes
 *   (l'embed PostgREST ne duplique pas un contact présent dans 2 listes) ;
 * - sinon → segment type × zones (applySegmentFilter).
 */
export function audienceQuery(
  supabase: SupabaseClient<any, any, any, any, any>,
  target: AudienceTarget,
  select: string,
  options?: { count?: 'exact'; head?: boolean },
): any {
  if (target.target_list_ids && target.target_list_ids.length > 0) {
    const embedded = `${select}, contact_list_members!inner(list_id)`;
    return supabase
      .from('contacts')
      .select(embedded, options)
      .in('contact_list_members.list_id', target.target_list_ids)
      .eq('subscribed', true);
  }
  return applySegmentFilter(
    supabase.from('contacts').select(select, options),
    target.target_contact_type,
    target.target_zones,
  );
}

/**
 * Données du composer : biens publiés, listes (avec compteurs) et templates.
 * Utilisé par /admin/campagnes/new et /admin/campagnes/[id] (mode brouillon).
 */
export async function loadComposerData(
  supabase: SupabaseClient<any, any, any, any, any>,
): Promise<{
  properties: Awaited<ReturnType<typeof listComposerProperties>>;
  lists: Array<{ id: string; name: string; member_count: number }>;
  templates: Array<{ id: string; name: string; html: string }>;
}> {
  const [properties, { data: lists }, { data: memberships }, { data: templates }] =
    await Promise.all([
      listComposerProperties(supabase),
      supabase.from('contact_lists').select('id, name').order('name'),
      supabase.from('contact_list_members').select('list_id'),
      supabase
        .from('email_templates')
        .select('id, name, html')
        .order('updated_at', { ascending: false }),
    ]);

  const counts = new Map<string, number>();
  for (const m of memberships ?? []) {
    const listId = (m as any).list_id as string;
    counts.set(listId, (counts.get(listId) ?? 0) + 1);
  }

  return {
    properties,
    lists: (lists ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      member_count: counts.get(l.id) ?? 0,
    })),
    templates: (templates ?? []) as Array<{ id: string; name: string; html: string }>,
  };
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
