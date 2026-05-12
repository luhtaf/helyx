import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { GraphQLError } from 'graphql';
import { fetchOtxGeneral, OtxConfigError, OtxLookupError } from './client.js';
import { mapOtxResponse } from './mapper.js';
import type { OtxIocKind } from './types.js';

// Light input validation. OTX itself rejects malformed values, but a
// quick client-side guard surfaces the obvious errors faster.
const VALIDATORS: Record<OtxIocKind, RegExp> = {
  ipv4:        /^(\d{1,3}\.){3}\d{1,3}$/,
  ipv6:        /^[0-9a-f:]+$/i,
  domain:      /^([a-z0-9-]+\.)+[a-z]{2,}$/i,
  hostname:    /^([a-z0-9-]+\.)+[a-z]{2,}$/i,
  url:         /^https?:\/\/.+/i,
  file_md5:    /^[a-f0-9]{32}$/i,
  file_sha1:   /^[a-f0-9]{40}$/i,
  file_sha256: /^[a-f0-9]{64}$/i,
  cve:         /^CVE-\d{4}-\d{4,}$/i,
};

export const otxResolvers = {
  Query: {
    otxLookup: async (
      _p: unknown,
      args: { value: string; kind: OtxIocKind },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const value = args.value.trim();
      if (!value) {
        throw new GraphQLError('value is required', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      const re = VALIDATORS[args.kind];
      if (re && !re.test(value)) {
        throw new GraphQLError(`value does not look like a ${args.kind}`, {
          extensions: { code: 'BAD_USER_INPUT', kind: args.kind },
        });
      }
      try {
        const raw = await fetchOtxGeneral(args.kind, value);
        const summary = mapOtxResponse(raw);
        return {
          queriedValue: value,
          queriedKind: args.kind,
          ...summary,
        };
      } catch (err) {
        if (err instanceof OtxConfigError) {
          throw new GraphQLError(err.message, { extensions: { code: 'OTX_CONFIG_MISSING' } });
        }
        if (err instanceof OtxLookupError) {
          throw new GraphQLError(err.message, { extensions: { code: 'OTX_LOOKUP_FAILED', status: err.status } });
        }
        throw err;
      }
    },
  },
};
