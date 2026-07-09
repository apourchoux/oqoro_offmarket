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

  // Taux d'occupation locatif du quartier (0–100). Donnée de marché renseignée
  // manuellement côté admin — sert la case "Occupation zone" de la fiche bien
  // et la moyenne affichée sur la home.
  zone_occupancy_rate: number | null;

  // Opt-in admin pour l'emplacement « vedette » de la home. Quand plusieurs
  // biens sont cochés, la home en tire un au hasard à chaque chargement.
  is_featured: boolean;

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

// ─────────── Campagnes email ───────────

export type ContactType = 'proprietaire' | 'investisseur' | 'mixte';

export type ContactSource = 'manuel' | 'import_csv' | 'lead';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export type CampaignContentMode = 'property' | 'custom';

export type CampaignTargetType = 'tous' | 'proprietaire' | 'investisseur';

export type RecipientStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed';

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  contact_type: ContactType;
  // Codes département ('69', '2A', '971'...). Vide = toute la France.
  zones: string[];
  notes: string | null;
  source: ContactSource;
  lead_id: string | null;
  subscribed: boolean;
  unsubscribed_at: string | null;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  intro_text: string | null;
  property_id: string | null;
  target_contact_type: CampaignTargetType;
  // null = toute la France ; sinon codes département ciblés.
  target_zones: string[] | null;
  // null = ciblage segment (type × zones) ; sinon audience = union des listes.
  target_list_ids: string[] | null;
  status: CampaignStatus;
  total_recipients: number;
  error: string | null;
  sent_at: string | null;
  // Expéditeur nommé (défaut : RESEND_FROM) + reply-to optionnel.
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  // Preheader affiché dans la boîte de réception.
  preview_text: string | null;
  // Envoi programmé (statut 'scheduled').
  scheduled_at: string | null;
  // 'property' = template bien généré ; 'custom' = HTML libre (variables).
  content_mode: CampaignContentMode;
  custom_html: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactList {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  html: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id: string;
  email: string;
  status: RecipientStatus;
  resend_email_id: string | null;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  created_at: string;
}

export interface CampaignStats {
  campaign_id: string;
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
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

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  proprietaire: 'Propriétaire',
  investisseur: 'Investisseur',
  mixte: 'Les deux',
};

export const CONTACT_SOURCE_LABELS: Record<ContactSource, string> = {
  manuel: 'Manuel',
  import_csv: 'Import CSV',
  lead: 'Lead',
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Brouillon',
  scheduled: 'Programmée',
  sending: 'Envoi en cours',
  sent: 'Envoyée',
  failed: 'Échec',
};

export const CAMPAIGN_TARGET_TYPE_LABELS: Record<CampaignTargetType, string> = {
  tous: 'Tous les contacts',
  proprietaire: 'Propriétaires',
  investisseur: 'Investisseurs',
};

export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  pending: 'En attente',
  sent: 'Envoyé',
  delivered: 'Délivré',
  opened: 'Ouvert',
  clicked: 'Cliqué',
  bounced: 'Rejeté',
  complained: 'Plainte',
  failed: 'Échec',
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
