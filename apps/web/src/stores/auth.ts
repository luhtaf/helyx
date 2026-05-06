// Token in HttpOnly cookie since Phase 3. Store tracks user/org only.
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface PersistedAuth {
  user: AuthUser | null;
  activeOrgId: string | null;
}

const STORAGE_KEY = 'helyx.auth';

function loadFromStorage(): PersistedAuth {
  if (typeof localStorage === 'undefined') return { user: null, activeOrgId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, activeOrgId: null };
    const parsed = JSON.parse(raw) as Partial<PersistedAuth>;
    return {
      user: parsed.user ?? null,
      activeOrgId: parsed.activeOrgId ?? null,
    };
  } catch {
    return { user: null, activeOrgId: null };
  }
}

function persist(state: PersistedAuth): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useAuthStore = defineStore('auth', () => {
  const initial = loadFromStorage();
  const user = ref<AuthUser | null>(initial.user);
  const activeOrgId = ref<string | null>(initial.activeOrgId);

  watch(
    [user, activeOrgId],
    () => persist({ user: user.value, activeOrgId: activeOrgId.value }),
    { deep: true },
  );

  const isAuthed = computed(() => Boolean(user.value));

  function setAuth(newUser: AuthUser): void {
    user.value = newUser;
  }

  function setActiveOrg(orgId: string | null): void {
    activeOrgId.value = orgId;
  }

  function logout(): void {
    user.value = null;
    activeOrgId.value = null;
    // Clear any legacy token keys from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('helyx_token');
    localStorage.removeItem(STORAGE_KEY);
  }

  return { user, activeOrgId, isAuthed, setAuth, setActiveOrg, logout };
});
