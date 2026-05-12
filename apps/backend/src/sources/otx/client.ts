import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { OtxGeneralResponseSchema, OTX_URL_SEGMENT, type OtxGeneralResponse, type OtxIocKind } from './types.js';

// OTX REST client. Free tier: 10K requests/hour — way above our
// on-demand lookup needs. Auth via X-OTX-API-KEY header. Failures
// raise typed errors the resolver can map to user-readable toasts.

export class OtxConfigError extends Error {
  constructor() {
    super('OTX_API_KEY not configured. Set it in .env (free key at otx.alienvault.com) and restart the backend.');
    this.name = 'OtxConfigError';
  }
}

export class OtxLookupError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OtxLookupError';
  }
}

function requireApiKey(): string {
  const k = config.OTX_API_KEY;
  if (!k || k.trim().length === 0) throw new OtxConfigError();
  return k;
}

export async function fetchOtxGeneral(kind: OtxIocKind, value: string): Promise<OtxGeneralResponse> {
  const apiKey = requireApiKey();
  const segment = OTX_URL_SEGMENT[kind];
  // OTX uses URL-encoded value in path. Hashes / IPs / domains are all
  // safe to encode the same way.
  const url = `${config.OTX_BASE_URL}/indicators/${segment}/${encodeURIComponent(value)}/general`;
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'X-OTX-API-KEY': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new OtxLookupError(`OTX network error: ${(err as Error).message}`, 0);
  }
  if (res.status === 404) {
    // OTX returns 404 for "not in our catalog" — operator-friendly to
    // surface as an empty result rather than a hard error.
    return { pulse_info: { count: 0, pulses: [], references: [] } };
  }
  if (!res.ok) {
    throw new OtxLookupError(`OTX ${res.status} ${res.statusText}`, res.status);
  }
  const json = await res.json();
  const parsed = OtxGeneralResponseSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn({ url, issues: parsed.error.issues.slice(0, 3) }, 'OTX response shape changed');
    // Don't throw — return whatever we managed to coerce (passthrough
    // means most fields survive). UI degrades gracefully on missing
    // fields.
    return json as OtxGeneralResponse;
  }
  logger.debug({ url, durationMs: Date.now() - startedAt, pulses: parsed.data.pulse_info?.count ?? 0 }, 'otx lookup ok');
  return parsed.data;
}
