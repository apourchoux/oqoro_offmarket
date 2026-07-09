// Helpers partagés des endpoints campagnes (fichier préfixé `_` : pas une route).

import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidDepartement } from '../../../../lib/zones';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TARGET_TYPES = ['tous', 'proprietaire', 'investisseur'] as const;

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
  if ('subject' in body) {
    if (typeof body.subject !== 'string' || body.subject.length > 300) {
      return { error: 'Objet invalide' };
    }
    fields.subject = body.subject.trim();
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

/** Le bien d'une campagne doit exister et être publié pour un envoi/preview. */
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
