import type { Migration } from './types.js';

// F3b — PDN (Pusat Data Nasional) egress allowlist. Per-tenant list of
// approved hostnames that CTI bundles are allowed to leave Helyx
// through. The guard module reads this list pre-flight on every push
// path (H7 MISP, H9 TAXII/EclecticIQ — pending).
//
// Pre-H7/H9 the guard is dormant but managed: operator builds the
// allowlist now, push paths plug into it later. assertEgressAllowed
// already exists in code so adding a push handler is a one-liner.
//
// Data model:
//   - status: 'active' | 'disabled'  (no hard delete; audit trail)
//   - hostname: lowercased + trimmed, no scheme/path. Match is
//     exact-host (no wildcard yet — keep blast radius small until
//     operators ask).
export const m024_pdn_egress: Migration = {
  id: '024_pdn_egress',
  description: 'F3b — Per-tenant PDN egress allowlist for CTI push paths.',
  up: [
    `CREATE CONSTRAINT pdn_egress_id_unique IF NOT EXISTS
     FOR (e:PdnEgressEntry) REQUIRE e.id IS UNIQUE`,

    // (tenantId, hostname) is the lookup hot path: "is acmehq.bssn.go.id
    // in this tenant's allowlist?". Composite index, not unique — we
    // soft-disable by setting status, so the same hostname could appear
    // multiple times across status flips. Repo dedupes on insert.
    `CREATE INDEX pdn_egress_tenant_hostname IF NOT EXISTS
     FOR (e:PdnEgressEntry) ON (e.tenantId, e.hostname)`,

    `CREATE INDEX pdn_egress_tenant_status IF NOT EXISTS
     FOR (e:PdnEgressEntry) ON (e.tenantId, e.status)`,
  ],
};
