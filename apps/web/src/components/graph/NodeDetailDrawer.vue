<script setup lang="ts">
import { computed } from 'vue';
import type { GraphNode } from './graph-types';

const props = defineProps<{ node: GraphNode | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

interface KV { label: string; value: string; mono?: boolean; severity?: string }

const fields = computed<KV[]>(() => {
  if (!props.node) return [];
  const d = (props.node.data ?? {}) as Record<string, unknown>;
  const out: KV[] = [
    { label: 'type', value: props.node.type, mono: true },
    { label: 'id', value: props.node.entityId, mono: true },
  ];
  switch (props.node.type) {
    case 'Stakeholder':
      if (d.slug) out.push({ label: 'slug', value: String(d.slug), mono: true });
      break;
    case 'Asset':
      if (d.kind) out.push({ label: 'kind', value: String(d.kind), mono: true });
      if (d.hostname) out.push({ label: 'hostname', value: String(d.hostname), mono: true });
      break;
    case 'CVE':
      if (d.severity) out.push({ label: 'severity', value: String(d.severity), severity: String(d.severity) });
      if (d.baseScore != null) out.push({ label: 'cvss v3.1', value: String(d.baseScore), mono: true });
      if (d.description) out.push({ label: 'description', value: String(d.description) });
      break;
    case 'Case':
      if (d.title) out.push({ label: 'title', value: String(d.title) });
      if (d.status) out.push({ label: 'status', value: String(d.status), mono: true });
      break;
    case 'Sektor':
      if (d.slug) out.push({ label: 'slug', value: String(d.slug), mono: true });
      break;
    case 'CWE':
      if (d.name) out.push({ label: 'name', value: String(d.name) });
      break;
  }
  return out;
});

function severityClass(s: string | undefined): string {
  switch ((s ?? '').toUpperCase()) {
    case 'CRITICAL': return 'text-sev-crit';
    case 'HIGH':     return 'text-sev-high';
    case 'MEDIUM':   return 'text-sev-med';
    case 'LOW':      return 'text-sev-low';
    default:         return 'text-ink';
  }
}

function detailHref(): string | null {
  if (!props.node) return null;
  switch (props.node.type) {
    case 'Stakeholder': return `/stakeholders/${props.node.entityId}`;
    case 'Case': return `/cases/${props.node.entityId}`;
    default: return null;
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-200"
    enter-from-class="translate-x-full"
    leave-active-class="transition-transform duration-200"
    leave-to-class="translate-x-full"
  >
    <aside
      v-if="node"
      class="fixed top-0 right-0 h-screen w-[360px] bg-base border-l border-rule-strong z-30 overflow-y-auto"
    >
      <div class="p-6">
        <header class="flex items-baseline justify-between mb-4 pb-3 border-b border-rule-strong">
          <div class="min-w-0">
            <p class="font-mono text-[9px] uppercase tracking-wider text-ink-faint">selected</p>
            <h3 class="text-[16px] text-ink truncate mt-0.5">{{ node.label }}</h3>
          </div>
          <button
            type="button"
            class="font-mono text-[10px] text-ink-faint hover:text-ink transition shrink-0 ml-3"
            @click="emit('close')"
          >ESC</button>
        </header>

        <dl class="space-y-3 text-[12px]">
          <div v-for="f in fields" :key="f.label">
            <dt class="font-mono text-[9px] uppercase tracking-wider text-ink-faint">{{ f.label }}</dt>
            <dd
              :class="[
                'mt-0.5 break-words',
                f.mono ? 'font-mono' : '',
                f.severity ? severityClass(f.severity) : 'text-ink-dim',
              ]"
            >{{ f.value }}</dd>
          </div>
        </dl>

        <RouterLink
          v-if="detailHref()"
          :to="detailHref()!"
          class="mt-6 inline-block font-mono text-[11px] text-signal hover:underline"
        >Open detail page →</RouterLink>
      </div>
    </aside>
  </Transition>
</template>
