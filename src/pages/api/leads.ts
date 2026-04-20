import type { APIRoute } from 'astro';
import { getAdminClient, insertLead } from '../../lib/supabase';
import { sendLeadConfirmation, sendLeadNotification } from '../../lib/resend';
import type { Property } from '../../lib/types';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LeadPayload {
  property_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export const POST: APIRoute = async ({ request }) => {
  let payload: LeadPayload;
  try {
    payload = (await request.json()) as LeadPayload;
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const first_name = (payload.first_name ?? '').trim();
  const last_name = (payload.last_name ?? '').trim();
  const email = (payload.email ?? '').trim();
  const phone = (payload.phone ?? '').trim();
  const property_id = payload.property_id ?? null;

  if (!first_name || !last_name || !email || !phone) {
    return json({ error: 'Tous les champs sont requis' }, 400);
  }
  if (!EMAIL_REGEX.test(email)) {
    return json({ error: 'Email invalide' }, 400);
  }
  if (first_name.length > 100 || last_name.length > 100 || phone.length > 50) {
    return json({ error: 'Champs trop longs' }, 400);
  }

  try {
    const lead = await insertLead({
      property_id,
      first_name,
      last_name,
      email,
      phone,
    });

    let property: Property | null = null;
    if (property_id) {
      const supabase = getAdminClient();
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('id', property_id)
        .maybeSingle();
      property = (data as Property) ?? null;
    }

    await Promise.allSettled([
      sendLeadNotification(lead, property),
      sendLeadConfirmation(lead, property),
    ]);

    return json({ success: true });
  } catch (err) {
    console.error('[api/leads] error', err);
    return json({ error: "Erreur serveur lors de l'enregistrement" }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
