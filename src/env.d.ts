/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM: string;
  readonly LEAD_NOTIFICATION_TO: string;
  readonly LEAD_NOTIFICATION_CC: string;
  readonly ADMIN_EMAILS: string;
  readonly NETLIFY_BUILD_HOOK: string;
  readonly PUBLIC_GA_MEASUREMENT_ID: string;
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      email: string;
    };
  }
}
