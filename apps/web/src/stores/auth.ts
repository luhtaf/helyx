import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface PersistedAuth {
  token: string | null;
  user: AuthUser | null;
  activeOrgId: string | null;
}

const STORAGE_KEY = 'helyx.auth';

function loadFromStorage(): PersistedAuth {
  if (typeof localStorage === 'undefined') return { token: null, user: null, activeOrgId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null, activeOrgId: null };
    const parsed = JSON.parse(raw) as Partial<PersistedAuth>;
    return {
      token: parsed.token ?? null,
      user: parsed.user ?? null,
      activeOrgId: parsed.activeOrgId ?? null,
    };
  } catch {
    return { token: null, user: null, activeOrgId: null };
  }
}

function persist(state: PersistedAuth): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useAuthStore = defineStore('auth', () => {
  const initial = loadFromStorage();
  const token = ref<string | null>(initial.token);
  const user = ref<AuthUser | null>(initial.user);
  const activeOrgId = ref<string | null>(initial.activeOrgId);

  watch(
    [token, user, activeOrgId],
    () => persist({ token: token.value, user: user.value, activeOrgId: activeOrgId.value }),
    { deep: true },
  );

  const isAuthed = computed(() => Boolean(token.value && user.value));

  function setAuth(newToken: string, newUser: AuthUser): void {
    token.value = newToken;
    user.value = newUser;
  }

  function setActiveOrg(orgId: string | null): void {
    activeOrgId.value = orgId;
  }

  function logout(): void {
    token.value = null;
    user.value = null;
    activeOrgId.value = null;
  }

  return { token, user, activeOrgId, isAuthed, setAuth, setActiveOrg, logout };
});
