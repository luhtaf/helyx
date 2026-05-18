import type { Migration } from './types.js';

// Phase Z — OIDC SSO config moved from env to DB so it's admin-panel
// managed (no redeploy to point at a new IdP).
//
// Singleton: exactly one :OidcConfig with id='singleton'. SSO is
// instance-global, NOT per-tenant — login happens before org context
// exists (no activeOrgId yet), so one IdP serves the whole deployment.
// Managed by OWNER (consistent with other /admin/* OWNER surfaces).
//
// clientSecret is stored AES-256-GCM sealed (crypto/secretbox.ts,
// CTI_SIGNING_MASTER_KEY tier) — never returned by the admin query,
// only decrypted in-memory at token-exchange time.
export const m027_oidc_config: Migration = {
  id: '027_oidc_config',
  description: 'OIDC SSO config singleton (:OidcConfig) — DB-driven, admin-managed.',
  up: [
    `CREATE CONSTRAINT oidc_config_id_unique IF NOT EXISTS
     FOR (c:OidcConfig) REQUIRE c.id IS UNIQUE`,
  ],
};
