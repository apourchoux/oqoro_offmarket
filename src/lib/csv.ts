// Utilitaires CSV partagés (import contacts, import dans une liste).
// Parseur minimal : champs quotés ("" = quote échappée), délimiteur `,` ou `;`
// autodétecté, CRLF/LF, BOM UTF-8 d'Excel toléré côté appelant.

/** Autodétecte `;` (Excel FR) vs `,` sur la première ligne. */
export function detectDelimiter(raw: string): string {
  const nl = raw.indexOf('\n');
  const firstLine = raw.slice(0, nl === -1 ? raw.length : nl);
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
    ? ';'
    : ',';
}

/** Normalise un en-tête : sans accents, minuscules, sans espaces de bord. */
export function normalizeHeader(cell: string): string {
  return cell
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Parseur CSV minimal : champs quotés ("" = quote échappée), CRLF/LF. */
export function parseCsv(input: string, delimiter: string): string[][] {
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
