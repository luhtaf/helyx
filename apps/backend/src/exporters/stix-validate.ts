import { z } from 'zod';

// H5b — STIX 2.1 structural validator (focused, not full OASIS schema set).
//
// Why focused vs OASIS-complete: we only emit 3 SDO types
// (bundle, identity, indicator) and reference 1 marking-definition by id.
// Vendoring ~80 OASIS schema files (~1MB) to validate 4 shapes is overkill.
// Catch generator bugs (typos, missing required fields, wrong types) here;
// when we emit additional SDO types in the future, extend this file.
//
// Conformance reference:
// https://docs.oasis-open.org/cti/stix/v2.1/os/stix-v2.1-os.html

// STIX identifiers: <type>--<rfc4122-v4-uuid>. We allow non-strict UUID
// because indicator ids derive from sha256 (still 8-4-4-4-12 hex shape).
const STIX_ID_RE = /^[a-z][a-z0-9-]+--[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const stixIdSchema = z.string().regex(STIX_ID_RE, 'invalid STIX 2.1 id format');

// STIX timestamps: ISO 8601, RFC3339-compatible. Date.toISOString() satisfies.
const stixTimestampSchema = z.string().datetime({ offset: false });

const commonSdoFields = {
  spec_version: z.literal('2.1'),
  id: stixIdSchema,
  created: stixTimestampSchema,
  modified: stixTimestampSchema,
  object_marking_refs: z.array(stixIdSchema).optional(),
};

const identitySchema = z.object({
  type: z.literal('identity'),
  ...commonSdoFields,
  name: z.string().min(1),
  identity_class: z.enum(['individual', 'group', 'system', 'organization', 'class', 'unknown']),
});

const indicatorSchema = z.object({
  type: z.literal('indicator'),
  ...commonSdoFields,
  created_by_ref: stixIdSchema.optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  indicator_types: z.array(z.string()).optional(),
  pattern: z.string().min(1),
  // OASIS reserves stix/snort/yara/pcre; sigma is widely-used community ext.
  pattern_type: z.string().min(1),
  valid_from: stixTimestampSchema,
  labels: z.array(z.string()).optional(),
});

// Bundle is the wrapper. Per spec, objects must be a non-empty array.
const stixObjectSchema = z.discriminatedUnion('type', [identitySchema, indicatorSchema]);

const bundleSchema = z.object({
  type: z.literal('bundle'),
  id: stixIdSchema,
  // Bundle does NOT carry spec_version in 2.1 (removed from 2.0).
  objects: z.array(stixObjectSchema).min(1),
});

export interface StixValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

// Validate a parsed STIX 2.1 bundle. Returns structured errors; never throws
// on invalid input. Throws on non-object input (programmer error).
export function validateStixBundle(parsed: unknown): StixValidationResult {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TypeError('validateStixBundle: input must be a parsed object');
  }
  const result = bundleSchema.safeParse(parsed);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.issues.map((iss) => ({
      path: iss.path.join('.') || '<root>',
      message: iss.message,
    })),
  };
}

// Convenience for callers that have JSON text. Parses + validates in one go.
export function validateStixJson(json: string): StixValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { valid: false, errors: [{ path: '<root>', message: `invalid JSON: ${(e as Error).message}` }] };
  }
  return validateStixBundle(parsed);
}
