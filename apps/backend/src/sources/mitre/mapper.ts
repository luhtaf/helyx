import { mapTactics, mapTechniqueTacticEdges, type TacticRow, type TechniqueTacticEdge } from './tactics.mapper.js';
import {
  AttackPattern,
  DataComponent,
  DataSource,
  IntrusionSet,
  Relationship,
  type StixBundle,
} from './types.js';

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
  detection: string | null;
  dataSources: string[];
  killChainPhases: string[];
  isSubtechnique: boolean;
}

export interface DataSourceRow {
  id: string;
  stixId: string;
  name: string;
  description: string | null;
  url: string | null;
  platforms: string[];
}

export interface DataComponentRow {
  id: string;
  name: string;
  description: string | null;
  dataSourceStixId: string;
}

export interface UsesEdgeRow {
  intrusionSetId: string;
  attackPatternId: string;
}

export interface DetectsEdgeRow {
  dataComponentStixId: string;
  attackPatternId: string;
}

export interface MappedMitre {
  intrusionSets: IntrusionSetRow[];
  attackPatterns: AttackPatternRow[];
  tactics: TacticRow[];
  techniqueTactics: TechniqueTacticEdge[];
  uses: UsesEdgeRow[];
  dataSources: DataSourceRow[];
  dataComponents: DataComponentRow[];
  detects: DetectsEdgeRow[];
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

function dataComponentIdFromStix(stixId: string): string {
  // Data components have no ATT&CK external_id, so we persist the UUID suffix of the STIX id.
  return stixId.replace(/^x-mitre-data-component--/, '');
}

export function mapBundle(bundle: StixBundle): MappedMitre {
  const intrusionSets: IntrusionSetRow[] = [];
  const attackPatterns: AttackPatternRow[] = [];
  const dataSources: DataSourceRow[] = [];
  const dataComponents: DataComponentRow[] = [];
  const uses: UsesEdgeRow[] = [];
  const detects: DetectsEdgeRow[] = [];
  const skipped = { revoked: 0, deprecated: 0, unresolvedRefs: 0 };

  const stixIdToExternalId = new Map<string, string>();
  const dataComponentStixIdToId = new Map<string, string>();
  const intrusionStixIds = new Set<string>();
  const attackPatternStixIds = new Set<string>();
  const dataComponentStixIds = new Set<string>();

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
      stixIdToExternalId.set(obj.id, attackId);
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
      stixIdToExternalId.set(obj.id, attackId);
      attackPatternStixIds.add(obj.id);

      attackPatterns.push({
        id: attackId,
        name: obj.name,
        description: obj.description ?? null,
        url: externalAttackUrl(obj.external_references),
        platforms: obj.x_mitre_platforms ?? [],
        detection: obj.x_mitre_detection ?? null,
        dataSources: obj.x_mitre_data_sources ?? [],
        killChainPhases: (obj.kill_chain_phases ?? [])
          .filter((p) => p.kill_chain_name === 'mitre-attack')
          .map((p) => p.phase_name),
        isSubtechnique: obj.x_mitre_is_subtechnique ?? false,
      });
    } else if (type === 'x-mitre-data-source') {
      const parsed = DataSource.safeParse(raw);
      if (!parsed.success) continue;
      const obj = parsed.data;
      if (obj.revoked) { skipped.revoked++; continue; }
      if (obj.x_mitre_deprecated) { skipped.deprecated++; continue; }

      const dataSourceId = externalAttackId(obj.external_references);
      if (!dataSourceId) continue;
      stixIdToExternalId.set(obj.id, dataSourceId);

      dataSources.push({
        id: dataSourceId,
        stixId: obj.id,
        name: obj.name,
        description: obj.description ?? null,
        url: externalAttackUrl(obj.external_references),
        platforms: obj.x_mitre_platforms ?? [],
      });
    } else if (type === 'x-mitre-data-component') {
      const parsed = DataComponent.safeParse({
        ...raw,
        x_mitre_data_source_ref: typeof (raw as { x_mitre_data_source_ref?: unknown }).x_mitre_data_source_ref === 'string'
          ? (raw as { x_mitre_data_source_ref: string }).x_mitre_data_source_ref
          : '',
      });
      if (!parsed.success) continue;
      const obj = parsed.data;
      if (obj.revoked) { skipped.revoked++; continue; }
      if (obj.x_mitre_deprecated) { skipped.deprecated++; continue; }

      const dataComponentId = dataComponentIdFromStix(obj.id);
      dataComponentStixIdToId.set(obj.id, dataComponentId);
      dataComponentStixIds.add(obj.id);

      dataComponents.push({
        id: dataComponentId,
        name: obj.name,
        description: obj.description ?? null,
        dataSourceStixId: obj.x_mitre_data_source_ref,
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
      const isId = stixIdToExternalId.get(rel.source_ref);
      const apId = stixIdToExternalId.get(rel.target_ref);
      if (!isId || !apId) { skipped.unresolvedRefs++; continue; }
      uses.push({ intrusionSetId: isId, attackPatternId: apId });
    } else if (rel.relationship_type === 'detects'
        && dataComponentStixIds.has(rel.source_ref)
        && attackPatternStixIds.has(rel.target_ref)) {
      const dataComponentId = dataComponentStixIdToId.get(rel.source_ref);
      const attackPatternId = stixIdToExternalId.get(rel.target_ref);
      if (!dataComponentId || !attackPatternId) { skipped.unresolvedRefs++; continue; }
      detects.push({ dataComponentStixId: dataComponentId, attackPatternId });
    }
  }

  return {
    intrusionSets,
    attackPatterns,
    tactics: mapTactics(bundle),
    techniqueTactics: mapTechniqueTacticEdges(bundle),
    uses,
    dataSources,
    dataComponents,
    detects,
    skipped,
  };
}
