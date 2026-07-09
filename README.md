# OQORO Off Market

Mini-site d'investissement locatif off-market. Biens en gestion OQORO à la vente,
avec données locatives certifiées.

- **Stack** : Astro 4 (hybrid) · React islands · Tailwind · Supabase · Resend · Netlify
- **Domaine** : `offmarket.oqoro.com`

## Démarrage

```bash
npm install
cp .env.example .env.local   # et remplir les valeurs
npm run dev
```

## Variables d'environnement

Voir `.env.example`. Les `PUBLIC_*` sont exposées au navigateur. Les autres
restent côté serveur (Netlify → Site settings → Environment variables).

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
- **WS6 — Campagnes email** : `src/pages/admin/campagnes/**`,
  `src/pages/admin/api/{contacts,campagnes}/**`,
  `src/components/admin/{CampaignComposer,ContactsTable,ZonesPicker}.tsx`,
  `src/lib/{campaigns,campaign-email,zones,resend-webhook}.ts`,
  `netlify/functions/send-campaign-background.mts`,
  `src/pages/api/{resend-webhook,unsubscribe}.ts`, `src/pages/desabonnement.astro`

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
3. Cocher *Publié* puis *Publier & rebuild* → déclenche le build hook Netlify
   et régénère les pages statiques
4. Les leads arrivent dans `/admin/leads`

## Campagnes email

Onglet **Campagnes** de l'admin : envoi d'un bien mis en avant à un segment de
contacts (propriétaires / investisseurs), via l'API Resend.

- **Contacts** (`/admin/campagnes/contacts`) : saisie manuelle, import CSV
  (colonnes `prenom,nom,email,telephone,type,zones` — zones = codes département
  séparés par `|`, type ∈ `proprietaire|investisseur|mixte`), ou conversion
  d'un lead. Un contact sans zone cherche dans toute la France.
- **Composer** (`/admin/campagnes/new`) : bien publié → audience (type × zones,
  compteur live) → objet + intro → aperçu → brouillon / test / envoi.
- **Envoi** : snapshot des destinataires puis batchs Resend de 100 via la
  background function Netlify `send-campaign-background` (jusqu'à 15 min).
  Chaque email porte un lien de désabonnement + header `List-Unsubscribe`
  (one-click RFC 8058).
- **Stats** : délivrés / ouverts / cliqués / bounces / plaintes via webhook
  Resend ; une plainte spam désabonne le contact.

### Mise en service

1. Appliquer `supabase/migrations/0006_email_campaigns.sql` dans le SQL editor.
2. Renseigner `CAMPAIGN_FUNCTION_SECRET` (longue chaîne aléatoire) dans les
   variables d'environnement Netlify.
3. Dans Resend : activer le tracking **opens & clicks** sur le domaine
   d'envoi, puis créer un webhook vers
   `https://offmarket.oqoro.com/api/resend-webhook` avec les événements
   `delivered`, `opened`, `clicked`, `bounced`, `complained`, et copier le
   signing secret dans `RESEND_WEBHOOK_SECRET`.
4. Les background functions Netlify nécessitent un plan qui les supporte
   (elles sont exécutées en synchrone par `netlify dev` en local).
5. Premier envoi : tester sur un segment ne contenant que les adresses de
   l'équipe.

## Déploiement Netlify

1. **Connecter le repo GitHub** dans Netlify → *Add new site → Import existing project*.
   Build command et publish dir sont définis dans `netlify.toml`.
2. **Renseigner les variables d'environnement** listées dans `.env.example`
   (Site settings → Environment variables).
3. **Créer un Build Hook** : Site settings → Build & deploy → Build hooks →
   *Add build hook*. Copier l'URL dans la variable `NETLIFY_BUILD_HOOK`.
4. **Pointer le domaine** `offmarket.oqoro.com` (Domains → Add custom domain →
   CNAME vers `{site}.netlify.app`).
