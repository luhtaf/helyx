function readVar(name: string): string {
  if (typeof window === 'undefined') return '#888888';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}

export function severityHex(severity: string | null | undefined): string {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL': return readVar('--sev-crit');
    case 'HIGH':     return readVar('--sev-high');
    case 'MEDIUM':   return readVar('--sev-med');
    case 'LOW':      return readVar('--sev-low');
    default:         return readVar('--sev-none');
  }
}

export function severityBorderVar(severity: string | null | undefined): string {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL': return 'var(--sev-crit)';
    case 'HIGH':     return 'var(--sev-high)';
    case 'MEDIUM':   return 'var(--sev-med)';
    case 'LOW':      return 'var(--sev-low)';
    default:         return 'var(--sev-none)';
  }
}

export function inkDimHex(): string {
  return readVar('--ink-dim');
}

export function inkFaintHex(): string {
  return readVar('--ink-faint');
}

export function signalHex(): string {
  return readVar('--signal');
}
