<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';
import { useCreateHunt } from '@/composables/useHunts';
import SectionRule from '@/components/ui/SectionRule.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';

const router = useRouter();
const { client } = useApolloClient();
const { submit, loading: creating, error: createError } = useCreateHunt();

type Step = 1 | 2 | 3;
const step = ref<Step>(1);
const name = ref('');
const taSearch = ref('');
const assetSearch = ref('');
const taPage = ref(1);
const assetPage = ref(1);
const selectedTa = ref<Set<string>>(new Set());
const selectedAssets = ref<Set<string>>(new Set());

const TA_LIST = gql`
  query HuntPickerActors($search: String, $page: Int, $perPage: Int) {
    threatActors(search: $search, page: $page, perPage: $perPage) {
      total page perPage
      items { id name techniqueCount }
    }
  }
`;

const ASSET_LIST = gql`
  query HuntPickerAssets($search: String, $page: Int, $perPage: Int) {
    assets(search: $search, page: $page, perPage: $perPage) {
      total page perPage
      items { id name kind ipAddresses }
    }
  }
`;

const { result: taResult, loading: taLoading } = useQuery(
  TA_LIST,
  () => ({ search: taSearch.value.trim() || null, page: taPage.value, perPage: 12 }),
  () => ({ enabled: step.value === 2, fetchPolicy: 'cache-and-network' }),
);

const { result: assetResult, loading: assetLoading } = useQuery(
  ASSET_LIST,
  () => ({ search: assetSearch.value.trim() || null, page: assetPage.value, perPage: 12 }),
  () => ({ enabled: step.value === 3, fetchPolicy: 'cache-and-network' }),
);

interface PickerPage<T> { total: number; page: number; perPage: number; items: T[] }
interface TaItem { id: string; name: string; techniqueCount: number }
interface AssetItem { id: string; name: string; kind: string; ipAddresses: string[] }

const taData = computed(() => (taResult.value as { threatActors?: PickerPage<TaItem> } | undefined)?.threatActors ?? null);
const assetData = computed(() => (assetResult.value as { assets?: PickerPage<AssetItem> } | undefined)?.assets ?? null);

let taSearchTimer: ReturnType<typeof setTimeout> | null = null;
watch(taSearch, () => {
  if (taSearchTimer) clearTimeout(taSearchTimer);
  taSearchTimer = setTimeout(() => { taPage.value = 1; }, 300);
});

let assetSearchTimer: ReturnType<typeof setTimeout> | null = null;
watch(assetSearch, () => {
  if (assetSearchTimer) clearTimeout(assetSearchTimer);
  assetSearchTimer = setTimeout(() => { assetPage.value = 1; }, 300);
});

function toggleTa(id: string): void {
  const next = new Set(selectedTa.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selectedTa.value = next;
}
function toggleAsset(id: string): void {
  const next = new Set(selectedAssets.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selectedAssets.value = next;
}

const canNext = computed(() => {
  if (step.value === 1) return name.value.trim().length > 0;
  if (step.value === 2) return selectedTa.value.size > 0 || selectedAssets.value.size > 0;
  return true;
});
const canCreate = computed(() => name.value.trim().length > 0 && (selectedTa.value.size > 0 || selectedAssets.value.size > 0));

async function onCreate(): Promise<void> {
  const result = await submit({
    name: name.value.trim(),
    targetActorIds: [...selectedTa.value],
    scopedAssetIds: [...selectedAssets.value],
  });
  if (result?.id) {
    await client.refetchQueries({ include: ['Hunts'] }).catch(() => undefined);
    router.replace(`/hunts/${result.id}`);
  }
}

const stepLabels: Record<Step, string> = { 1: 'name', 2: 'targets', 3: 'scope' };
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-12">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'hunt', to: '/hunts' },
          { label: 'new', mono: false },
        ]"
        class="mb-3"
      />
      <h1 class="text-[26px] font-medium tracking-tight text-ink">New hunt</h1>

      <nav class="mt-5 flex items-center gap-3 font-mono text-[11px]">
        <template v-for="n in [1, 2, 3] as Step[]" :key="n">
          <button
            type="button"
            :class="[
              'flex items-center gap-2 transition',
              step === n ? 'text-ink' : 'text-ink-faint hover:text-ink-dim',
            ]"
            @click="step = n"
          >
            <span :class="['inline-flex h-5 w-5 items-center justify-center rounded-full border tabular-nums', step === n ? 'border-signal text-signal' : 'border-rule text-ink-faint']">
              {{ n }}
            </span>
            <span>{{ stepLabels[n] }}</span>
          </button>
          <span v-if="n < 3" class="text-ink-faint">/</span>
        </template>
      </nav>
    </header>

    <section v-if="step === 1" class="space-y-6 max-w-md">
      <SectionRule label="hunt name" />
      <Input v-model="name" label="name" placeholder="e.g. Q2 ransomware exposure" required />
      <p class="font-mono text-[10px] text-ink-faint">
        a hunt = (selected actors) × (selected assets). intersection computed live.
      </p>
    </section>

    <section v-if="step === 2" class="space-y-6">
      <SectionRule label="target threat actors">
        <template #right>{{ selectedTa.size }} selected</template>
      </SectionRule>
      <Input v-model="taSearch" type="search" placeholder="search by name or id (APT28, G0007)" />
      <ul v-if="taData?.items.length" class="space-y-0">
        <li
          v-for="ta in taData.items"
          :key="ta.id"
          :class="[
            'border-l-2 pl-4 py-2.5 cursor-pointer transition',
            selectedTa.has(ta.id) ? 'border-signal bg-surface/30' : 'border-rule-strong hover:border-ink-dim',
          ]"
          @click="toggleTa(ta.id)"
        >
          <div class="flex items-baseline justify-between gap-4">
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[10px] tabular-nums" :class="selectedTa.has(ta.id) ? 'text-signal' : 'text-ink-faint'">
                {{ selectedTa.has(ta.id) ? '✓' : '○' }}
              </span>
              <span class="font-mono text-[11px] text-ink-dim tabular-nums">{{ ta.id }}</span>
              <span class="text-[13px] text-ink">{{ ta.name }}</span>
            </div>
            <span class="font-mono text-[10px] text-ink-faint tabular-nums">{{ ta.techniqueCount }} ttps</span>
          </div>
        </li>
      </ul>
      <p v-else-if="!taLoading" class="text-[13px] text-ink-dim">no actors found.</p>
      <div v-if="taData" class="flex items-center gap-3 font-mono text-[11px] text-ink-faint">
        <button :disabled="taPage <= 1" :class="['transition', taPage <= 1 ? 'opacity-30' : 'hover:text-ink']" @click="taPage = Math.max(1, taPage - 1)">‹ prev</button>
        <span>page {{ taData.page }} / {{ Math.max(1, Math.ceil(taData.total / taData.perPage)) }}</span>
        <button :disabled="taPage >= Math.ceil(taData.total / taData.perPage)" :class="['transition', taPage >= Math.ceil(taData.total / taData.perPage) ? 'opacity-30' : 'hover:text-ink']" @click="taPage = taPage + 1">next ›</button>
      </div>
    </section>

    <section v-if="step === 3" class="space-y-6">
      <SectionRule label="scope assets">
        <template #right>{{ selectedAssets.size }} selected</template>
      </SectionRule>
      <Input v-model="assetSearch" type="search" placeholder="search by asset name" />
      <ul v-if="assetData?.items.length" class="space-y-0">
        <li
          v-for="a in assetData.items"
          :key="a.id"
          :class="[
            'border-l-2 pl-4 py-2.5 cursor-pointer transition',
            selectedAssets.has(a.id) ? 'border-signal bg-surface/30' : 'border-rule-strong hover:border-ink-dim',
          ]"
          @click="toggleAsset(a.id)"
        >
          <div class="flex items-baseline justify-between gap-4">
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[10px] tabular-nums" :class="selectedAssets.has(a.id) ? 'text-signal' : 'text-ink-faint'">
                {{ selectedAssets.has(a.id) ? '✓' : '○' }}
              </span>
              <span class="text-[13px] text-ink">{{ a.name }}</span>
              <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ a.kind.toLowerCase().replace('_', ' ') }}</span>
            </div>
            <span class="font-mono text-[10px] text-ink-faint">
              {{ a.ipAddresses.length ? a.ipAddresses.join(', ') : '—' }}
            </span>
          </div>
        </li>
      </ul>
      <p v-else-if="!assetLoading" class="text-[13px] text-ink-dim">no assets found in this org.</p>
      <div v-if="assetData" class="flex items-center gap-3 font-mono text-[11px] text-ink-faint">
        <button :disabled="assetPage <= 1" :class="['transition', assetPage <= 1 ? 'opacity-30' : 'hover:text-ink']" @click="assetPage = Math.max(1, assetPage - 1)">‹ prev</button>
        <span>page {{ assetData.page }} / {{ Math.max(1, Math.ceil(assetData.total / assetData.perPage)) }}</span>
        <button :disabled="assetPage >= Math.ceil(assetData.total / assetData.perPage)" :class="['transition', assetPage >= Math.ceil(assetData.total / assetData.perPage) ? 'opacity-30' : 'hover:text-ink']" @click="assetPage = assetPage + 1">next ›</button>
      </div>
    </section>

    <p v-if="createError" class="mt-6 rounded-md border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit">
      {{ createError.message }}
    </p>

    <footer class="mt-12 flex items-center justify-between gap-4 border-t border-rule pt-6">
      <Button v-if="step > 1" variant="ghost" size="sm" @click="step = (step - 1) as Step">← back</Button>
      <span v-else />
      <div class="flex items-center gap-3">
        <span class="font-mono text-[10px] text-ink-faint tabular-nums">
          {{ selectedTa.size }} actors · {{ selectedAssets.size }} assets
        </span>
        <Button v-if="step < 3" variant="primary" size="sm" :disabled="!canNext" @click="step = (step + 1) as Step">next →</Button>
        <Button v-else variant="primary" size="sm" :disabled="!canCreate" :loading="creating" @click="onCreate">
          create hunt
        </Button>
      </div>
    </footer>
  </div>
</template>
