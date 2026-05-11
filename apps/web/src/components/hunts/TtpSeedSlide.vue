<script setup lang="ts">
// H3 — TTP-seed picker. User enters T-code (and optional Actor scope)
// → backend returns count facets ('1,847 matches → refine?') → user
// confirms → navigate to /graph?ttp=T1486&actor=... where GraphView
// pulls the snapshot and renders.
//
// Design note (per Codex Design feedback): formalize CreateStakeholderSlide
// as the slideover pattern instead of extracting a new <Slideover>. This
// component mirrors that file's structure (Teleport + Transition + escape
// + footer actions) so the design system stays consistent.

import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTtpMaterialize, type TtpFacets } from '@/composables/useHunts';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const router = useRouter();
const { submit: materialize, loading } = useTtpMaterialize();

const techniqueId = ref('');
const actorId = ref('');
const facets = ref<TtpFacets | null>(null);
const error = ref<string | null>(null);

// Reset state when the slide closes.
watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    techniqueId.value = '';
    actorId.value = '';
    facets.value = null;
    error.value = null;
  }
});

function tCodeOk(s: string): boolean {
  return /^T\d{4}(\.\d{3})?$/.test(s.trim());
}

async function onPreview(): Promise<void> {
  error.value = null;
  facets.value = null;
  const tid = techniqueId.value.trim().toUpperCase();
  if (!tCodeOk(tid)) {
    error.value = 'T-code format: T1486 or T1059.001';
    return;
  }
  try {
    const r = await materialize({
      techniqueId: tid,
      actorId: actorId.value.trim() || null,
      proceedToGraph: false,
    });
    if (!r) {
      error.value = 'Preview failed';
      return;
    }
    facets.value = r.facets;
    if (!r.facets.techniqueName) {
      error.value = `T-code "${tid}" not found in MITRE catalog`;
      facets.value = null;
    }
  } catch (e) {
    error.value = (e as Error).message ?? 'unknown error';
  }
}

function onMaterialize(): void {
  if (!facets.value) return;
  // Hand off to GraphView via URL params; GraphView's existing route
  // entry point handles the materialize→render→footer-bar flow.
  const params: Record<string, string> = { ttp: facets.value.techniqueId };
  if (actorId.value.trim()) params.actor = actorId.value.trim();
  router.push({ path: '/graph', query: params });
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-transform duration-200"
      enter-from-class="translate-x-full"
      leave-active-class="transition-transform duration-200"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed top-0 right-0 h-screen w-[440px] bg-base border-l border-rule-strong z-40 flex flex-col"
      >
        <header class="px-6 py-5 border-b border-rule-strong">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">hunt by ttp</p>
          <h2 class="text-[16px] text-ink mt-1">TTP-seed materialize</h2>
          <p class="text-[12px] text-ink-dim mt-2 leading-snug">
            Pick a MITRE technique. Helyx will preview how many actors / stakeholders / assets / rules / artifacts in your tenant intersect this TTP, then materialize a graph for hunting.
          </p>
        </header>

        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <Input
            v-model="techniqueId"
            label="MITRE T-code"
            placeholder="T1486"
            :required="true"
          />
          <Input
            v-model="actorId"
            label="Actor scope (optional)"
            placeholder="IntrusionSet.id — refines TTP-from-Actor JOIN"
          />

          <div v-if="error" class="border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-[12px] text-sev-crit rounded-md">
            {{ error }}
          </div>

          <div v-if="facets" class="border border-rule-strong rounded-md p-4 space-y-3">
            <div class="flex items-baseline justify-between gap-3 pb-2 border-b border-rule">
              <p class="font-mono text-[11px] text-signal">{{ facets.techniqueId }}</p>
              <p class="text-[12px] text-ink truncate">{{ facets.techniqueName }}</p>
            </div>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              <div class="flex justify-between"><dt class="text-ink-dim">actors</dt><dd class="font-mono text-ink tabular-nums">{{ facets.actorCount }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-dim">rules</dt><dd class="font-mono text-ink tabular-nums">{{ facets.ruleCount }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-dim">stakeholders</dt><dd class="font-mono text-ink tabular-nums">{{ facets.stakeholderCount }}</dd></div>
              <div class="flex justify-between"><dt class="text-ink-dim">assets</dt><dd class="font-mono text-ink tabular-nums">{{ facets.assetCount }}</dd></div>
              <div class="flex justify-between col-span-2"><dt class="text-ink-dim">artifacts (tenant cases)</dt><dd class="font-mono text-ink tabular-nums">{{ facets.artifactCount }}</dd></div>
            </dl>
            <p class="font-mono text-[11px] text-ink-faint border-t border-rule pt-2">
              {{ facets.totalNodes }} total nodes — refine with Actor scope or proceed to graph
            </p>
          </div>
        </div>

        <footer class="px-6 py-4 border-t border-rule-strong flex items-center gap-3">
          <Button v-if="!facets" variant="primary" :loading="loading" :disabled="!techniqueId.trim()" @click="onPreview">
            Preview facets
          </Button>
          <Button v-if="facets" variant="primary" :loading="loading" @click="onMaterialize">
            Materialize ({{ facets.totalNodes }} nodes)
          </Button>
          <Button v-if="facets" variant="ghost" @click="facets = null">Refine</Button>
          <Button variant="ghost" @click="emit('close')">Cancel</Button>
        </footer>
      </aside>
    </Transition>
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 bg-base/40 z-30" @click="emit('close')" />
    </Transition>
  </Teleport>
</template>
