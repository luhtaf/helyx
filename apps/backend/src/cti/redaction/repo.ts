import { randomUUID } from 'node:crypto';
import { getSession } from '../../db/neo4j.js';
import {
  REDACTION_BUILTINS,
  type RedactionProfile,
  type RedactionPolicies,
} from './types.js';

// Tenant-scoped — every Cypher includes WHERE p.tenantId = $tenantId.

const RETURN_FIELDS = `
  p.id AS id, p.tenantId AS tenantId, p.slug AS slug,
  p.name AS name, p.description AS description,
  coalesce(p.includeRuleNames, true) AS includeRuleNames,
  coalesce(p.includeRuleDescriptions, true) AS includeRuleDescriptions,
  coalesce(p.includeRuleTags, true) AS includeRuleTags,
  coalesce(p.includeOrgIdentity, true) AS includeOrgIdentity,
  coalesce(p.builtin, false) AS builtin,
  toString(p.createdAt) AS createdAt
`;

function recordToProfile(rec: { get: (k: string) => unknown }): RedactionProfile {
  return {
    id: rec.get('id') as string,
    tenantId: rec.get('tenantId') as string,
    slug: rec.get('slug') as string,
    name: rec.get('name') as string,
    description: rec.get('description') as string,
    includeRuleNames: rec.get('includeRuleNames') as boolean,
    includeRuleDescriptions: rec.get('includeRuleDescriptions') as boolean,
    includeRuleTags: rec.get('includeRuleTags') as boolean,
    includeOrgIdentity: rec.get('includeOrgIdentity') as boolean,
    builtin: rec.get('builtin') as boolean,
    createdAt: rec.get('createdAt') as string,
  };
}

/**
 * Lazy-seed the 3 builtin profiles for this tenant. Idempotent — MERGE
 * on (tenantId, slug). Called by listRedactionProfiles so the operator
 * always sees them on first visit, no admin script required.
 */
async function ensureBuiltins(tenantId: string): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx) => {
      for (const b of REDACTION_BUILTINS) {
        await tx.run(
          `MERGE (p:RedactionProfile {tenantId: $tenantId, slug: $slug})
           ON CREATE SET p.id = $id, p.name = $name, p.description = $description,
                         p.includeRuleNames = $includeRuleNames,
                         p.includeRuleDescriptions = $includeRuleDescriptions,
                         p.includeRuleTags = $includeRuleTags,
                         p.includeOrgIdentity = $includeOrgIdentity,
                         p.builtin = true,
                         p.createdAt = datetime()`,
          {
            tenantId,
            slug: b.slug,
            id: randomUUID(),
            name: b.name,
            description: b.description,
            ...b.policies,
          },
        );
      }
    });
  } finally {
    await session.close();
  }
}

export async function listRedactionProfiles(tenantId: string): Promise<RedactionProfile[]> {
  await ensureBuiltins(tenantId);
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (p:RedactionProfile {tenantId: $tenantId})
       RETURN ${RETURN_FIELDS}
       ORDER BY p.builtin DESC, p.name ASC`,
      { tenantId },
    );
    return r.records.map(recordToProfile);
  } finally {
    await session.close();
  }
}

export async function getRedactionProfile(
  tenantId: string,
  id: string,
): Promise<RedactionProfile | null> {
  const session = getSession();
  try {
    const r = await session.run(
      `MATCH (p:RedactionProfile {tenantId: $tenantId, id: $id})
       RETURN ${RETURN_FIELDS}`,
      { tenantId, id },
    );
    return r.records.length === 0 ? null : recordToProfile(r.records[0]!);
  } finally {
    await session.close();
  }
}

/** Resolver-time helper: extract just the policy flags (for applyRedaction). */
export function policiesOf(profile: RedactionProfile): RedactionPolicies {
  return {
    includeRuleNames: profile.includeRuleNames,
    includeRuleDescriptions: profile.includeRuleDescriptions,
    includeRuleTags: profile.includeRuleTags,
    includeOrgIdentity: profile.includeOrgIdentity,
  };
}

/** Persist a Hunt's redactionProfileId. Tenant-scoped. */
export async function setHuntRedactionProfile(
  tenantId: string,
  huntId: string,
  profileId: string | null,
): Promise<boolean> {
  const session = getSession();
  try {
    const r = await session.executeWrite(async (tx) =>
      await tx.run(
        `MATCH (h:Hunt {id: $huntId, tenantId: $tenantId})
         SET h.redactionProfileId = $profileId
         RETURN h.id AS id`,
        { tenantId, huntId, profileId },
      ),
    );
    return r.records.length > 0;
  } finally {
    await session.close();
  }
}
