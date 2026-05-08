// Token in HttpOnly cookie since Phase 3. Store tracks user/org only.
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export type OrgRole = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';

export const ROLE_RANK: Record<OrgRole, number> = { OWNER: 4, ADMIN: 3, ANALYST: 2, VIEWER: 1 };

interface PersistedAuth {
  user: AuthUser | null;
  activeOrgId: string | null;
  activeOrgRole: OrgRole | null;
}

const STORAGE_KEY = 'helyx.auth';

function loadFromStorage(): PersistedAuth {
  if (typeof localStorage === 'undefined') return { user: null, activeOrgId: null, activeOrgRole: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, activeOrgId: null, activeOrgRole: null };
    const parsed = JSON.parse(raw) as Partial<PersistedAuth>;
    return {
      user: parsed.user ?? null,
      activeOrgId: parsed.activeOrgId ?? null,
      activeOrgRole: parsed.activeOrgRole ?? null,
    };
  } catch {
    return { user: null, activeOrgId: null, activeOrgRole: null };
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
  const activeOrgRole = ref<OrgRole | null>(initial.activeOrgRole);

  watch(
    [user, activeOrgId, activeOrgRole],
    () => persist({ user: user.value, activeOrgId: activeOrgId.value, activeOrgRole: activeOrgRole.value }),
    { deep: true },
  );

  const isAuthed = computed(() => Boolean(user.value));

  function hasMinRole(required: OrgRole): boolean {
    const have = activeOrgRole.value;
    if (!have) return false;
    return ROLE_RANK[have] >= ROLE_RANK[required];
  }

  function setAuth(newUser: AuthUser): void {
    user.value = newUser;
  }

  function setActiveOrg(orgId: string | null, role: OrgRole | null = null): void {
    activeOrgId.value = orgId;
    activeOrgRole.value = role;
  }

  function logout(): void {
    user.value = null;
    activeOrgId.value = null;
    activeOrgRole.value = null;
    // Clear any legacy token keys from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('helyx_token');
    localStorage.removeItem(STORAGE_KEY);
  }

  return { user, activeOrgId, activeOrgRole, isAuthed, hasMinRole, setAuth, setActiveOrg, logout };
});
