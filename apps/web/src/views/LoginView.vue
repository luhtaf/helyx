<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useLogin } from '@/composables/useAuth';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const email = ref('');
const password = ref('');
const router = useRouter();
const { submit, loading, error } = useLogin();

async function onSubmit(): Promise<void> {
  const ok = await submit(email.value, password.value);
  if (ok) router.replace((router.currentRoute.value.query.next as string) || '/');
}
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
      </form>

      <p class="mt-6 text-center text-xs text-ink-faint">
        Local instance · no account flow yet — use existing credentials
      </p>
    </div>
  </main>
</template>
