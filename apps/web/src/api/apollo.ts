import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import type { useAuthStore } from '@/stores/auth';

type AuthStore = ReturnType<typeof useAuthStore>;

export function createApolloClient(auth: AuthStore): ApolloClient<unknown> {
  const httpLink = new HttpLink({ uri: '/graphql' });

  const authLink = setContext((_, { headers }) => ({
    headers: {
      ...headers,
      ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
      ...(auth.activeOrgId ? { 'x-helyx-org': auth.activeOrgId } : {}),
    },
  }));

  return new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
      query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
    },
  });
}
