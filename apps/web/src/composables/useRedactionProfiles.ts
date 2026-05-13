// F3a — RedactionProfile composables. List (always populated; backend
// lazy-seeds builtins) + per-Hunt picker mutation.

import { computed, ref } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export interface RedactionProfile {
  id: string;
  slug: string;
  name: string;
  description: string;
  builtin: boolean;
  includeRuleNames: boolean;
  includeRuleDescriptions: boolean;
  includeRuleTags: boolean;
  includeOrgIdentity: boolean;
  createdAt: string;
}

const PROFILE_FIELDS = `
  id slug name description builtin
  includeRuleNames includeRuleDescriptions includeRuleTags includeOrgIdentity
  createdAt
`;

const LIST_QUERY = gql`
  query RedactionProfiles {
    redactionProfiles { ${PROFILE_FIELDS} }
  }
`;

const SET_HUNT_PROFILE = gql`
  mutation SetHuntRedactionProfile($huntId: ID!, $profileId: ID) {
    setHuntRedactionProfile(huntId: $huntId, profileId: $profileId)
  }
`;

export function useRedactionProfiles() {
  const { result, loading, error } = useQuery<{ redactionProfiles: RedactionProfile[] }>(
    LIST_QUERY,
    null,
    { fetchPolicy: 'cache-and-network' },
  );
  const profiles = computed<RedactionProfile[]>(() => result.value?.redactionProfiles ?? []);
  return { profiles, loading, error };
}

export function useSetHuntRedactionProfile() {
  const { client } = useApolloClient();
  const loading = ref(false);
  const error = ref<Error | null>(null);

  /** profileId=null clears the assignment (= full bundle on next export). */
  async function submit(huntId: string, profileId: string | null): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await client.mutate({
        mutation: SET_HUNT_PROFILE,
        variables: { huntId, profileId },
      });
      return true;
    } catch (e) {
      error.value = e as Error;
      return false;
    } finally {
      loading.value = false;
    }
  }

  return { submit, loading, error };
}
