import { ApolloClient, HttpLink, InMemoryCache, fromPromise, Observable } from '@apollo/client/core';
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

// Auth-lost flag — once refresh fails, all subsequent requests skip the
// refresh+retry path entirely. Otherwise watchQuery (cache-and-network)
// + view re-renders keep firing requests in the gap before window.location
// finishes redirecting → rate-limit DoS on the user's own session.
let authLost = false;

async function doRefresh(client: ApolloClient<unknown>): Promise<boolean> {
  if (authLost) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await client.mutate({ mutation: REFRESH, errorPolicy: 'all' });
        const ok = Boolean(r.data?.refresh?.ok);
        if (!ok) authLost = true;
        return ok;
      } catch {
        authLost = true;
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 1000);
      }
    })();
  }
  return refreshing;
}

function redirectToLogin(): void {
  // Idempotent — if already redirecting, don't trigger again
  if (window.location.pathname === '/login') return;
  window.location.href = '/login?reason=session_expired';
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
    // Skip refresh attempt for refresh/login mutations themselves (avoid loop)
    if (operation.operationName === 'refresh' || operation.operationName === 'login') {
      return undefined;
    }
    const code = graphQLErrors?.[0]?.extensions?.code as string | undefined;
    const status = (networkError as { statusCode?: number })?.statusCode;

    // If auth already lost, don't retry — let error propagate, kick to login
    if (authLost) {
      redirectToLogin();
      return undefined;
    }

    // Access expired or no session cookie → try silent refresh
    if (status === 401 || code === 'CSRF_NO_SESSION') {
      return fromPromise(doRefresh(client)).flatMap((ok) => {
        if (!ok) {
          // Refresh failed — kick to login. Return empty observable (terminates
          // chain cleanly without retrying — would loop and rate-limit otherwise)
          redirectToLogin();
          return new Observable<never>((subscriber) => subscriber.complete());
        }
        return forward(operation);  // retry only on successful refresh
      });
    }

    // Refresh itself returned REFRESH_EXPIRED → user must re-login
    if (code === 'REFRESH_EXPIRED' || code === 'INVALID_REFRESH' || code === 'NO_REFRESH') {
      authLost = true;
      auth.logout();
      redirectToLogin();
    }

    // Rate-limited (we got hit ourselves) → don't retry, surface to view
    if (code === 'RATE_LIMITED') {
      return undefined;  // let error propagate
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
