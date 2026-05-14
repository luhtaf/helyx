// H7-adjacent — case-bound artifact mutations.
// v1: IOC artifact only (most common). Rest follow if pattern reuses.

import { ref } from 'vue';
import { useApolloClient } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { IocType, Direction, Severity, Confidence } from './artifact-kinds';

export interface ArtifactBaseInput {
  observedAt: string;
  hostAssetId?: string | null;
  severity: Severity;
  confidence: Confidence;
  notes?: string | null;
  tags?: string[] | null;
}

export interface IocArtifactInput {
  base: ArtifactBaseInput;
  iocType: IocType;
  value: string;
  direction?: Direction | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
  source?: string | null;
}

const CREATE_IOC_ARTIFACT = gql`
  mutation CreateIocArtifact($caseId: ID!, $input: IocArtifactInput!) {
    createIocArtifact(caseId: $caseId, input: $input) {
      id
      iocType
      value
    }
  }
`;

export function useCreateIocArtifact() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function submit(caseId: string, input: IocArtifactInput): Promise<{ id: string; iocType: string; value: string } | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ createIocArtifact: { id: string; iocType: string; value: string } }>({
        mutation: CREATE_IOC_ARTIFACT,
        variables: { caseId, input },
        // Refetch the case detail so artifact counts update without
        // manual reload. Apollo automatic update is too brittle for
        // 11-type union; refetch is the boring + correct option.
        refetchQueries: ['Case'],
        awaitRefetchQueries: true,
      });
      return r.data?.createIocArtifact ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  return { submit, submitting, error };
}
