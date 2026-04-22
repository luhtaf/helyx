import { useMutation, useQuery } from '@vue/apollo-composable';
import { computed, ref } from 'vue';
import gql from 'graphql-tag';
import { useAuthStore, type AuthUser } from '@/stores/auth';

const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id email displayName }
    }
  }
`;

const ME = gql`
  query Me {
    me { id email displayName }
    myOrganizations { id name slug myRole }
  }
`;

interface LoginResult {
  login: { token: string; user: AuthUser };
}

interface MeResult {
  me: AuthUser | null;
  myOrganizations: { id: string; name: string; slug: string; myRole: string }[];
}

export function useLogin() {
  const auth = useAuthStore();
  const error = ref<string | null>(null);
  const { mutate, loading } = useMutation<LoginResult>(LOGIN);

  async function submit(email: string, password: string): Promise<boolean> {
    error.value = null;
    try {
      const res = await mutate({ email, password });
      const payload = res?.data?.login;
      if (!payload) {
        error.value = 'Login failed: empty response';
        return false;
      }
      auth.setAuth(payload.token, payload.user);
      return true;
    } catch (err) {
      error.value = (err as Error).message ?? 'Login failed';
      return false;
    }
  }

  return { submit, loading, error };
}

export function useMe(enabled: () => boolean) {
  const { result, loading, error, refetch } = useQuery<MeResult>(
    ME,
    null,
    () => ({ enabled: enabled(), fetchPolicy: 'network-only' }),
  );
  const me = computed(() => result.value?.me ?? null);
  const organizations = computed(() => result.value?.myOrganizations ?? []);
  return { me, organizations, loading, error, refetch };
}
