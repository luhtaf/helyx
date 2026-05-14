<script setup lang="ts">
// /admin/cti-push — H7/H9 push target admin + recent attempts log.
//
// Three sections:
//   1. Add target (OWNER) — kind/label/url/maxTier/apiKey/dryRun
//   2. Active + disabled targets list
//   3. Recent attempts (audit ledger, newest first)
//
// Push trigger lives on the hunt graph header (separate "Push…"
// dropdown), not here — keeps the per-hunt action close to the hunt.

import { ref } from 'vue';
import {
  useCtiPushTargets, useCtiPushAttempts, useCtiPushMutations,
  PUSH_TARGET_KINDS, PUSH_TARGET_KIND_LABELS,
  PUSH_OUTCOME_LABELS, type PushOutcome,
  type CtiPushTarget, type PushTargetKind,
} from '@/composables/useCtiPushTargets';
import { RELEASE_TIERS, RELEASE_TIER_LABELS, type ReleaseTier } from '@/composables/useRules';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { useAuthStore } from '@/stores/auth';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const { active, disabled, loading, error } = useCtiPushTargets();
const { attempts, loading: loadingAttempts } = useCtiPushAttempts(50);
const { add, disable, enable, submitting } = useCtiPushMutations();
const { show: showToast } = useToast();
const { confirm } = useConfirm();
const auth = useAuthStore();

const isOwner = () => auth.activeOrgRole === 'OWNER';

// Add form
const formKind = ref<PushTargetKind>('MISP');
const formLabel = ref('');
const formUrl = ref('');
const formMaxTier = ref<ReleaseTier>('cross_agency');
const formApiKey = ref('');
const formDryRun = ref(true);

async function onAdd(): Promise<void> {
  const label = formLabel.value.trim();
  const url = formUrl.value.trim();
  if (!label || !url) {
    showToast('Label + URL required', 'error');
    return;
  }
  const r = await add({
    kind: formKind.value,
    label,
    url,
    maxTier: formMaxTier.value,
    apiKey: formApiKey.value.trim(),
    dryRun: formDryRun.value,
  });
  if (r) {
    showToast(`Added ${PUSH_TARGET_KIND_LABELS[r.kind]} target · ${r.label}`, 'success');
    formLabel.value = '';
    formUrl.value = '';
    formApiKey.value = '';
    formDryRun.value = true;
  } else {
    showToast('Add failed — check inputs', 'error');
  }
}

async function onDisable(t: CtiPushTarget): Promise<void> {
  const ok = await confirm({
    title: `Disable ${t.label}?`,
    message: 'Push attempts to this target will be denied until re-enabled.',
    variant: 'danger',
    confirmLabel: 'Disable',
  });
  if (!ok) return;
  const r = await disable(t.id);
  if (r) showToast(`Disabled ${t.label}`, 'success');
  else showToast('Disable failed', 'error');
}

async function onEnable(t: CtiPushTarget): Promise<void> {
  const r = await enable(t.id);
  if (r) showToast(`Re-enabled ${t.label}`, 'success');
  else showToast('Enable failed', 'error');
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

function outcomeClass(o: PushOutcome): string {
  if (o === 'success') return 'text-sev-low';
  if (o === 'dry_run') return 'text-signal';
  if (o.startsWith('denied_')) return 'text-sev-med';
  return 'text-sev-crit';
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'cti push targets' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        compliance · H7/H9 push paths
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">CTI push targets</h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Configured MISP / OpenCTI / TAXII / EclecticIQ destinations.
        Every push runs the F1 (release tier) → F3a (redaction) → F2
        (signing) → F3b (egress allowlist) gauntlet. dryRun targets
        validate every gate then stop short of HTTP.
      </p>
    </header>

    <p v-if="loading && active.length === 0 && disabled.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed: {{ error.message }}</p>

    <template v-else>
      <!-- Add (OWNER only) -->
      <section v-if="isOwner()" class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">add target</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <div class="grid grid-cols-12 gap-2">
          <select
            v-model="formKind"
            class="col-span-2 px-2 py-2 bg-surface border border-rule-strong rounded text-[12px] font-mono uppercase tracking-wider text-ink-dim focus:outline-none focus:border-signal/40"
          >
            <option v-for="k in PUSH_TARGET_KINDS" :key="k" :value="k">{{ k }}</option>
          </select>
          <input
            v-model="formLabel"
            placeholder="label — 'BSSN MISP'"
            class="col-span-3 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
          />
          <input
            v-model="formUrl"
            placeholder="url — https://misp.bssn.go.id"
            class="col-span-4 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
          />
          <select
            v-model="formMaxTier"
            class="col-span-2 px-2 py-2 bg-surface border border-rule-strong rounded text-[11px] font-mono uppercase tracking-wider text-ink-dim focus:outline-none focus:border-signal/40"
          >
            <option v-for="t in RELEASE_TIERS" :key="t" :value="t">{{ RELEASE_TIER_LABELS[t] }}</option>
          </select>
          <Button
            class="col-span-1"
            variant="primary"
            :loading="submitting"
            :disabled="!formLabel.trim() || !formUrl.trim()"
            @click="onAdd"
          >Add</Button>
        </div>
        <div class="grid grid-cols-12 gap-2 mt-2">
          <input
            v-model="formApiKey"
            type="password"
            placeholder="api key (optional)"
            class="col-span-9 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
          />
          <label class="col-span-3 flex items-center gap-2 px-3 py-2 font-mono text-[11px] text-ink-dim">
            <input v-model="formDryRun" type="checkbox" class="accent-signal" />
            dry-run (recommended v1)
          </label>
        </div>
        <p class="mt-2 font-mono text-[10px] text-ink-faint">
          dryRun=true validates every gate but stops before real HTTP. v1 ships dry-run only.
        </p>
      </section>

      <!-- Active targets -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-sev-low">active · {{ active.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>
        <ul v-if="active.length" class="space-y-2">
          <li v-for="t in active" :key="t.id" class="border border-sev-low/30 rounded-md p-4 bg-sev-low/5">
            <div class="flex items-baseline justify-between gap-4 mb-1">
              <div class="flex items-baseline gap-3">
                <span class="font-mono text-[10px] uppercase tracking-wider text-sev-low">{{ t.kind }}</span>
                <span class="text-[13px] text-ink">{{ t.label }}</span>
                <span class="font-mono text-[10px] text-ink-faint">{{ t.url }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">max-tier {{ t.maxTier }}</span>
                <span v-if="t.dryRun" class="font-mono text-[10px] uppercase tracking-wider text-signal">dry-run</span>
                <Button v-if="isOwner()" variant="ghost" size="sm" :loading="submitting" @click="onDisable(t)">Disable</Button>
              </div>
            </div>
            <p class="font-mono text-[10px] text-ink-faint">
              api key: {{ t.apiKeyMasked || '—' }} · added {{ fmtDate(t.createdAt) }}
            </p>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-faint italic">no active targets — pushes will fail until you add one.</p>
      </section>

      <!-- Disabled -->
      <section v-if="disabled.length" class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">disabled · {{ disabled.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>
        <ul class="space-y-2">
          <li v-for="t in disabled" :key="t.id" class="border border-rule rounded-md p-4 bg-surface/20">
            <div class="flex items-baseline justify-between gap-4">
              <div class="flex items-baseline gap-3">
                <span class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">{{ t.kind }}</span>
                <span class="text-[12px] text-ink-dim line-through">{{ t.label }}</span>
              </div>
              <Button v-if="isOwner()" variant="ghost" size="sm" :loading="submitting" @click="onEnable(t)">Re-enable</Button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Recent attempts -->
      <section>
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">recent attempts · {{ attempts.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>
        <p v-if="loadingAttempts && attempts.length === 0" class="text-[12px] text-ink-faint">loading…</p>
        <ul v-else-if="attempts.length" class="space-y-2">
          <li v-for="a in attempts" :key="a.id" class="border border-rule rounded-md p-3 bg-surface/20">
            <div class="flex items-baseline justify-between gap-4 mb-1">
              <div class="flex items-baseline gap-3 text-[12px]">
                <span class="font-mono text-[10px] uppercase tracking-wider" :class="outcomeClass(a.outcome)">
                  {{ PUSH_OUTCOME_LABELS[a.outcome] }}
                </span>
                <span class="text-ink-dim">{{ a.targetLabel ?? '—' }}</span>
                <span class="text-ink-faint">→</span>
                <span class="text-ink-dim">{{ a.huntName ?? a.huntId.slice(0, 8) }}</span>
              </div>
              <span class="font-mono text-[10px] text-ink-faint">{{ fmtDate(a.ts) }}</span>
            </div>
            <p v-if="a.errorDetail" class="text-[11px] text-ink-mid italic leading-snug">
              {{ a.errorDetail }}
            </p>
            <p v-else-if="a.indicatorCount != null" class="font-mono text-[10px] text-ink-faint">
              {{ a.indicatorCount }} indicator{{ a.indicatorCount === 1 ? '' : 's' }}
              <template v-if="a.bundleContentHash"> · bundle {{ a.bundleContentHash.slice(0, 12) }}</template>
            </p>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-faint italic">no attempts yet.</p>
      </section>
    </template>
  </div>
</template>
