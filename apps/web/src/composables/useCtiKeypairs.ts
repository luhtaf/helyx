// F2 keypair rotation surface — list active/previous/revoked keys, rotate
// (mints new active + demotes current), revoke (marks compromised key
// untrusted). Rotate + revoke are OWNER-only mutations.

import { computed, ref } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export const KEYPAIR_STATUSES = ['active', 'previous', 'revoked'] as const;
export type CtiKeypairStatus = (typeof KEYPAIR_STATUSES)[number];

export const STATUS_LABELS: Record<CtiKeypairStatus, string> = {
  active:   'active',
  previous: 'previous',
  revoked:  'revoked',
};

export interface CtiOrgKeypair {
  id: string;
  fingerprint: string;
  publicKeyPem: string;
  algorithm: string;
  status: CtiKeypairStatus;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

const KEYPAIR_FIELDS = `
  id fingerprint publicKeyPem algorithm status
  createdAt rotatedAt revokedAt revokedReason
`;

const LIST_QUERY = gql`
  query CtiOrgKeypairs {
    ctiOrgKeypairs { ${KEYPAIR_FIELDS} }
  }
`;

const ROTATE_MUTATION = gql`
  mutation RotateCtiKeypair($reason: String!) {
    rotateCtiKeypair(reason: $reason) { ${KEYPAIR_FIELDS} }
  }
`;

const REVOKE_MUTATION = gql`
  mutation RevokeCtiKeypair($keypairId: ID!, $reason: String!) {
    revokeCtiKeypair(keypairId: $keypairId, reason: $reason) { ${KEYPAIR_FIELDS} }
  }
`;

export function useCtiKeypairs() {
  const { result, loading, error, refetch } = useQuery<{ ctiOrgKeypairs: CtiOrgKeypair[] }>(
    LIST_QUERY,
    null,
    { fetchPolicy: 'cache-and-network' },
  );
  const keypairs = computed<CtiOrgKeypair[]>(() => result.value?.ctiOrgKeypairs ?? []);
  const active = computed<CtiOrgKeypair | null>(
    () => keypairs.value.find((k) => k.status === 'active') ?? null,
  );
  const previous = computed<CtiOrgKeypair[]>(
    () => keypairs.value.filter((k) => k.status === 'previous'),
  );
  const revoked = computed<CtiOrgKeypair[]>(
    () => keypairs.value.filter((k) => k.status === 'revoked'),
  );
  return { keypairs, active, previous, revoked, loading, error, refetch };
}

export interface CtiKeypairRotation {
  id: string;
  ts: string;
  actorUserId: string;
  actorEmail: string | null;
  oldKeypairId: string | null;
  oldFingerprint: string | null;
  newKeypairId: string;
  newFingerprint: string;
  reason: string;
}

const ROTATIONS_QUERY = gql`
  query CtiKeypairRotations {
    ctiKeypairRotations {
      id ts actorUserId actorEmail
      oldKeypairId oldFingerprint
      newKeypairId newFingerprint
      reason
    }
  }
`;

export function useCtiKeypairRotations() {
  const { result, loading, error, refetch } = useQuery<{ ctiKeypairRotations: CtiKeypairRotation[] }>(
    ROTATIONS_QUERY,
    null,
    { fetchPolicy: 'cache-and-network' },
  );
  const rotations = computed<CtiKeypairRotation[]>(() => result.value?.ctiKeypairRotations ?? []);
  return { rotations, loading, error, refetch };
}

/**
 * Trigger a client-side download of a public key as a .pem file. Uses
 * a Blob + dynamic <a download> link — no server roundtrip, no extra
 * route. Filename includes the fingerprint so an operator with several
 * keys side-by-side can tell them apart.
 */
export function downloadPublicKey(pem: string, fingerprint: string): void {
  const blob = new Blob([pem], { type: 'application/x-pem-file' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helyx-cti-public-${fingerprint}.pem`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useRotateKeypair() {
  const { client } = useApolloClient();
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function submit(reason: string): Promise<CtiOrgKeypair | null> {
    loading.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ rotateCtiKeypair: CtiOrgKeypair }>({
        mutation: ROTATE_MUTATION,
        variables: { reason },
        refetchQueries: [{ query: LIST_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.rotateCtiKeypair ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { submit, loading, error };
}

export function useRevokeKeypair() {
  const { client } = useApolloClient();
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function submit(keypairId: string, reason: string): Promise<CtiOrgKeypair | null> {
    loading.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ revokeCtiKeypair: CtiOrgKeypair }>({
        mutation: REVOKE_MUTATION,
        variables: { keypairId, reason },
        refetchQueries: [{ query: LIST_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.revokeCtiKeypair ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { submit, loading, error };
}
