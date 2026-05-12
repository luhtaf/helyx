<script setup lang="ts">
// Mode 2 of HuntCreateView: TTP-seed materialize. Inline panel form
// (the slide-over wrapper TtpSeedSlide is no longer used since /hunts/new
// owns the entire create surface).

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTtpMaterialize, type TtpFacets } from '@/composables/useHunts';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';
import SectionRule from '@/components/ui/SectionRule.vue';

const router = useRouter();
const { submit: materialize, loading } = useTtpMaterialize();

const techniqueId = ref('');
const actorId = ref('');
const facets = ref<TtpFacets | null>(null);
const error = ref<string | null>(null);

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
  const params: Record<string, string> = { ttp: facets.value.techniqueId };
  if (actorId.value.trim()) params.actor = actorId.value.trim();
  router.push({ path: '/graph', query: params });
}
</script>

<template>
  <div class="max-w-xl space-y-6">
    <SectionRule label="MITRE technique" />
    <p class="text-[12px] text-ink-faint max-w-[68ch]">
      Pick a MITRE T-code. We preview how many actors / stakeholders / assets / rules / artifacts in your tenant intersect this TTP, then materialize a graph for hunting.
    </p>

    <Input v-model="techniqueId" label="MITRE T-code" placeholder="T1486" :required="true" />
    <Input v-model="actorId" label="Actor scope (optional)" placeholder="IntrusionSet.id — refines TTP-from-Actor JOIN" />

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

    <footer class="border-t border-rule pt-6 flex items-center gap-3">
      <Button v-if="!facets" variant="primary" :loading="loading" :disabled="!techniqueId.trim()" @click="onPreview">
        Preview facets
      </Button>
      <Button v-if="facets" variant="primary" :loading="loading" @click="onMaterialize">
        Materialize ({{ facets.totalNodes }} nodes)
      </Button>
      <Button v-if="facets" variant="ghost" @click="facets = null">Refine</Button>
    </footer>
  </div>
</template>
