<script setup lang="ts">
// /admin/scanners — registered scanner agents.
//
// Operator workflow: OWNER registers a scanner per scope (e.g.
// 'acme-prod-k8s'), captures the plaintext token shown ONCE, deploys
// to the network, agent POSTs results to /api/v1/scanner/ingest.
// Rotation is scoped: rotating a scanner invalidates the prior token.

import { ref } from 'vue';
import { useScanners, useScannerMutations, type Scanner } from '@/composables/useScanners';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { useAuthStore } from '@/stores/auth';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const { active, disabled, expired, loading, error } = useScanners();
const { create, rotate, disable, enable, submitting } = useScannerMutations();
const { show: showToast } = useToast();
const { confirm } = useConfirm();
const auth = useAuthStore();

const isOwner = () => auth.activeOrgRole === 'OWNER';

// Add form
const formLabel = ref('');
const formScope = ref('');
const formExpiresAt = ref('');

// Plaintext token shown ONCE post-create or rotate. Operator must
// copy before dismissing the modal.
const newToken = ref<string | null>(null);
const newTokenLabel = ref<string>('');

async function onCreate(): Promise<void> {
  const label = formLabel.value.trim();
  const scope = formScope.value.trim();
  if (!label || !scope) {
    showToast('label + scope required', 'error');
    return;
  }
  const r = await create({
    label, scope,
    expiresAt: formExpiresAt.value ? `${formExpiresAt.value}T00:00:00.000Z` : null,
  });
  if (r) {
    newToken.value = r.plaintextToken;
    newTokenLabel.value = r.scanner.label;
    formLabel.value = '';
    formScope.value = '';
    formExpiresAt.value = '';
    showToast(`Created ${r.scanner.label}`, 'success');
  } else {
    showToast('Create failed', 'error');
  }
}

async function onRotate(s: Scanner): Promise<void> {
  const ok = await confirm({
    title: `Rotate token for ${s.label}?`,
    message: 'The current token will stop working immediately. Operator must update the deployed agent with the new token.',
    variant: 'danger',
    confirmLabel: 'Rotate',
  });
  if (!ok) return;
  const r = await rotate(s.id);
  if (r) {
    newToken.value = r.plaintextToken;
    newTokenLabel.value = r.scanner.label;
    showToast(`Rotated token for ${s.label}`, 'success');
  } else {
    showToast('Rotate failed', 'error');
  }
}

async function onDisable(s: Scanner): Promise<void> {
  const ok = await confirm({
    title: `Disable ${s.label}?`,
    message: 'Future POST /api/v1/scanner/ingest with this token returns 403.',
    variant: 'danger',
    confirmLabel: 'Disable',
  });
  if (!ok) return;
  const r = await disable(s.id);
  if (r) showToast(`Disabled ${s.label}`, 'success');
  else showToast('Disable failed', 'error');
}

async function onEnable(s: Scanner): Promise<void> {
  const r = await enable(s.id);
  if (r) showToast(`Re-enabled ${s.label}`, 'success');
  else showToast('Enable failed', 'error');
}

function copyToken(): void {
  if (!newToken.value) return;
  navigator.clipboard.writeText(newToken.value).then(() => {
    showToast('Token copied to clipboard', 'success');
  }).catch(() => {
    showToast('Copy failed — select + copy manually', 'error');
  });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return s.slice(0, 19).replace('T', ' ');
}

function statusTone(s: Scanner['status']): string {
  if (s === 'active') return 'text-sev-low';
  if (s === 'disabled') return 'text-ink-dim';
  return 'text-sev-crit'; // expired
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'scanners' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        inventory · ingest agents
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">Scanners</h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Registered scanner agents POST scan results to <code class="font-mono text-[12px] text-signal">/api/v1/scanner/ingest</code>
        with a Bearer token. Discovered assets land in the
        <RouterLink to="/admin/inventory-inbox" class="text-signal hover:underline">inventory inbox</RouterLink>
        for review.
      </p>
    </header>

    <p v-if="loading && active.length === 0 && disabled.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed: {{ error.message }}</p>

    <template v-else>
      <!-- Token-once modal -->
      <Teleport to="body">
        <div v-if="newToken" class="fixed inset-0 z-[60] bg-base/70 backdrop-blur-sm flex items-center justify-center px-4" @click="newToken = null">
          <div class="w-[560px] bg-base border border-signal/40 rounded-md shadow-2xl p-6" @click.stop>
            <header class="mb-4">
              <p class="font-mono text-[10px] uppercase tracking-wider text-signal mb-1">⚠ shown once · capture now</p>
              <h3 class="text-[16px] text-ink">Scanner token for {{ newTokenLabel }}</h3>
            </header>
            <pre class="font-mono text-[11px] text-ink-mid bg-base/60 p-3 rounded border border-rule whitespace-pre-wrap break-all mb-4">{{ newToken }}</pre>
            <p class="text-[12px] text-ink-dim leading-snug mb-4">
              Configure your scanner agent with this token in the Authorization header:
              <code class="font-mono text-[11px] text-signal">Authorization: Bearer {{ newToken.slice(0, 12) }}…</code>
            </p>
            <footer class="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" @click="copyToken">Copy</Button>
              <Button variant="primary" size="sm" @click="newToken = null">I've captured it</Button>
            </footer>
          </div>
        </div>
      </Teleport>

      <!-- Add form (OWNER) -->
      <section v-if="isOwner()" class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">register scanner</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>
        <div class="grid grid-cols-12 gap-2">
          <input v-model="formLabel" placeholder="label — 'acme-prod-k8s-scanner'" class="col-span-4 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition" />
          <input v-model="formScope" placeholder="scope — 'acme-prod-k8s'" class="col-span-4 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition" />
          <input v-model="formExpiresAt" type="date" placeholder="expires (optional)" class="col-span-3 px-3 py-2 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition" />
          <Button class="col-span-1" variant="primary" :loading="submitting" :disabled="!formLabel.trim() || !formScope.trim()" @click="onCreate">Register</Button>
        </div>
        <p class="mt-2 font-mono text-[10px] text-ink-faint">Token shown ONCE on register. Capture immediately.</p>
      </section>

      <!-- Active -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-sev-low">active · {{ active.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>
        <ul v-if="active.length" class="space-y-2">
          <li v-for="s in active" :key="s.id" class="border border-sev-low/30 rounded-md p-4 bg-sev-low/5">
            <div class="flex items-baseline justify-between gap-4 mb-1">
              <div class="flex items-baseline gap-3">
                <span class="text-[13px] text-ink">{{ s.label }}</span>
                <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{{ s.scope }}</span>
                <span class="font-mono text-[10px] text-ink-dim">{{ s.tokenPrefix }}…</span>
              </div>
              <div class="flex items-center gap-3" v-if="isOwner()">
                <Button variant="ghost" size="sm" :loading="submitting" @click="onRotate(s)">Rotate</Button>
                <Button variant="ghost" size="sm" :loading="submitting" @click="onDisable(s)">Disable</Button>
              </div>
            </div>
            <p class="font-mono text-[10px] text-ink-faint">
              {{ s.totalIngests }} ingest{{ s.totalIngests === 1 ? '' : 's' }} · last {{ fmtDate(s.lastIngestAt) }} · created {{ fmtDate(s.createdAt) }}
              <template v-if="s.expiresAt"> · expires {{ s.expiresAt.slice(0, 10) }}</template>
            </p>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-faint italic">no active scanners — register one to start ingesting.</p>
      </section>

      <!-- Disabled / expired -->
      <section v-if="disabled.length || expired.length">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">inactive · {{ disabled.length + expired.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>
        <ul class="space-y-2">
          <li v-for="s in [...disabled, ...expired]" :key="s.id" class="border border-rule rounded-md p-4 bg-surface/20">
            <div class="flex items-baseline justify-between gap-4">
              <div class="flex items-baseline gap-3">
                <span class="text-[12px] text-ink-dim line-through">{{ s.label }}</span>
                <span class="font-mono text-[10px] uppercase tracking-wider" :class="statusTone(s.status)">{{ s.status }}</span>
              </div>
              <Button v-if="isOwner() && s.status === 'disabled'" variant="ghost" size="sm" :loading="submitting" @click="onEnable(s)">Re-enable</Button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
