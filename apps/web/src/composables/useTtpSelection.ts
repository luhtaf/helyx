// Global TTP selection state. Singleton via module-level refs — every
// caller sees the same selection. Persisted to localStorage so the
// selection survives route changes, reloads, and drawer toggles.
//
// Used by:
// - TtpPickerDrawer (the picker UI itself)
// - TtpPickerLauncher (floating pill counter)
// - HuntGuessActorPanel (reads selected[] when user clicks "Guess actor")
// - GraphView (reads selected[] when user clicks "Add to graph")
// - Future: any feature that needs an operator-built TTP set
//
// Key 'helyx.ttp-selection' is intentionally not tenant-scoped — the
// selection is a UI-side scratchpad, not persisted entity data, and TTPs
// are global (MITRE catalog) not per-tenant.

import { ref, computed, watch } from 'vue';

export interface SelectedTtp {
  id: string;
  name: string;
  isSubtechnique: boolean;
}

const STORAGE_KEY = 'helyx.ttp-selection';
const ID_RE = /^T\d{4}(\.\d{3})?$/;

function loadFromStorage(): SelectedTtp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is SelectedTtp =>
      x && typeof x === 'object' && typeof x.id === 'string' && ID_RE.test(x.id),
    );
  } catch {
    return [];
  }
}

// Module-level singletons — all imports share the same refs.
const selected = ref<SelectedTtp[]>(loadFromStorage());
const isOpen = ref(false);

watch(selected, (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage full / disabled — degrade silently. Selection still
    // works in-memory for the current session.
  }
}, { deep: true });

export function useTtpSelection() {
  return {
    selected: computed(() => selected.value),
    selectedIds: computed(() => selected.value.map((s) => s.id)),
    count: computed(() => selected.value.length),
    isOpen,

    has(id: string): boolean {
      return selected.value.some((s) => s.id === id);
    },

    add(t: SelectedTtp): void {
      if (!ID_RE.test(t.id)) return;
      if (selected.value.some((s) => s.id === t.id)) return;
      selected.value = [...selected.value, t];
    },

    remove(id: string): void {
      selected.value = selected.value.filter((s) => s.id !== id);
    },

    toggle(t: SelectedTtp): void {
      if (selected.value.some((s) => s.id === t.id)) {
        this.remove(t.id);
      } else {
        this.add(t);
      }
    },

    clear(): void {
      selected.value = [];
    },

    open(): void { isOpen.value = true; },
    close(): void { isOpen.value = false; },
    toggleOpen(): void { isOpen.value = !isOpen.value; },
  };
}
