// H7b — OpenCTI publisher. OpenCTI ingests a STIX 2.1 bundle via its
// GraphQL `uploadImport` mutation (the same path the OpenCTI UI's
// "Data import" uses); the platform's built-in import connector then
// processes the bundle asynchronously. Auth is a Bearer API token.
//
// This is a graphql-multipart-request-spec upload (operations + map +
// file part) — the "more complex than MISP" bit that was deferred at
// H7. Node 18+ gives us global FormData/Blob/fetch so no dep needed.
//
// OpenCTI docs: https://docs.opencti.io/latest/deployment/integrations/
//
// Egress + tier gates are enforced upstream in push.ts; this is
// transport only. Structured result mirrors misp/taxii clients so
// push.ts lands operator-readable text in :CtiPushAttempt.errorDetail.

interface OpenCtiUploadResult {
  ok: boolean;
  /** HTTP status. 0 = network/timeout before response. */
  status: number;
  /** OpenCTI import file id when the mutation returns one. */
  importId: string | null;
  /** Truncated for the audit row. */
  errorDetail: string | null;
}

const TIMEOUT_MS = 30_000;

// Single mutation: drop the bundle into OpenCTI's pending-import area.
// `global` workbench so any org-scoped connector can pick it up.
const MUTATION =
  'mutation HelyxBundleImport($file: Upload!) {' +
  ' uploadImport(file: $file) { id name } }';

function graphqlRoot(baseUrl: string): string {
  // Operator may paste 'https://opencti.bssn.go.id' or already include
  // '/graphql'. Normalize to exactly one /graphql.
  const root = baseUrl.replace(/\/graphql\/?$/, '').replace(/\/+$/, '');
  return `${root}/graphql`;
}

/**
 * Push a STIX 2.1 bundle to OpenCTI via uploadImport.
 *
 * Builds a graphql-multipart-request: part `operations` (the mutation
 * with a null file placeholder), part `map` (binds part "0" to
 * variables.file), and part `0` (the bundle as a JSON Blob).
 */
export async function uploadStixToOpenCti(
  baseUrl: string,
  apiKey: string,
  bundleJson: string,
): Promise<OpenCtiUploadResult> {
  const url = graphqlRoot(baseUrl);
  const form = new FormData();
  form.append(
    'operations',
    JSON.stringify({ query: MUTATION, variables: { file: null } }),
  );
  form.append('map', JSON.stringify({ '0': ['variables.file'] }));
  form.append(
    '0',
    new Blob([bundleJson], { type: 'application/json' }),
    'helyx-bundle.json',
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        // Don't set Content-Type — fetch derives the multipart boundary
        // from the FormData body. Setting it manually breaks parsing.
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: form,
      signal: controller.signal,
    });

    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        importId: null,
        errorDetail: `HTTP ${resp.status} from OpenCTI — ${bodyText.slice(0, 500)}`,
      };
    }

    // GraphQL: 200 even on errors — inspect the body.
    try {
      const parsed = JSON.parse(bodyText) as {
        data?: { uploadImport?: { id?: string } };
        errors?: { message?: string }[];
      };
      if (parsed.errors?.length) {
        return {
          ok: false,
          status: resp.status,
          importId: null,
          errorDetail: `OpenCTI GraphQL error: ${parsed.errors[0]?.message ?? 'unknown'}`,
        };
      }
      return {
        ok: true,
        status: resp.status,
        importId: parsed.data?.uploadImport?.id ?? null,
        errorDetail: null,
      };
    } catch {
      return {
        ok: true,
        status: resp.status,
        importId: null,
        errorDetail: `200 OK but unparseable body: ${bodyText.slice(0, 200)}`,
      };
    }
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      importId: null,
      errorDetail: isAbort
        ? `OpenCTI request timed out after ${TIMEOUT_MS / 1000}s`
        : `OpenCTI fetch failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
