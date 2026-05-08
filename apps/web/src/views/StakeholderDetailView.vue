<script setup lang="ts">
import { toRef } from 'vue';
import { useStakeholder } from '@/composables/useStakeholder';
import SensorStatusPill from '@/components/stakeholder/SensorStatusPill.vue';
import SektorBadge from '@/components/stakeholder/SektorBadge.vue';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const { stakeholder, loading, error } = useStakeholder(() => idRef.value);
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
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-3">sensor deployment</p>
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

      <!-- Linked assets (skeleton) -->
      <section class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">linked assets</p>
        <p class="text-[12px] text-ink-faint italic">Backend resolver pending — see TODOS Phase 2.5</p>
      </section>

      <!-- Cases (skeleton) -->
      <section class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">cases</p>
        <p class="text-[12px] text-ink-faint italic">Backend resolver pending — see TODOS Phase 2.5</p>
      </section>

      <!-- Reconciliation history (skeleton) -->
      <section class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">reconciliation history</p>
        <p class="text-[12px] text-ink-faint italic">Backend resolver pending — see TODOS Phase 2.5</p>
      </section>

      <!-- Notes -->
      <section v-if="stakeholder.notes" class="mb-8 border-t border-rule pt-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">notes</p>
        <p class="text-[13px] text-ink-dim leading-6 whitespace-pre-line max-w-[68ch]">{{ stakeholder.notes }}</p>
      </section>

      <!-- Footer metadata -->
      <footer class="border-t border-rule pt-4 font-mono text-[10px] text-ink-faint">
        created {{ stakeholder.createdAt.slice(0, 10) }} · updated {{ stakeholder.updatedAt.slice(0, 10) }}
      </footer>
    </template>
  </div>
</template>
