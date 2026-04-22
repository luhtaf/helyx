<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCweDetail } from '@/composables/useCwes';
import SectionRule from '@/components/ui/SectionRule.vue';
import SeverityWord from '@/components/ui/SeverityWord.vue';
import Pagination from '@/components/ui/Pagination.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import { severityBorderVar } from '@/utils/severity';

const props = defineProps<{ id: string }>();

const route = useRoute();
const router = useRouter();
const idRef = toRef(props, 'id');

const page = computed(() => {
  const raw = Number(route.query.page);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
});

const { cwe, loading, error } = useCweDetail(() => idRef.value, () => page.value);

function setQuery(patch: Record<string, string | null | undefined>): void {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    if (value != null && value !== '') next[key] = String(value);
  }
  router.replace({ path: route.path, query: next });
}

function setPage(nextPage: number): void {
  setQuery({ page: nextPage === 1 ? null : String(nextPage) });
}

function fmtDate(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? '—';
}

function severityBorderColor(value: string | null | undefined): string {
  return severityBorderVar(value);
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'weaknesses', to: '/cves' },
          { label: id, mono: true },
        ]"
        class="mb-3"
      />

      <div v-if="cwe" class="flex flex-wrap items-baseline gap-4">
        <span class="font-mono text-[26px] font-medium text-ink tabular-nums">{{ cwe.id }}</span>
        <h1 v-if="cwe.name" class="text-[26px] font-medium tracking-tight text-ink">
          {{ cwe.name }}
        </h1>
      </div>
    </header>

    <p v-if="loading && !cwe" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">
      failed to load: {{ error.message }}
    </p>
    <p v-else-if="!cwe" class="text-[13px] text-ink-dim">
      cwe not found in graph.
    </p>

    <template v-else>
      <SectionRule label="cves with this weakness">
        <template #right>{{ cwe.cves.total }}</template>
      </SectionRule>

      <ul v-if="cwe.cves.items.length" class="space-y-0">
        <li
          v-for="item in cwe.cves.items"
          :key="item.cveId"
          class="border-l-2 pl-4 py-3"
          :style="{ borderColor: severityBorderColor(item.severity) }"
        >
          <RouterLink :to="`/cves/${item.cveId}`" class="block group">
            <div class="flex items-baseline justify-between gap-4">
              <span class="font-mono text-[14px] text-ink group-hover:text-signal transition">
                {{ item.cveId }}
              </span>
              <div class="flex items-baseline gap-3 shrink-0">
                <span v-if="item.baseScore != null" class="font-mono text-[14px] text-ink tabular-nums">
                  {{ item.baseScore.toFixed(1) }}
                </span>
                <SeverityWord :severity="item.severity" />
              </div>
            </div>
            <div class="mt-1.5 flex items-baseline justify-between gap-4">
              <p class="text-[12px] text-ink-dim line-clamp-1 grow">
                {{ item.description ?? '—' }}
              </p>
              <span class="font-mono text-[10px] text-ink-faint shrink-0">
                {{ fmtDate(item.publishedAt) }}
              </span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-[13px] text-ink-dim">
        no cves reference this weakness.
      </p>

      <div v-if="cwe.cves.total > 0" class="mt-8">
        <Pagination
          :page="cwe.cves.page"
          :per-page="cwe.cves.perPage"
          :total="cwe.cves.total"
          @update:page="setPage"
        />
      </div>
    </template>
  </div>
</template>
