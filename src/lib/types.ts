// ══════════════════════════════
export type PropertyStatus = 'draft' | 'published';

export type PropertyType =
  | 'colocation_meublee'
  | 'appartement_meuble'
  | 'appartement_nu';

export type ManagementType = 'solo' | 'plus';

export type DpeClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type LotStatus = 'loue' | 'vacant' | 'preavis';

export type PhotoSource = 'url' | 'upload';

export type LeadStatus = 'new' | 'contacted' | 'converted' | 'archived';

export interface Property {
  id: string;
  slug: string;
  status: PropertyStatus;

  title: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  neighborhood: string | null;
  property_type: PropertyType | null;
  total_surface: number | null;
  nb_rooms: number | null;
  floor: number | null;
  description: string | null;

  sale_price: number;
  notary_rate: number;
  notary_fees: number;
  total_project: number;

  dpe_energy_class: DpeClass | null;
  dpe_energy_value: number | null;
  dpe_ges_class: DpeClass | null;
  dpe_ges_value: number | null;
  dpe_energy_cost: number | null;
  heating_type: string | null;

  latitude: number | null;
  longitude: number | null;

  management_type: ManagementType | null;
  charges_included: string[] | null;

  oqoro_listing_url: string | null;
  sale_listing_url: string | null;
  matterport_url: string | null;

  meta_title: string | null;
  meta_description: string | null;

  // Phase 3 — données premium (toutes nullable)
  monthly_charges: number | null;
  yearly_property_tax: number | null;
  monthly_management_fee: number | null;
  oqoro_fees: number | null;
  market_data: PropertyMarketData | null;
  agent: PropertyAgent | null;

  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyMarketData {
  price_per_m2?: number;
  rent_per_m2?: number;
  yield_median?: number;
  tension?: string;
  relocation_delay?: string;
  price_evolution_5y?: number;
  price_delta_12m?: number;
  rent_delta_12m?: number;
}

export interface PropertyAgent {
  name?: string;
  role?: string;
  initials?: string;
  phone?: string;
}

export interface PropertyLot {
  id: string;
  property_id: string;
  name: string;
  surface: number | null;
  rent_hc: number;
  charges: number;
  status: LotStatus;
  sort_order: number;
}

export interface PropertyPhoto {
  id: string;
  property_id: string;
  url: string;
  source: PhotoSource;
  label: string | null;
  is_primary: boolean;
  sort_order: number;
}

export type TransportCategory =
  | 'transport'
  | 'education'
  | 'shopping'
  | 'park'
  | 'health'
  | 'other';

export interface PropertyTransport {
  id: string;
  property_id: string;
  name: string;
  transport_type: string | null;
  destination: string | null;
  time_label: string | null;
  category: TransportCategory | null;
  sort_order: number;
}

export interface PropertyAnnualReport {
  id: string;
  property_id: string;
  year: number;
  occupancy_rate: number | null;
  total_rent_collected: number | null;
  unpaid_amount: number;
}

export interface Lead {
  id: string;
  property_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
}

export interface PropertyFinancials {
  id: string;
  sale_price: number;
  notary_fees: number;
  total_project: number;
  monthly_rent_cc: number;
  annual_rent_cc: number;
  gross_yield: number;
  project_yield: number;
  total_lots: number;
  rented_lots: number;
}

export interface PropertyFull {
  property: Property;
  lots: PropertyLot[];
  photos: PropertyPhoto[];
  transports: PropertyTransport[];
  annual_reports: PropertyAnnualReport[];
  financials: PropertyFinancials;
}

// ─────────── Labels pour affichage ───────────

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  colocation_meublee: 'Colocation meublée',
  appartement_meuble: 'Appartement meublé',
  appartement_nu: 'Appartement nu',
};

export const MANAGEMENT_TYPE_LABELS: Record<ManagementType, string> = {
  solo: 'Oqoro Solo',
  plus: 'Oqoro Plus',
};

export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  loue: 'Loué',
  vacant: 'Vacant',
  preavis: 'En préavis',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  converted: 'Converti',
  archived: 'Archivé',
};

export const CHARGES_OPTIONS: { value: string; label: string }[] = [
  { value: 'eau', label: 'Eau' },
  { value: 'electricite', label: 'Électricité' },
  { value: 'gaz', label: 'Gaz' },
  { value: 'internet', label: 'Internet' },
  { value: 'menage', label: 'Ménage' },
  { value: 'assurance', label: 'Assurance habitation' },
  { value: 'taxe_ordures', label: 'Taxe ordures ménagères' },
];
