import { ref, type Ref } from 'vue';
import { useMutation } from '@vue/apollo-composable';
import gql from 'graphql-tag';

const INGEST_SBOM = gql`
  mutation IngestSbom($assetId: ID!, $sbomJson: String!, $sourceFilename: String) {
    ingestSbom(assetId: $assetId, sbomJson: $sbomJson, sourceFilename: $sourceFilename) {
      sbomId
      componentCount
      componentsWithExplicitCpe
      productLinkCount
      skippedNoPurl
    }
  }
`;

export interface SbomIngestResult {
  sbomId: string;
  componentCount: number;
  componentsWithExplicitCpe: number;
  productLinkCount: number;
  skippedNoPurl: number;
}

export function useSbomUpload(): {
  upload: (assetId: string, file: File) => Promise<SbomIngestResult>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
} {
  const error = ref<string | null>(null);
  const { mutate, loading } = useMutation<{ ingestSbom: SbomIngestResult }>(INGEST_SBOM);

  async function upload(assetId: string, file: File): Promise<SbomIngestResult> {
    error.value = null;
    if (file.size > 50 * 1024 * 1024) {
      const err = new Error('SBOM exceeds 50 MiB limit');
      error.value = err.message;
      throw err;
    }

    try {
      const sbomJson = await file.text();
      const res = await mutate({ assetId, sbomJson, sourceFilename: file.name });
      const payload = res?.data?.ingestSbom;
      if (!payload) throw new Error('SBOM ingest failed: empty response');
      return payload;
    } catch (err) {
      error.value = (err as Error).message ?? 'SBOM ingest failed';
      throw err;
    }
  }

  return { upload, loading, error };
}
