function readVar(name: string): string {
  if (typeof window === 'undefined') return '#888';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

const PHASE_TIER: Record<string, 'pre' | 'access' | 'pivot' | 'impact'> = {
  'reconnaissance':       'pre',
  'resource-development': 'pre',
  'initial-access':       'access',
  'execution':            'access',
  'persistence':          'access',
  'privilege-escalation': 'access',
  'defense-evasion':      'access',
  'credential-access':    'pivot',
  'discovery':            'pivot',
  'lateral-movement':     'pivot',
  'collection':           'impact',
  'command-and-control':  'impact',
  'exfiltration':         'impact',
  'impact':               'impact',
};

export type PhaseTier = 'pre' | 'access' | 'pivot' | 'impact' | 'unknown';

export function phaseTier(phases: string[] | null | undefined): PhaseTier {
  for (const p of phases ?? []) {
    const t = PHASE_TIER[p];
    if (t) return t;
  }
  return 'unknown';
}

export function tierColor(tier: PhaseTier): string {
  switch (tier) {
    case 'pre':     return readVar('--ink-faint');
    case 'access':  return readVar('--sev-low');
    case 'pivot':   return readVar('--sev-med');
    case 'impact':  return readVar('--sev-high');
    default:        return readVar('--ink-dim');
  }
}

export function tierLabel(tier: PhaseTier): string {
  switch (tier) {
    case 'pre':    return 'pre-attack';
    case 'access': return 'access';
    case 'pivot':  return 'pivot';
    case 'impact': return 'impact';
    default:       return 'other';
  }
}
