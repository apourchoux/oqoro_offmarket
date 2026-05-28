// Mock data for /preview and tests. Not used in production.

import type {
  Property,
  PropertyLot,
  PropertyPhoto,
  PropertyTransport,
  PropertyAnnualReport,
  PropertyFinancials,
  PropertyFull,
} from './types';

export const mockProperty: Property = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: '83-cours-richard-vitton-lyon-3e',
  status: 'published',
  title: 'Colocation meublée 110 m² — 83 Cours Richard Vitton',
  address: '83 Cours Richard Vitton',
  city: 'Lyon',
  postal_code: '69003',
  neighborhood: 'Montchat',
  property_type: 'colocation_meublee',
  total_surface: 110,
  nb_rooms: 5,
  floor: 2,
  description:
    "Colocation meublée de 4 chambres dans un immeuble de standing du 3e arrondissement de Lyon. Entièrement rénovée en 2023, meublée par nos équipes avec du mobilier de qualité. Quartier Montchat très prisé, à 5 minutes à pied du métro Grange Blanche.",
  sale_price: 485000,
  notary_rate: 0.08,
  notary_fees: 38800,
  total_project: 523800,
  dpe_energy_class: 'D',
  dpe_energy_value: 210,
  dpe_ges_class: 'C',
  dpe_ges_value: 28,
  dpe_energy_cost: 1580,
  heating_type: 'Gaz individuel',
  latitude: 45.7485,
  longitude: 4.8751,
  management_type: 'plus',
  charges_included: ['eau', 'electricite', 'internet', 'assurance'],
  oqoro_listing_url: 'https://oqoro.com/annonce/12345',
  sale_listing_url: null,
  matterport_url: 'https://my.matterport.com/show/?m=xxxxxxxxxxx',
  meta_title:
    'Colocation 110m² Lyon 3e à vendre | Rendement 7,2% | OQORO Off Market',
  meta_description:
    "Colocation meublée en gestion OQORO à vendre. 4 chambres louées, revenus locatifs certifiés, rendement brut 7,2%.",
  monthly_charges: null,
  yearly_property_tax: null,
  monthly_management_fee: null,
  oqoro_fees: null,
  market_data: null,
  agent: null,
  zone_occupancy_rate: 96,
  is_featured: false,
  published_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockLots: PropertyLot[] = [
  {
    id: 'l1',
    property_id: mockProperty.id,
    name: 'Chambre 1 — Parquet',
    surface: 14,
    rent_hc: 560,
    charges: 80,
    status: 'loue',
    sort_order: 0,
  },
  {
    id: 'l2',
    property_id: mockProperty.id,
    name: 'Chambre 2 — Balcon',
    surface: 16,
    rent_hc: 620,
    charges: 80,
    status: 'loue',
    sort_order: 1,
  },
  {
    id: 'l3',
    property_id: mockProperty.id,
    name: 'Chambre 3 — Mezzanine',
    surface: 18,
    rent_hc: 680,
    charges: 80,
    status: 'loue',
    sort_order: 2,
  },
  {
    id: 'l4',
    property_id: mockProperty.id,
    name: 'Chambre 4 — Master',
    surface: 20,
    rent_hc: 720,
    charges: 80,
    status: 'preavis',
    sort_order: 3,
  },
];

export const mockPhotos: PropertyPhoto[] = [
  {
    id: 'p1',
    property_id: mockProperty.id,
    url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',
    source: 'url',
    label: 'Salon',
    is_primary: true,
    sort_order: 0,
  },
  {
    id: 'p2',
    property_id: mockProperty.id,
    url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
    source: 'url',
    label: 'Cuisine',
    is_primary: false,
    sort_order: 1,
  },
  {
    id: 'p3',
    property_id: mockProperty.id,
    url: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800',
    source: 'url',
    label: 'Chambre 1',
    is_primary: false,
    sort_order: 2,
  },
  {
    id: 'p4',
    property_id: mockProperty.id,
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
    source: 'url',
    label: 'Chambre 2',
    is_primary: false,
    sort_order: 3,
  },
];

export const mockTransports: PropertyTransport[] = [
  {
    id: 't1',
    property_id: mockProperty.id,
    name: 'Métro Grange Blanche',
    transport_type: 'Métro D',
    destination: null,
    time_label: '5 min à pied',
    category: 'transport',
    sort_order: 0,
  },
  {
    id: 't2',
    property_id: mockProperty.id,
    name: 'Tram T2 — Vinatier',
    transport_type: 'Tramway',
    destination: null,
    time_label: '8 min à pied',
    category: 'transport',
    sort_order: 1,
  },
  {
    id: 't3',
    property_id: mockProperty.id,
    name: 'Gare Part-Dieu',
    transport_type: 'SNCF',
    destination: null,
    time_label: '12 min en métro',
    category: 'transport',
    sort_order: 2,
  },
];

export const mockReports: PropertyAnnualReport[] = [
  {
    id: 'r1',
    property_id: mockProperty.id,
    year: 2025,
    occupancy_rate: 98.5,
    total_rent_collected: 31680,
    unpaid_amount: 0,
  },
  {
    id: 'r2',
    property_id: mockProperty.id,
    year: 2024,
    occupancy_rate: 100,
    total_rent_collected: 32160,
    unpaid_amount: 0,
  },
  {
    id: 'r3',
    property_id: mockProperty.id,
    year: 2023,
    occupancy_rate: 96.2,
    total_rent_collected: 30912,
    unpaid_amount: 320,
  },
];

const monthly_rent_cc = mockLots.reduce(
  (acc, lot) => acc + lot.rent_hc + lot.charges,
  0,
);

export const mockFinancials: PropertyFinancials = {
  id: mockProperty.id,
  sale_price: mockProperty.sale_price,
  notary_fees: mockProperty.notary_fees,
  total_project: mockProperty.total_project,
  monthly_rent_cc,
  annual_rent_cc: monthly_rent_cc * 12,
  gross_yield: Math.round(
    ((monthly_rent_cc * 12) / mockProperty.sale_price) * 10000,
  ) / 100,
  project_yield: Math.round(
    ((monthly_rent_cc * 12) / mockProperty.total_project) * 10000,
  ) / 100,
  total_lots: mockLots.length,
  rented_lots: mockLots.filter((l) => l.status === 'loue').length,
};

export const mockPropertyFull: PropertyFull = {
  property: mockProperty,
  lots: mockLots,
  photos: mockPhotos,
  transports: mockTransports,
  annual_reports: mockReports,
  financials: mockFinancials,
};
