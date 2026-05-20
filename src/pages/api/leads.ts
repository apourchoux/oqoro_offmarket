import type { APIRoute } from 'astro';
import { getAdminClient, insertLead } from '../../lib/supabase';
import { sendLeadConfirmation, sendLeadNotification } from '../../lib/resend';
import { rateLimit } from '../../lib/security';
import type { Property } from '../../lib/types';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EMAIL = 254;
const MAX_NAME = 100;
const MAX_PHONE = 50;
const PHONE_REGEX = /^[+0-9 .()\-]{4,50}$/;

interface LeadPayload {
  property_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  budget?: string;
  source?: string;
  // Honeypot — un humain ne le voit pas (display:none), un bot le remplit.
  website?: string;
  hp?: string;
}

function isFormSubmission(request: Request): boolean {
  const ct = request.headers.get('content-type') ?? '';
  return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

async function readPayload(request: Request): Promise<LeadPayload | null> {
  if (isFormSubmission(request)) {
    const form = await request.formData();
    return {
      property_id: (form.get('property_id') as string | null) || null,
      first_name: (form.get('first_name') as string | null) ?? '',
      last_name: (form.get('last_name') as string | null) ?? '',
      email: (form.get('email') as string | null) ?? '',
      phone: (form.get('phone') as string | null) ?? '',
      budget: (form.get('budget') as string | null) ?? '',
      source: (form.get('source') as string | null) ?? '',
      website: (form.get('website') as string | null) ?? '',
      hp: (form.get('hp') as string | null) ?? '',
    };
  }
  try {
    return (await request.json()) as LeadPayload;
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request, redirect, clientAddress }) => {
  const useFormFlow = isFormSubmission(request);
  const ip = clientAddress || 'unknown';

  // Rate-limit IP : 10 leads / minute. Largement au-dessus d'un usage humain,
  // bloque le spam automatisé.
  const rl = rateLimit(`leads:${ip}`, 10, 60 * 1000);
  if (!rl.ok) {
    return useFormFlow
      ? redirect('/?lead=error&msg=rate#alerte', 303)
      : json({ error: 'Trop de tentatives, réessayez plus tard.' }, 429);
  }

  const payload = await readPayload(request);

  if (!payload) {
    return useFormFlow
      ? redirect('/?lead=error&msg=invalid', 303)
      : json({ error: 'JSON invalide' }, 400);
  }

  // Honeypot : si un bot remplit un champ caché, on renvoie un succès factice
  // pour ne pas l'aider à itérer, mais on n'écrit rien.
  if ((payload.website ?? '').trim() !== '' || (payload.hp ?? '').trim() !== '') {
    const source = (payload.source ?? '').trim().slice(0, 50) || 'unknown';
    return useFormFlow
      ? redirect(`/?lead=ok&from=${encodeURIComponent(source)}#alerte`, 303)
      : json({ success: true });
  }

  const email = (payload.email ?? '').trim();
  const source = (payload.source ?? '').trim().slice(0, 50) || 'unknown';
  const fromQs = `&from=${encodeURIComponent(source)}`;
  if (!email || email.length > MAX_EMAIL || !EMAIL_REGEX.test(email)) {
    return useFormFlow
      ? redirect(`/?lead=error&msg=email${fromQs}#alerte`, 303)
      : json({ error: 'Email invalide' }, 400);
  }

  const first_name = ((payload.first_name ?? '').trim() || '—').slice(0, MAX_NAME);
  const last_name = ((payload.last_name ?? '').trim() || '—').slice(0, MAX_NAME);
  const phoneRaw = (payload.phone ?? '').trim();
  const phone = phoneRaw ? phoneRaw.slice(0, MAX_PHONE) : '—';
  if (phoneRaw && !PHONE_REGEX.test(phone)) {
    return useFormFlow
      ? redirect(`/?lead=error&msg=phone${fromQs}#alerte`, 303)
      : json({ error: 'Téléphone invalide' }, 400);
  }

  const propertyIdRaw = payload.property_id ?? null;
  const property_id =
    propertyIdRaw && UUID_REGEX.test(String(propertyIdRaw))
      ? String(propertyIdRaw)
      : null;

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

    return useFormFlow
      ? redirect(`/?lead=ok${fromQs}#alerte`, 303)
      : json({ success: true });
  } catch (err) {
    console.error('[api/leads] error');
    return useFormFlow
      ? redirect(`/?lead=error&msg=server${fromQs}#alerte`, 303)
      : json({ error: "Erreur serveur lors de l'enregistrement" }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
