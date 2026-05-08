import { ref, readonly, type Ref, type DeepReadonly } from 'vue';

export type ToastVariant = 'info' | 'success' | 'error';

const message = ref<string | null>(null);
const variant = ref<ToastVariant>('info');
let timer: ReturnType<typeof setTimeout> | null = null;

interface UseToast {
  message: DeepReadonly<Ref<string | null>>;
  variant: DeepReadonly<Ref<ToastVariant>>;
  show: (msg: string, v?: ToastVariant, durationMs?: number) => void;
  clear: () => void;
}

export function useToast(): UseToast {
  function show(msg: string, v: ToastVariant = 'info', durationMs = 2500): void {
    message.value = msg;
    variant.value = v;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { message.value = null; }, durationMs);
  }
  function clear(): void {
    if (timer) clearTimeout(timer);
    message.value = null;
  }
  return { message: readonly(message), variant: readonly(variant), show, clear };
}
