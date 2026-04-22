<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useThreatActorsList } from '@/composables/useThreatActors';
import SectionRule from '@/components/ui/SectionRule.vue';
import Pagination from '@/components/ui/Pagination.vue';

const route = useRoute();
const router = useRouter();

const search = ref((route.query.q as string) || '');
const page = computed(() => Number(route.query.page) || 1);
const perPage = 25;

const { data, loading } = useThreatActorsList({
  search: () => search.value.trim() || null,
  page: () => page.value,
  perPage: () => perPage,
});

function setQuery(patch: Record<string, string | null | undefined>): void {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (v != null && v !== '') next[k] = String(v);
  }
  router.replace({ path: '/threat-actors', query: next });
}

function setPage(p: number): void {
  setQuery({ page: String(p) });
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery({ q: search.value.trim() || null, page: '1' }), 300);
});
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">actors</p>
      <h1 class="mt-2 text-2xl font-medium tracking-tight">Threat actor catalog</h1>
      <p class="mt-2 text-[12px] text-ink-faint">
        sourced from MITRE ATT&CK Enterprise · global, shared across organisations
      </p>
    </header>

    <div class="mb-8 flex items-center gap-3 font-mono text-[11px]">
      <span class="text-ink-faint w-12">search</span>
      <input
        v-model="search"
        type="search"
        placeholder="actor name or id (e.g. APT28, G0007)"
        class="bg-transparent border-b border-rule focus:border-ink-dim focus:outline-none text-ink placeholder:text-ink-faint py-1 w-full max-w-xs transition"
      />
    </div>

    <SectionRule label="results">
      <template #right>
        <span v-if="loading && !data">loading…</span>
        <span v-else-if="data">{{ data.total }} actor{{ data.total === 1 ? '' : 's' }}</span>
      </template>
    </SectionRule>

    <ul v-if="data?.items.length" class="space-y-0">
      <li
        v-for="ta in data.items"
        :key="ta.id"
        class="border-l-2 border-rule-strong pl-4 py-3 hover:border-ink-dim transition"
      >
        <RouterLink :to="`/threat-actors/${ta.id}`" class="block group">
          <div class="flex items-baseline justify-between gap-4">
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[12px] text-ink-dim tabular-nums">{{ ta.id }}</span>
              <span class="text-[14px] text-ink group-hover:text-signal transition">
                {{ ta.name }}
              </span>
            </div>
            <span class="font-mono text-[11px] tabular-nums text-ink-faint shrink-0">
              {{ ta.techniqueCount }} ttp{{ ta.techniqueCount === 1 ? '' : 's' }}
            </span>
          </div>
          <p
            v-if="ta.aliases.length > 1"
            class="mt-1 font-mono text-[10px] text-ink-faint truncate"
          >
            aka {{ ta.aliases.filter((a) => a !== ta.name).slice(0, 5).join(' · ') }}
          </p>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-[13px] text-ink-dim">
      no threat actors match the current search.
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
