<script setup lang="ts">
// /admin/sso — OIDC SSO config (OWNER). DB-driven: edits take effect
// immediately, no redeploy. Generic OIDC (Keycloak / Google / Azure
// AD). Provisioning is invite-only — surfaced as a warning so the
// operator knows IdP users still need a Helyx account first.
//
// Client secret is write-only: the field shows a placeholder when one
// is already stored; leaving it blank on save keeps the existing one.

import { ref, watch } from 'vue';
import { useOidcConfig, useOidcMutations } from '@/composables/useOidcConfig';
import { useToast } from '@/composables/useToast';
import Breadcrumb from '@/components/layout/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';

const { cfg, loading, error, refetch } = useOidcConfig();
const { save, setEnabled } = useOidcMutations();
const { show: showToast } = useToast();

const form = ref({
  issuer: '',
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  postLoginRedirect: '',
  scopes: '',
});
const busy = ref(false);

// Hydrate the form once config arrives / changes (secret stays blank —
// it's never returned).
watch(cfg, (c) => {
  if (!c) return;
  form.value = {
    issuer: c.issuer,
    clientId: c.clientId,
    clientSecret: '',
    redirectUri: c.redirectUri,
    postLoginRedirect: c.postLoginRedirect,
    scopes: c.scopes,
  };
}, { immediate: true });

async function onSave(): Promise<void> {
  busy.value = true;
  try {
    const r = await save({
      issuer: form.value.issuer.trim(),
      clientId: form.value.clientId.trim(),
      clientSecret: form.value.clientSecret.trim() || null,
      redirectUri: form.value.redirectUri.trim(),
      postLoginRedirect: form.value.postLoginRedirect.trim(),
      scopes: form.value.scopes.trim(),
    });
    if (r) {
      showToast('SSO config saved', 'success');
      form.value.clientSecret = '';
      refetch();
    } else {
      showToast('Save failed', 'error');
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Save failed', 'error');
  } finally {
    busy.value = false;
  }
}

async function onToggle(): Promise<void> {
  if (!cfg.value) return;
  busy.value = true;
  try {
    const r = await setEnabled(!cfg.value.enabled);
    if (r) showToast(r.enabled ? 'SSO enabled' : 'SSO disabled', 'success');
    else showToast('Toggle failed', 'error');
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Toggle failed', 'error');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="px-12 py-10 max-w-[860px] relative z-10">
    <header class="border-b border-rule-strong pb-4 mb-8">
      <Breadcrumb
        :crumbs="[
          { label: 'overview', to: '/' },
          { label: 'admin', to: '/admin/audit' },
          { label: 'sso' },
        ]"
        class="mb-3"
      />
      <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">
        organization · authentication
      </p>
      <div class="flex items-baseline justify-between gap-4">
        <h1 class="text-[26px] font-medium tracking-tight text-ink">SSO (OIDC)</h1>
        <span
          v-if="cfg"
          :class="['font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm border',
                   cfg.enabled ? 'text-sev-low border-sev-low/40' : 'text-ink-faint border-rule']"
        >{{ cfg.enabled ? 'enabled' : 'disabled' }}</span>
      </div>
      <p class="mt-3 text-[13px] text-ink-dim leading-relaxed">
        Generic OIDC — Keycloak / Google / Azure AD via standard discovery.
        Changes apply immediately (no redeploy). Login is
        <strong class="text-ink">invite-only</strong>: an IdP user can only
        sign in if a Helyx account with their verified email already exists.
      </p>
    </header>

    <p v-if="loading && !cfg" class="text-[13px] text-ink-dim">loading…</p>
    <p v-else-if="error" class="text-[13px] text-sev-crit">failed: {{ error.message }}</p>

    <template v-else-if="cfg">
      <div class="space-y-5">
        <div>
          <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
            issuer URL <span class="text-sev-crit">*</span>
          </label>
          <input
            v-model="form.issuer"
            type="url"
            placeholder="https://keycloak.bssn.go.id/realms/helyx"
            class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
          />
          <p class="mt-1 font-mono text-[10px] text-ink-faint">
            discovery hits {{ form.issuer || '<issuer>' }}/.well-known/openid-configuration
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
              client ID <span class="text-sev-crit">*</span>
            </label>
            <input
              v-model="form.clientId"
              type="text"
              class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
            />
          </div>
          <div>
            <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
              client secret
              <span v-if="cfg.hasClientSecret" class="text-ink-faint normal-case">· stored</span>
              <span v-else class="text-sev-crit">*</span>
            </label>
            <input
              v-model="form.clientSecret"
              type="password"
              autocomplete="new-password"
              :placeholder="cfg.hasClientSecret ? '•••••• (leave blank to keep)' : 'required'"
              class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
            />
          </div>
        </div>

        <div>
          <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
            redirect URI <span class="text-sev-crit">*</span>
          </label>
          <input
            v-model="form.redirectUri"
            type="url"
            class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
          />
          <p class="mt-1 font-mono text-[10px] text-ink-faint">
            register this exact value as a redirect URI in the IdP client
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
              post-login redirect
            </label>
            <input
              v-model="form.postLoginRedirect"
              type="url"
              class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
            />
          </div>
          <div>
            <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">
              scopes
            </label>
            <input
              v-model="form.scopes"
              type="text"
              placeholder="openid email profile"
              class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] font-mono focus:outline-none focus:border-signal/40 transition"
            />
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-rule pt-5">
          <Button
            :variant="cfg.enabled ? 'ghost' : 'primary'"
            size="sm"
            :loading="busy"
            @click="onToggle"
          >{{ cfg.enabled ? 'Disable SSO' : 'Enable SSO' }}</Button>
          <Button variant="primary" size="sm" :loading="busy" @click="onSave">
            Save config
          </Button>
        </div>
        <p v-if="cfg.updatedAt" class="font-mono text-[10px] text-ink-faint">
          last updated {{ cfg.updatedAt.slice(0, 19).replace('T', ' ') }}
        </p>
      </div>
    </template>
  </div>
</template>
