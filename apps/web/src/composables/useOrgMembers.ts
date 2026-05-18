// Org membership admin — list members, invite (by email), change role,
// revoke. Backend gates ADMIN+; the UI mirrors that but the server is
// the authority. addOrganizationMember doubles as role-change (ON MATCH
// SET role server-side), so "change role" reuses the invite mutation.

import { computed } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export type OrgRole = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface OrgMember {
  user: { id: string; email: string; displayName: string };
  role: OrgRole;
  joinedAt: string;
}

const ORG_MEMBERS = gql`
  query OrgMembers($slug: String!) {
    organization(slug: $slug) {
      id
      name
      slug
      myRole
      members {
        user { id email displayName }
        role
        joinedAt
      }
    }
  }
`;

const ADD_MEMBER = gql`
  mutation AddOrganizationMember($orgId: ID!, $email: String!, $role: OrgRole!) {
    addOrganizationMember(orgId: $orgId, email: $email, role: $role) {
      user { id email displayName }
      role
      joinedAt
    }
  }
`;

const REMOVE_MEMBER = gql`
  mutation RemoveOrganizationMember($orgId: ID!, $userId: ID!) {
    removeOrganizationMember(orgId: $orgId, userId: $userId)
  }
`;

interface OrgResult {
  organization: {
    id: string;
    name: string;
    slug: string;
    myRole: OrgRole | null;
    members: OrgMember[];
  } | null;
}

export function useOrgMembers(slug: () => string | null) {
  const { result, loading, error, refetch } = useQuery<OrgResult>(
    ORG_MEMBERS,
    () => ({ slug: slug() ?? '' }),
    () => ({ enabled: Boolean(slug()), fetchPolicy: 'cache-and-network' }),
  );
  const org = computed(() => result.value?.organization ?? null);
  const members = computed<OrgMember[]>(() => result.value?.organization?.members ?? []);
  return { org, members, loading, error, refetch: () => { refetch(); } };
}

// Mutations throw on server-side refusal (last-owner, self-remove, not
// found) — the view try/catches and surfaces the GraphQL message via
// toast, so no error ref here.
export function useOrgMemberMutations(): {
  add: (orgId: string, email: string, role: OrgRole) => Promise<OrgMember | null>;
  remove: (orgId: string, userId: string) => Promise<boolean>;
} {
  const { client } = useApolloClient();

  async function add(orgId: string, email: string, role: OrgRole): Promise<OrgMember | null> {
    const r = await client.mutate<{ addOrganizationMember: OrgMember }>({
      mutation: ADD_MEMBER,
      variables: { orgId, email, role },
      refetchQueries: ['OrgMembers'],
      awaitRefetchQueries: true,
    });
    return r.data?.addOrganizationMember ?? null;
  }

  async function remove(orgId: string, userId: string): Promise<boolean> {
    const r = await client.mutate<{ removeOrganizationMember: boolean }>({
      mutation: REMOVE_MEMBER,
      variables: { orgId, userId },
      refetchQueries: ['OrgMembers'],
      awaitRefetchQueries: true,
    });
    return Boolean(r.data?.removeOrganizationMember);
  }

  return { add, remove };
}
