import { AttackPattern, IntrusionSet, Relationship, type StixBundle } from './types.js';

export interface IntrusionSetRow {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  url: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface AttackPatternRow {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  platforms: string[];
  killChainPhases: string[];
  isSubtechnique: boolean;
}

export interface UsesEdgeRow {
  intrusionSetId: string;
  attackPatternId: string;
}

export interface MappedMitre {
  intrusionSets: IntrusionSetRow[];
  attackPatterns: AttackPatternRow[];
  uses: UsesEdgeRow[];
  skipped: { revoked: number; deprecated: number; unresolvedRefs: number };
}

function externalAttackId(refs: { source_name: string; external_id?: string }[] | undefined): string | null {
  if (!refs) return null;
  const r = refs.find((x) => x.source_name === 'mitre-attack' && x.external_id);
  return r?.external_id ?? null;
}

function externalAttackUrl(refs: { source_name: string; url?: string }[] | undefined): string | null {
  if (!refs) return null;
  const r = refs.find((x) => x.source_name === 'mitre-attack' && x.url);
  return r?.url ?? null;
}

export function mapBundle(bundle: StixBundle): MappedMitre {
  const intrusionSets: IntrusionSetRow[] = [];
  const attackPatterns: AttackPatternRow[] = [];
  const uses: UsesEdgeRow[] = [];
  const skipped = { revoked: 0, deprecated: 0, unresolvedRefs: 0 };

  const stixIdToAttackId = new Map<string, string>();
  const intrusionStixIds = new Set<string>();
  const attackPatternStixIds = new Set<string>();

  for (const raw of bundle.objects) {
    const type = (raw as { type?: string }).type;
    if (!type) continue;

    if (type === 'intrusion-set') {
      const parsed = IntrusionSet.safeParse(raw);
      if (!parsed.success) continue;
      const obj = parsed.data;
      if (obj.revoked) { skipped.revoked++; continue; }
      if (obj.x_mitre_deprecated) { skipped.deprecated++; continue; }

      const attackId = externalAttackId(obj.external_references);
      if (!attackId) continue;
      stixIdToAttackId.set(obj.id, attackId);
      intrusionStixIds.add(obj.id);

      intrusionSets.push({
        id: attackId,
        name: obj.name,
        description: obj.description ?? null,
        aliases: obj.aliases ?? [],
        url: externalAttackUrl(obj.external_references),
        createdAt: obj.created ?? null,
        modifiedAt: obj.modified ?? null,
      });
    } else if (type === 'attack-pattern') {
      const parsed = AttackPattern.safeParse(raw);
      if (!parsed.success) continue;
      const obj = parsed.data;
      if (obj.revoked) { skipped.revoked++; continue; }
      if (obj.x_mitre_deprecated) { skipped.deprecated++; continue; }

      const attackId = externalAttackId(obj.external_references);
      if (!attackId) continue;
      stixIdToAttackId.set(obj.id, attackId);
      attackPatternStixIds.add(obj.id);

      attackPatterns.push({
        id: attackId,
        name: obj.name,
        description: obj.description ?? null,
        url: externalAttackUrl(obj.external_references),
        platforms: obj.x_mitre_platforms ?? [],
        killChainPhases: (obj.kill_chain_phases ?? [])
          .filter((p) => p.kill_chain_name === 'mitre-attack')
          .map((p) => p.phase_name),
        isSubtechnique: obj.x_mitre_is_subtechnique ?? false,
      });
    }
  }

  for (const raw of bundle.objects) {
    const type = (raw as { type?: string }).type;
    if (type !== 'relationship') continue;
    const parsed = Relationship.safeParse(raw);
    if (!parsed.success) continue;
    const rel = parsed.data;
    if (rel.revoked) { skipped.revoked++; continue; }

    if (rel.relationship_type === 'uses'
        && intrusionStixIds.has(rel.source_ref)
        && attackPatternStixIds.has(rel.target_ref)) {
      const isId = stixIdToAttackId.get(rel.source_ref);
      const apId = stixIdToAttackId.get(rel.target_ref);
      if (!isId || !apId) { skipped.unresolvedRefs++; continue; }
      uses.push({ intrusionSetId: isId, attackPatternId: apId });
    }
  }

  return { intrusionSets, attackPatterns, uses, skipped };
}
