<script setup lang="ts">
// /admin/cti-egress — F3b PDN-only egress allowlist (OWNER write,
// ANALYST read).
//
// Operator workflow:
//   1. Add hostname (paste full URL, scheme/path stripped at server)
//   2. Disable when partner agency rotates / decommissions endpoint
//   3. Re-enable later (status flips, audit chain preserved)
//   4. Pre-flight check: paste a URL → see "allowed" or "denied + why"
//
// Pre-H7/H9 the guard is dormant; the catalog is curated now so the
// push paths plug in cleanly when they land.

import { ref } from 'vue';
import {
  usePdnEgressEntries, usePdnEgressMutations,
  type PdnEgressEntry, type EgressCheck,
} from '@/composables/usePdnEgress';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { useAuthStore } from '@/stores/auth';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const { active, disabled, loading, error } = usePdnEgressEntries();
const { add, disable, enable, check, submitting } = usePdnEgressMutations();
const { show: showToast } = useToast();
const { confirm } = useConfirm();
const auth = useAuthStore();

const isOwner = () => auth.activeOrgRole === 'OWNER';

// Add form
const hostnameInput = ref('');
const labelInput = ref('');

async function onAdd(): Promise<void> {
  const hostname = hostnameInput.value.trim();
  const label = labelInput.value.trim();
  if (!hostname || !label) {
    showToast('Hostname and label both required', 'error');
    return;
  }
  const r = await add(hostname, label);
  if (r) {
    showToast(`Added ${r.hostname} (${r.label})`, 'success');
    hostnameInput.value = '';
    labelInput.value = '';
  } else {
    showToast('Add failed — check hostname format', 'error');
  }
}

async function onDisable(e: PdnEgressEntry): Promise<void> {
  const ok = await confirm({
    title: `Disable egress to ${e.hostname}?`,
    message: 'Push paths will reject this hostname until re-enabled. Existing audit trail preserved.',
    variant: 'danger',
    confirmLabel: 'Disable',
  });
  if (!ok) return;
  const r = await disable(e.id);
  if (r) showToast(`Disabled ${e.hostname}`, 'success');
  else showToast('Disable failed', 'error');
}

async function onEnable(e: PdnEgressEntry): Promise<void> {
  const r = await enable(e.id);
  if (r) showToast(`Re-enabled ${e.hostname}`, 'success');
  else showToast('Enable failed', 'error');
}

// Pre-flight URL check
const checkUrl = ref('');
const checkResult = ref<EgressCheck | null>(null);
const checking = ref(false);

async function onCheck(): Promise<void> {
  const url = checkUrl.value.trim();
  if (!url) return;
  checking.value = true;
  try {
    checkResult.value = await check(url);
  } finally {
    checking.value = false;
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'pdn egress allowlist' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        compliance · F3b PDN-only egress
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">PDN egress allowlist</h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Hostnames Helyx is allowed to push CTI bundles to. Every push path
        (MISP, TAXII, EclecticIQ — pending) checks this list before fetch.
        Anything not on the active list is denied with a 'PDN_EGRESS_DENIED'
        error.
      </p>
    </header>

    <p v-if="loading && active.length === 0 && disabled.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed: {{ error.message }}</p>

    <template v-else>
      <!-- Pre-flight check -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">pre-flight check</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <div class="flex items-start gap-3 mb-3">
          <input
            v-model="checkUrl"
            type="text"
            placeholder="https://misp.bssn.go.id/events/add"
            class="flex-1 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
            @keyup.enter="onCheck"
          />
          <Button variant="ghost" size="sm" :loading="checking" :disabled="!checkUrl.trim()" @click="onCheck">
            Check
          </Button>
        </div>
        <div v-if="checkResult" class="border border-rule rounded-md p-3 bg-surface/20">
          <div class="flex items-baseline gap-3">
            <span
              class="font-mono text-[11px] uppercase tracking-wider"
              :class="checkResult.allowed ? 'text-sev-low' : 'text-sev-crit'"
            >{{ checkResult.allowed ? '✓ allowed' : '✗ denied' }}</span>
            <span class="font-mono text-[12px] text-ink tabular-nums">{{ checkResult.hostname || '—' }}</span>
          </div>
          <p v-if="!checkResult.allowed && checkResult.reason" class="mt-1 font-mono text-[10px] text-ink-faint">
            reason: {{ checkResult.reason }}
          </p>
        </div>
      </section>

      <!-- Add (OWNER only) -->
      <section v-if="isOwner()" class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">add</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <div class="flex items-start gap-2">
          <input
            v-model="hostnameInput"
            type="text"
            placeholder="hostname or URL — misp.bssn.go.id"
            class="flex-1 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
          />
          <input
            v-model="labelInput"
            type="text"
            placeholder="label — 'BSSN MISP'"
            class="w-[220px] px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
          />
          <Button
            variant="primary"
            :loading="submitting"
            :disabled="!hostnameInput.trim() || !labelInput.trim()"
            @click="onAdd"
          >Add</Button>
        </div>
        <p class="mt-2 font-mono text-[10px] text-ink-faint">
          Re-adding an existing disabled hostname re-enables it (audit chain preserved).
        </p>
      </section>

      <!-- Active -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-sev-low">active · {{ active.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <ul v-if="active.length" class="space-y-2">
          <li
            v-for="e in active"
            :key="e.id"
            class="border border-sev-low/30 rounded-md p-4 bg-sev-low/5"
          >
            <div class="flex items-baseline justify-between gap-4 mb-1">
              <div class="flex items-baseline gap-3">
                <span class="font-mono text-[12px] text-ink tabular-nums">{{ e.hostname }}</span>
                <span class="text-[12px] text-ink-mid">{{ e.label }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[10px] text-ink-faint">
                  added {{ fmtDate(e.createdAt) }} · {{ e.addedByEmail ?? e.addedByUserId.slice(0, 8) }}
                </span>
                <Button
                  v-if="isOwner()"
                  variant="ghost"
                  size="sm"
                  :loading="submitting"
                  @click="onDisable(e)"
                >Disable</Button>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-faint italic">no active entries — push paths will deny everything until you add one.</p>
      </section>

      <!-- Disabled -->
      <section v-if="disabled.length">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">disabled · {{ disabled.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <ul class="space-y-2">
          <li
            v-for="e in disabled"
            :key="e.id"
            class="border border-rule rounded-md p-4 bg-surface/20"
          >
            <div class="flex items-baseline justify-between gap-4">
              <div class="flex items-baseline gap-3">
                <span class="font-mono text-[12px] text-ink-dim line-through tabular-nums">{{ e.hostname }}</span>
                <span class="text-[12px] text-ink-faint">{{ e.label }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[10px] text-ink-faint">
                  disabled {{ fmtDate(e.disabledAt) }}
                </span>
                <Button
                  v-if="isOwner()"
                  variant="ghost"
                  size="sm"
                  :loading="submitting"
                  @click="onEnable(e)"
                >Re-enable</Button>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
