import { z } from 'zod';
import type { StixBundle } from './types.js';

const Tactic = z.object({
  type: z.literal('x-mitre-tactic'),
  name: z.string(),
  description: z.string().optional(),
  external_references: z.array(
    z.object({
      source_name: z.string(),
      external_id: z.string().optional(),
      url: z.string().optional(),
    }).passthrough(),
  ).optional(),
  x_mitre_shortname: z.string(),
  revoked: z.boolean().optional(),
  x_mitre_deprecated: z.boolean().optional(),
}).passthrough();

const AttackPattern = z.object({
  type: z.literal('attack-pattern'),
  external_references: z.array(
    z.object({
      source_name: z.string(),
      external_id: z.string().optional(),
    }).passthrough(),
  ).optional(),
  kill_chain_phases: z.array(
    z.object({
      kill_chain_name: z.string(),
      phase_name: z.string(),
    }).passthrough(),
  ).optional(),
  revoked: z.boolean().optional(),
  x_mitre_deprecated: z.boolean().optional(),
}).passthrough();

const TACTIC_ORDER: Record<string, number> = {
  reconnaissance: 0,
  'resource-development': 1,
  'initial-access': 2,
  execution: 3,
  persistence: 4,
  'privilege-escalation': 5,
  'defense-evasion': 6,
  'credential-access': 7,
  discovery: 8,
  'lateral-movement': 9,
  collection: 10,
  'command-and-control': 11,
  exfiltration: 12,
  impact: 13,
};

export interface TacticRow {
  id: string;
  name: string;
  shortname: string;
  description: string | null;
  url: string | null;
  ordering: number;
}

export interface TechniqueTacticEdge {
  techniqueId: string;
  tacticShortname: string;
}

function externalAttackId(
  refs: { source_name: string; external_id?: string }[] | undefined,
): string | null {
  if (!refs) return null;
  const ref = refs.find((entry) => entry.source_name === 'mitre-attack' && entry.external_id);
  return ref?.external_id ?? null;
}

function externalAttackUrl(
  refs: { source_name: string; url?: string }[] | undefined,
): string | null {
  if (!refs) return null;
  const ref = refs.find((entry) => entry.source_name === 'mitre-attack' && entry.url);
  return ref?.url ?? null;
}

export function mapTactics(bundle: StixBundle): TacticRow[] {
  const tactics: TacticRow[] = [];

  for (const raw of bundle.objects) {
    if ((raw as { type?: string }).type !== 'x-mitre-tactic') continue;
    const parsed = Tactic.safeParse(raw);
    if (!parsed.success) continue;
    const tactic = parsed.data;
    if (tactic.revoked || tactic.x_mitre_deprecated) continue;

    const id = externalAttackId(tactic.external_references);
    const ordering = TACTIC_ORDER[tactic.x_mitre_shortname];
    if (!id || ordering == null) continue;

    tactics.push({
      id,
      name: tactic.name,
      shortname: tactic.x_mitre_shortname,
      description: tactic.description ?? null,
      url: externalAttackUrl(tactic.external_references),
      ordering,
    });
  }

  return tactics.sort((a, b) => a.ordering - b.ordering);
}

export function mapTechniqueTacticEdges(bundle: StixBundle): TechniqueTacticEdge[] {
  const seen = new Set<string>();
  const edges: TechniqueTacticEdge[] = [];

  for (const raw of bundle.objects) {
    if ((raw as { type?: string }).type !== 'attack-pattern') continue;
    const parsed = AttackPattern.safeParse(raw);
    if (!parsed.success) continue;
    const pattern = parsed.data;
    if (pattern.revoked || pattern.x_mitre_deprecated) continue;

    const techniqueId = externalAttackId(pattern.external_references);
    if (!techniqueId) continue;

    for (const phase of pattern.kill_chain_phases ?? []) {
      if (phase.kill_chain_name !== 'mitre-attack') continue;
      if (TACTIC_ORDER[phase.phase_name] == null) continue;
      const key = `${techniqueId}:${phase.phase_name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ techniqueId, tacticShortname: phase.phase_name });
    }
  }

  return edges;
}
