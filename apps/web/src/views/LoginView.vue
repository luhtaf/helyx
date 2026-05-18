<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLogin } from '@/composables/useAuth';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const email = ref('');
const password = ref('');
const route = useRoute();
const router = useRouter();
const { submit, loading, error } = useLogin();

async function onSubmit(): Promise<void> {
  const ok = await submit(email.value, password.value);
  if (ok) router.replace((router.currentRoute.value.query.next as string) || '/');
}

// SSO — only shown when the backend reports OIDC configured. Status is
// a public unauthenticated endpoint so this is safe pre-login.
const ssoEnabled = ref(false);
onMounted(async () => {
  try {
    const r = await fetch('/auth/oidc/status', { credentials: 'include' });
    if (r.ok) ssoEnabled.value = Boolean((await r.json())?.enabled);
  } catch {
    // SSO just stays hidden — password login is unaffected.
  }
});

function startSso(): void {
  // Full-page navigation (not XHR) — the OIDC dance is 302 redirects.
  window.location.href = '/auth/oidc/start';
}

// Map ?sso_error=<code> (set by the callback on failure) to a human
// message. Codes mirror auth/oidc/routes.ts redirectWithError().
const SSO_ERRORS: Record<string, string> = {
  not_provisioned: 'Akun SSO ini belum terdaftar. Hubungi admin organisasi untuk diundang lebih dulu.',
  email_unverified: 'Email dari penyedia SSO belum terverifikasi.',
  bad_state: 'Sesi SSO kedaluwarsa. Coba lagi.',
  nonce_mismatch: 'Validasi SSO gagal. Coba lagi.',
  invalid_id_token: 'Token SSO tidak valid.',
  token_exchange_failed: 'Gagal menukar kode SSO. Coba lagi.',
  idp_error: 'Penyedia SSO menolak permintaan.',
  discovery_failed: 'Konfigurasi SSO bermasalah. Hubungi admin.',
  missing_params: 'Callback SSO tidak lengkap.',
  callback_failed: 'Proses SSO gagal. Coba lagi.',
};
const ssoError = computed(() => {
  const code = route.query.sso_error as string | undefined;
  return code ? (SSO_ERRORS[code] ?? 'Login SSO gagal.') : '';
});
</script>

<template>
  <main class="flex min-h-screen items-center justify-center px-6 relative z-10">
    <div class="w-full max-w-sm">
      <header class="mb-10 text-center">
        <p class="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-faint">
          helyx · threat graph
        </p>
        <h1 class="text-2xl font-medium tracking-tight">Sign in</h1>
      </header>

      <div
        v-if="route.query.reason === 'session_expired'"
        class="mb-4 rounded-md border border-sev-med/40 bg-sev-med/10 px-3 py-2 text-xs text-sev-med"
      >
        Sesi habis. Silakan login kembali.
      </div>

      <div
        v-if="ssoError"
        class="mb-4 rounded-md border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit"
      >
        {{ ssoError }}
      </div>

      <form
        class="rounded-xl border border-rule bg-surface p-7 shadow-2xl"
        @submit.prevent="onSubmit"
      >
        <div class="space-y-4">
          <Input
            v-model="email"
            type="email"
            label="Email"
            autocomplete="email"
            required
            placeholder="you@org.com"
          />
          <Input
            v-model="password"
            type="password"
            label="Password"
            autocomplete="current-password"
            required
          />
        </div>

        <p
          v-if="error"
          class="mt-4 rounded-md border border-sev-crit/40 bg-sev-crit/10 px-3 py-2 text-xs text-sev-crit"
        >
          {{ error }}
        </p>

        <Button
          class="mt-6"
          type="submit"
          variant="primary"
          block
          :loading="loading"
        >
          {{ loading ? 'Signing in…' : 'Continue' }}
        </Button>

        <template v-if="ssoEnabled">
          <div class="my-5 flex items-center gap-3">
            <div class="h-px flex-1 bg-rule" />
            <span class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">or</span>
            <div class="h-px flex-1 bg-rule" />
          </div>
          <Button
            type="button"
            variant="ghost"
            block
            @click="startSso"
          >
            Sign in with SSO
          </Button>
        </template>
      </form>

      <p class="mt-6 text-center text-xs text-ink-faint">
        Local instance · no account flow yet — use existing credentials
      </p>
    </div>
  </main>
</template>
