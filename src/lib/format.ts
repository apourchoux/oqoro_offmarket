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

/**
 * Wrap a Supabase Storage public URL with on-the-fly resize/quality params.
 * Example: photoUrl(url, 1200, 80) → "<url>?width=1200&quality=80"
 *
 * - Only mutates URLs hosted on Supabase Storage (`/storage/v1/object/public/`).
 * - Falls back to the original URL for external sources (Unsplash, etc.) — they
 *   handle their own transforms.
 * - Pass `width: undefined` to skip resizing (only set quality).
 */
export function photoUrl(
  url: string | null | undefined,
  width?: number,
  quality = 80,
): string {
  if (!url) return '';
  // Only Supabase Storage URLs benefit from the transform endpoint.
  if (!url.includes('/storage/v1/object/public/')) return url;
  const transformed = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  params.set('quality', String(quality));
  params.set('resize', 'cover');
  return `${transformed}?${params.toString()}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
