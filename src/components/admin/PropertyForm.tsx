import { useMemo, useState, type FormEvent } from 'react';
import type {
  Property,
  PropertyLot,
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

  const [property, setProperty] = useState<Partial<Property>>(
    initialProperty ?? {
      status: 'draft',
      notary_rate: 0.08,
      sale_price: 0,
      title: '',
      slug: '',
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

      <Section title="Photos">
        <PhotoManager
          photos={photos}
          onChange={setPhotos}
          onUpload={handleUploadPhoto}
        />
      </Section>

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

      <Section title="Lots">
        <LotRepeater lots={lots} onChange={setLots} />
      </Section>

      <Section title="Historique locatif">
        <ReportRepeater reports={reports} onChange={setReports} />
      </Section>

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
      </Section>

      <div className="sticky bottom-0 bg-white border-t border-oq-border py-4 -mx-6 px-6 flex items-center justify-end gap-3">
        <button type="submit" disabled={saving} className="oq-btn-secondary">
          {saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}
        </button>
        <button
          type="button"
          onClick={(e) => handleSubmit(e as any, true)}
          disabled={saving}
          className="oq-btn-dark"
        >
          Publier & rebuild
        </button>
      </div>
    </form>
  );
}

// ────────── Sub-components ──────────

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
  const [uploading, setUploading] = useState(false);

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
  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange([
        ...photos,
        {
          id: crypto.randomUUID(),
          url,
          source: 'upload',
          label: null,
          is_primary: photos.length === 0,
          sort_order: photos.length,
          _isNew: true,
        },
      ]);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...photos, blankPhoto(photos.length)])}
          className="oq-btn-secondary"
        >
          + Ajouter une URL
        </button>
        <label className="oq-btn-secondary cursor-pointer">
          {uploading ? 'Envoi…' : '+ Uploader un fichier'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
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
        <div key={t.id} className="border border-oq-border rounded-btn p-3 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Nom (station, gare)">
            <input className="oq-input" value={t.name} onChange={(e) => update(i, { name: e.target.value })} />
          </Field>
          <Field label="Type">
            <input className="oq-input" value={t.transport_type ?? ''} onChange={(e) => update(i, { transport_type: e.target.value || null })} />
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
