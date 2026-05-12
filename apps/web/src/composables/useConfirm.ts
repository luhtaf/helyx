// Promise-based confirm modal — replaces window.confirm() per project
// standard (vue-frontend-standards skill) + because window.confirm
// breaks the design system (gray native chrome dialog jarring against
// the warm-dark forensic-ledger theme).
//
// Usage:
//   const { confirm } = useConfirm();
//   const ok = await confirm({
//     title: 'Delete hunt',
//     message: 'This cannot be undone.',
//     variant: 'danger',
//     confirmLabel: 'Delete',
//   });
//   if (!ok) return;
//
// Singleton state, mounted once in App.vue via ConfirmModal.

import { ref } from 'vue';

export type ConfirmVariant = 'default' | 'danger';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Affects confirm button color. 'danger' = sev-crit. */
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PendingState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const pending = ref<PendingState | null>(null);

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      // If a previous prompt is still up (rare race), resolve it false
      // so the new prompt can take over cleanly.
      if (pending.value) pending.value.resolve(false);
      pending.value = { ...opts, resolve };
    });
  }

  function accept(): void {
    if (!pending.value) return;
    pending.value.resolve(true);
    pending.value = null;
  }

  function reject(): void {
    if (!pending.value) return;
    pending.value.resolve(false);
    pending.value = null;
  }

  return { confirm, pending, accept, reject };
}
