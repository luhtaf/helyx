// F3a — RedactionProfile type + builtin slugs/seeds.
//
// SoT for what fields the operator can mask. Adding a new field policy
// requires updating: this file, repo's serializer, schema's GraphQL type,
// applyRedaction's filter, FE composable's type, and view label.

export const REDACTION_BUILTIN_SLUGS = ['minimal', 'context', 'full'] as const;
export type RedactionBuiltinSlug = (typeof REDACTION_BUILTIN_SLUGS)[number];

export interface RedactionPolicies {
  /** Indicator.name */
  includeRuleNames: boolean;
  /** Indicator.description */
  includeRuleDescriptions: boolean;
  /** Indicator.labels (tags can leak adversary names + internal codenames) */
  includeRuleTags: boolean;
  /** Identity object + created_by_ref refs (origin attribution) */
  includeOrgIdentity: boolean;
}

export interface RedactionProfile extends RedactionPolicies {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string;
  builtin: boolean;
  createdAt: string;
}

interface BuiltinSpec {
  slug: RedactionBuiltinSlug;
  name: string;
  description: string;
  policies: RedactionPolicies;
}

// Three builtin profiles. 'full' = no masking (default behavior).
// 'context' = strip org attribution but keep operator notes (good for
// peer-agency sharing). 'minimal' = patterns + TLP only (most defensive,
// for unknown-trust downstream).
export const REDACTION_BUILTINS: BuiltinSpec[] = [
  {
    slug: 'full',
    name: 'Full',
    description: 'No masking — every field of every indicator is included along with org identity.',
    policies: {
      includeRuleNames: true,
      includeRuleDescriptions: true,
      includeRuleTags: true,
      includeOrgIdentity: true,
    },
  },
  {
    slug: 'context',
    name: 'Context',
    description: 'Keep names + descriptions + tags; strip org identity (anonymous origin). Suitable for peer-agency sharing.',
    policies: {
      includeRuleNames: true,
      includeRuleDescriptions: true,
      includeRuleTags: true,
      includeOrgIdentity: false,
    },
  },
  {
    slug: 'minimal',
    name: 'Minimal',
    description: 'Pattern + TLP only. Strips name, description, tags, and org identity. Use for unknown-trust downstream.',
    policies: {
      includeRuleNames: false,
      includeRuleDescriptions: false,
      includeRuleTags: false,
      includeOrgIdentity: false,
    },
  },
];

export function findBuiltin(slug: string): BuiltinSpec | undefined {
  return REDACTION_BUILTINS.find((b) => b.slug === slug);
}
