import type { RedactionPolicies } from './types.js';

// F3a — pure-function masker over an in-memory STIX bundle.
//
// Mutating the bundle in place would surprise callers; we shallow-clone
// the objects array + the touched objects so the validator + sign path
// downstream see a consistent shape and the original bundle (if cached)
// stays intact.
//
// Field-mask policy:
//   - includeRuleNames=false        → indicator.name omitted
//   - includeRuleDescriptions=false → indicator.description omitted
//   - includeRuleTags=false         → indicator.labels omitted
//   - includeOrgIdentity=false      → identity object stripped + every
//                                     created_by_ref dropped from
//                                     remaining objects (no dangling ref)

interface StixBundleLike {
  type: 'bundle';
  id: string;
  objects: Record<string, unknown>[];
}

interface RedactionStats {
  indicatorsMasked: number;
  identityStripped: boolean;
  policiesApplied: RedactionPolicies;
}

export interface RedactionResult {
  bundle: StixBundleLike;
  stats: RedactionStats;
}

const FULL_PASS: RedactionPolicies = {
  includeRuleNames: true,
  includeRuleDescriptions: true,
  includeRuleTags: true,
  includeOrgIdentity: true,
};

function isFullPass(p: RedactionPolicies): boolean {
  return (
    p.includeRuleNames &&
    p.includeRuleDescriptions &&
    p.includeRuleTags &&
    p.includeOrgIdentity
  );
}

export function applyRedaction(
  bundle: StixBundleLike,
  policies: RedactionPolicies | null,
): RedactionResult {
  const effective = policies ?? FULL_PASS;
  // Fast path: no policy or 'full' profile → return same bundle, zero work.
  if (isFullPass(effective)) {
    return { bundle, stats: { indicatorsMasked: 0, identityStripped: false, policiesApplied: effective } };
  }

  let identityStripped = false;
  let indicatorsMasked = 0;

  const next = bundle.objects.flatMap((obj) => {
    const type = obj.type;

    if (type === 'identity' && !effective.includeOrgIdentity) {
      identityStripped = true;
      return [];
    }

    if (type === 'indicator') {
      const cloned: Record<string, unknown> = { ...obj };
      let touched = false;
      if (!effective.includeRuleNames && 'name' in cloned) {
        delete cloned.name;
        touched = true;
      }
      if (!effective.includeRuleDescriptions && 'description' in cloned) {
        delete cloned.description;
        touched = true;
      }
      if (!effective.includeRuleTags && 'labels' in cloned) {
        delete cloned.labels;
        touched = true;
      }
      if (!effective.includeOrgIdentity && 'created_by_ref' in cloned) {
        // Drop the ref since the Identity itself is gone — leaving a
        // dangling created_by_ref breaks STIX 2.1 referential integrity.
        delete cloned.created_by_ref;
        touched = true;
      }
      if (touched) indicatorsMasked++;
      return [cloned];
    }

    // Other object types pass through. If we add Identity-referring
    // SDOs later (relationship, sighting), extend here.
    if (!effective.includeOrgIdentity && 'created_by_ref' in obj) {
      const cloned: Record<string, unknown> = { ...obj };
      delete cloned.created_by_ref;
      return [cloned];
    }
    return [obj];
  });

  return {
    bundle: { type: 'bundle', id: bundle.id, objects: next },
    stats: { indicatorsMasked, identityStripped, policiesApplied: effective },
  };
}
