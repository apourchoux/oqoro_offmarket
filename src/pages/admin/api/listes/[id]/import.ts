import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../../lib/supabase';
import { isValidDepartement } from '../../../../../lib/zones';
import { detectDelimiter, normalizeHeader, parseCsv } from '../../../../../lib/csv';
import { CONTACT_TYPES, EMAIL_REGEX } from '../../contacts/_helpers';
import { UUID_REGEX, json } from '../../_helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

export const prerender = false;

const MAX_BODY_BYTES = 1024 * 1024; // 1 Mo
const MAX_ROWS = 5000;

// Import CSV directement dans une liste (modale « Importer CSV » du panneau de
// liste). Chaque ligne du fichier crée le contact s'il n'existe pas (dédoublonné
// sur lower(email)) puis l'associe à CETTE liste.
//
// Deux entrées possibles :
//   - application/json : { contacts: [{ email, first_name?, last_name?, phone? }] }
//     (le client a déjà appliqué le mapping des colonnes — chemin de la modale).
//   - text/csv : CSV brut, en-tête auto-détecté (email requis ; prenom, nom,
//     telephone, type, zones optionnels) ; tolère une colonne d'emails sans
//     en-tête. Chemin historique / import direct.

interface Candidate {
  line: number;
  email: string;
  row: Record<string, unknown>;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  const listId = params.id;
  if (!listId || !UUID_REGEX.test(listId)) return json({ error: 'ID de liste invalide' }, 400);

  const supabase = getAdminClient();

  // La liste doit exister (l'association référence list_id).
  const { data: list, error: listError } = await supabase
    .from('contact_lists')
    .select('id')
    .eq('id', listId)
    .maybeSingle();
  if (listError) return json({ error: listError.message }, 500);
  if (!list) return json({ error: 'Liste introuvable' }, 404);

  const contentType = request.headers.get('content-type') ?? '';
  const parsed = contentType.includes('application/json')
    ? await candidatesFromJson(request)
    : await candidatesFromCsv(request);
  if ('error' in parsed) return json({ error: parsed.error }, parsed.status);

  const { candidates, errors, skipped } = parsed;
  if (candidates.length === 0) {
    return json({ success: true, created: 0, linked: 0, skipped, errors });
  }

  return finishImport(supabase, listId, candidates, errors, skipped);
};

// ─────────────────────────── Entrée JSON (mapping client) ───────────────────
async function candidatesFromJson(
  request: Request,
): Promise<{ candidates: Candidate[]; errors: LineError[]; skipped: number } | ErrOut> {
  let body: { contacts?: unknown };
  try {
    body = await request.json();
  } catch {
    return { error: 'JSON invalide', status: 400 };
  }
  const rows = body.contacts;
  if (!Array.isArray(rows)) return { error: 'Champ « contacts » manquant', status: 400 };
  if (rows.length > MAX_ROWS) return { error: `Trop de lignes (max ${MAX_ROWS})`, status: 400 };

  const candidates: Candidate[] = [];
  const errors: LineError[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  rows.forEach((raw, index) => {
    const line = index + 1;
    const c = (raw ?? {}) as Record<string, unknown>;
    const email = String(c.email ?? '').trim().toLowerCase();
    const first_name = String(c.first_name ?? '').trim();
    const last_name = String(c.last_name ?? '').trim();
    const phone = String(c.phone ?? '').trim();

    if (!email && !first_name && !last_name && !phone) return; // ligne vide
    const bad = validateCore(email, first_name, last_name);
    if (bad) {
      errors.push({ line, reason: bad });
      return;
    }
    if (seen.has(email)) {
      skipped += 1;
      return;
    }
    seen.add(email);
    candidates.push({ line, email, row: contactRow({ email, first_name, last_name, phone }) });
  });

  return { candidates, errors, skipped };
}

// ─────────────────────────── Entrée CSV brute ───────────────────────────────
async function candidatesFromCsv(
  request: Request,
): Promise<{ candidates: Candidate[]; errors: LineError[]; skipped: number } | ErrOut> {
  // Retire le BOM UTF-8 qu'Excel écrit systématiquement en « CSV UTF-8 ».
  const rawText = (await request.text()).replace(/^\uFEFF/, '');
  if (!rawText.trim()) return { error: 'CSV vide', status: 400 };
  if (new TextEncoder().encode(rawText).length > MAX_BODY_BYTES) {
    return { error: 'Fichier trop volumineux (max 1 Mo)', status: 400 };
  }

  const delimiter = detectDelimiter(rawText);
  const rows = parseCsv(rawText, delimiter);
  if (rows.length === 0) return { error: 'CSV vide', status: 400 };

  const header = rows[0].map(normalizeHeader);
  const col = {
    email: header.indexOf('email'),
    first_name: header.indexOf('prenom'),
    last_name: header.indexOf('nom'),
    phone: header.indexOf('telephone'),
    type: header.indexOf('type'),
    zones: header.indexOf('zones'),
  };

  let dataRows: string[][];
  let hasHeader: boolean;
  if (col.email !== -1) {
    dataRows = rows.slice(1);
    hasHeader = true;
  } else if (rows[0].length === 1 && EMAIL_REGEX.test((rows[0][0] ?? '').trim().toLowerCase())) {
    col.email = 0;
    dataRows = rows;
    hasHeader = false;
  } else {
    return { error: 'En-tête invalide : une colonne « email » est requise.', status: 400 };
  }
  if (dataRows.length > MAX_ROWS) return { error: `Trop de lignes (max ${MAX_ROWS})`, status: 400 };

  const candidates: Candidate[] = [];
  const errors: LineError[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  dataRows.forEach((cells, index) => {
    const line = hasHeader ? index + 2 : index + 1;
    if (cells.every((c) => !c.trim())) return; // ligne vide

    const email = (cells[col.email] ?? '').trim().toLowerCase();
    const first_name = col.first_name === -1 ? '' : (cells[col.first_name] ?? '').trim();
    const last_name = col.last_name === -1 ? '' : (cells[col.last_name] ?? '').trim();
    const phone = col.phone === -1 ? '' : (cells[col.phone] ?? '').trim();
    const typeRaw = col.type === -1 ? '' : (cells[col.type] ?? '').trim().toLowerCase();
    const zonesRaw = col.zones === -1 ? '' : (cells[col.zones] ?? '').trim();

    const bad = validateCore(email, first_name, last_name);
    if (bad) {
      errors.push({ line, reason: bad });
      return;
    }
    if (seen.has(email)) {
      skipped += 1;
      return;
    }
    if (typeRaw && !(CONTACT_TYPES as readonly string[]).includes(typeRaw)) {
      errors.push({ line, reason: `Type inconnu : « ${typeRaw} »` });
      return;
    }
    const zones = zonesRaw ? zonesRaw.split('|').map((z) => z.trim()).filter(Boolean) : [];
    const badZone = zones.find((z) => !isValidDepartement(z));
    if (badZone !== undefined) {
      errors.push({ line, reason: `Code département invalide : « ${badZone} »` });
      return;
    }

    seen.add(email);
    candidates.push({
      line,
      email,
      row: contactRow({ email, first_name, last_name, phone, contact_type: typeRaw, zones }),
    });
  });

  return { candidates, errors, skipped };
}

// ─────────────────────────── Création + association ─────────────────────────
async function finishImport(
  supabase: SupabaseClient<any, any, any, any, any>,
  listId: string,
  candidates: Candidate[],
  errors: LineError[],
  skipped: number,
): Promise<Response> {
  // Map email → contact_id (existants + créés).
  const emailToId = new Map<string, string>();
  const candidateEmails = candidates.map((c) => c.email);
  for (let i = 0; i < candidateEmails.length; i += 500) {
    const { data: existing, error } = await supabase
      .from('contacts')
      .select('id, email')
      .in('email', candidateEmails.slice(i, i + 500));
    if (error) {
      console.error('[admin listes import] read error', error);
      return json({ error: error.message }, 500);
    }
    for (const c of existing ?? []) {
      emailToId.set(String((c as any).email).toLowerCase(), String((c as any).id));
    }
  }

  const toInsert = candidates.filter((c) => !emailToId.has(c.email));
  let created = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { data: insertedRows, error } = await supabase
      .from('contacts')
      .insert(chunk.map((c) => c.row))
      .select('id, email');
    if (!error) {
      created += insertedRows?.length ?? chunk.length;
      for (const r of insertedRows ?? []) {
        emailToId.set(String((r as any).email).toLowerCase(), String((r as any).id));
      }
      continue;
    }
    if (error.code !== '23505') {
      console.error('[admin listes import] insert error', error);
      return json({ error: `Import interrompu : ${error.message}` }, 500);
    }
    // Doublon résiduel (casse différente : l'index unique porte sur
    // lower(email)) : repli ligne à ligne pour n'écarter que le contact en jeu.
    for (const c of chunk) {
      const { data: one, error: rowError } = await supabase
        .from('contacts')
        .insert(c.row)
        .select('id, email')
        .maybeSingle();
      if (!rowError && one) {
        created += 1;
        emailToId.set(String((one as any).email).toLowerCase(), String((one as any).id));
      } else if (rowError?.code === '23505') {
        const { data: found } = await supabase
          .from('contacts')
          .select('id, email')
          .eq('email', c.email)
          .maybeSingle();
        if (found) emailToId.set(c.email, String((found as any).id));
      } else if (rowError) {
        errors.push({ line: c.line, reason: rowError.message });
      }
    }
  }

  // Nombre de contacts qui existaient déjà en base (≈ « mis à jour » du Mailer).
  const existingMatched = candidates.length - toInsert.length;

  // Association à la liste (upsert idempotent).
  const contactIds = [
    ...new Set(candidates.map((c) => emailToId.get(c.email)).filter(Boolean)),
  ] as string[];
  let linked = 0;
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    const { error } = await supabase.from('contact_list_members').upsert(
      chunk.map((contact_id) => ({ list_id: listId, contact_id })),
      { onConflict: 'list_id,contact_id', ignoreDuplicates: true },
    );
    if (error) {
      console.error('[admin listes import] link error', error);
      return json(
        { error: `Association à la liste interrompue : ${error.message}`, created, linked, skipped, errors },
        500,
      );
    }
    linked += chunk.length;
  }

  return json({ success: true, created, updated: existingMatched, linked, skipped, errors });
}

// ─────────────────────────── Helpers ────────────────────────────────────────
interface LineError {
  line: number;
  reason: string;
}
interface ErrOut {
  error: string;
  status: number;
}

/** Validation commune email + longueur des noms. Renvoie un motif d'erreur ou null. */
function validateCore(email: string, first_name: string, last_name: string): string | null {
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return `Email invalide : « ${email || '(vide)'} »`;
  }
  if (first_name.length > 100 || last_name.length > 100) {
    return 'Prénom ou nom trop long (max 100)';
  }
  return null;
}

/** Construit la ligne d'insertion `contacts` (valeurs par défaut incluses). */
function contactRow(input: {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  contact_type?: string;
  zones?: string[];
}): Record<string, unknown> {
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone || null,
    contact_type: input.contact_type || 'proprietaire',
    zones: [...new Set(input.zones ?? [])],
    source: 'import_csv',
  };
}
