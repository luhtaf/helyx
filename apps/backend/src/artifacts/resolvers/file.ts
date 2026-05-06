import type { RequestContext } from '../../auth/context.js';
import { assertOrgRole } from '../../auth/middleware.js';
import { createArtifactNode, linkFileToHash } from '../repo.js';
import { TYPE_TO_LABEL, buildBase, type BaseInputShape } from './_shared.js';

interface FileInput {
  base: BaseInputShape;
  filename: string;
  filepath?: string | null;
  md5?: string | null;
  sha1?: string | null;
  sha256?: string | null;
  sizeBytes?: number | null;
  mime?: string | null;
  signed?: boolean | null;
  signer?: string | null;
  behavior?: string[] | null;
}

export const fileResolvers = {
  Mutation: {
    createFileArtifact: async (
      _p: unknown,
      args: { caseId: string; input: FileInput },
      ctx: RequestContext,
    ) => {
      assertOrgRole(ctx, 'ANALYST');
      const created = await createArtifactNode(
        ctx.activeOrgId,
        args.caseId,
        buildBase(args.input.base, 'FILE', ctx.user.id),
        {
          typeLabel: TYPE_TO_LABEL.FILE,
          typeFields: {
            filename: args.input.filename,
            filepath: args.input.filepath ?? null,
            md5: args.input.md5 ?? null,
            sha1: args.input.sha1 ?? null,
            sha256: args.input.sha256 ?? null,
            sizeBytes: args.input.sizeBytes ?? null,
            mime: args.input.mime ?? null,
            signed: args.input.signed ?? null,
            signer: args.input.signer ?? null,
            behavior: args.input.behavior ?? [],
          },
        },
      );
      if (args.input.sha256) {
        await linkFileToHash(created.id, args.input.sha256);
      }
      return created;
    },
  },
};
