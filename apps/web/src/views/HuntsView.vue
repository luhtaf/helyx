<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHuntsList } from '@/composables/useHunts';
import SectionRule from '@/components/ui/SectionRule.vue';
import Pagination from '@/components/ui/Pagination.vue';
import Button from '@/components/ui/Button.vue';

const route = useRoute();
const router = useRouter();

const page = computed(() => Number(route.query.page) || 1);
const perPage = 25;

const { data, loading } = useHuntsList({
  page: () => page.value,
  perPage: () => perPage,
});

function setPage(p: number): void {
  router.replace({ path: '/hunts', query: p === 1 ? {} : { page: String(p) } });
}

function fmtDate(s: string): string {
  return s.slice(0, 10);
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10 flex items-end justify-between gap-4">
      <div>
        <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">hunt</p>
        <h1 class="mt-2 text-2xl font-medium tracking-tight">Threat hunting</h1>
        <p class="mt-2 text-[12px] text-ink-faint">
          intersect selected actors × selected inventory · ttp + cve correlation
        </p>
      </div>
      <Button variant="primary" size="sm" @click="router.push('/hunts/new')">+ new hunt</Button>
    </header>

    <SectionRule label="hunts">
      <template #right>
        <span v-if="loading && !data">loading…</span>
        <span v-else-if="data">{{ data.total }} hunt{{ data.total === 1 ? '' : 's' }}</span>
      </template>
    </SectionRule>

    <ul v-if="data?.items.length" class="space-y-0">
      <li
        v-for="hunt in data.items"
        :key="hunt.id"
        class="border-l-2 border-rule-strong pl-4 py-3 hover:border-ink-dim transition"
      >
        <RouterLink :to="`/hunts/${hunt.id}`" class="block group">
          <div class="flex items-baseline justify-between gap-4">
            <span class="text-[14px] text-ink group-hover:text-signal transition">
              {{ hunt.name }}
            </span>
            <div class="flex items-baseline gap-4 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
              <span>{{ hunt.targetActorCount }} actor{{ hunt.targetActorCount === 1 ? '' : 's' }}</span>
              <span>{{ hunt.scopedAssetCount }} asset{{ hunt.scopedAssetCount === 1 ? '' : 's' }}</span>
            </div>
          </div>
          <p class="mt-1 font-mono text-[10px] text-ink-faint">
            <span class="uppercase tracking-wider">{{ hunt.status.toLowerCase() }}</span>
            <span class="mx-2">·</span>
            <span>created {{ fmtDate(hunt.createdAt) }}</span>
          </p>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="text-[13px] text-ink-dim">
      no hunts yet — start one with
      <RouterLink to="/hunts/new" class="text-ink hover:text-signal transition">+ new hunt</RouterLink>.
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
