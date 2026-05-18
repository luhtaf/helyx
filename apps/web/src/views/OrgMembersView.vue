<script setup lang="ts">
// /admin/members — org membership admin. Invite an existing user by
// email, change a member's role, or revoke access. Server is the
// authority (ADMIN+); UI mirrors the gate + the last-owner / no-self
// refusals surface as toasts.
//
// The active org's slug is resolved from the auth store's activeOrgId
// against the `me` org list (the members query keys on slug, not id).

import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useMe } from '@/composables/useAuth';
import {
  useOrgMembers, useOrgMemberMutations, type OrgRole,
} from '@/composables/useOrgMembers';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const auth = useAuthStore();
const { show: showToast } = useToast();
const { confirm } = useConfirm();

const { organizations } = useMe(() => true);
const activeSlug = computed<string | null>(() => {
  const id = auth.activeOrgId;
  if (!id) return null;
  return organizations.value.find((o) => o.id === id)?.slug ?? null;
});

const { org, members, loading, error, refetch } = useOrgMembers(() => activeSlug.value);
const { add, remove } = useOrgMemberMutations();

const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'];
const ROLE_TONE: Record<OrgRole, string> = {
  OWNER: 'text-sev-crit border-sev-crit/40',
  ADMIN: 'text-signal border-signal/40',
  ANALYST: 'text-sev-low border-sev-low/40',
  VIEWER: 'text-ink-dim border-rule',
};

const canManage = computed(() => org.value?.myRole === 'OWNER' || org.value?.myRole === 'ADMIN');

// Invite form
const inviteEmail = ref('');
const inviteRole = ref<OrgRole>('VIEWER');
const busy = ref(false);

function fmtDate(s: string): string {
  return s.slice(0, 10);
}

async function onInvite(): Promise<void> {
  const email = inviteEmail.value.trim().toLowerCase();
  if (!email || !org.value) return;
  busy.value = true;
  try {
    const m = await add(org.value.id, email, inviteRole.value);
    if (m) {
      showToast(`${m.user.displayName} → ${m.role}`, 'success');
      inviteEmail.value = '';
    } else {
      showToast('invite failed', 'error');
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'invite failed', 'error');
  } finally {
    busy.value = false;
  }
}

async function onChangeRole(userEmail: string, next: OrgRole): Promise<void> {
  if (!org.value) return;
  busy.value = true;
  try {
    await add(org.value.id, userEmail, next);
    showToast(`role → ${next}`, 'success');
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'role change failed', 'error');
    refetch(); // revert optimistic <select> to server truth
  } finally {
    busy.value = false;
  }
}

async function onRemove(userId: string, name: string): Promise<void> {
  if (!org.value) return;
  const ok = await confirm({
    title: `Revoke ${name}?`,
    message: 'They lose all access to this organization. Audit chain preserved.',
    variant: 'danger',
    confirmLabel: 'Revoke access',
  });
  if (!ok) return;
  busy.value = true;
  try {
    const done = await remove(org.value.id, userId);
    if (done) showToast(`${name} removed`, 'success');
    else showToast('remove failed', 'error');
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'remove failed', 'error');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[1080px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-10">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'members' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        organization · access
      </p>
      <h1 class="text-[26px] font-medium tracking-tight text-ink">
        Members<span v-if="org" class="text-ink-faint"> · {{ org.name }}</span>
      </h1>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed max-w-[720px]">
        Invite an already-registered user by email, change a member's role, or
        revoke access. The last OWNER cannot be removed — promote another
        member first.
      </p>
    </header>

    <p v-if="!activeSlug" class="text-[13px] text-ink-dim">
      No active organization selected.
    </p>
    <p v-else-if="loading && members.length === 0" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed: {{ error.message }}</p>

    <template v-else>
      <!-- Invite -->
      <section v-if="canManage" class="mb-10">
        <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-3">invite member</h2>
        <div class="flex items-center gap-3">
          <input
            v-model="inviteEmail"
            type="email"
            placeholder="user@email — must already have an account"
            class="flex-1 max-w-md px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
            @keydown.enter="onInvite"
          />
          <select
            v-model="inviteRole"
            class="px-2 py-2 bg-surface border border-rule-strong rounded text-[12px] font-mono"
          >
            <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
          </select>
          <Button variant="primary" size="sm" :loading="busy" :disabled="!inviteEmail.trim()" @click="onInvite">
            Invite
          </Button>
        </div>
      </section>

      <!-- Members -->
      <section>
        <h2 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-3">
          members · {{ members.length }}
        </h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-rule-strong">
              <th class="py-2">name</th>
              <th class="py-2">email</th>
              <th class="py-2 w-[140px]">role</th>
              <th class="py-2 w-[110px]">joined</th>
              <th class="py-2 w-[90px]" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in members" :key="m.user.id" class="border-b border-rule">
              <td class="py-3 text-ink">
                {{ m.user.displayName }}
                <span v-if="m.user.id === auth.user?.id" class="font-mono text-[10px] text-ink-faint">(you)</span>
              </td>
              <td class="py-3 text-ink-dim font-mono text-[12px]">{{ m.user.email }}</td>
              <td class="py-3">
                <select
                  v-if="canManage && m.user.id !== auth.user?.id"
                  :value="m.role"
                  :disabled="busy"
                  class="px-1.5 py-1 bg-surface border rounded text-[11px] font-mono uppercase tracking-wider"
                  :class="ROLE_TONE[m.role]"
                  @change="onChangeRole(m.user.email, ($event.target as HTMLSelectElement).value as OrgRole)"
                >
                  <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                </select>
                <span
                  v-else
                  :class="['inline-flex px-1.5 py-0.5 rounded-sm border font-mono text-[10px] uppercase tracking-wider', ROLE_TONE[m.role]]"
                >{{ m.role }}</span>
              </td>
              <td class="py-3 text-ink-faint font-mono text-[11px] tabular-nums">{{ fmtDate(m.joinedAt) }}</td>
              <td class="py-3 text-right">
                <button
                  v-if="canManage && m.user.id !== auth.user?.id"
                  type="button"
                  class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-sev-crit transition disabled:opacity-50"
                  :disabled="busy"
                  @click="onRemove(m.user.id, m.user.displayName)"
                >revoke</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!canManage" class="mt-4 font-mono text-[11px] text-ink-faint">
          You have {{ org?.myRole }} access — member management needs ADMIN or OWNER.
        </p>
      </section>
    </template>
  </div>
</template>
