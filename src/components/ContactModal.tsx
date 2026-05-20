import { useEffect, useState, type FormEvent } from 'react';

interface ContactModalProps {
  propertyId: string;
  propertyTitle: string;
  propertyAddress: string;
  propertyPrice: string;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function ContactModal({
  propertyId,
  propertyTitle,
  propertyAddress,
  propertyPrice,
}: ContactModalProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const triggers = document.querySelectorAll<HTMLElement>(
      '[data-contact-trigger]',
    );
    const openModal = () => setOpen(true);
    triggers.forEach((t) => t.addEventListener('click', openModal));
    return () => {
      triggers.forEach((t) => t.removeEventListener('click', openModal));
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      property_id: propertyId,
      first_name: String(formData.get('first_name') ?? '').trim(),
      last_name: String(formData.get('last_name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      // Honeypot anti-bot — invisible pour l'utilisateur.
      website: String(formData.get('website') ?? ''),
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Une erreur est survenue');
      }
      setStatus('success');
      // GA event lead_submit (contact bien)
      if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'lead_submit', {
          source: 'contact_modal',
          property_id: propertyId,
          property_title: propertyTitle,
        });
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Une erreur est survenue',
      );
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
      />
      <div className="relative bg-white rounded-card max-w-md w-full shadow-xl">
        <button
          type="button"
          aria-label="Fermer"
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-oq-bg text-oq-muted"
        >
          ×
        </button>

        <div className="px-6 pt-6 pb-4 border-b border-oq-border">
          <div className="text-[12px] font-bold uppercase tracking-wider text-oq-muted mb-1">
            OQORO Off Market
          </div>
          <h2
            id="contact-modal-title"
            className="text-[18px] font-bold text-oq-black"
          >
            {propertyTitle}
          </h2>
          <p className="text-[13px] text-oq-muted mt-1">
            {propertyAddress} · {propertyPrice}
          </p>
        </div>

        {status === 'success' ? (
          <div className="p-6 text-center">
            <div className="text-[15px] font-semibold text-oq-black mb-2">
              Demande envoyée
            </div>
            <p className="text-[14px] text-oq-text">
              Notre équipe transaction vous recontacte sous 24-48h.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="oq-btn-secondary mt-6"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-[13px] text-oq-muted">
              Recevez le dossier complet et les modalités de visite.
            </p>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="first_name" className="oq-label">
                  Prénom
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  className="oq-input"
                />
              </div>
              <div>
                <label htmlFor="last_name" className="oq-label">
                  Nom
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  className="oq-input"
                />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="oq-label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="oq-input"
              />
            </div>
            <div>
              <label htmlFor="phone" className="oq-label">
                Téléphone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                className="oq-input"
              />
            </div>
            {errorMessage && (
              <p className="text-[13px] text-oq-red">{errorMessage}</p>
            )}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="oq-btn-dark w-full disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Envoi…' : 'Envoyer ma demande'}
            </button>
            <p className="text-[11px] text-oq-muted text-center">
              Vos données ne seront utilisées que pour répondre à cette demande.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
