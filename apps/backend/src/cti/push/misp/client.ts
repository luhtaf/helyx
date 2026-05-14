// H7 — minimal MISP REST client. v1 uses /events/upload_stix to ingest
// our STIX 2.1 bundle as a MISP event. Auth via Authorization header
// (MISP convention is the raw API key, no Bearer prefix).
//
// MISP API docs: https://www.misp-project.org/openapi/
//
// Wraps fetch() with a 30s timeout (push paths shouldn't hang forever)
// and surfaces structured errors so push.ts can land them in the
// :CtiPushAttempt errorDetail field with operator-readable text.

interface MispUploadResult {
  ok: boolean;
  /** HTTP status. 0 = network/timeout error before response. */
  status: number;
  /** MISP event id when ok+parsed. */
  eventId: string | null;
  /** Truncated for the audit row — full body might be a 10KB error page. */
  errorDetail: string | null;
}

const TIMEOUT_MS = 30_000;

/**
 * POST a STIX 2.1 bundle to MISP's /events/upload_stix endpoint.
 *
 * The endpoint expects a JSON body matching the MISP upload-stix
 * schema: `{ Event: { ... }, ...stix_bundle_fields }` for v2.4.140+.
 * For older MISP installs (pre-v2.4.140), raw STIX 2.1 also works
 * via /events/upload_stix?stix_version=2.
 *
 * apiKey gets sent as Authorization header. Empty key = no auth (rare
 * but valid for some test instances).
 */
export async function uploadStixToMisp(
  baseUrl: string,
  apiKey: string,
  bundleJson: string,
): Promise<MispUploadResult> {
  // baseUrl might be 'https://misp.bssn.go.id' or
  // 'https://misp.bssn.go.id/events' (operator pasted full path).
  // Strip trailing /events* so we can append cleanly.
  const root = baseUrl.replace(/\/events.*$/, '').replace(/\/$/, '');
  const url = `${root}/events/upload_stix?stix_version=2`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(apiKey ? { 'Authorization': apiKey } : {}),
      },
      body: bundleJson,
      signal: controller.signal,
    });

    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        eventId: null,
        errorDetail: `HTTP ${resp.status} from MISP — ${bodyText.slice(0, 500)}`,
      };
    }

    // MISP returns either {Event: {id, ...}} or {message, name, errors}
    // depending on its mood. Parse defensively; on parse fail surface
    // the raw body as detail.
    let eventId: string | null = null;
    try {
      const parsed = JSON.parse(bodyText) as { Event?: { id?: string | number } };
      const ev = parsed?.Event;
      if (ev && (typeof ev.id === 'string' || typeof ev.id === 'number')) {
        eventId = String(ev.id);
      }
    } catch {
      return {
        ok: true,
        status: resp.status,
        eventId: null,
        errorDetail: `200 OK but unparseable body (likely OK, MISP is finicky): ${bodyText.slice(0, 200)}`,
      };
    }

    return {
      ok: true,
      status: resp.status,
      eventId,
      errorDetail: null,
    };
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      eventId: null,
      errorDetail: isAbort
        ? `MISP request timed out after ${TIMEOUT_MS / 1000}s`
        : `MISP fetch failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
