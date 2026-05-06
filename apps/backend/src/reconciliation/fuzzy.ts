import type { StakeholderRow } from '../stakeholders/types.js';
import type { SuggestionRow } from './types.js';

export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

export function acronym(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase();
}

export interface MatchInput {
  rawName: string;
  rawNormalizedKey: string;
}

export function rankSuggestions(
  raw: MatchInput,
  candidates: StakeholderRow[],
  options: { maxResults?: number; levenshteinThreshold?: number } = {},
): SuggestionRow[] {
  const max = options.maxResults ?? 3;
  const lvThreshold = options.levenshteinThreshold ?? 4;
  const out: SuggestionRow[] = [];

  for (const c of candidates) {
    // 1. exact alias match
    if (c.aliases.some((a) => normalizeKey(a) === raw.rawNormalizedKey)) {
      out.push({ stakeholderId: c.id, confidence: 1.0, reason: 'alias-match' });
      continue;
    }

    // 2. levenshtein on name + aliases
    const candidates2 = [c.name, ...c.aliases];
    const lvBest = Math.min(
      ...candidates2.map((s) => levenshtein(s.toLowerCase(), raw.rawName.toLowerCase())),
    );
    if (lvBest <= lvThreshold) {
      const conf = Math.max(0, 1 - lvBest / Math.max(raw.rawName.length, 8));
      out.push({ stakeholderId: c.id, confidence: conf, reason: 'levenshtein' });
      continue;
    }

    // 3. acronym match
    const rawAcronym = acronym(raw.rawName);
    const candAcronym = acronym(c.name);
    if (rawAcronym.length >= 2 && rawAcronym === candAcronym) {
      out.push({ stakeholderId: c.id, confidence: 0.7, reason: 'acronym-match' });
      continue;
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, max);
}
