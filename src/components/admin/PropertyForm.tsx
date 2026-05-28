import { useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  Property,
  PropertyAgent,
  PropertyLot,
  PropertyMarketData,
  PropertyPhoto,
  PropertyTransport,
  PropertyAnnualReport,
  LotStatus,
  DpeClass,
  PropertyType,
  ManagementType,
} from '../../lib/types';
import { CHARGES_OPTIONS } from '../../lib/types';
import { formatEur, slugify } from '../../lib/format';

interface Props {
  mode: 'create' | 'edit';
  initialProperty?: Property;
  initialLots?: PropertyLot[];
  initialPhotos?: PropertyPhoto[];
  initialTransports?: PropertyTransport[];
  initialReports?: PropertyAnnualReport[];
}

type LotDraft = Omit<PropertyLot, 'property_id'> & { _isNew?: boolean };
type PhotoDraft = Omit<PropertyPhoto, 'property_id'> & { _isNew?: boolean };
type TransportDraft = Omit<PropertyTransport, 'property_id'> & { _isNew?: boolean };
type ReportDraft = Omit<PropertyAnnualReport, 'property_id'> & { _isNew?: boolean };

const DPE_CLASSES: DpeClass[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const STEPS = [
  { id: 1, label: 'Le bien' },
  { id: 2, label: 'Photos' },
  { id: 3, label: 'Argent' },
  { id: 4, label: 'Quartier & énergie' },
  { id: 5, label: 'Présentation' },
] as const;
type StepId = (typeof STEPS)[number]['id'];

function blankLot(order: number): LotDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    surface: null,
    rent_hc: 0,
    charges: 0,
    status: 'vacant',
    sort_order: order,
    _isNew: true,
  };
}

function blankPhoto(order: number): PhotoDraft {
  return {
    id: crypto.randomUUID(),
    url: '',
    source: 'url',
    label: null,
    is_primary: order === 0,
    sort_order: order,
    _isNew: true,
  };
}

function blankTransport(order: number): TransportDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    transport_type: null,
    destination: null,
    time_label: null,
    category: null,
    sort_order: order,
    _isNew: true,
  };
}

function blankReport(): ReportDraft {
  return {
    id: crypto.randomUUID(),
    year: new Date().getFullYear() - 1,
    occupancy_rate: null,
    total_rent_collected: null,
    unpaid_amount: 0,
    _isNew: true,
  };
}

export default function PropertyForm({
  mode,
  initialProperty,
  initialLots = [],
  initialPhotos = [],
  initialTransports = [],
  initialReports = [],
}: Props) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentStep, setCurrentStep] = useState<StepId>(1);

  function goToStep(step: StepId) {
    setCurrentStep(step);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === STEPS.length;

  const [property, setProperty] = useState<Partial<Property>>(
    initialProperty ?? {
      status: 'draft',
      notary_rate: 0.08,
      sale_price: 0,
      title: '',
      slug: '',
      management_type: 'plus',
    },
  );
  const [lots, setLots] = useState<LotDraft[]>(
    initialLots.length > 0 ? initialLots : [blankLot(0)],
  );
  const [photos, setPhotos] = useState<PhotoDraft[]>(initialPhotos);
  const [transports, setTransports] = useState<TransportDraft[]>(initialTransports);
  const [reports, setReports] = useState<ReportDraft[]>(initialReports);

  const financials = useMemo(() => {
    const price = Number(property.sale_price ?? 0);
    const rate = Number(property.notary_rate ?? 0.08);
    const notary_fees = Math.round(price * rate);
    const total_project = Math.round(price * (1 + rate));
    const monthly_rent_cc = lots.reduce(
      (acc, l) => acc + Number(l.rent_hc) + Number(l.charges),
      0,
    );
    const annual = monthly_rent_cc * 12;
    const gross_yield = price > 0 ? (annual / price) * 100 : 0;
    const project_yield = total_project > 0 ? (annual / total_project) * 100 : 0;
    return {
      notary_fees,
      total_project,
      monthly_rent_cc,
      annual_rent_cc: annual,
      gross_yield,
      project_yield,
    };
  }, [property.sale_price, property.notary_rate, lots]);

  function set<K extends keyof Property>(key: K, value: Property[K]) {
    setProperty((p) => ({ ...p, [key]: value }));
  }

  function setMarket<K extends keyof PropertyMarketData>(
    key: K,
    value: PropertyMarketData[K] | undefined,
  ) {
    setProperty((p) => {
      const next: PropertyMarketData = { ...(p.market_data ?? {}) };
      if (value === undefined || value === '' || (typeof value === 'number' && Number.isNaN(value))) {
        delete next[key];
      } else {
        next[key] = value;
      }
      const isEmpty = Object.keys(next).length === 0;
      return { ...p, market_data: isEmpty ? null : next };
    });
  }

  function setAgent<K extends keyof PropertyAgent>(
    key: K,
    value: PropertyAgent[K] | undefined,
  ) {
    setProperty((p) => {
      const next: PropertyAgent = { ...(p.agent ?? {}) };
      if (value === undefined || value === '') {
        delete next[key];
      } else {
        next[key] = value;
      }
      const isEmpty = Object.keys(next).length === 0;
      return { ...p, agent: isEmpty ? null : next };
    });
  }

  function autoSlug() {
    const parts = [property.city ?? '', property.address ?? ''].filter(Boolean);
    if (parts.length === 0) return;
    set('slug', slugify(parts.join(' ')));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>, publish: boolean) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        property: {
          ...property,
          status: publish ? 'published' : (property.status ?? 'draft'),
        },
        lots,
        photos,
        transports,
        reports,
        publish,
      };
      const endpoint =
        mode === 'create'
          ? '/admin/api/properties/create'
          : `/admin/api/properties/${initialProperty?.id}/update`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Erreur inconnue');
      setMessage({ type: 'success', text: publish ? 'Bien publié.' : 'Bien enregistré.' });
      if (mode === 'create' && data.id) {
        setTimeout(() => {
          window.location.href = `/admin/biens/${data.id}`;
        }, 600);
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadPhoto(file: File) {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const urlRes = await fetch('/admin/api/photo-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, ext }),
    });
    const urlData = await urlRes.json();
    if (!urlRes.ok) throw new Error(urlData?.error ?? 'Signed URL failed');

    const upload = await fetch(urlData.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    });
    if (!upload.ok) throw new Error(`Upload failed (${upload.status})`);

    return urlData.publicUrl as string;
  }

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-10">
      {message && (
        <div
          className={
            message.type === 'success'
              ? 'p-3 rounded-btn bg-oq-green-soft text-green-800 text-[14px]'
              : 'p-3 rounded-btn bg-oq-red-soft text-red-800 text-[14px]'
          }
        >
          {message.text}
        </div>
      )}

      <Stepper currentStep={currentStep} onChange={goToStep} />

      {currentStep === 1 && (
      <Section title="Informations générales">
        <Grid2>
          <Field label="Titre">
            <input
              className="oq-input"
              required
              value={property.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <Field label="Slug (URL)">
            <div className="flex gap-2">
              <input
                className="oq-input"
                required
                value={property.slug ?? ''}
                onChange={(e) => set('slug', e.target.value)}
              />
              <button type="button" onClick={autoSlug} className="oq-btn-secondary shrink-0">
                Auto
              </button>
            </div>
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Adresse">
            <input className="oq-input" value={property.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Quartier">
            <input className="oq-input" value={property.neighborhood ?? ''} onChange={(e) => set('neighborhood', e.target.value)} />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Ville">
            <input className="oq-input" value={property.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Code postal">
            <input className="oq-input" value={property.postal_code ?? ''} onChange={(e) => set('postal_code', e.target.value)} />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Type de bien">
            <select
              className="oq-input"
              value={property.property_type ?? ''}
              onChange={(e) => set('property_type', (e.target.value || null) as PropertyType | null)}
            >
              <option value="">—</option>
              <option value="colocation_meublee">Colocation meublée</option>
              <option value="appartement_meuble">Appartement meublé</option>
              <option value="appartement_nu">Appartement nu</option>
            </select>
          </Field>
          <Field label="Surface totale (m²)">
            <input
              className="oq-input"
              type="number"
              step="0.1"
              value={property.total_surface ?? ''}
              onChange={(e) => set('total_surface', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Nombre de pièces">
            <input
              className="oq-input"
              type="number"
              value={property.nb_rooms ?? ''}
              onChange={(e) => set('nb_rooms', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Étage">
            <input
              className="oq-input"
              type="number"
              value={property.floor ?? ''}
              onChange={(e) => set('floor', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Grid2>
        <Field label="Description">
          <textarea
            className="oq-input min-h-[140px]"
            value={property.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </Section>
      )}

      {currentStep === 2 && (
      <Section title="Photos">
        <PhotoManager
          photos={photos}
          onChange={setPhotos}
          onUpload={handleUploadPhoto}
        />
      </Section>
      )}

      {currentStep === 3 && (
      <Section title="Données financières">
        <Grid2>
          <Field label="Prix de vente (€)">
            <input
              className="oq-input"
              type="number"
              required
              value={property.sale_price ?? 0}
              onChange={(e) => set('sale_price', Number(e.target.value))}
            />
          </Field>
          <Field label="Taux frais de notaire">
            <input
              className="oq-input"
              type="number"
              step="0.001"
              value={property.notary_rate ?? 0.08}
              onChange={(e) => set('notary_rate', Number(e.target.value))}
            />
          </Field>
        </Grid2>
        <div className="bg-oq-bg rounded-btn p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
          <Stat label="Frais notaire" value={formatEur(financials.notary_fees)} />
          <Stat label="Total projet" value={formatEur(financials.total_project)} />
          <Stat label="Rendement brut" value={`${financials.gross_yield.toFixed(2)} %`} />
          <Stat label="Rendement projet" value={`${financials.project_yield.toFixed(2)} %`} />
        </div>
      </Section>
      )}

      {currentStep === 3 && (
      <Section title="Occupation locative">
        <p className="text-[13px] text-oq-muted">
          Taux d'occupation locatif moyen du quartier (moyenne OQORO sur l'ensemble
          des lots en gestion sur la zone). Sert au calcul de rentabilité et aux
          stats home / fiche bien. Laisse vide si tu n'as pas de référence.
        </p>
        <Grid2>
          <Field label="Taux d'occupation du quartier (%)">
            <input
              className="oq-input"
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="ex. 95"
              value={property.zone_occupancy_rate ?? ''}
              onChange={(e) =>
                set(
                  'zone_occupancy_rate',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </Field>
        </Grid2>
      </Section>
      )}

      {currentStep === 3 && (
      <Section title="Lots">
        <LotRepeater lots={lots} onChange={setLots} />
      </Section>
      )}

      {currentStep === 5 && (
      <Section title="Historique locatif">
        <ReportRepeater reports={reports} onChange={setReports} />
      </Section>
      )}

      {currentStep === 4 && (
      <Section title="DPE">
        <Grid2>
          <Field label="Classe énergie">
            <select
              className="oq-input"
              value={property.dpe_energy_class ?? ''}
              onChange={(e) => set('dpe_energy_class', (e.target.value || null) as DpeClass | null)}
            >
              <option value="">—</option>
              {DPE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Valeur énergie (kWh/m²/an)">
            <input
              className="oq-input"
              type="number"
              value={property.dpe_energy_value ?? ''}
              onChange={(e) => set('dpe_energy_value', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Classe GES">
            <select
              className="oq-input"
              value={property.dpe_ges_class ?? ''}
              onChange={(e) => set('dpe_ges_class', (e.target.value || null) as DpeClass | null)}
            >
              <option value="">—</option>
              {DPE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Valeur GES (kg CO₂/m²/an)">
            <input
              className="oq-input"
              type="number"
              value={property.dpe_ges_value ?? ''}
              onChange={(e) => set('dpe_ges_value', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Coût énergie (€/an)">
            <input
              className="oq-input"
              type="number"
              value={property.dpe_energy_cost ?? ''}
              onChange={(e) => set('dpe_energy_cost', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Type de chauffage">
            <input
              className="oq-input"
              value={property.heating_type ?? ''}
              onChange={(e) => set('heating_type', e.target.value || null)}
            />
          </Field>
        </Grid2>
      </Section>
      )}

      {currentStep === 4 && (
      <Section title="Localisation & transports">
        <Grid2>
          <Field label="Latitude">
            <input
              className="oq-input"
              type="number"
              step="0.0001"
              value={property.latitude ?? ''}
              onChange={(e) => set('latitude', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Longitude">
            <input
              className="oq-input"
              type="number"
              step="0.0001"
              value={property.longitude ?? ''}
              onChange={(e) => set('longitude', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Grid2>
        <TransportRepeater transports={transports} onChange={setTransports} />
      </Section>
      )}

      {currentStep === 5 && (
      <Section title="Gestion & liens">
        <Field label="Type de mandat">
          <select
            className="oq-input"
            value={property.management_type ?? ''}
            onChange={(e) => set('management_type', (e.target.value || null) as ManagementType | null)}
          >
            <option value="">—</option>
            <option value="solo">Oqoro Solo</option>
            <option value="plus">Oqoro Plus</option>
          </select>
        </Field>
        <Field label="Charges incluses">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CHARGES_OPTIONS.map((opt) => {
              const checked = (property.charges_included ?? []).includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const current = property.charges_included ?? [];
                      const next = e.target.checked
                        ? [...current, opt.value]
                        : current.filter((v) => v !== opt.value);
                      set('charges_included', next);
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </Field>
        <Grid2>
          <Field label="URL annonce oqoro.com">
            <input className="oq-input" value={property.oqoro_listing_url ?? ''} onChange={(e) => set('oqoro_listing_url', e.target.value || null)} />
          </Field>
          <Field label="URL annonce externe">
            <input className="oq-input" value={property.sale_listing_url ?? ''} onChange={(e) => set('sale_listing_url', e.target.value || null)} />
          </Field>
        </Grid2>
        <Field label="URL Matterport">
          <input className="oq-input" value={property.matterport_url ?? ''} onChange={(e) => set('matterport_url', e.target.value || null)} />
        </Field>
      </Section>
      )}

      {currentStep === 3 && (
      <Section title="Charges et frais (optionnel)">
        <p className="text-[13px] text-oq-muted">
          Si renseignés, ces montants remplacent les estimations automatiques sur la page bien
          (calcul de rentabilité, diagnostic financier).
        </p>
        <Grid2>
          <Field label="Charges de copropriété (€/mois)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="1"
              value={property.monthly_charges ?? ''}
              onChange={(e) =>
                set(
                  'monthly_charges',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </Field>
          <Field label="Taxe foncière (€/an)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="1"
              value={property.yearly_property_tax ?? ''}
              onChange={(e) =>
                set(
                  'yearly_property_tax',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Gestion + assurance (€/mois)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="1"
              value={property.monthly_management_fee ?? ''}
              onChange={(e) =>
                set(
                  'monthly_management_fee',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </Field>
          <Field label="Honoraires OQORO (€)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="1"
              value={property.oqoro_fees ?? ''}
              onChange={(e) =>
                set(
                  'oqoro_fees',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </Field>
        </Grid2>
      </Section>
      )}

      {currentStep === 4 && (
      <Section title="Marché local (optionnel)">
        <p className="text-[13px] text-oq-muted">
          Indicateurs du quartier. Si vides, des estimations sont calculées automatiquement.
        </p>
        <Grid2>
          <Field label="Prix moyen au m² (€/m²)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="1"
              value={property.market_data?.price_per_m2 ?? ''}
              onChange={(e) =>
                setMarket('price_per_m2', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </Field>
          <Field label="Loyer médian (€/m²/mois)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="0.1"
              value={property.market_data?.rent_per_m2 ?? ''}
              onChange={(e) =>
                setMarket('rent_per_m2', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Rendement médian quartier (%)">
            <input
              className="oq-input"
              type="number"
              min="0"
              step="0.1"
              value={property.market_data?.yield_median ?? ''}
              onChange={(e) =>
                setMarket('yield_median', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </Field>
          <Field label="Évolution prix · 5 ans (%)">
            <input
              className="oq-input"
              type="number"
              step="0.1"
              value={property.market_data?.price_evolution_5y ?? ''}
              onChange={(e) =>
                setMarket('price_evolution_5y', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Délai moyen de relocation">
            <input
              className="oq-input"
              placeholder="11 jours"
              value={property.market_data?.relocation_delay ?? ''}
              onChange={(e) => setMarket('relocation_delay', e.target.value || undefined)}
            />
          </Field>
          <Field label="Tension locative (texte libre)">
            <input
              className="oq-input"
              placeholder="Élevée · 3,2 candidats / annonce"
              value={property.market_data?.tension ?? ''}
              onChange={(e) => setMarket('tension', e.target.value || undefined)}
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Δ prix m² sur 12 mois (%)">
            <input
              className="oq-input"
              type="number"
              step="0.1"
              value={property.market_data?.price_delta_12m ?? ''}
              onChange={(e) =>
                setMarket('price_delta_12m', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </Field>
          <Field label="Δ loyer médian sur 12 mois (%)">
            <input
              className="oq-input"
              type="number"
              step="0.1"
              value={property.market_data?.rent_delta_12m ?? ''}
              onChange={(e) =>
                setMarket('rent_delta_12m', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
          </Field>
        </Grid2>
      </Section>
      )}

      {currentStep === 5 && (
      <Section title="Conseiller affecté (optionnel)">
        <p className="text-[13px] text-oq-muted">
          S'affiche dans la carte d'achat à droite de la fiche bien. Sans valeur, Baptiste est utilisé par défaut.
        </p>
        <Grid2>
          <Field label="Nom complet">
            <input
              className="oq-input"
              placeholder="Baptiste"
              value={property.agent?.name ?? ''}
              onChange={(e) => setAgent('name', e.target.value || undefined)}
            />
          </Field>
          <Field label="Initiales (2 lettres)">
            <input
              className="oq-input"
              maxLength={3}
              placeholder="BC"
              value={property.agent?.initials ?? ''}
              onChange={(e) => setAgent('initials', e.target.value.toUpperCase() || undefined)}
            />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Rôle">
            <input
              className="oq-input"
              placeholder="Conseiller Off Market"
              value={property.agent?.role ?? ''}
              onChange={(e) => setAgent('role', e.target.value || undefined)}
            />
          </Field>
          <Field label="Téléphone (international, ex. +33180000000)">
            <input
              className="oq-input"
              placeholder="+33180000000"
              value={property.agent?.phone ?? ''}
              onChange={(e) => setAgent('phone', e.target.value || undefined)}
            />
          </Field>
        </Grid2>
      </Section>
      )}

      {currentStep === 5 && (
      <Section title="SEO & publication">
        <Field label="Meta title">
          <input className="oq-input" value={property.meta_title ?? ''} onChange={(e) => set('meta_title', e.target.value || null)} />
        </Field>
        <Field label="Meta description">
          <textarea
            className="oq-input"
            value={property.meta_description ?? ''}
            onChange={(e) => set('meta_description', e.target.value || null)}
          />
        </Field>
        <label className="flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={property.status === 'published'}
            onChange={(e) => set('status', e.target.checked ? 'published' : 'draft')}
          />
          Publié (visible en ligne)
        </label>
        <label className="flex items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            className="mt-1"
            checked={property.is_featured === true}
            onChange={(e) => set('is_featured', e.target.checked)}
          />
          <span>
            Mettre en avant sur la home
            <span className="block text-[12px] text-oq-muted mt-0.5">
              Affiché dans l'emplacement « vedette ». Si plusieurs biens sont cochés,
              la home en tire un au hasard à chaque chargement.
            </span>
          </span>
        </label>
      </Section>
      )}

      <div className="sticky bottom-0 bg-white border-t border-oq-border py-4 -mx-6 px-6 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          disabled={isFirstStep}
          onClick={() => goToStep((currentStep - 1) as StepId)}
          className="oq-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Précédent
        </button>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" disabled={saving} className="oq-btn-secondary">
            {saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={(e) => handleSubmit(e as any, true)}
              disabled={saving}
              className="oq-btn-dark"
            >
              Publier &amp; rebuild
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToStep((currentStep + 1) as StepId)}
              className="oq-btn-dark"
            >
              Suivant →
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// ────────── Sub-components ──────────

function Stepper({
  currentStep,
  onChange,
}: {
  currentStep: StepId;
  onChange: (step: StepId) => void;
}) {
  return (
    <nav className="flex items-stretch gap-0 border border-oq-border rounded-btn overflow-hidden bg-white">
      {STEPS.map((step, idx) => {
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onChange(step.id)}
            className={[
              'flex-1 px-4 py-3 text-left transition-colors text-[13px]',
              isActive
                ? 'bg-oq-black text-white font-semibold'
                : isDone
                  ? 'bg-white text-oq-black hover:bg-oq-bg'
                  : 'bg-white text-oq-muted hover:bg-oq-bg',
              idx > 0 ? 'border-l border-oq-border' : '',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-bold',
                  isActive
                    ? 'bg-white text-oq-black'
                    : isDone
                      ? 'bg-oq-green-soft text-green-700'
                      : 'bg-oq-bg text-oq-muted',
                ].join(' ')}
              >
                {isDone ? '✓' : step.id}
              </span>
              <span className="truncate">{step.label}</span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-bold text-oq-black mb-4 pb-2 border-b border-oq-border">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="oq-label">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-oq-muted">{label}</div>
      <div className="font-bold text-oq-black mt-1">{value}</div>
    </div>
  );
}

function LotRepeater({
  lots,
  onChange,
}: {
  lots: LotDraft[];
  onChange: (next: LotDraft[]) => void;
}) {
  function update(index: number, patch: Partial<LotDraft>) {
    onChange(lots.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function remove(index: number) {
    onChange(lots.filter((_, i) => i !== index));
  }
  return (
    <div className="space-y-3">
      {lots.map((lot, i) => (
        <div key={lot.id} className="border border-oq-border rounded-btn p-4 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Nom du lot">
            <input className="oq-input" value={lot.name} onChange={(e) => update(i, { name: e.target.value })} />
          </Field>
          <Field label="Surface (m²)">
            <input
              className="oq-input"
              type="number"
              step="0.1"
              value={lot.surface ?? ''}
              onChange={(e) => update(i, { surface: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="Loyer HC (€)">
            <input
              className="oq-input"
              type="number"
              value={lot.rent_hc}
              onChange={(e) => update(i, { rent_hc: Number(e.target.value) })}
            />
          </Field>
          <Field label="Charges (€)">
            <input
              className="oq-input"
              type="number"
              value={lot.charges}
              onChange={(e) => update(i, { charges: Number(e.target.value) })}
            />
          </Field>
          <Field label="Statut">
            <select
              className="oq-input"
              value={lot.status}
              onChange={(e) => update(i, { status: e.target.value as LotStatus })}
            >
              <option value="loue">Loué</option>
              <option value="vacant">Vacant</option>
              <option value="preavis">Préavis</option>
            </select>
          </Field>
          <button type="button" onClick={() => remove(i)} className="oq-btn-secondary">Suppr.</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lots, blankLot(lots.length)])} className="oq-btn-secondary">
        + Ajouter un lot
      </button>
    </div>
  );
}

function PhotoManager({
  photos,
  onChange,
  onUpload,
}: {
  photos: PhotoDraft[];
  onChange: (next: PhotoDraft[]) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // Use a ref to access the up-to-date photos list inside the upload loop
  // (otherwise the closure captures the initial array and overwrites later uploads).
  const photosRef = useRef(photos);
  photosRef.current = photos;

  function update(index: number, patch: Partial<PhotoDraft>) {
    onChange(photos.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function remove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }
  function setPrimary(index: number) {
    onChange(photos.map((p, i) => ({ ...p, is_primary: i === index })));
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...photos];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((p, i) => ({ ...p, sort_order: i })));
  }

  async function handleFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setProgress({ done: 0, total: images.length });
    const failures: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      try {
        const url = await onUpload(file);
        const current = photosRef.current;
        const newPhoto: PhotoDraft = {
          id: crypto.randomUUID(),
          url,
          source: 'upload',
          label: null,
          is_primary: current.length === 0,
          sort_order: current.length,
          _isNew: true,
        };
        const next = [...current, newPhoto];
        photosRef.current = next;
        onChange(next);
      } catch (err) {
        failures.push(`${file.name} : ${(err as Error).message}`);
      }
      setProgress({ done: i + 1, total: images.length });
    }

    setProgress(null);
    if (failures.length > 0) {
      alert(`Upload partiel — ${failures.length} échec(s) :\n${failures.join('\n')}`);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFiles(files);
  }

  return (
    <div className="space-y-3">
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={onDrop}
        className={[
          'rounded-btn border-2 border-dashed p-6 text-center transition-colors',
          dragActive ? 'border-oq-black bg-oq-bg' : 'border-oq-border bg-white',
        ].join(' ')}
      >
        <div className="text-[14px] text-oq-text mb-3">
          Glissez vos photos ici, ou
        </div>
        <label className="oq-btn-secondary cursor-pointer inline-flex">
          {progress ? `Envoi ${progress.done}/${progress.total}…` : 'Sélectionner des fichiers'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={progress !== null}
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length > 0) handleFiles(files);
              e.target.value = '';
            }}
          />
        </label>
        <div className="text-[12px] text-oq-muted mt-3">
          JPG, PNG, WebP — plusieurs fichiers acceptés
        </div>
      </div>

      {photos.map((photo, i) => (
        <div key={photo.id} className="border border-oq-border rounded-btn p-3 flex gap-4 items-center">
          <img src={photo.url} alt="" className="w-20 h-20 object-cover rounded-btn bg-oq-bg" />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="URL">
              <input className="oq-input" value={photo.url} onChange={(e) => update(i, { url: e.target.value })} />
            </Field>
            <Field label="Légende">
              <input className="oq-input" value={photo.label ?? ''} onChange={(e) => update(i, { label: e.target.value || null })} />
            </Field>
          </div>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="radio"
                name="primary-photo"
                checked={photo.is_primary}
                onChange={() => setPrimary(i)}
              />
              Principale
            </label>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="text-[13px] px-2 py-1 hover:bg-oq-bg rounded">↑</button>
              <button type="button" onClick={() => move(i, 1)} className="text-[13px] px-2 py-1 hover:bg-oq-bg rounded">↓</button>
              <button type="button" onClick={() => remove(i)} className="text-[13px] px-2 py-1 hover:bg-oq-bg rounded">✕</button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...photos, blankPhoto(photos.length)])}
        className="oq-btn-secondary"
      >
        + Ajouter une URL externe
      </button>
    </div>
  );
}

function TransportRepeater({
  transports,
  onChange,
}: {
  transports: TransportDraft[];
  onChange: (next: TransportDraft[]) => void;
}) {
  function update(index: number, patch: Partial<TransportDraft>) {
    onChange(transports.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }
  function remove(index: number) {
    onChange(transports.filter((_, i) => i !== index));
  }
  return (
    <div className="space-y-2">
      {transports.map((t, i) => (
        <div key={t.id} className="border border-oq-border rounded-btn p-3 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Nom (station, gare)">
            <input className="oq-input" value={t.name} onChange={(e) => update(i, { name: e.target.value })} />
          </Field>
          <Field label="Type">
            <input className="oq-input" value={t.transport_type ?? ''} onChange={(e) => update(i, { transport_type: e.target.value || null })} />
          </Field>
          <Field label="Catégorie">
            <select
              className="oq-input"
              value={t.category ?? ''}
              onChange={(e) => update(i, { category: (e.target.value || null) as TransportDraft['category'] })}
            >
              <option value="">—</option>
              <option value="transport">Transport</option>
              <option value="education">Éducation</option>
              <option value="shopping">Commerces</option>
              <option value="park">Parc / espace vert</option>
              <option value="health">Santé</option>
              <option value="other">Autre</option>
            </select>
          </Field>
          <Field label="Temps">
            <input className="oq-input" value={t.time_label ?? ''} onChange={(e) => update(i, { time_label: e.target.value || null })} />
          </Field>
          <button type="button" onClick={() => remove(i)} className="oq-btn-secondary">Suppr.</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...transports, blankTransport(transports.length)])} className="oq-btn-secondary">
        + Ajouter un transport
      </button>
    </div>
  );
}

function ReportRepeater({
  reports,
  onChange,
}: {
  reports: ReportDraft[];
  onChange: (next: ReportDraft[]) => void;
}) {
  function update(index: number, patch: Partial<ReportDraft>) {
    onChange(reports.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function remove(index: number) {
    onChange(reports.filter((_, i) => i !== index));
  }
  return (
    <div className="space-y-2">
      {reports.map((r, i) => (
        <div key={r.id} className="border border-oq-border rounded-btn p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Année">
            <input
              className="oq-input"
              type="number"
              value={r.year}
              onChange={(e) => update(i, { year: Number(e.target.value) })}
            />
          </Field>
          <Field label="Taux d'occupation (%)">
            <input
              className="oq-input"
              type="number"
              step="0.1"
              value={r.occupancy_rate ?? ''}
              onChange={(e) => update(i, { occupancy_rate: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="Loyers encaissés (€)">
            <input
              className="oq-input"
              type="number"
              value={r.total_rent_collected ?? ''}
              onChange={(e) => update(i, { total_rent_collected: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="Impayés (€)">
            <input
              className="oq-input"
              type="number"
              value={r.unpaid_amount}
              onChange={(e) => update(i, { unpaid_amount: Number(e.target.value) })}
            />
          </Field>
          <button type="button" onClick={() => remove(i)} className="oq-btn-secondary">Suppr.</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...reports, blankReport()])} className="oq-btn-secondary">
        + Ajouter une année
      </button>
    </div>
  );
}
