// F3b — PDN egress allowlist types.

export const EGRESS_STATUSES = ['active', 'disabled'] as const;
export type EgressStatus = (typeof EGRESS_STATUSES)[number];

export interface PdnEgressEntry {
  id: string;
  tenantId: string;
  /** Lowercased hostname only (no scheme, no path, no port). */
  hostname: string;
  /** Operator-friendly name — 'BSSN MISP', 'Pajak TAXII', etc. */
  label: string;
  status: EgressStatus;
  addedByUserId: string;
  addedByEmail: string | null;
  createdAt: string;
  /** Set when status moves to 'disabled'. */
  disabledAt: string | null;
  disabledByUserId: string | null;
}

/** Strip scheme/port/path so the operator can paste a full URL and we
 *  store the hostname only. Returns lowercased hostname. */
export function normalizeHostname(input: string): string {
  let raw = input.trim().toLowerCase();
  // Drop scheme if present.
  raw = raw.replace(/^https?:\/\//, '');
  // Drop everything after the first / : ? #
  raw = raw.split(/[\/:?#]/)[0] ?? raw;
  return raw;
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function isValidHostname(h: string): boolean {
  if (h.length === 0 || h.length > 253) return false;
  return HOSTNAME_RE.test(h);
}
