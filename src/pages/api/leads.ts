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
  budget?: string;
  source?: string;
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
    };
  }
  try {
    return (await request.json()) as LeadPayload;
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const useFormFlow = isFormSubmission(request);
  const payload = await readPayload(request);

  if (!payload) {
    return useFormFlow
      ? redirect('/?lead=error&msg=invalid', 303)
      : json({ error: 'JSON invalide' }, 400);
  }

  const email = (payload.email ?? '').trim();
  const source = (payload.source ?? '').trim().slice(0, 50) || 'unknown';
  const fromQs = `&from=${encodeURIComponent(source)}`;
  if (!email || !EMAIL_REGEX.test(email)) {
    return useFormFlow
      ? redirect(`/?lead=error&msg=email${fromQs}#alerte`, 303)
      : json({ error: 'Email invalide' }, 400);
  }

  const first_name = (payload.first_name ?? '').trim() || '—';
  const last_name = (payload.last_name ?? '').trim() || '—';
  const phone = (payload.phone ?? '').trim() || '—';
  const property_id = payload.property_id ?? null;

  if (first_name.length > 100 || last_name.length > 100 || phone.length > 50) {
    return useFormFlow
      ? redirect(`/?lead=error&msg=length${fromQs}#alerte`, 303)
      : json({ error: 'Champs trop longs' }, 400);
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

    return useFormFlow
      ? redirect(`/?lead=ok${fromQs}#alerte`, 303)
      : json({ success: true });
  } catch (err) {
    console.error('[api/leads] error', err);
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
