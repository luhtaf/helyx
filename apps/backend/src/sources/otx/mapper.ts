import type { OtxGeneralResponse, OtxPulse } from './types.js';

// Flatten OTX wire shape → operator-friendly summary. Top-level
// returns a small object with the bits the FE renders (pulse list +
// derived attribution + MITRE technique ids), no deep nested OTX
// schema leaking into our GraphQL surface.

export interface OtxLookupSummary {
  /** Total pulse hits in OTX catalog. 0 = not seen / clean. */
  pulseCount: number;
  /** Up to 10 most-recent pulses, each one a campaign / cluster. */
  pulses: Array<{
    id: string;
    name: string;
    description: string;
    author: string;
    modifiedAt: string | null;
    tags: string[];
    /** MITRE ATT&CK ids referenced in this pulse, e.g. ['T1059.001']. */
    attackIds: string[];
    /** Adversary attribution per pulse author — 'APT28' / 'Lazarus' etc. */
    adversary: string;
    malwareFamilies: string[];
    targetedCountries: string[];
    industries: string[];
    references: string[];
  }>;
  /** Aggregated across all pulses — distinct adversary names. */
  adversaries: string[];
  /** Aggregated across all pulses — distinct MITRE T-codes. */
  attackIds: string[];
  /** Aggregated across all pulses — distinct malware family names. */
  malwareFamilies: string[];
  /** Aggregated across all pulses — distinct tag names. */
  tags: string[];
}

function attackIdFrom(raw: string | { id?: string; name?: string; display_name?: string }): string | null {
  if (typeof raw === 'string') return raw;
  return raw.id ?? raw.name ?? raw.display_name ?? null;
}

function malwareFamilyFrom(raw: string | { id?: string; display_name?: string }): string | null {
  if (typeof raw === 'string') return raw;
  return raw.display_name ?? raw.id ?? null;
}

export function mapOtxResponse(resp: OtxGeneralResponse): OtxLookupSummary {
  const pulses = resp.pulse_info?.pulses ?? [];
  const sorted = [...pulses].sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''));
  const top = sorted.slice(0, 10);

  const adversaries = new Set<string>();
  const attackIds = new Set<string>();
  const malwareFamilies = new Set<string>();
  const tags = new Set<string>();

  for (const p of pulses) {
    if (p.adversary) adversaries.add(p.adversary);
    for (const a of p.attack_ids ?? []) {
      const id = attackIdFrom(a);
      if (id) attackIds.add(id);
    }
    for (const m of p.malware_families ?? []) {
      const name = malwareFamilyFrom(m);
      if (name) malwareFamilies.add(name);
    }
    for (const t of p.tags ?? []) tags.add(t);
  }

  return {
    pulseCount: resp.pulse_info?.count ?? pulses.length,
    pulses: top.map((p: OtxPulse) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      author: p.author_name ?? '',
      modifiedAt: p.modified ?? null,
      tags: p.tags ?? [],
      attackIds: (p.attack_ids ?? []).map(attackIdFrom).filter((x): x is string => x !== null),
      adversary: p.adversary ?? '',
      malwareFamilies: (p.malware_families ?? []).map(malwareFamilyFrom).filter((x): x is string => x !== null),
      targetedCountries: p.targeted_countries ?? [],
      industries: p.industries ?? [],
      references: p.references ?? [],
    })),
    adversaries: [...adversaries].sort(),
    attackIds: [...attackIds].sort(),
    malwareFamilies: [...malwareFamilies].sort(),
    tags: [...tags].sort(),
  };
}
