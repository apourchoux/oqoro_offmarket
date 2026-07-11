import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { isValidDepartement } from '../../../../lib/zones';
import { CONTACT_TYPES, EMAIL_REGEX, json } from './_helpers';

export const prerender = false;

const MAX_BODY_BYTES = 1024 * 1024; // 1 Mo
const MAX_ROWS = 2000;

// Colonnes attendues (en-tête, insensible à la casse/accents) :
//   prenom,nom,email,telephone,type,zones
// `type` ∈ proprietaire|investisseur|mixte (défaut proprietaire).
// `zones` = codes département séparés par `|` (ex : "75|92|69"), vide = toute
// la France. Délimiteur `,` ou `;` autodétecté sur la ligne d'en-tête.

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Non authentifié' }, 401);

  // Retire le BOM UTF-8 qu'Excel écrit systématiquement en « CSV UTF-8 ».
  const raw = (await request.text()).replace(/^\uFEFF/, '');
  if (!raw.trim()) return json({ error: 'CSV vide' }, 400);
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ error: 'Fichier trop volumineux (max 1 Mo)' }, 400);
  }

  const delimiter = detectDelimiter(raw);
  const rows = parseCsv(raw, delimiter);
  if (rows.length < 2) {
    return json({ error: 'CSV vide (en-tête + au moins une ligne attendus)' }, 400);
  }
  if (rows.length - 1 > MAX_ROWS) {
    return json({ error: `Trop de lignes (max ${MAX_ROWS})` }, 400);
  }

  const header = rows[0].map(normalizeHeader);
  const col = {
    first_name: header.indexOf('prenom'),
    last_name: header.indexOf('nom'),
    email: header.indexOf('email'),
    phone: header.indexOf('telephone'),
    type: header.indexOf('type'),
    zones: header.indexOf('zones'),
  };
  if (col.first_name === -1 || col.last_name === -1 || col.email === -1) {
    return json(
      { error: 'En-tête invalide : colonnes requises « prenom », « nom », « email »' },
      400,
    );
  }

  const candidates: Array<{ line: number; row: Record<string, unknown>; email: string }> = [];
  const errors: Array<{ line: number; reason: string }> = [];
  const seenInFile = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i];
    if (cells.every((c) => !c.trim())) continue; // ligne vide

    const first_name = (cells[col.first_name] ?? '').trim();
    const last_name = (cells[col.last_name] ?? '').trim();
    const email = (cells[col.email] ?? '').trim().toLowerCase();
    const phone = col.phone === -1 ? '' : (cells[col.phone] ?? '').trim();
    const typeRaw = col.type === -1 ? '' : (cells[col.type] ?? '').trim().toLowerCase();
    const zonesRaw = col.zones === -1 ? '' : (cells[col.zones] ?? '').trim();

    if (!first_name || first_name.length > 100) {
      errors.push({ line, reason: 'Prénom manquant ou trop long' });
      continue;
    }
    if (!last_name || last_name.length > 100) {
      errors.push({ line, reason: 'Nom manquant ou trop long' });
      continue;
    }
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      errors.push({ line, reason: `Email invalide : « ${email || '(vide)'} »` });
      continue;
    }
    if (seenInFile.has(email)) {
      skipped += 1; // doublon à l'intérieur du fichier
      continue;
    }
    if (typeRaw && !(CONTACT_TYPES as readonly string[]).includes(typeRaw)) {
      errors.push({ line, reason: `Type inconnu : « ${typeRaw} »` });
      continue;
    }
    const zones = zonesRaw
      ? zonesRaw.split('|').map((z) => z.trim()).filter(Boolean)
      : [];
    const badZone = zones.find((z) => !isValidDepartement(z));
    if (badZone !== undefined) {
      errors.push({ line, reason: `Code département invalide : « ${badZone} »` });
      continue;
    }

    seenInFile.add(email);
    candidates.push({
      line,
      email,
      row: {
        first_name,
        last_name,
        email,
        phone: phone || null,
        contact_type: typeRaw || 'proprietaire',
        zones: [...new Set(zones)],
        source: 'import_csv',
      },
    });
  }

  // Dédoublonnage contre la base, scopé aux emails du fichier (pas de select
  // pleine table : il serait tronqué à la limite PostgREST de 1000 lignes).
  const supabase = getAdminClient();
  const known = new Set<string>();
  const candidateEmails = candidates.map((c) => c.email);
  for (let i = 0; i < candidateEmails.length; i += 500) {
    const { data: existing, error } = await supabase
      .from('contacts')
      .select('email')
      .in('email', candidateEmails.slice(i, i + 500));
    if (error) {
      console.error('[admin contacts import] read error', error);
      return json({ error: error.message }, 500);
    }
    for (const c of existing ?? []) {
      known.add(String((c as any).email).toLowerCase());
    }
  }

  const toInsert = candidates.filter((c) => !known.has(c.email));
  skipped += candidates.length - toInsert.length;

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabase
      .from('contacts')
      .insert(chunk.map((c) => c.row));
    if (!error) {
      inserted += chunk.length;
      continue;
    }
    if (error.code !== '23505') {
      console.error('[admin contacts import] insert error', error);
      return json(
        { error: `Import interrompu : ${error.message}`, inserted, skipped, errors },
        500,
      );
    }
    // Doublon résiduel dans le chunk (ex. casse différente, l'index unique
    // porte sur lower(email)) : repli ligne à ligne pour ne perdre que lui.
    for (const c of chunk) {
      const { error: rowError } = await supabase.from('contacts').insert(c.row);
      if (!rowError) {
        inserted += 1;
      } else if (rowError.code === '23505') {
        skipped += 1;
      } else {
        errors.push({ line: c.line, reason: rowError.message });
      }
    }
  }

  return json({ success: true, inserted, skipped, errors });
};

function detectDelimiter(raw: string): string {
  const firstLine = raw.slice(0, raw.indexOf('\n') === -1 ? raw.length : raw.indexOf('\n'));
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
    ? ';'
    : ',';
}

function normalizeHeader(cell: string): string {
  return cell
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Parseur CSV minimal : champs quotés ("" = quote échappée), CRLF/LF. */
function parseCsv(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
