import { GraphQLError } from 'graphql';
import { isHostnameAllowed } from './repo.js';

// F3b — pre-flight gate every CTI push path runs before fetch().
//
// Pattern (when H7/H9 land):
//   await assertEgressAllowed(tenantId, targetUrl);  // throws on deny
//   await fetch(targetUrl, {...});
//
// Throws GraphQLError with code 'PDN_EGRESS_DENIED' so resolvers
// surface a clear operator message ("BSSN MISP not on allowlist —
// add at /admin/cti-egress").

export class EgressDeniedError extends GraphQLError {
  constructor(hostname: string) {
    super(
      `Egress to '${hostname}' is not on the PDN allowlist for this tenant. ` +
      `Add the hostname at /admin/cti-egress before pushing.`,
      { extensions: { code: 'PDN_EGRESS_DENIED', hostname } },
    );
  }
}

/** Throws EgressDeniedError when the URL's hostname isn't on the
 *  active allowlist. Accepts a full URL string for caller convenience. */
export async function assertEgressAllowed(tenantId: string, url: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    throw new GraphQLError(`Invalid URL for egress: ${url}`, {
      extensions: { code: 'PDN_EGRESS_BAD_URL', url },
    });
  }
  if (hostname.length === 0) {
    throw new GraphQLError(`URL has no hostname: ${url}`, {
      extensions: { code: 'PDN_EGRESS_BAD_URL', url },
    });
  }
  const allowed = await isHostnameAllowed(tenantId, hostname);
  if (!allowed) throw new EgressDeniedError(hostname);
}

/** Pre-flight check that returns a boolean instead of throwing. Useful
 *  for FE pre-flight UI ("would this URL be allowed?"). */
export async function isEgressAllowed(tenantId: string, url: string): Promise<boolean> {
  try {
    await assertEgressAllowed(tenantId, url);
    return true;
  } catch {
    return false;
  }
}
