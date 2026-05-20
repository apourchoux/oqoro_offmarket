// Shared security helpers used by middleware, API routes and layouts.

/**
 * Normalise un pathname pour le check d'autorisation : décode plusieurs niveaux
 * d'encodage URL, replie les slashes redondants et passe en minuscules.
 * Mitigation des CVE Astro GHSA-ggxq-hp9w-j794 (URL encoding bypass) et
 * GHSA-whqg-ppgf-wp8c (double URL encoding bypass) — applique le check sur
 * la forme canonique du chemin.
 */
export function normalizePathname(pathname: string): string {
  let current = pathname;
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      break;
    }
    if (decoded === current) break;
    current = decoded;
  }
  return current.replace(/\/{2,}/g, '/').toLowerCase();
}

/**
 * Échappe un objet JSON pour insertion dans un <script>. JSON.stringify ne
 * neutralise pas `</script>` ni les séparateurs U+2028/U+2029, ce qui ouvre
 * une XSS dès qu'une string contrôlée par un opérateur arrive dans le bloc.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Renvoie l'URL si et seulement si c'est une URL http(s) bien formée.
 * Sert à éviter les `javascript:` ou `data:` URIs dans les attributs href/src
 * issus de champs admin éditables.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Vérifie que la requête vient d'une origine de confiance (même site).
 * Sert de garde-fou CSRF sur les endpoints qui n'ont pas de body JSON
 * (et n'ont donc pas le préflight CORS pour les protéger).
 */
export function isSameOrigin(request: Request, host: string | null): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const candidate = origin ?? referer;
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    if (host && url.host !== host) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Rate-limit best-effort en mémoire. Suffisant pour ralentir le brute-force et
 * le spam de leads sur un trafic raisonnable ; pour une vraie défense au
 * niveau d'un cluster il faut un backend partagé (Upstash KV, Netlify Blobs).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

const PHOTO_ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const PHOTO_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

export function isAllowedPhotoExt(ext: string): boolean {
  return PHOTO_ALLOWED_EXT.has(ext.toLowerCase());
}

export function isAllowedPhotoMime(mime: string): boolean {
  return PHOTO_ALLOWED_MIME.has(mime.toLowerCase());
}
