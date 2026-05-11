import { computed, type ComputedRef, type Ref } from 'vue';
import { useMutation, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
export { type RuleKind, type RuleStatus, type RuleSource } from './rule-kinds';
import type { RuleKind, RuleStatus, RuleSource } from './rule-kinds';

// F1 — release tier (4-tier need-to-know enforcement). GraphQL enum
// uses underscored form ('cross_agency') because GraphQL enum names
// can't have hyphens.
export type ReleaseTier = 'public' | 'cross_agency' | 'sectoral' | 'internal';
export const RELEASE_TIERS: ReleaseTier[] = ['public', 'cross_agency', 'sectoral', 'internal'];
export const RELEASE_TIER_LABELS: Record<ReleaseTier, string> = {
  public: 'public',
  cross_agency: 'cross-agency',
  sectoral: 'sectoral',
  internal: 'internal',
};

export interface DetectionRule {
  id: string;
  kind: RuleKind;
  name: string;
  description: string | null;
  content: string;
  tags: string[];
  source: RuleSource;
  sourceRef: string | null;
  status: RuleStatus;
  releaseTier: ReleaseTier;
  createdAt: string;
  updatedAt: string;
  derivedFromArtifactCount: number;
  detectsTechniqueCount: number;
  generatedByHuntCount: number;
}

export interface RulesPage {
  total: number;
  page: number;
  perPage: number;
  items: DetectionRule[];
}

export interface RuleFilter {
  kind?: RuleKind | null;
  status?: RuleStatus | null;
  source?: RuleSource | null;
  tag?: string | null;
  search?: string | null;
}

const RULES_LIST = gql`
  query DetectionRules($filter: RuleFilterInput, $page: Int, $perPage: Int) {
    detectionRules(filter: $filter, page: $page, perPage: $perPage) {
      total page perPage
      items {
        id kind name description tags source sourceRef status releaseTier
        createdAt updatedAt
        derivedFromArtifactCount detectsTechniqueCount generatedByHuntCount
      }
    }
  }
`;

const RULE_DETAIL = gql`
  query DetectionRule($id: ID!) {
    detectionRule(id: $id) {
      id kind name description content tags source sourceRef status releaseTier
      createdAt updatedAt
      derivedFromArtifactCount detectsTechniqueCount generatedByHuntCount
    }
  }
`;

const SET_RULE_RELEASE_TIER = gql`
  mutation SetRuleReleaseTier($id: ID!, $tier: ReleaseTier!) {
    setRuleReleaseTier(id: $id, tier: $tier) {
      id releaseTier updatedAt
    }
  }
`;

export function useSetRuleReleaseTier() {
  const { mutate, loading, error } = useMutation<
    { setRuleReleaseTier: { id: string; releaseTier: ReleaseTier; updatedAt: string } },
    { id: string; tier: ReleaseTier }
  >(SET_RULE_RELEASE_TIER, () => ({
    refetchQueries: ['DetectionRule', 'DetectionRules'],
    awaitRefetchQueries: true,
  }));
  return {
    submit: async (id: string, tier: ReleaseTier) =>
      (await mutate({ id, tier }))?.data?.setRuleReleaseTier ?? null,
    loading, error,
  };
}

const CREATE_RULE = gql`
  mutation CreateDetectionRule($input: CreateRuleInput!) {
    createDetectionRule(input: $input) {
      id kind name status
    }
  }
`;

const UPDATE_RULE = gql`
  mutation UpdateDetectionRule($id: ID!, $input: UpdateRuleInput!) {
    updateDetectionRule(id: $id, input: $input) { id updatedAt }
  }
`;

const DELETE_RULE = gql`
  mutation DeleteDetectionRule($id: ID!) {
    deleteDetectionRule(id: $id)
  }
`;

export function useRules(opts: { filter: () => RuleFilter; page: () => number; perPage: () => number }): {
  data: ComputedRef<RulesPage | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refetch: () => void;
} {
  const { result, loading, error, refetch } = useQuery<{ detectionRules: RulesPage }>(
    RULES_LIST,
    () => ({
      filter: {
        kind: opts.filter().kind ?? null,
        status: opts.filter().status ?? null,
        source: opts.filter().source ?? null,
        tag: opts.filter().tag ?? null,
        search: opts.filter().search ?? null,
      },
      page: opts.page(),
      perPage: opts.perPage(),
    }),
    () => ({ fetchPolicy: 'cache-and-network' as const }),
  );
  return {
    data: computed(() => result.value?.detectionRules ?? null),
    loading, error,
    refetch: () => { refetch(); },
  };
}

export function useRule(id: () => string): {
  rule: ComputedRef<DetectionRule | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
} {
  const { result, loading, error } = useQuery<{ detectionRule: DetectionRule | null }>(
    RULE_DETAIL,
    () => ({ id: id() }),
    () => ({ enabled: Boolean(id()), fetchPolicy: 'cache-and-network' }),
  );
  return {
    rule: computed(() => result.value?.detectionRule ?? null),
    loading, error,
  };
}

export interface CreateRuleInput {
  kind: RuleKind;
  name: string;
  description?: string | null;
  content: string;
  tags?: string[];
  status?: RuleStatus;
  derivedFromArtifactIds?: string[];
  detectsTechniqueIds?: string[];
}

export function useCreateRule() {
  const { mutate, loading, error } = useMutation<
    { createDetectionRule: { id: string; name: string } },
    { input: CreateRuleInput }
  >(CREATE_RULE, () => ({ refetchQueries: ['DetectionRules'], awaitRefetchQueries: true }));
  return {
    submit: async (input: CreateRuleInput) => (await mutate({ input }))?.data?.createDetectionRule ?? null,
    loading, error,
  };
}

export interface UpdateRuleInput {
  name?: string;
  description?: string | null;
  content?: string;
  tags?: string[];
  status?: RuleStatus;
}

export function useUpdateRule() {
  const { mutate, loading, error } = useMutation<
    { updateDetectionRule: { id: string; updatedAt: string } },
    { id: string; input: UpdateRuleInput }
  >(UPDATE_RULE, () => ({ refetchQueries: ['DetectionRule', 'DetectionRules'], awaitRefetchQueries: true }));
  return {
    submit: async (id: string, input: UpdateRuleInput) => (await mutate({ id, input }))?.data?.updateDetectionRule ?? null,
    loading, error,
  };
}

export function useDeleteRule() {
  const { mutate, loading, error } = useMutation<{ deleteDetectionRule: boolean }>(DELETE_RULE, () => ({
    refetchQueries: ['DetectionRules'], awaitRefetchQueries: true,
  }));
  return {
    submit: async (id: string) => Boolean((await mutate({ id }))?.data?.deleteDetectionRule),
    loading, error,
  };
}
