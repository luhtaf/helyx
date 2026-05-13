<script setup lang="ts">
// /admin/cti-redaction — F3a builtin redaction profiles (read-only v1).
// Operators pick a profile per-hunt from the GraphView header; this page
// is the catalog showing what each profile does.
//
// Min role ANALYST. Custom profile creation lands in F3a follow-up.

import { useRedactionProfiles, type RedactionProfile } from '@/composables/useRedactionProfiles';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';

const { profiles, loading, error } = useRedactionProfiles();

interface PolicyRow {
  key: keyof Pick<RedactionProfile, 'includeRuleNames' | 'includeRuleDescriptions' | 'includeRuleTags' | 'includeOrgIdentity'>;
  label: string;
  detail: string;
}

const POLICY_ROWS: PolicyRow[] = [
  { key: 'includeRuleNames',        label: 'Rule names',        detail: 'Indicator.name — operator-authored rule title' },
  { key: 'includeRuleDescriptions', label: 'Rule descriptions', detail: 'Indicator.description — operator notes' },
  { key: 'includeRuleTags',         label: 'Rule tags',         detail: 'Indicator.labels — adversary names + codenames' },
  { key: 'includeOrgIdentity',      label: 'Org identity',      detail: 'Identity object + every created_by_ref (origin attribution)' },
];

function tone(included: boolean): string {
  return included ? 'text-sev-low' : 'text-sev-crit';
}
function symbol(included: boolean): string {
  return included ? '✓' : '✗';
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'cti redaction' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        compliance · F3a field-mask catalog
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">CTI redaction profiles</h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Profile applied at STIX export to mask operator-authored fields before
        signing + sharing. Pick a profile per Hunt from its graph header; the
        unredacted bundle never leaves the org.
      </p>
    </header>

    <p v-if="loading && profiles.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>

    <ul v-else class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <li
        v-for="p in profiles"
        :key="p.id"
        class="border border-rule-strong rounded-md p-5 bg-surface/30 flex flex-col"
      >
        <div class="flex items-baseline justify-between gap-3 mb-3">
          <h2 class="text-[16px] text-ink font-medium tracking-tight">{{ p.name }}</h2>
          <span class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">{{ p.slug }}</span>
        </div>
        <p class="text-[12px] text-ink-dim leading-relaxed mb-4">{{ p.description }}</p>

        <div class="flex-1 space-y-1.5 mb-4">
          <div
            v-for="row in POLICY_ROWS"
            :key="row.key"
            class="flex items-baseline gap-2.5 text-[12px]"
          >
            <span class="font-mono text-[12px] tabular-nums w-3 shrink-0" :class="tone(p[row.key])">{{ symbol(p[row.key]) }}</span>
            <span class="text-ink-mid">{{ row.label }}</span>
          </div>
        </div>

        <p class="font-mono text-[10px] text-ink-faint mt-auto">
          {{ p.builtin ? 'builtin' : 'custom' }} · created {{ p.createdAt.slice(0, 10) }}
        </p>
      </li>
    </ul>
  </div>
</template>
