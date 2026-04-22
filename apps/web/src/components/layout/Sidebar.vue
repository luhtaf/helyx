<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useApolloClient } from '@vue/apollo-composable';
import { useAuthStore } from '@/stores/auth';
import { useMe } from '@/composables/useAuth';

const auth = useAuthStore();
const router = useRouter();
const { client } = useApolloClient();
const { me, organizations } = useMe(() => auth.isAuthed);

const showSwitcher = ref(false);
const activeOrg = computed(() =>
  organizations.value.find((o) => o.id === auth.activeOrgId) ?? null,
);

watchEffect(() => {
  if (organizations.value.length > 0 && !auth.activeOrgId) {
    auth.setActiveOrg(organizations.value[0]!.id);
  }
});

async function logout(): Promise<void> {
  auth.logout();
  await client.clearStore();
  router.replace('/login');
}

function switchOrg(orgId: string): void {
  auth.setActiveOrg(orgId);
  showSwitcher.value = false;
  client.resetStore().catch(() => undefined);
}

interface NavItem {
  to: string;
  label: string;
  exact?: boolean;
}

const navItems: NavItem[] = [
  { to: '/',              label: 'overview', exact: true },
  { to: '/assets',        label: 'inventory' },
  { to: '/hunts',         label: 'hunt' },
  { to: '/threat-actors', label: 'actors' },
];

function isActive(item: NavItem, isActiveRoute: boolean, isExactRoute: boolean): boolean {
  return item.exact ? isExactRoute : isActiveRoute;
}
</script>

<template>
  <aside class="flex h-screen w-[200px] shrink-0 flex-col bg-base relative z-10">
    <div class="px-5 pt-7 pb-5">
      <p class="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
        {{ activeOrg?.name ?? 'no org' }}
      </p>
      <button
        v-if="organizations.length > 1"
        type="button"
        class="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-ink transition"
        @click="showSwitcher = !showSwitcher"
      >
        <span>switch</span>
        <span class="text-[8px]">↗</span>
      </button>
      <ul v-if="showSwitcher" class="mt-3 space-y-1.5">
        <li v-for="org in organizations" :key="org.id">
          <button
            type="button"
            :class="[
              'flex w-full items-center justify-between text-left font-mono text-[10px] uppercase tracking-wider transition',
              org.id === auth.activeOrgId ? 'text-signal' : 'text-ink-dim hover:text-ink',
            ]"
            @click="switchOrg(org.id)"
          >
            <span class="truncate">{{ org.name }}</span>
            <span class="text-[9px] text-ink-faint">{{ org.myRole }}</span>
          </button>
        </li>
      </ul>
    </div>

    <hr class="border-t border-rule-strong" />

    <nav class="flex-1 px-5 py-6">
      <ul class="space-y-1.5">
        <li v-for="(item, i) in navItems" :key="item.to">
          <RouterLink :to="item.to" custom v-slot="{ isActive: routeActive, isExactActive, navigate }">
            <button
              type="button"
              :class="[
                'group flex w-full items-center gap-3 py-1 text-left transition',
                isActive(item, routeActive, isExactActive)
                  ? 'text-ink'
                  : 'text-ink-dim hover:text-ink',
              ]"
              @click="navigate"
            >
              <span
                :class="[
                  'font-mono text-[12px] font-medium tabular-nums w-6',
                  isActive(item, routeActive, isExactActive) ? 'text-signal' : 'text-ink-faint',
                ]"
              >{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="text-[13px]">{{ item.label }}</span>
              <span
                v-if="isActive(item, routeActive, isExactActive)"
                class="ml-auto text-[8px] text-sev-crit"
              >●</span>
            </button>
          </RouterLink>
        </li>
      </ul>
    </nav>

    <hr class="border-t border-rule-strong" />

    <div class="px-5 py-5">
      <p class="font-mono text-[11px] text-ink truncate">{{ me?.email ?? '—' }}</p>
      <button
        type="button"
        class="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-ink transition"
        @click="logout"
      >sign out</button>
    </div>
  </aside>
</template>
