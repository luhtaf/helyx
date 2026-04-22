import type { RequestContext } from '../auth/context.js';
import { badInput, notFound } from '../auth/errors.js';
import { assertOrgRole } from '../auth/middleware.js';
import { findAssetById } from './assets.repo.js';
import { ingestSbom } from './sbom.repo.js';
import { parseCycloneDx } from './sbom.cyclonedx.js';

const MAX_SBOM_BYTES = 50 * 1024 * 1024;

export const sbomResolvers = {
  Mutation: {
    ingestSbom: async (
      _p: unknown,
      args: { assetId: string; sbomJson: string; sourceFilename?: string | null },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      if (Buffer.byteLength(args.sbomJson, 'utf8') > MAX_SBOM_BYTES) {
        throw badInput('SBOM exceeds 50 MiB limit', 'sbomJson');
      }

      let raw: unknown;
      try {
        raw = JSON.parse(args.sbomJson);
      } catch (err) {
        throw badInput(`SBOM is not valid JSON: ${(err as Error).message}`, 'sbomJson');
      }

      let mapped;
      try {
        mapped = parseCycloneDx(raw);
      } catch (err) {
        throw badInput(`SBOM parse failed: ${(err as Error).message}`, 'sbomJson');
      }

      const asset = await findAssetById(ctx.activeOrgId, args.assetId);
      if (!asset) throw notFound('Asset not found in this organization');

      const result = await ingestSbom({
        tenantId: ctx.activeOrgId,
        assetId: args.assetId,
        sbom: mapped,
        sourceFilename: args.sourceFilename ?? null,
      });

      return {
        sbomId: result.sbomId,
        asset,
        componentCount: result.componentCount,
        componentsWithExplicitCpe: result.componentsWithExplicitCpe,
        productLinkCount: result.productLinkCount,
        skippedNoPurl: mapped.skippedNoPurl,
      };
    },
  },
};
