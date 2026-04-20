# OQORO Off Market

Mini-site d'investissement locatif off-market. Biens en gestion OQORO à la vente,
avec données locatives certifiées.

- **Stack** : Astro 4 (hybrid) · React islands · Tailwind · Supabase · Resend · Cloudflare Pages
- **Domaine** : `offmarket.oqoro.com`

## Démarrage

```bash
npm install
cp .env.example .env.local   # et remplir les valeurs
npm run dev
```

## Variables d'environnement

Voir `.env.example`. Les `PUBLIC_*` sont exposées au navigateur. Les autres
restent côté serveur (Cloudflare Pages → Settings → Environment variables).

## Base de données

Le schéma complet est dans `supabase/schema.sql`. À exécuter une fois dans le
SQL editor Supabase, puis :

1. Créer un bucket Storage `property-photos` (public).
2. Créer un utilisateur admin dans **Authentication → Users**.
3. Ajouter son email à `ADMIN_EMAILS`.

## Architecture

Chaque workstream du PRD est mappé sur des fichiers dédiés :

- **WS1 — Fondations** : `src/lib/types.ts` (contrat partagé),
  `src/lib/supabase.ts`, `supabase/schema.sql`, `astro.config.mjs`
- **WS2 — Design system** : `tailwind.config.js`, `src/styles/global.css`,
  `src/layouts/Base.astro`, `src/components/*.astro`
- **WS3 — Admin** : `src/pages/admin/**`, `src/components/admin/**`,
  `src/middleware.ts`
- **WS4 — Pages publiques** : `src/pages/index.astro`,
  `src/pages/biens/[slug].astro`
- **WS5 — Leads & emails** : `src/components/ContactModal.tsx`,
  `src/pages/api/leads.ts`, `src/lib/resend.ts`

## Scripts

```bash
npm run dev        # Dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run typecheck  # astro check
```

## Workflow éditorial

1. Admin → `/admin/login`
2. Créer / éditer un bien
3. Cocher *Publié* puis *Publier & rebuild* → déclenche le deploy hook
   Cloudflare Pages et régénère les pages statiques
4. Les leads arrivent dans `/admin/leads`
