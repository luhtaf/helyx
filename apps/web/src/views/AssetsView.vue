<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAssetsList } from '@/composables/useAssets';
import SectionRule from '@/components/ui/SectionRule.vue';
import Pagination from '@/components/ui/Pagination.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const KINDS = ['HOST', 'HYPERVISOR', 'VM', 'CONTAINER', 'K8S_CLUSTER', 'K8S_NODE', 'K8S_POD', 'IMAGE', 'APPLICATION'] as const;

const kind = computed(() => (route.query.kind as string) || null);
const search = ref((route.query.q as string) || '');
const page = computed(() => Number(route.query.page) || 1);
const perPage = 25;

const { data, loading } = useAssetsList({
  kind: () => kind.value,
  search: () => search.value.trim() || null,
  page: () => page.value,
  perPage: () => perPage,
  enabled: () => Boolean(auth.activeOrgId),
});

function setQuery(patch: Record<string, string | null | undefined>): void {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (v != null && v !== '') next[k] = String(v);
  }
  router.replace({ path: '/assets', query: next });
}

function setKind(k: string | null): void {
  setQuery({ kind: k, page: '1' });
}

function setPage(p: number): void {
  setQuery({ page: String(p) });
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery({ q: search.value.trim() || null, page: '1' }), 300);
});

function fmtKind(k: string): string {
  return k.toLowerCase().replace('_', ' ');
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">inventory</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight">Assets</h1>
    </header>

    <div class="mb-8 grid gap-5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px]">
        <span class="text-ink-faint w-12">filter</span>
        <button
          type="button"
          :class="['transition', !kind ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
          @click="setKind(null)"
        >all</button>
        <template v-for="(k, i) in KINDS" :key="k">
          <span class="text-ink-faint">/</span>
          <button
            type="button"
            :class="['transition', kind === k ? 'text-ink' : 'text-ink-faint hover:text-ink-dim']"
            @click="setKind(k)"
          >{{ fmtKind(k) }}</button>
        </template>
      </div>

      <div class="flex items-center gap-3 font-mono text-[11px]">
        <span class="text-ink-faint w-12">search</span>
        <input
          v-model="search"
          type="search"
          placeholder="asset name substring"
          class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-faint py-1 w-full max-w-xs transition"
        />
      </div>
    </div>

    <SectionRule label="results">
      <template #right>
        <span v-if="loading && !data">loading…</span>
        <span v-else-if="data">{{ data.total }} asset{{ data.total === 1 ? '' : 's' }}</span>
      </template>
    </SectionRule>

    <ul v-if="data?.items.length" class="space-y-0">
      <li
        v-for="asset in data.items"
        :key="asset.id"
        class="border-l-2 border-rule-strong pl-4 py-3 hover:border-ink-dim transition"
      >
        <RouterLink :to="`/assets/${asset.id}`" class="block group">
          <div class="flex items-baseline justify-between gap-4">
            <span class="text-[14px] text-ink group-hover:text-signal transition">
              {{ asset.name }}
            </span>
            <div class="flex items-baseline gap-4 shrink-0 font-mono text-[11px] tabular-nums">
              <span v-if="asset.cveCount > 0" class="text-sev-crit">
                {{ asset.cveCount }} cve{{ asset.cveCount === 1 ? '' : 's' }}
              </span>
              <span class="text-ink-faint">
                {{ asset.componentCount }} comp
              </span>
              <span v-if="asset.childCount > 0" class="text-ink-dim">
                {{ asset.childCount }} child{{ asset.childCount === 1 ? '' : 'ren' }}
              </span>
            </div>
          </div>
          <p class="mt-1 font-mono text-[10px] text-ink-faint">
            <span class="text-ink-dim uppercase tracking-wider">{{ fmtKind(asset.kind) }}</span>
            <template v-if="asset.hostname">
              <span class="mx-2">·</span>{{ asset.hostname }}
            </template>
            <template v-if="asset.ipAddresses.length">
              <span class="mx-2">·</span>
              <span v-for="(ip, i) in asset.ipAddresses" :key="ip">
                <span v-if="i > 0">,&nbsp;</span>{{ ip }}
              </span>
            </template>
          </p>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-[13px] text-ink-dim">
      no assets match the current filter.
    </p>

    <div v-if="data" class="mt-8">
      <Pagination
        :page="data.page"
        :per-page="data.perPage"
        :total="data.total"
        @update:page="setPage"
      />
    </div>
  </div>
</template>
