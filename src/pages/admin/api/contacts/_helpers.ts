// Helpers partagés des endpoints contacts (fichier préfixé `_` : pas une route).

import { isValidDepartement } from '../../../../lib/zones';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CONTACT_TYPES = ['proprietaire', 'investisseur', 'mixte'] as const;

export const MAX_NAME = 100;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 50;
export const MAX_NOTES = 5000;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Valide les champs éditables d'un contact (create et update partagent la même
 * allowlist — seules les clés présentes dans `body` sont validées). L'email
 * est normalisé en minuscules (aligné sur l'index unique lower(email)).
 */
export function validateContactFields(
  body: Record<string, unknown>,
): { fields: Record<string, unknown> } | { error: string } {
  const fields: Record<string, unknown> = {};

  if ('first_name' in body) {
    if (
      typeof body.first_name !== 'string' ||
      !body.first_name.trim() ||
      body.first_name.trim().length > MAX_NAME
    ) {
      return { error: 'Prénom invalide' };
    }
    fields.first_name = body.first_name.trim();
  }
  if ('last_name' in body) {
    if (
      typeof body.last_name !== 'string' ||
      !body.last_name.trim() ||
      body.last_name.trim().length > MAX_NAME
    ) {
      return { error: 'Nom invalide' };
    }
    fields.last_name = body.last_name.trim();
  }
  if ('email' in body) {
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > MAX_EMAIL || !EMAIL_REGEX.test(email)) {
      return { error: 'Email invalide' };
    }
    fields.email = email;
  }
  if ('phone' in body) {
    if (
      body.phone !== null &&
      (typeof body.phone !== 'string' || body.phone.trim().length > MAX_PHONE)
    ) {
      return { error: 'Téléphone invalide' };
    }
    fields.phone =
      typeof body.phone === 'string' && body.phone.trim()
        ? body.phone.trim()
        : null;
  }
  if ('contact_type' in body) {
    if (
      typeof body.contact_type !== 'string' ||
      !(CONTACT_TYPES as readonly string[]).includes(body.contact_type)
    ) {
      return { error: 'Type de contact invalide' };
    }
    fields.contact_type = body.contact_type;
  }
  if ('zones' in body) {
    if (
      !Array.isArray(body.zones) ||
      body.zones.some((z) => typeof z !== 'string' || !isValidDepartement(z))
    ) {
      return { error: 'Zones invalides' };
    }
    fields.zones = [...new Set(body.zones as string[])];
  }
  if ('notes' in body) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return { error: 'Notes invalides' };
    }
    fields.notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.slice(0, MAX_NOTES)
        : null;
  }
  if ('subscribed' in body) {
    if (typeof body.subscribed !== 'boolean') {
      return { error: 'Abonnement invalide' };
    }
    fields.subscribed = body.subscribed;
    fields.unsubscribed_at = body.subscribed ? null : new Date().toISOString();
  }

  return { fields };
}
