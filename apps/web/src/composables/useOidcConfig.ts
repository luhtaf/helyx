// OIDC SSO admin (OWNER). DB-driven config — no redeploy to change IdP.
// The client secret is write-only: never returned, only `hasClientSecret`.

import { computed } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export interface OidcConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLoginRedirect: string;
  scopes: string;
  hasClientSecret: boolean;
  updatedAt: string | null;
}

export interface OidcConfigInput {
  issuer: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  postLoginRedirect: string;
  scopes: string;
}

const FIELDS = `
  enabled issuer clientId redirectUri postLoginRedirect
  scopes hasClientSecret updatedAt
`;

const OIDC_CONFIG = gql`
  query OidcConfig { oidcConfig { ${FIELDS} } }
`;
const SET_OIDC_CONFIG = gql`
  mutation SetOidcConfig($input: OidcConfigInput!) {
    setOidcConfig(input: $input) { ${FIELDS} }
  }
`;
const SET_OIDC_ENABLED = gql`
  mutation SetOidcEnabled($enabled: Boolean!) {
    setOidcEnabled(enabled: $enabled) { ${FIELDS} }
  }
`;

export function useOidcConfig() {
  const { result, loading, error, refetch } = useQuery<{ oidcConfig: OidcConfig }>(
    OIDC_CONFIG, null, { fetchPolicy: 'cache-and-network' },
  );
  const cfg = computed<OidcConfig | null>(() => result.value?.oidcConfig ?? null);
  return { cfg, loading, error, refetch: () => { refetch(); } };
}

export function useOidcMutations() {
  const { client } = useApolloClient();

  async function save(input: OidcConfigInput): Promise<OidcConfig | null> {
    const r = await client.mutate<{ setOidcConfig: OidcConfig }>({
      mutation: SET_OIDC_CONFIG,
      variables: { input },
      refetchQueries: ['OidcConfig'],
      awaitRefetchQueries: true,
    });
    return r.data?.setOidcConfig ?? null;
  }

  async function setEnabled(enabled: boolean): Promise<OidcConfig | null> {
    const r = await client.mutate<{ setOidcEnabled: OidcConfig }>({
      mutation: SET_OIDC_ENABLED,
      variables: { enabled },
      refetchQueries: ['OidcConfig'],
      awaitRefetchQueries: true,
    });
    return r.data?.setOidcEnabled ?? null;
  }

  return { save, setEnabled };
}
