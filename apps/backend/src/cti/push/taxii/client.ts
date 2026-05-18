// H9 — TAXII 2.1 publisher client. Helyx acts as a TAXII *client*
// pushing our signed STIX 2.1 bundle into a remote collection via the
// add-objects endpoint:
//
//   POST {apiRoot}/collections/{id}/objects/
//   Content-Type: application/taxii+json;version=2.1
//   Accept:       application/taxii+json;version=2.1
//   Body:         { "objects": [ ...stix objects... ] }   (an *envelope*,
//                  NOT a bundle — TAXII 2.1 dropped bundles)
//
// Spec: OASIS TAXII 2.1 §5.4 "Add Objects".
//
// Auth: target.apiKey carries the credential. Two conventions, sniffed:
//   - contains ':'  → HTTP Basic  (username:password)
//   - otherwise     → Bearer token
//   - empty         → no auth (open test collections)
//
// Mirrors misp/client.ts: fetch + 30s timeout, structured result so
// push.ts can land operator-readable text in :CtiPushAttempt.errorDetail.

interface TaxiiUploadResult {
  ok: boolean;
  /** HTTP status. 0 = network/timeout before response. */
  status: number;
  /** TAXII status-resource id when the server returns one (202 flow). */
  statusId: string | null;
  /** Truncated for the audit row. */
  errorDetail: string | null;
}

const TIMEOUT_MS = 30_000;
const TAXII_MEDIA = 'application/taxii+json;version=2.1';

function authHeader(apiKey: string): Record<string, string> {
  if (!apiKey) return {};
  if (apiKey.includes(':')) {
    return { Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}` };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

// Operator may paste any of:
//   .../collections/<id>
//   .../collections/<id>/
//   .../collections/<id>/objects
//   .../collections/<id>/objects/
// TAXII 2.1 requires the trailing slash on the objects endpoint.
function normalizeObjectsUrl(baseUrl: string): string {
  let u = baseUrl.trim().replace(/\/+$/, '');
  if (!/\/objects$/.test(u)) u += '/objects';
  return `${u}/`;
}

/**
 * Push a STIX 2.1 bundle's objects to a TAXII 2.1 collection.
 *
 * The bundle JSON is re-shaped into a TAXII envelope ({objects:[...]})
 * — TAXII 2.1 servers reject a raw `bundle` object. Egress + tier
 * gates are enforced upstream in push.ts; this is transport only.
 */
export async function uploadStixToTaxii(
  baseUrl: string,
  apiKey: string,
  bundleJson: string,
): Promise<TaxiiUploadResult> {
  // Re-wrap bundle → envelope. A malformed bundle here is a generator
  // bug (push.ts already validated build), but stay defensive.
  let envelope: string;
  try {
    const parsed = JSON.parse(bundleJson) as { objects?: unknown[] };
    const objects = Array.isArray(parsed.objects) ? parsed.objects : [];
    if (objects.length === 0) {
      return {
        ok: false, status: 0, statusId: null,
        errorDetail: 'bundle has no STIX objects to publish',
      };
    }
    envelope = JSON.stringify({ objects });
  } catch (e) {
    return {
      ok: false, status: 0, statusId: null,
      errorDetail: `could not parse STIX bundle: ${(e as Error).message}`,
    };
  }

  const url = normalizeObjectsUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': TAXII_MEDIA,
        'Accept': TAXII_MEDIA,
        ...authHeader(apiKey),
      },
      body: envelope,
      signal: controller.signal,
    });

    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        statusId: null,
        errorDetail: `HTTP ${resp.status} from TAXII — ${bodyText.slice(0, 500)}`,
      };
    }

    // TAXII 2.1 add-objects returns a status resource (often 202).
    let statusId: string | null = null;
    try {
      const parsed = JSON.parse(bodyText) as { id?: string; status?: string };
      if (typeof parsed?.id === 'string') statusId = parsed.id;
    } catch {
      // 2xx with non-JSON body — accept it, the push landed.
      return {
        ok: true,
        status: resp.status,
        statusId: null,
        errorDetail: `${resp.status} but unparseable status body: ${bodyText.slice(0, 200)}`,
      };
    }

    return { ok: true, status: resp.status, statusId, errorDetail: null };
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      statusId: null,
      errorDetail: isAbort
        ? `TAXII request timed out after ${TIMEOUT_MS / 1000}s`
        : `TAXII fetch failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
