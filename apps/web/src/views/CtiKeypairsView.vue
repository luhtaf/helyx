<script setup lang="ts">
// /admin/cti-keys — F2 Ed25519 signing keypair admin (OWNER role).
//
// Three sections:
//   1. Active key (the one signing new exports right now)
//   2. Previous keys (demoted by past rotations; still verify historical bundles)
//   3. Revoked keys (operator declared compromised)
//
// Operator actions:
//   - "Rotate now" → mints new active, demotes current (modal asks reason)
//   - "Revoke" per non-active row → modal asks reason

import { ref } from 'vue';
import {
  useCtiKeypairs, useRotateKeypair, useRevokeKeypair,
  useCtiKeypairRotations, downloadPublicKey,
  type CtiOrgKeypair,
} from '@/composables/useCtiKeypairs';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const { active, previous, revoked, loading, error, refetch } = useCtiKeypairs();
const { rotations, refetch: refetchRotations } = useCtiKeypairRotations();
const { submit: rotate, loading: rotating } = useRotateKeypair();
const { submit: revoke, loading: revoking } = useRevokeKeypair();
const { show: showToast } = useToast();
const { confirm } = useConfirm();

// Reason input lives on the page (not in the confirm modal) — Ed25519
// rotations are deliberate operator decisions, not one-tap confirms. The
// reason ends up in both :KeypairRotation ledger + :AuditEvent.
const rotateReason = ref('');
const revokeReasons = ref<Record<string, string>>({});

async function onRotate(): Promise<void> {
  const reason = rotateReason.value.trim();
  if (!reason) {
    showToast('Reason required for rotation', 'error');
    return;
  }
  const ok = await confirm({
    title: 'Rotate signing keypair?',
    message:
      'New exports will be signed with the new key. Existing exports stay verifiable via their original key. This action is logged.',
    variant: 'danger',
    confirmLabel: 'Rotate',
  });
  if (!ok) return;
  const next = await rotate(reason);
  if (next) {
    showToast(`New active keypair · ${next.fingerprint}`, 'success');
    rotateReason.value = '';
    await Promise.all([refetch(), refetchRotations()]);
  } else {
    showToast('Rotation failed', 'error');
  }
}

function onDownloadPem(k: CtiOrgKeypair): void {
  downloadPublicKey(k.publicKeyPem, k.fingerprint);
  showToast(`Saved helyx-cti-public-${k.fingerprint}.pem`, 'success');
}

async function onRevoke(k: CtiOrgKeypair): Promise<void> {
  const reason = (revokeReasons.value[k.id] ?? '').trim();
  if (!reason) {
    showToast('Reason required for revocation', 'error');
    return;
  }
  const ok = await confirm({
    title: `Revoke key ${k.fingerprint}?`,
    message:
      'Downstream verifiers should mistrust signatures from this key. Bundles signed by it will be flagged. Cannot be undone.',
    variant: 'danger',
    confirmLabel: 'Revoke',
  });
  if (!ok) return;
  const r = await revoke(k.id, reason);
  if (r) {
    showToast(`Revoked ${k.fingerprint}`, 'success');
    delete revokeReasons.value[k.id];
    await refetch();
  } else {
    showToast('Revoke failed', 'error');
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
          { label: 'cti signing keys' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        compliance · F2 ed25519 signing
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">CTI signing keys</h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Each org signs every exported STIX bundle with its Ed25519 private key.
        Rotation mints a new active key and demotes the current one — historical
        bundles remain verifiable via the key they were signed with.
      </p>
    </header>

    <p v-if="loading && !active" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed to load: {{ error.message }}</p>

    <template v-else>
      <!-- Active key -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">active key</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <div v-if="active" class="border border-rule-strong rounded-md p-5 bg-surface/30">
          <div class="flex items-baseline justify-between gap-4 mb-3">
            <div class="flex items-baseline gap-3">
              <span class="font-mono text-[13px] text-signal tabular-nums">{{ active.fingerprint }}</span>
              <span class="font-mono text-[10px] uppercase tracking-wider text-sev-low">{{ active.algorithm }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-mono text-[10px] text-ink-faint">created {{ fmtDate(active.createdAt) }}</span>
              <Button variant="ghost" size="sm" @click="onDownloadPem(active)">⤓ public key</Button>
            </div>
          </div>
          <details class="text-[11px]">
            <summary class="cursor-pointer text-ink-dim hover:text-ink transition select-none">show public key (PEM)</summary>
            <pre class="mt-2 font-mono text-[10px] text-ink-mid bg-base/60 p-3 rounded border border-rule whitespace-pre-wrap break-all">{{ active.publicKeyPem }}</pre>
          </details>
        </div>
        <p v-else class="text-[12px] text-ink-faint italic">
          no active key — first rotation will mint one.
        </p>
      </section>

      <!-- Rotate -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">rotate</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <div class="flex items-start gap-3">
          <input
            v-model="rotateReason"
            type="text"
            placeholder="reason — e.g. 'quarterly rotation per IT-SEC-014'"
            class="flex-1 px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
          />
          <Button variant="primary" :loading="rotating" :disabled="!rotateReason.trim()" @click="onRotate">
            Rotate now
          </Button>
        </div>
        <p class="mt-2 font-mono text-[10px] text-ink-faint">
          OWNER role only. Reason is logged in :KeypairRotation + :AuditEvent.
        </p>
      </section>

      <!-- Previous -->
      <section class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">previous · {{ previous.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <ul v-if="previous.length" class="space-y-2">
          <li
            v-for="k in previous"
            :key="k.id"
            class="border border-rule rounded-md p-4 bg-surface/20"
          >
            <div class="flex items-baseline justify-between gap-4 mb-2">
              <div class="flex items-baseline gap-3">
                <span class="font-mono text-[12px] text-ink tabular-nums">{{ k.fingerprint }}</span>
                <span class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">{{ k.algorithm }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[10px] text-ink-faint">
                  created {{ fmtDate(k.createdAt) }} · rotated {{ fmtDate(k.rotatedAt) }}
                </span>
                <button
                  type="button"
                  class="font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-ink transition"
                  @click="onDownloadPem(k)"
                >⤓ pem</button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="revokeReasons[k.id]"
                type="text"
                placeholder="reason for revoke (compromise, policy)"
                class="flex-1 px-2.5 py-1.5 bg-base/60 border border-rule rounded text-[11px] focus:outline-none focus:border-signal/40 transition"
              />
              <Button
                variant="danger"
                size="sm"
                :loading="revoking"
                :disabled="!(revokeReasons[k.id]?.trim())"
                @click="onRevoke(k)"
              >
                Revoke
              </Button>
            </div>
          </li>
        </ul>
        <p v-else class="text-[12px] text-ink-faint italic">no previous keys.</p>
      </section>

      <!-- Revoked -->
      <section v-if="revoked.length" class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-sev-crit">revoked · {{ revoked.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <ul class="space-y-2">
          <li
            v-for="k in revoked"
            :key="k.id"
            class="border border-sev-crit/30 rounded-md p-4 bg-sev-crit/5"
          >
            <div class="flex items-baseline justify-between gap-4 mb-2">
              <div class="flex items-baseline gap-3">
                <span class="font-mono text-[12px] text-ink-dim line-through tabular-nums">{{ k.fingerprint }}</span>
                <span class="font-mono text-[10px] uppercase tracking-wider text-sev-crit">revoked</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono text-[10px] text-ink-faint">
                  revoked {{ fmtDate(k.revokedAt) }}
                </span>
                <button
                  type="button"
                  class="font-mono text-[10px] uppercase tracking-wider text-ink-dim hover:text-ink transition"
                  @click="onDownloadPem(k)"
                  title="Download public key — kept so verifiers can check old bundles (signatures stay valid, status flag warns them)."
                >⤓ pem</button>
              </div>
            </div>
            <p v-if="k.revokedReason" class="text-[12px] text-ink-mid italic leading-snug">
              {{ k.revokedReason }}
            </p>
          </li>
        </ul>
      </section>

      <!-- Rotation history — append-only ledger from :KeypairRotation -->
      <section v-if="rotations.length" class="mb-12">
        <div class="flex items-baseline gap-4 mb-4">
          <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">rotation history · {{ rotations.length }}</h2>
          <div class="flex-1 border-b border-rule-strong" />
        </div>

        <ol class="space-y-3">
          <li
            v-for="r in rotations"
            :key="r.id"
            class="border border-rule rounded-md p-4 bg-surface/20"
          >
            <div class="flex items-baseline justify-between gap-4 mb-2">
              <div class="flex items-baseline gap-2 font-mono text-[11px] tabular-nums">
                <span v-if="r.oldFingerprint" class="text-ink-dim">{{ r.oldFingerprint }}</span>
                <span v-else class="text-ink-faint italic">∅ initial</span>
                <span class="text-ink-faint">→</span>
                <span class="text-signal">{{ r.newFingerprint }}</span>
              </div>
              <span class="font-mono text-[10px] text-ink-faint">
                {{ fmtDate(r.ts) }} · {{ r.actorEmail ?? r.actorUserId.slice(0, 8) }}
              </span>
            </div>
            <p class="text-[12px] text-ink-mid italic leading-snug">{{ r.reason }}</p>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
