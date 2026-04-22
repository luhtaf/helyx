<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import MatrixColumn from '@/components/matrix/MatrixColumn.vue';
import { useMatrix } from '@/composables/useMatrix';

const route = useRoute();
const router = useRouter();

const PLATFORM_OPTIONS = [
  'windows',
  'linux',
  'macos',
  'network',
  'containers',
  'office-suite',
  'iaas',
  'saas',
] as const;

const platform = ref((route.query.platform as string) || '');
const search = ref((route.query.q as string) || '');
const showSubtechniques = computed(() => route.query.sub === '1');

const { columns, loading, error } = useMatrix(() => ({
  platform: platform.value || null,
  search: search.value.trim() || null,
}));

const totalTechniques = computed(() =>
  columns.value.reduce((sum, column) => sum + column.techniques.length, 0),
);

function setQuery(patch: Record<string, string | null | undefined>): void {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    if (value != null && value !== '') next[key] = String(value);
  }
  router.replace({ path: '/techniques', query: next });
}

watch(platform, () => {
  setQuery({ platform: platform.value || null });
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery({ q: search.value.trim() || null }), 300);
});

function toggleSubtechniques(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  setQuery({ sub: checked ? '1' : null });
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'matrix' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">ttp · matrix</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight text-ink">ATT&amp;CK Matrix</h1>
      <p class="mt-2 text-[12px] text-ink-faint">
        MITRE ATT&amp;CK Enterprise · 14 tactics · {{ totalTechniques }} techniques
      </p>
    </header>

    <div class="mb-8 flex flex-wrap items-center gap-4 font-mono text-[11px]">
      <label class="flex items-center gap-2 text-ink-dim">
        <span class="text-ink-faint">platform</span>
        <select
          v-model="platform"
          class="h-9 rounded-md bg-surface border border-rule px-3 text-ink focus:outline-none focus:border-ink-dim"
        >
          <option value="">all</option>
          <option v-for="option in PLATFORM_OPTIONS" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <label class="flex items-center gap-2 text-ink-dim">
        <span class="text-ink-faint">search</span>
        <input
          v-model="search"
          type="search"
          placeholder="technique name or id"
          class="h-9 w-[240px] rounded-md bg-surface border border-rule px-3 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink-dim"
        />
      </label>

      <label class="flex items-center gap-2 text-ink-dim cursor-pointer select-none">
        <input
          :checked="showSubtechniques"
          type="checkbox"
          class="h-4 w-4 rounded-[2px] border border-rule bg-surface accent-[var(--signal)]"
          @change="toggleSubtechniques"
        />
        <span class="text-ink-faint">sub-techniques</span>
      </label>
    </div>

    <p v-if="loading && !columns.length" class="mb-6 text-[13px] text-ink-dim">loading matrix…</p>
    <p v-else-if="error" class="mb-6 text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!columns.length" class="mb-6 text-[13px] text-ink-dim">
      no techniques match the current filter.
    </p>

    <div v-else class="flex overflow-x-auto pb-8 -mx-12 px-12 border-y border-rule">
      <MatrixColumn
        v-for="column in columns"
        :key="column.tactic.id"
        :column="column"
        :show-subtechniques="showSubtechniques"
      />
    </div>
  </div>
</template>
