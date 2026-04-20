// Shared formatters — used by both .astro components and React islands.

const eurFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return eurFormatter.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return numberFormatter.format(value);
}

export function formatPercent(
  value: number | null | undefined,
  alreadyPercent = true,
): string {
  if (value === null || value === undefined) return '—';
  return percentFormatter.format(alreadyPercent ? value / 100 : value);
}

export function formatSurface(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${numberFormatter.format(value)} m²`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
