import { ApolloClient, HttpLink, InMemoryCache, fromPromise } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import gql from 'graphql-tag';
import type { useAuthStore } from '@/stores/auth';

type AuthStore = ReturnType<typeof useAuthStore>;

const REFRESH = gql`mutation refresh { refresh { ok } }`;

function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)helyx_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

// Single-flight: 1 refresh per burst — coalesces multiple concurrent 401s.
let refreshing: Promise<boolean> | null = null;

async function doRefresh(client: ApolloClient<unknown>): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await client.mutate({ mutation: REFRESH, errorPolicy: 'all' });
        return Boolean(r.data?.refresh?.ok);
      } catch {
        return false;
      } finally {
        // Reset shortly after so next burst can refresh independently
        setTimeout(() => { refreshing = null; }, 1000);
      }
    })();
  }
  return refreshing;
}

export function createApolloClient(auth: AuthStore): ApolloClient<unknown> {
  const httpLink = new HttpLink({
    uri: '/graphql',
    credentials: 'include', // sends cookies
  });

  const headerLink = setContext((_, { headers }) => {
    const csrf = readCsrfCookie();
    return {
      headers: {
        ...headers,
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(auth.activeOrgId ? { 'x-helyx-org': auth.activeOrgId } : {}),
      },
    };
  });

  let client: ApolloClient<unknown>;

  const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
    // Skip refresh attempt for the refresh mutation itself (avoid loop)
    if (operation.operationName === 'refresh' || operation.operationName === 'login') {
      return undefined;
    }
    const code = graphQLErrors?.[0]?.extensions?.code as string | undefined;
    const status = (networkError as { statusCode?: number })?.statusCode;

    // Access expired or no session cookie → try silent refresh
    if (status === 401 || code === 'CSRF_NO_SESSION') {
      return fromPromise(doRefresh(client)).flatMap((ok) => {
        if (!ok) {
          // Refresh failed too — go to login w/ banner reason
          window.location.href = '/login?reason=session_expired';
          return forward(operation);
        }
        return forward(operation);
      });
    }

    // Refresh itself returned REFRESH_EXPIRED → user must re-login
    if (code === 'REFRESH_EXPIRED' || code === 'INVALID_REFRESH' || code === 'NO_REFRESH') {
      auth.logout();
      window.location.href = '/login?reason=session_expired';
    }
    return undefined;
  });

  client = new ApolloClient({
    link: errorLink.concat(headerLink).concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
      query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
    },
  });
  return client;
}
