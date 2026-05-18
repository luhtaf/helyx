// Case-bound artifact mutations. One generic create dispatches to the
// right per-type mutation via the artifact-forms SoT — covers all 11
// types (the old IOC-only helper is gone; AddArtifactModal is the one
// surface now).

import { ref } from 'vue';
import { useApolloClient } from '@vue/apollo-composable';
import type { Severity, Confidence, ArtifactType } from './artifact-kinds';
import { ARTIFACT_FORM_SPECS } from './artifact-forms';

export interface ArtifactBaseInput {
  observedAt: string;
  hostAssetId?: string | null;
  severity: Severity;
  confidence: Confidence;
  notes?: string | null;
  tags?: string[] | null;
}

export function useCreateArtifact() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  /**
   * @param type    artifact type (drives which mutation runs)
   * @param caseId  owning case
   * @param base    shared base input
   * @param fields  type-specific fields (already coerced to wire types)
   */
  async function submit(
    type: ArtifactType,
    caseId: string,
    base: ArtifactBaseInput,
    fields: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    const spec = ARTIFACT_FORM_SPECS[type];
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<Record<string, { id: string }>>({
        mutation: spec.mutation,
        variables: { caseId, input: { base, ...fields } },
        // Refetch the Case query — artifact union is 11-type; cache
        // surgery is brittle, refetch is the boring + correct option.
        refetchQueries: ['Case'],
        awaitRefetchQueries: true,
      });
      return r.data?.[spec.respKey] ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  return { submit, submitting, error };
}
