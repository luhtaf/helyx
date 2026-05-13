// Transform registry — Maltego-style enrichment actions per NodeType.
//
// Each transform owns its query shape via Transform<TResponse> generic.
// `expand()` is pure — easy to unit test in isolation when test runner
// lands.
//
// File-size discipline (CLAUDE.md): when this exceeds ~250 LoC OR > 15
// transforms, split per-NodeType into transforms/{stakeholder,asset,cve,
// case}.ts re-exported from transforms/index.ts.

import gql from 'graphql-tag';
import type { ExpandResult, GraphNode, Transform } from './graph-types';
import { edgeId, nodeId } from './graph-types';

// ─── Stakeholder transforms ─────────────────────────────────────────

interface StakeholderAssetsResp {
  stakeholder: { assets: { id: string; name: string; kind: string; hostname: string | null }[] } | null;
}
const STAKEHOLDER_ASSETS = gql`
  query GraphStakeholderAssets($id: ID!) {
    stakeholder(id: $id) {
      assets(limit: 50) { id name kind hostname }
    }
  }
`;

const tStakeholderAssets: Transform<StakeholderAssetsResp> = {
  id: 'stakeholder.assets',
  label: 'Show owned assets',
  description: 'Assets the stakeholder owns (Stakeholder→OWNS→Asset).',
  appliesTo: 'Stakeholder',
  cap: 50,
  query: STAKEHOLDER_ASSETS,
  expand: (resp, parent) => {
    const assets = resp.stakeholder?.assets ?? [];
    return {
      nodes: assets.map((a) => ({
        id: nodeId('Asset', a.id),
        entityId: a.id,
        type: 'Asset',
        label: a.name,
        data: { kind: a.kind, hostname: a.hostname },
      })),
      edges: assets.map((a) => ({
        id: edgeId(parent.id, nodeId('Asset', a.id), 'OWNS'),
        source: parent.id,
        target: nodeId('Asset', a.id),
        edgeType: 'OWNS',
        label: 'owns',
      })),
    };
  },
};

interface StakeholderCvesResp {
  stakeholder: {
    cves: {
      total: number;
      items: { cveId: string; severity: string | null; baseScore: number | null; description: string | null }[];
    };
  } | null;
}
const STAKEHOLDER_CVES = gql`
  query GraphStakeholderCves($id: ID!) {
    stakeholder(id: $id) {
      cves(perPage: 25, mode: BEAST) {
        total
        items { cveId severity baseScore description }
      }
    }
  }
`;

const tStakeholderCves: Transform<StakeholderCvesResp> = {
  id: 'stakeholder.cves',
  label: 'Show CVEs (all paths)',
  description: 'CVEs via SBOM chain + scanner attribution. UNION of both sources.',
  appliesTo: 'Stakeholder',
  cap: 25,
  query: STAKEHOLDER_CVES,
  expand: (resp, parent): ExpandResult => {
    const items = resp.stakeholder?.cves.items ?? [];
    const total = resp.stakeholder?.cves.total ?? 0;
    return {
      nodes: items.map((c) => ({
        id: nodeId('CVE', c.cveId),
        entityId: c.cveId,
        type: 'CVE',
        label: c.cveId,
        data: { severity: c.severity ?? 'NONE', baseScore: c.baseScore, description: c.description },
      })),
      edges: items.map((c) => ({
        id: edgeId(parent.id, nodeId('CVE', c.cveId), 'AFFECTED_BY'),
        source: parent.id,
        target: nodeId('CVE', c.cveId),
        edgeType: 'AFFECTED_BY',
        label: c.severity ?? '',
      })),
      totalAvailable: total,
    };
  },
};

interface StakeholderCasesResp {
  stakeholder: {
    cases: { id: string; reportNo: string; title: string | null; status: string }[];
  } | null;
}
const STAKEHOLDER_CASES = gql`
  query GraphStakeholderCases($id: ID!) {
    stakeholder(id: $id) {
      cases(first: 20) { id reportNo title status }
    }
  }
`;

const tStakeholderCases: Transform<StakeholderCasesResp> = {
  id: 'stakeholder.cases',
  label: 'Show cases',
  description: 'Cases that target this stakeholder.',
  appliesTo: 'Stakeholder',
  cap: 20,
  query: STAKEHOLDER_CASES,
  expand: (resp, parent) => {
    const cases = resp.stakeholder?.cases ?? [];
    return {
      nodes: cases.map((c) => ({
        id: nodeId('Case', c.id),
        entityId: c.id,
        type: 'Case',
        label: c.reportNo,
        data: { title: c.title, status: c.status },
      })),
      edges: cases.map((c) => ({
        id: edgeId(nodeId('Case', c.id), parent.id, 'TARGETED_BY'),
        source: nodeId('Case', c.id),
        target: parent.id,
        edgeType: 'TARGETED_BY',
      })),
    };
  },
};

interface StakeholderSektorResp {
  stakeholder: { sektor: { id: string; slug: string; name: string } | null } | null;
}
const STAKEHOLDER_SEKTOR = gql`
  query GraphStakeholderSektor($id: ID!) {
    stakeholder(id: $id) { sektor { id slug name } }
  }
`;

const tStakeholderSektor: Transform<StakeholderSektorResp> = {
  id: 'stakeholder.sektor',
  label: 'Show sektor',
  description: 'Sektor classification.',
  appliesTo: 'Stakeholder',
  cap: 1,
  query: STAKEHOLDER_SEKTOR,
  expand: (resp, parent) => {
    const s = resp.stakeholder?.sektor;
    if (!s) return { nodes: [], edges: [] };
    const sektorNode = nodeId('Sektor', s.id);
    return {
      nodes: [{ id: sektorNode, entityId: s.id, type: 'Sektor', label: s.name, data: { slug: s.slug } }],
      edges: [{
        id: edgeId(parent.id, sektorNode, 'IN_SEKTOR'),
        source: parent.id,
        target: sektorNode,
        edgeType: 'IN_SEKTOR',
      }],
    };
  },
};

// ─── Asset transforms ──────────────────────────────────────────────

interface AssetStakeholderResp {
  asset: { stakeholder: { id: string; slug: string; name: string } | null } | null;
}
const ASSET_STAKEHOLDER = gql`
  query GraphAssetStakeholder($id: ID!) {
    asset(id: $id) { stakeholder { id slug name } }
  }
`;

const tAssetStakeholder: Transform<AssetStakeholderResp> = {
  id: 'asset.stakeholder',
  label: 'Show parent stakeholder',
  description: 'Stakeholder that owns this asset.',
  appliesTo: 'Asset',
  cap: 1,
  query: ASSET_STAKEHOLDER,
  expand: (resp, parent) => {
    const s = resp.asset?.stakeholder;
    if (!s) return { nodes: [], edges: [] };
    const stakeNode = nodeId('Stakeholder', s.id);
    return {
      nodes: [{ id: stakeNode, entityId: s.id, type: 'Stakeholder', label: s.name, data: { slug: s.slug } }],
      edges: [{
        id: edgeId(stakeNode, parent.id, 'OWNS'),
        source: stakeNode,
        target: parent.id,
        edgeType: 'OWNS',
      }],
    };
  },
};

interface AssetCvesResp {
  asset: {
    cveCount: number;
    cves: { cveId: string; severity: string | null; baseScore: number | null }[];
  } | null;
}
const ASSET_CVES = gql`
  query GraphAssetCves($id: ID!) {
    asset(id: $id) {
      cveCount(mode: BEAST)
      cves(mode: BEAST, limit: 25) { cveId severity baseScore }
    }
  }
`;

const tAssetCves: Transform<AssetCvesResp> = {
  id: 'asset.cves',
  label: 'Show CVEs (this asset)',
  description: 'CVEs matched via SBOM chain. ATTRIBUTED_CVE not yet exposed at Asset level (use Stakeholder for full coverage).',
  appliesTo: 'Asset',
  cap: 25,
  query: ASSET_CVES,
  expand: (resp, parent): ExpandResult => {
    const items = resp.asset?.cves ?? [];
    const total = resp.asset?.cveCount ?? items.length;
    return {
      nodes: items.map((c) => ({
        id: nodeId('CVE', c.cveId),
        entityId: c.cveId,
        type: 'CVE',
        label: c.cveId,
        data: { severity: c.severity ?? 'NONE', baseScore: c.baseScore },
      })),
      edges: items.map((c) => ({
        id: edgeId(parent.id, nodeId('CVE', c.cveId), 'AFFECTED_BY'),
        source: parent.id,
        target: nodeId('CVE', c.cveId),
        edgeType: 'AFFECTED_BY',
        label: c.severity ?? '',
      })),
      totalAvailable: total,
    };
  },
};

// ─── CVE transforms ─────────────────────────────────────────────────

interface CveAffectedAssetsResp {
  cve: {
    affectedAssets: {
      total: number;
      items: { asset: { id: string; name: string; kind: string; hostname: string | null } }[];
    };
  } | null;
}
const CVE_AFFECTED_ASSETS = gql`
  query GraphCveAffectedAssets($id: ID!) {
    cve(id: $id) {
      affectedAssets(perPage: 25) {
        total
        items { asset { id name kind hostname } }
      }
    }
  }
`;

const tCveAffectedAssets: Transform<CveAffectedAssetsResp> = {
  id: 'cve.affectedAssets',
  label: 'Show other affected assets',
  description: 'Assets in your tenant that match this CVE.',
  appliesTo: 'CVE',
  cap: 25,
  query: CVE_AFFECTED_ASSETS,
  expand: (resp, parent): ExpandResult => {
    const items = resp.cve?.affectedAssets.items ?? [];
    const total = resp.cve?.affectedAssets.total ?? items.length;
    return {
      nodes: items.map(({ asset: a }) => ({
        id: nodeId('Asset', a.id),
        entityId: a.id,
        type: 'Asset',
        label: a.name,
        data: { kind: a.kind, hostname: a.hostname },
      })),
      edges: items.map(({ asset: a }) => ({
        id: edgeId(nodeId('Asset', a.id), parent.id, 'AFFECTED_BY'),
        source: nodeId('Asset', a.id),
        target: parent.id,
        edgeType: 'AFFECTED_BY',
      })),
      totalAvailable: total,
    };
  },
};

interface CveWeaknessesResp {
  cve: { weaknesses: { id: string; name: string | null }[] } | null;
}
const CVE_WEAKNESSES = gql`
  query GraphCveWeaknesses($id: ID!) {
    cve(id: $id) { weaknesses { id name } }
  }
`;

const tCveWeaknesses: Transform<CveWeaknessesResp> = {
  id: 'cve.weaknesses',
  label: 'Show weaknesses (CWE)',
  description: 'CWE classifications attached to this CVE.',
  appliesTo: 'CVE',
  cap: 5,
  query: CVE_WEAKNESSES,
  expand: (resp, parent) => {
    const weaks = resp.cve?.weaknesses ?? [];
    return {
      nodes: weaks.map((w) => ({
        id: nodeId('CWE', w.id),
        entityId: w.id,
        type: 'CWE',
        label: w.id,
        data: { name: w.name },
      })),
      edges: weaks.map((w) => ({
        id: edgeId(parent.id, nodeId('CWE', w.id), 'WEAKNESS'),
        source: parent.id,
        target: nodeId('CWE', w.id),
        edgeType: 'WEAKNESS',
      })),
    };
  },
};

// ─── Case transforms ───────────────────────────────────────────────

interface CaseStakeholderResp {
  case: { stakeholder: { id: string; slug: string; name: string } } | null;
}
const CASE_STAKEHOLDER = gql`
  query GraphCaseStakeholder($id: ID!) {
    case(id: $id) {
      stakeholder { id slug name }
    }
  }
`;

const tCaseStakeholder: Transform<CaseStakeholderResp> = {
  id: 'case.stakeholder',
  label: 'Show targeted stakeholder',
  description: 'Stakeholder this case targets.',
  appliesTo: 'Case',
  cap: 1,
  query: CASE_STAKEHOLDER,
  expand: (resp, parent) => {
    const s = resp.case?.stakeholder;
    if (!s) return { nodes: [], edges: [] };
    const stakeNode = nodeId('Stakeholder', s.id);
    return {
      nodes: [{ id: stakeNode, entityId: s.id, type: 'Stakeholder', label: s.name, data: { slug: s.slug } }],
      edges: [{
        id: edgeId(parent.id, stakeNode, 'TARGETED_BY'),
        source: parent.id,
        target: stakeNode,
        edgeType: 'TARGETED_BY',
      }],
    };
  },
};

// ─── ThreatActor transforms ─────────────────────────────────────────

interface ActorTechniquesResp {
  threatActor: {
    techniques: { id: string; name: string; isSubtechnique: boolean }[];
  } | null;
}
const ACTOR_TECHNIQUES = gql`
  query GraphActorTechniques($id: ID!) {
    threatActor(id: $id) {
      techniques { id name isSubtechnique }
    }
  }
`;

const tActorTechniques: Transform<ActorTechniquesResp> = {
  id: 'actor.techniques',
  label: 'Show TTPs they USE',
  description: 'Every MITRE technique this actor is documented to use.',
  appliesTo: 'ThreatActor',
  cap: 200,
  // Inline picker: "How many TTPs?" Operator avoids dumping 100+ TTPs
  // (Lazarus, APT41) when they only want a sample. ThreatActor.techniques
  // BE field returns all — slice client-side post-fetch.
  varyLimit: [10, 25, 50],
  query: ACTOR_TECHNIQUES,
  expand: (resp, parent, limit) => {
    const all = resp.threatActor?.techniques ?? [];
    const ttps = limit && limit < all.length ? all.slice(0, limit) : all;
    return {
      nodes: ttps.map((t) => ({
        id: nodeId('AttackPattern', t.id),
        entityId: t.id,
        type: 'AttackPattern',
        label: t.name,
        data: { isSubtechnique: t.isSubtechnique },
      })),
      edges: ttps.map((t) => ({
        id: edgeId(parent.id, nodeId('AttackPattern', t.id), 'USES'),
        source: parent.id,
        target: nodeId('AttackPattern', t.id),
        edgeType: 'USES',
        label: 'uses',
      })),
      totalAvailable: all.length,
    };
  },
};

// ─── AttackPattern transforms ───────────────────────────────────────

interface AttackPatternActorsResp {
  attackPattern: {
    threatActors: { id: string; name: string; techniqueCount: number }[];
  } | null;
}
const ATTACK_PATTERN_ACTORS = gql`
  query GraphAttackPatternActors($id: ID!, $limit: Int) {
    attackPattern(id: $id) {
      threatActors(limit: $limit) { id name techniqueCount }
    }
  }
`;

const tAttackPatternActors: Transform<AttackPatternActorsResp> = {
  id: 'attackPattern.actors',
  label: 'Show actors who USE this',
  description: 'IntrusionSets documented to use this MITRE technique.',
  appliesTo: 'AttackPattern',
  cap: 100,
  varyLimit: [10, 25, 50],
  query: ATTACK_PATTERN_ACTORS,
  expand: (resp, parent) => {
    const actors = resp.attackPattern?.threatActors ?? [];
    return {
      nodes: actors.map((a) => ({
        id: nodeId('ThreatActor', a.id),
        entityId: a.id,
        type: 'ThreatActor',
        label: a.name,
        data: { techniqueCount: a.techniqueCount },
      })),
      edges: actors.map((a) => ({
        id: edgeId(nodeId('ThreatActor', a.id), parent.id, 'USES'),
        source: nodeId('ThreatActor', a.id),
        target: parent.id,
        edgeType: 'USES',
        label: 'uses',
      })),
    };
  },
};

// ─── AttackPattern → sub-techniques + parent ───────────────────────

interface AttackPatternSubtechResp {
  attackPattern: {
    subtechniques: { id: string; name: string; isSubtechnique: boolean }[];
  } | null;
}
const ATTACK_PATTERN_SUBTECH = gql`
  query GraphAttackPatternSubtech($id: ID!, $limit: Int) {
    attackPattern(id: $id) {
      subtechniques(limit: $limit) { id name isSubtechnique }
    }
  }
`;

const tAttackPatternSubtech: Transform<AttackPatternSubtechResp> = {
  id: 'attackPattern.subtechniques',
  label: 'Show sub-techniques',
  description: 'MITRE sub-techniques of this T-code (T1003 → T1003.001 / .002 / ...).',
  appliesTo: 'AttackPattern',
  cap: 50,
  varyLimit: [10, 25, 50],
  query: ATTACK_PATTERN_SUBTECH,
  expand: (resp, parent) => {
    const subs = resp.attackPattern?.subtechniques ?? [];
    return {
      nodes: subs.map((s) => ({
        id: nodeId('AttackPattern', s.id),
        entityId: s.id,
        type: 'AttackPattern',
        label: `${s.id} ${s.name}`,
        data: { isSubtechnique: s.isSubtechnique },
      })),
      edges: subs.map((s) => ({
        id: edgeId(parent.id, nodeId('AttackPattern', s.id), 'SUBTECHNIQUE_OF'),
        source: parent.id,
        target: nodeId('AttackPattern', s.id),
        edgeType: 'SUBTECHNIQUE_OF',
        label: 'parent of',
      })),
    };
  },
};

interface AttackPatternParentResp {
  attackPattern: {
    parentTechnique: { id: string; name: string; isSubtechnique: boolean } | null;
  } | null;
}
const ATTACK_PATTERN_PARENT = gql`
  query GraphAttackPatternParent($id: ID!) {
    attackPattern(id: $id) {
      parentTechnique { id name isSubtechnique }
    }
  }
`;

const tAttackPatternParent: Transform<AttackPatternParentResp> = {
  id: 'attackPattern.parent',
  label: 'Show parent technique',
  description: 'Roll up to the parent T-code (T1003.001 → T1003).',
  appliesTo: 'AttackPattern',
  cap: 1,
  query: ATTACK_PATTERN_PARENT,
  expand: (resp, parent) => {
    const p = resp.attackPattern?.parentTechnique;
    if (!p) return { nodes: [], edges: [] };
    const pid = nodeId('AttackPattern', p.id);
    return {
      nodes: [{
        id: pid,
        entityId: p.id,
        type: 'AttackPattern',
        label: `${p.id} ${p.name}`,
        data: { isSubtechnique: p.isSubtechnique },
      }],
      edges: [{
        id: edgeId(pid, parent.id, 'SUBTECHNIQUE_OF'),
        source: pid,
        target: parent.id,
        edgeType: 'SUBTECHNIQUE_OF',
        label: 'parent of',
      }],
    };
  },
};

// ─── DetectionRule → originating Hunts ─────────────────────────────

interface RuleHuntsResp {
  detectionRule: {
    generatedByHunts: { id: string; name: string; status: string }[];
  } | null;
}
const RULE_HUNTS = gql`
  query GraphRuleHunts($id: ID!, $limit: Int) {
    detectionRule(id: $id) {
      generatedByHunts(limit: $limit) { id name status }
    }
  }
`;

const tRuleHunts: Transform<RuleHuntsResp> = {
  id: 'rule.generatedByHunts',
  label: 'Show originating hunts',
  description: 'Hunts that produced this detection rule via :GENERATED.',
  appliesTo: 'DetectionRule',
  cap: 50,
  varyLimit: [10, 25, 50],
  query: RULE_HUNTS,
  expand: (resp, parent) => {
    const hunts = resp.detectionRule?.generatedByHunts ?? [];
    return {
      nodes: hunts.map((h) => ({
        id: nodeId('Hunt', h.id),
        entityId: h.id,
        type: 'Hunt',
        label: h.name,
        data: { status: h.status },
      })),
      edges: hunts.map((h) => ({
        id: edgeId(nodeId('Hunt', h.id), parent.id, 'GENERATED'),
        source: nodeId('Hunt', h.id),
        target: parent.id,
        edgeType: 'GENERATED',
        label: 'generated',
      })),
    };
  },
};

// ─── Hunt → targetActors + scopedAssets ───────────────────────────

interface HuntActorsResp {
  hunt: {
    targetActors: { id: string; name: string; techniqueCount: number }[];
  } | null;
}
const HUNT_ACTORS = gql`
  query GraphHuntActors($id: ID!) {
    hunt(id: $id) {
      targetActors { id name techniqueCount }
    }
  }
`;

const tHuntActors: Transform<HuntActorsResp> = {
  id: 'hunt.targetActors',
  label: 'Show targeted actors',
  description: 'IntrusionSets this hunt is investigating.',
  appliesTo: 'Hunt',
  cap: 50,
  varyLimit: [10, 25, 50],
  query: HUNT_ACTORS,
  expand: (resp, parent, limit) => {
    const all = resp.hunt?.targetActors ?? [];
    const actors = limit && limit < all.length ? all.slice(0, limit) : all;
    return {
      nodes: actors.map((a) => ({
        id: nodeId('ThreatActor', a.id),
        entityId: a.id,
        type: 'ThreatActor',
        label: a.name,
        data: { techniqueCount: a.techniqueCount },
      })),
      edges: actors.map((a) => ({
        id: edgeId(parent.id, nodeId('ThreatActor', a.id), 'TARGETS'),
        source: parent.id,
        target: nodeId('ThreatActor', a.id),
        edgeType: 'TARGETS',
        label: 'targets',
      })),
      totalAvailable: all.length,
    };
  },
};

interface HuntAssetsResp {
  hunt: {
    scopedAssets: { id: string; name: string; kind: string }[];
  } | null;
}
const HUNT_ASSETS = gql`
  query GraphHuntAssets($id: ID!) {
    hunt(id: $id) {
      scopedAssets { id name kind }
    }
  }
`;

const tHuntAssets: Transform<HuntAssetsResp> = {
  id: 'hunt.scopedAssets',
  label: 'Show scoped assets',
  description: 'Inventory this hunt covers.',
  appliesTo: 'Hunt',
  cap: 100,
  varyLimit: [10, 25, 50],
  query: HUNT_ASSETS,
  expand: (resp, parent, limit) => {
    const all = resp.hunt?.scopedAssets ?? [];
    const assets = limit && limit < all.length ? all.slice(0, limit) : all;
    return {
      nodes: assets.map((a) => ({
        id: nodeId('Asset', a.id),
        entityId: a.id,
        type: 'Asset',
        label: a.name,
        data: { kind: a.kind },
      })),
      edges: assets.map((a) => ({
        id: edgeId(parent.id, nodeId('Asset', a.id), 'SCOPED_TO'),
        source: parent.id,
        target: nodeId('Asset', a.id),
        edgeType: 'SCOPED_TO',
        label: 'scope',
      })),
      totalAvailable: all.length,
    };
  },
};

// ─── CtiIoc → actor + technique attribution ────────────────────────

interface IocAttributionResp {
  ctiIoc: {
    actorId: string;
    actorName: string;
    techniqueId: string;
    techniqueName: string;
  } | null;
}
const IOC_ATTRIBUTION = gql`
  query GraphIocAttribution($id: ID!) {
    ctiIoc(id: $id) {
      actorId actorName techniqueId techniqueName
    }
  }
`;

const tIocActor: Transform<IocAttributionResp> = {
  id: 'ioc.actor',
  label: 'Show attributed actor',
  description: 'IntrusionSet this indicator was attributed to (W2.5).',
  appliesTo: 'CtiIoc',
  cap: 1,
  query: IOC_ATTRIBUTION,
  expand: (resp, parent) => {
    const i = resp.ctiIoc;
    if (!i || !i.actorId) return { nodes: [], edges: [] };
    const aid = nodeId('ThreatActor', i.actorId);
    return {
      nodes: [{
        id: aid,
        entityId: i.actorId,
        type: 'ThreatActor',
        label: i.actorName,
      }],
      edges: [{
        id: edgeId(parent.id, aid, 'ATTRIBUTED_TO'),
        source: parent.id,
        target: aid,
        edgeType: 'ATTRIBUTED_TO',
        label: 'attributed to',
      }],
    };
  },
};

const tIocTechnique: Transform<IocAttributionResp> = {
  id: 'ioc.technique',
  label: 'Show attributed technique',
  description: 'MITRE T-code this indicator hints at (W2.5).',
  appliesTo: 'CtiIoc',
  cap: 1,
  query: IOC_ATTRIBUTION,
  expand: (resp, parent) => {
    const i = resp.ctiIoc;
    if (!i || !i.techniqueId) return { nodes: [], edges: [] };
    const tid = nodeId('AttackPattern', i.techniqueId);
    return {
      nodes: [{
        id: tid,
        entityId: i.techniqueId,
        type: 'AttackPattern',
        label: `${i.techniqueId} ${i.techniqueName}`,
      }],
      edges: [{
        id: edgeId(parent.id, tid, 'HINTS_AT_TTP'),
        source: parent.id,
        target: tid,
        edgeType: 'HINTS_AT_TTP',
        label: 'hints at',
      }],
    };
  },
};

// ─── Registry ──────────────────────────────────────────────────────

export const TRANSFORMS: Transform[] = [
  tStakeholderAssets as Transform,
  tStakeholderCves as Transform,
  tStakeholderCases as Transform,
  tStakeholderSektor as Transform,
  tAssetStakeholder as Transform,
  tAssetCves as Transform,
  tCveAffectedAssets as Transform,
  tCveWeaknesses as Transform,
  tCaseStakeholder as Transform,
  tActorTechniques as Transform,
  tAttackPatternActors as Transform,
  tAttackPatternSubtech as Transform,
  tAttackPatternParent as Transform,
  tRuleHunts as Transform,
  tHuntActors as Transform,
  tHuntAssets as Transform,
  tIocActor as Transform,
  tIocTechnique as Transform,
];

/** Find the transforms applicable to a given node type. */
export function transformsFor(type: GraphNode['type']): Transform[] {
  return TRANSFORMS.filter((t) => t.appliesTo === type);
}
