<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { useStakeholder } from '@/composables/useStakeholder';
import { useUpdateStakeholder, useSetStakeholderSensor, type StakeholderUpdateInput, type SensorInput } from '@/composables/useStakeholders';
import SensorInputModal from '@/components/stakeholder/SensorInputModal.vue';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { severityClass } from '@/utils/severity';
import SensorStatusPill from '@/components/stakeholder/SensorStatusPill.vue';
import SektorBadge from '@/components/stakeholder/SektorBadge.vue';
import CaseStatusBadge from '@/components/case/CaseStatusBadge.vue';
import CreateStakeholderSlide from '@/components/reconciliation/CreateStakeholderSlide.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';
import NotesPanel from '@/components/notes/NotesPanel.vue';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const router = useRouter();
const auth = useAuthStore();
const { show: showToast } = useToast();
const { stakeholder, loading, error, refetch } = useStakeholder(() => idRef.value);

const canEdit = computed(() => auth.hasMinRole('ANALYST'));
const editOpen = ref(false);
const { submit: updateStakeholder, loading: updating } = useUpdateStakeholder();
const { submit: setSensor, loading: settingSensor } = useSetStakeholderSensor();
const sensorOpen = ref(false);
async function onSetSensor(input: SensorInput): Promise<void> {
  if (!stakeholder.value) return;
  const r = await setSensor(stakeholder.value.id, input);
  if (r) {
    showToast('Sensor coverage updated', 'success');
    sensorOpen.value = false;
  } else {
    showToast('Update failed', 'error');
  }
}

async function onUpdate(stakeholderId: string, input: StakeholderUpdateInput): Promise<void> {
  try {
    const updated = await updateStakeholder(stakeholderId, input);
    if (updated) {
      showToast(`saved → ${updated.name}`, 'success');
      editOpen.value = false;
      refetch();
    } else {
      showToast('save failed', 'error');
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'save failed', 'error');
  }
}

</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'stakeholders', to: '/stakeholders' },
          { label: stakeholder?.name ?? 'Loading…', mono: !stakeholder },
        ]"
        class="mb-3"
      />
      <div v-if="stakeholder" class="flex flex-wrap items-baseline justify-between gap-4">
        <div class="flex items-baseline gap-4">
          <span class="font-mono text-[12px] text-ink-dim">{{ stakeholder.slug }}</span>
          <h1 class="text-[24px] font-medium text-ink tracking-tight">{{ stakeholder.name }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <SektorBadge :sektor="stakeholder.sektor" :clickable="true" />
          <SensorStatusPill :status="stakeholder.sensor.status" />
          <Button v-if="canEdit" variant="ghost" @click="editOpen = true">Edit</Button>
          <RouterLink
            :to="{ name: 'graph', query: { seed: `stakeholder:${stakeholder.id}` } }"
            class="font-mono text-[11px] text-signal hover:underline ml-2"
          >Open in graph →</RouterLink>
        </div>
      </div>
    </header>

    <p v-if="loading && !stakeholder" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>
    <p v-else-if="!stakeholder" class="text-[13px] text-ink-dim">stakeholder not found.</p>

    <template v-else>
      <!-- Aliases -->
      <section v-if="stakeholder.aliases.length" class="mb-8">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">aliases</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="a in stakeholder.aliases"
            :key="a"
            class="inline-flex px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim font-mono text-[11px]"
          >{{ a }}</span>
        </div>
      </section>

      <!-- City + coords -->
      <section class="mb-8 grid grid-cols-2 gap-x-12 gap-y-4">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">city</p>
          <p class="text-ink mt-1">{{ stakeholder.city ?? '—' }}</p>
        </div>
        <div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">coords (lon, lat)</p>
          <p class="font-mono text-ink mt-1 tabular-nums">
            {{ stakeholder.coords ? `${stakeholder.coords[0]}, ${stakeholder.coords[1]}` : '—' }}
          </p>
        </div>
      </section>

      <!-- Sensor deployment summary -->
      <section class="mb-8 border-t border-rule pt-6">
        <div class="flex items-baseline justify-between mb-3">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">sensor deployment</p>
          <button
            v-if="canEdit"
            type="button"
            class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink transition"
            @click="sensorOpen = true"
          >configure ↗</button>
        </div>
        <div class="grid grid-cols-4 gap-x-8 gap-y-3">
          <div>
            <p class="font-mono text-[10px] text-ink-faint">stack</p>
            <p class="font-mono text-ink text-[13px] mt-1">{{ stakeholder.sensor.stack ?? '—' }}</p>
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">status</p>
            <SensorStatusPill :status="stakeholder.sensor.status" />
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">agents</p>
            <p class="font-mono text-ink text-[13px] mt-1 tabular-nums">{{ stakeholder.sensor.agentCount ?? '—' }}</p>
          </div>
          <div>
            <p class="font-mono text-[10px] text-ink-faint">deployed</p>
            <p class="font-mono text-ink-dim text-[12px] mt-1">{{ stakeholder.sensor.deployedAt?.slice(0, 10) ?? '—' }}</p>
          </div>
        </div>
        <p v-if="stakeholder.sensor.notes" class="mt-3 text-[13px] text-ink-dim leading-6 whitespace-pre-line">
          {{ stakeholder.sensor.notes }}
        </p>
      </section>

      <!-- Vulnerabilities -->
      <section class="mb-8 border-t border-rule pt-6">
        <div class="flex items-baseline justify-between mb-3">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            vulnerabilities <span class="text-ink-dim">·</span>
            <span class="text-ink tabular-nums">{{ stakeholder.cves.total }}</span>
          </p>
          <p class="font-mono text-[10px] text-ink-faint">via Asset→ATTRIBUTED_CVE + chain</p>
        </div>
        <p v-if="stakeholder.cves.items.length === 0" class="text-[12px] text-ink-faint italic">
          No CVEs attributed yet. Run <code class="font-mono">pnpm sf:sync</code> to ingest from Spiderfoot.
        </p>
        <ul v-else class="divide-y divide-rule text-[13px]">
          <li v-for="cve in stakeholder.cves.items" :key="cve.cveId" class="py-2 flex items-baseline gap-4">
            <span class="font-mono text-ink shrink-0 w-[140px]">{{ cve.cveId }}</span>
            <span :class="['font-mono text-[10px] uppercase tracking-wider shrink-0 w-[70px]', severityClass(cve.severity)]">
              {{ cve.severity ?? '—' }}
            </span>
            <span class="font-mono text-[12px] text-ink-dim tabular-nums shrink-0 w-[40px] text-right">
              {{ cve.baseScore?.toFixed(1) ?? '—' }}
            </span>
            <span class="text-ink-dim text-[12px] truncate">{{ cve.description ?? '' }}</span>
          </li>
        </ul>
      </section>

      <!-- Linked assets -->
      <section class="mb-8 border-t border-rule pt-6">
        <div class="flex items-baseline justify-between mb-3">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            linked assets <span class="text-ink-dim">·</span>
            <span class="text-ink tabular-nums">{{ stakeholder.assetCount }}</span>
          </p>
        </div>
        <p v-if="stakeholder.assets.length === 0" class="text-[12px] text-ink-faint italic">
          No assets owned. Spiderfoot ingest creates Asset nodes per scan target.
        </p>
        <ul v-else class="divide-y divide-rule text-[13px]">
          <li v-for="a in stakeholder.assets" :key="a.id" class="py-2 flex items-baseline gap-4">
            <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint shrink-0 w-[80px]">{{ a.kind }}</span>
            <span class="text-ink shrink-0 w-[280px] truncate">{{ a.name }}</span>
            <span class="font-mono text-[11px] text-ink-dim truncate">{{ a.hostname ?? '—' }}</span>
          </li>
        </ul>
      </section>

      <!-- Cases -->
      <section class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">
          cases <span class="text-ink-dim">·</span>
          <span class="text-ink tabular-nums">{{ stakeholder.cases.length }}</span>
        </p>
        <p v-if="stakeholder.cases.length === 0" class="text-[12px] text-ink-faint italic">
          No cases targeting this stakeholder.
        </p>
        <ul v-else class="divide-y divide-rule text-[13px]">
          <li
            v-for="c in stakeholder.cases"
            :key="c.id"
            class="py-2 flex items-baseline gap-4 cursor-pointer hover:bg-surface/40 transition px-1 -mx-1 rounded-sm"
            @click="router.push({ name: 'case-detail', params: { id: c.id } })"
          >
            <span class="font-mono text-ink shrink-0 w-[180px]">{{ c.reportNo }}</span>
            <CaseStatusBadge :status="c.status" />
            <span class="text-ink-dim text-[12px] truncate">{{ c.title ?? '' }}</span>
            <span class="ml-auto font-mono text-[11px] text-ink-faint shrink-0">{{ c.deployedAt.slice(0, 10) }}</span>
          </li>
        </ul>
      </section>

      <!-- Notes -->
      <section v-if="stakeholder.notes" class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">notes</p>
        <p class="text-[13px] text-ink-dim leading-6 whitespace-pre-line max-w-[68ch]">{{ stakeholder.notes }}</p>
      </section>

      <div class="mb-8">
        <NotesPanel entity-type="Stakeholder" :entity-id="stakeholder.id" />
      </div>

      <!-- Footer metadata -->
      <footer class="border-t border-rule pt-4 font-mono text-[10px] text-ink-faint">
        created {{ stakeholder.createdAt.slice(0, 10) }} · updated {{ stakeholder.updatedAt.slice(0, 10) }}
      </footer>
    </template>

    <SensorInputModal
      :open="sensorOpen"
      :loading="settingSensor"
      :existing="stakeholder?.sensor ?? null"
      @submit="onSetSensor"
      @cancel="sensorOpen = false"
    />

    <CreateStakeholderSlide
      :raw="null"
      :existing="stakeholder"
      :loading="updating"
      :open="editOpen"
      @update="onUpdate"
      @cancel="editOpen = false"
    />
  </div>
</template>
