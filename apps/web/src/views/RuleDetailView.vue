<script setup lang="ts">
import { ref, toRef, watch, watchEffect } from 'vue';
import { useRule, useSetRuleReleaseTier, useApproveRule, useUnapproveRule, isApprovalStale, RELEASE_TIERS, RELEASE_TIER_LABELS, type ReleaseTier } from '@/composables/useRules';
import { KIND_CLASSES, type RuleKind } from '@/composables/rule-kinds';
import { useToast } from '@/composables/useToast';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ id: string }>();
const idRef = toRef(props, 'id');
const { rule, loading, error } = useRule(() => idRef.value);
const { submit: setTier, loading: settingTier } = useSetRuleReleaseTier();
const { show: showToast } = useToast();

const kindClass = (k: RuleKind): string => KIND_CLASSES[k];

// Tier color: lower tier (more open) = warmer / wider; internal = restrained.
const TIER_CLASS: Record<ReleaseTier, string> = {
  public:       'bg-sev-low/15 text-sev-low border-sev-low/30',
  cross_agency: 'bg-signal/15 text-signal border-signal/30',
  sectoral:     'bg-sev-med/15 text-sev-med border-sev-med/30',
  internal:     'bg-ink-faint/10 text-ink-dim border-ink-faint/30',
};

// Local pending state — track edit-in-flight separately from server value.
const pendingTier = ref<ReleaseTier | null>(null);

watch(rule, (r) => { if (r) pendingTier.value = null; });

async function onChangeTier(next: ReleaseTier): Promise<void> {
  if (!rule.value || next === rule.value.releaseTier) return;
  pendingTier.value = next;
  try {
    const r = await setTier(rule.value.id, next);
    if (r) showToast(`Release tier → ${RELEASE_TIER_LABELS[next]}`, 'success');
  } catch (e) {
    pendingTier.value = null;
    showToast(`Tier change failed: ${(e as Error).message}`, 'error');
  }
}

// F2 — approval state. Stale check runs client-side via SubtleCrypto
// SHA-256 — instant feedback when content was edited post-approval.
const { submit: approve, loading: approving } = useApproveRule();
const { submit: unapprove, loading: unapproving } = useUnapproveRule();
const approvalStale = ref(false);

watchEffect(async () => {
  if (rule.value) approvalStale.value = await isApprovalStale(rule.value);
});

async function onApprove(): Promise<void> {
  if (!rule.value) return;
  try {
    await approve(rule.value.id);
    showToast(approvalStale.value ? 'Re-approved (content hash refreshed)' : 'Rule approved for release', 'success');
  } catch (e) {
    showToast(`Approve failed: ${(e as Error).message}`, 'error');
  }
}

async function onUnapprove(): Promise<void> {
  if (!rule.value) return;
  if (!confirm('Revoke approval? Push paths will reject this rule until re-approved.')) return;
  try {
    await unapprove(rule.value.id);
    showToast('Approval revoked', 'success');
  } catch (e) {
    showToast(`Unapprove failed: ${(e as Error).message}`, 'error');
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'rules', to: '/rules' },
          { label: rule?.name ?? 'Loading…', mono: !rule },
        ]"
        class="mb-3"
      />
      <div v-if="rule" class="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p :class="['font-mono text-[11px] uppercase tracking-wider', kindClass(rule.kind)]">{{ rule.kind }}</p>
          <h1 class="text-[22px] font-medium text-ink mt-1">{{ rule.name }}</h1>
          <p v-if="rule.description" class="mt-2 text-[13px] text-ink-dim max-w-[68ch]">{{ rule.description }}</p>
        </div>
        <div class="flex items-baseline gap-4 font-mono text-[11px] text-ink-faint">
          <span>{{ rule.status.toLowerCase() }}</span>
          <span>{{ rule.source.replace(/_/g, ' ') }}</span>
          <span
            :class="['inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] uppercase tracking-wider', TIER_CLASS[(pendingTier ?? rule.releaseTier)]]"
            :title="`release tier — F1 need-to-know enforcement (push enforcement: rule.tier ≤ target.maxTier)`"
          >
            <span v-if="pendingTier" class="opacity-50">{{ RELEASE_TIER_LABELS[pendingTier] }} (saving)</span>
            <span v-else>{{ RELEASE_TIER_LABELS[rule.releaseTier] }}</span>
          </span>
        </div>
      </div>
    </header>

    <p v-if="loading && !rule" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>
    <p v-else-if="!rule" class="text-[13px] text-ink-dim">rule not found.</p>

    <template v-else>
      <!-- Counters -->
      <section class="mb-8 grid grid-cols-3 gap-4">
        <div class="border border-rule-strong rounded-md px-4 py-3">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">derived from artifacts</p>
          <p class="font-mono text-[20px] text-ink mt-1 tabular-nums">{{ rule.derivedFromArtifactCount }}</p>
        </div>
        <div class="border border-rule-strong rounded-md px-4 py-3">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">detects techniques</p>
          <p class="font-mono text-[20px] text-ink mt-1 tabular-nums">{{ rule.detectsTechniqueCount }}</p>
        </div>
        <div class="border border-rule-strong rounded-md px-4 py-3">
          <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">generated by hunts</p>
          <p class="font-mono text-[20px] text-ink mt-1 tabular-nums">{{ rule.generatedByHuntCount }}</p>
        </div>
      </section>

      <!-- Tags -->
      <section v-if="rule.tags.length" class="mb-6">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">tags</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="t in rule.tags"
            :key="t"
            class="inline-flex px-2 py-0.5 rounded-sm border border-rule-strong text-ink-dim font-mono text-[11px]"
          >{{ t }}</span>
        </div>
      </section>

      <!-- Rule body -->
      <section class="mb-8">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">content</p>
        <pre class="bg-surface border border-rule rounded-md p-4 font-mono text-[12px] text-ink overflow-x-auto whitespace-pre-wrap">{{ rule.content }}</pre>
      </section>

      <!-- Provenance -->
      <section v-if="rule.sourceRef" class="mb-8">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">source ref</p>
        <p class="font-mono text-[12px] text-ink-dim">{{ rule.sourceRef }}</p>
      </section>

      <!-- F2 — approval state (sha256 content hash freshness check) -->
      <section class="mb-8">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">approval</p>
        <p class="text-[12px] text-ink-dim mb-3 max-w-[68ch]">
          Captures sha256 of rule.content at approval time. Editing the
          rule body after approval makes the approval <em>stale</em> —
          re-approval required before push.
        </p>
        <div class="flex items-center gap-3">
          <span
            v-if="rule.approvedAt && !approvalStale"
            class="inline-flex items-center px-2 py-0.5 rounded-sm border bg-sev-low/15 text-sev-low border-sev-low/30 font-mono text-[10px] uppercase tracking-wider"
            :title="`Approved ${rule.approvedAt.slice(0, 19).replace('T', ' ')} by ${rule.approvedByUserId?.slice(0, 8) ?? '—'}`"
          >approved</span>
          <span
            v-else-if="rule.approvedAt && approvalStale"
            class="inline-flex items-center px-2 py-0.5 rounded-sm border bg-sev-med/15 text-sev-med border-sev-med/30 font-mono text-[10px] uppercase tracking-wider"
            title="Content was edited after approval — re-approve required"
          >stale (content edited)</span>
          <span
            v-else
            class="inline-flex items-center px-2 py-0.5 rounded-sm border bg-ink-faint/10 text-ink-dim border-ink-faint/30 font-mono text-[10px] uppercase tracking-wider"
          >unapproved</span>

          <Button
            v-if="!rule.approvedAt || approvalStale"
            variant="primary" size="sm"
            :loading="approving"
            @click="onApprove"
          >{{ approvalStale ? 'Re-approve' : 'Approve for release' }}</Button>
          <Button
            v-if="rule.approvedAt"
            variant="ghost" size="sm"
            :loading="unapproving"
            @click="onUnapprove"
          >Revoke</Button>
        </div>
      </section>

      <!-- F1 — release tier picker (4-tier need-to-know enforcement) -->
      <section class="mb-8">
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-2">release tier</p>
        <p class="text-[12px] text-ink-dim mb-3 max-w-[68ch]">
          Controls who can receive this rule. Push pre-conditions enforce
          <code class="font-mono text-ink">rule.tier ≤ target.maxTier</code>.
          Lower tier = wider sharing.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in RELEASE_TIERS"
            :key="t"
            type="button"
            :disabled="settingTier"
            :class="[
              'px-3 py-1.5 rounded-sm border text-[11px] uppercase tracking-wider transition font-mono',
              t === (pendingTier ?? rule.releaseTier)
                ? TIER_CLASS[t]
                : 'border-rule text-ink-faint hover:border-rule-strong hover:text-ink-dim',
              settingTier ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ]"
            @click="onChangeTier(t)"
          >{{ RELEASE_TIER_LABELS[t] }}</button>
        </div>
      </section>

      <footer class="border-t border-rule pt-4 font-mono text-[10px] text-ink-faint">
        created {{ rule.createdAt.slice(0, 10) }} · updated {{ rule.updatedAt.slice(0, 10) }}
      </footer>
    </template>
  </div>
</template>
