import type { Migration } from './types.js';

// H5 — STIX 2.1 export persistence. Every download produces a
// :StixExport node so /exports/:id can be a graph-hub detail page
// (per CLAUDE.md no-terminal-state convention). Bundle bytes are
// re-generatable from the source Hunt + included rules; we persist
// metadata + signature only, never the bytes.
//
// Derived from a Hunt; references the rules included in the bundle.
// Carries the F2 signature so verifiers can later confirm authenticity.
export const m019_stix_export: Migration = {
  id: '019_stix_export',
  description: 'H5 — :StixExport persistence (metadata + signature, not bundle bytes).',
  up: [
    `CREATE CONSTRAINT stix_export_id_unique IF NOT EXISTS
     FOR (e:StixExport) REQUIRE e.id IS UNIQUE`,

    `CREATE INDEX stix_export_tenant_ts IF NOT EXISTS
     FOR (e:StixExport) ON (e.tenantId, e.ts)`,

    // Source: from which Hunt did this export originate
    `CREATE INDEX stix_export_hunt IF NOT EXISTS
     FOR (e:StixExport) ON (e.huntId)`,

    // (:StixExport)-[:DERIVED_FROM]->(:Hunt) — graph traversal for detail page
    // (:StixExport)-[:INCLUDES]->(:DetectionRule) — what's in the bundle
    // (:StixExport)-[:SIGNED_BY]->(:CtiOrgKeypair) — F2 signature provenance
    // No additional constraints needed — these edges use existing node IDs.
  ],
};
