// Helpers partagés des endpoints campagnes (fichier préfixé `_` : pas une route).

import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidDepartement } from '../../../../lib/zones';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TARGET_TYPES = ['tous', 'proprietaire', 'investisseur'] as const;
const CONTENT_MODES = ['property', 'custom'] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Valide les champs éditables d'une campagne (create et update partagent la
 * même allowlist). Ne valide que les clés présentes dans `body` ; retourne
 * soit le patch prêt à insérer, soit un message d'erreur.
 */
export function validateCampaignFields(
  body: Record<string, unknown>,
): { fields: Record<string, unknown> } | { error: string } {
  const fields: Record<string, unknown> = {};

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
      return { error: 'Nom de campagne invalide' };
    }
    fields.name = body.name.trim();
  }
  if ('folder' in body) {
    if (body.folder !== null && (typeof body.folder !== 'string' || body.folder.length > 100)) {
      return { error: 'Dossier invalide' };
    }
    fields.folder =
      typeof body.folder === 'string' && body.folder.trim()
        ? body.folder.trim()
        : null;
  }
  if ('subject' in body) {
    if (typeof body.subject !== 'string' || body.subject.length > 300) {
      return { error: 'Objet invalide' };
    }
    // Neutralise les retours ligne (défense en profondeur contre une éventuelle
    // injection d'en-tête, en plus de la ré-encodage côté API Resend).
    fields.subject = body.subject.replace(/[\r\n]+/g, ' ').trim();
  }
  if ('intro_text' in body) {
    if (body.intro_text !== null && typeof body.intro_text !== 'string') {
      return { error: "Texte d'introduction invalide" };
    }
    fields.intro_text =
      typeof body.intro_text === 'string' && body.intro_text.trim()
        ? body.intro_text.slice(0, 5000)
        : null;
  }
  if ('property_id' in body) {
    if (typeof body.property_id !== 'string' || !UUID_REGEX.test(body.property_id)) {
      return { error: 'Bien invalide' };
    }
    fields.property_id = body.property_id;
  }
  if ('target_contact_type' in body) {
    if (
      typeof body.target_contact_type !== 'string' ||
      !(TARGET_TYPES as readonly string[]).includes(body.target_contact_type)
    ) {
      return { error: 'Type de ciblage invalide' };
    }
    fields.target_contact_type = body.target_contact_type;
  }
  if ('target_list_ids' in body) {
    if (body.target_list_ids === null) {
      fields.target_list_ids = null;
    } else if (
      !Array.isArray(body.target_list_ids) ||
      body.target_list_ids.some(
        (id) => typeof id !== 'string' || !UUID_REGEX.test(id),
      )
    ) {
      return { error: 'Listes de ciblage invalides' };
    } else {
      const ids = [...new Set(body.target_list_ids as string[])];
      fields.target_list_ids = ids.length > 0 ? ids : null;
    }
  }
  if ('from_name' in body) {
    if (body.from_name !== null && (typeof body.from_name !== 'string' || body.from_name.length > 100)) {
      return { error: "Nom d'expéditeur invalide" };
    }
    // Interdit CRLF et chevrons : le nom est interpolé dans `Nom <email>`, un
    // `<`/`>` ou un saut de ligne pourrait falsifier l'affichage de l'expéditeur.
    if (typeof body.from_name === 'string' && /[\r\n<>]/.test(body.from_name)) {
      return { error: "Le nom d'expéditeur contient des caractères interdits (< > retour ligne)" };
    }
    fields.from_name =
      typeof body.from_name === 'string' && body.from_name.trim()
        ? body.from_name.trim()
        : null;
  }
  if ('from_email' in body) {
    if (body.from_email === null || body.from_email === '') {
      fields.from_email = null;
    } else if (
      typeof body.from_email !== 'string' ||
      body.from_email.length > 254 ||
      !EMAIL_REGEX.test(body.from_email.trim())
    ) {
      return { error: "Email d'expéditeur invalide" };
    } else {
      fields.from_email = body.from_email.trim().toLowerCase();
    }
  }
  if ('reply_to' in body) {
    if (body.reply_to === null || body.reply_to === '') {
      fields.reply_to = null;
    } else if (
      typeof body.reply_to !== 'string' ||
      body.reply_to.length > 254 ||
      !EMAIL_REGEX.test(body.reply_to.trim())
    ) {
      return { error: 'Reply-to invalide' };
    } else {
      fields.reply_to = body.reply_to.trim().toLowerCase();
    }
  }
  if ('preview_text' in body) {
    if (body.preview_text !== null && typeof body.preview_text !== 'string') {
      return { error: "Texte d'aperçu invalide" };
    }
    fields.preview_text =
      typeof body.preview_text === 'string' && body.preview_text.trim()
        ? body.preview_text.slice(0, 300)
        : null;
  }
  if ('content_mode' in body) {
    if (
      typeof body.content_mode !== 'string' ||
      !(CONTENT_MODES as readonly string[]).includes(body.content_mode)
    ) {
      return { error: 'Mode de contenu invalide' };
    }
    fields.content_mode = body.content_mode;
  }
  if ('custom_html' in body) {
    if (body.custom_html !== null && typeof body.custom_html !== 'string') {
      return { error: 'HTML invalide' };
    }
    fields.custom_html =
      typeof body.custom_html === 'string' && body.custom_html.trim()
        ? body.custom_html.slice(0, 500000)
        : null;
  }
  if ('target_zones' in body) {
    if (body.target_zones === null) {
      fields.target_zones = null;
    } else if (
      !Array.isArray(body.target_zones) ||
      body.target_zones.some((z) => typeof z !== 'string' || !isValidDepartement(z))
    ) {
      return { error: 'Zones de ciblage invalides' };
    } else {
      const zones = [...new Set(body.target_zones as string[])];
      fields.target_zones = zones.length > 0 ? zones : null;
    }
  }

  return { fields };
}

/**
 * À la création/édition d'un brouillon, le bien doit simplement exister —
 * la publication n'est exigée qu'au moment de l'envoi (send + worker), pour
 * ne pas bloquer la duplication de vieilles campagnes dont le bien a été
 * dépublié entre-temps.
 */
export async function assertPropertyExists(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .maybeSingle();
  return data ? null : 'Bien introuvable';
}

/** Le bien d'une campagne doit exister et être publié pour un envoi. */
export async function assertPublishedProperty(
  supabase: SupabaseClient,
  propertyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('properties')
    .select('id, status')
    .eq('id', propertyId)
    .maybeSingle();
  if (!data) return 'Bien introuvable';
  if (data.status !== 'published') return "Le bien n'est pas publié";
  return null;
}
