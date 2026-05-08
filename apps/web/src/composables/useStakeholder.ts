// apps/web/src/composables/useStakeholder.ts
import { computed, type ComputedRef, type Ref } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import type { Stakeholder } from './useStakeholders';
import type { CaseStatus } from './useCases';

export interface StakeholderAsset {
  id: string;
  name: string;
  kind: string;
  hostname: string | null;
  ipAddresses: string[];
  updatedAt: string;
}

export interface StakeholderCveRow {
  cveId: string;
  description: string | null;
  severity: string | null;
  baseScore: number | null;
  publishedAt: string | null;
  affectedAssetCount: number;
}

export interface StakeholderCase {
  id: string;
  reportNo: string;
  title: string | null;
  status: CaseStatus;
  verdict: string | null;
  deployedAt: string;
}

export interface StakeholderDetail extends Stakeholder {
  assetCount: number;
  cveCount: number;
  assets: StakeholderAsset[];
  cases: StakeholderCase[];
  cves: { items: StakeholderCveRow[]; total: number };
}

const STAKEHOLDER = gql`
  query Stakeholder($id: ID!) {
    stakeholder(id: $id) {
      id slug name aliases city coords notes status
      createdAt updatedAt
      sektor { id slug name displayOrder stakeholderCount }
      sensor { stack status agentCount deployedAt notes }
      assetCount
      cveCount(mode: BEAST)
      assets(limit: 50) { id name kind hostname ipAddresses updatedAt }
      cases(first: 25) { id reportNo title status verdict deployedAt }
      cves(perPage: 25, mode: BEAST) {
        total
        items { cveId description severity baseScore publishedAt affectedAssetCount }
      }
    }
  }
`;

export function useStakeholder(id: () => string): {
  stakeholder: ComputedRef<StakeholderDetail | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ stakeholder: StakeholderDetail | null }>(
    STAKEHOLDER,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    stakeholder: computed(() => result.value?.stakeholder ?? null),
    loading,
    error,
  };
}
