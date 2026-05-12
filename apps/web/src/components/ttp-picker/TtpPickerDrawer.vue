<script setup lang="ts">
// Bottom-sheet drawer with Matrix tree as multi-select picker. Slides
// up from below, ~75vh, dim backdrop. Reuses useMatrix data + reuses
// the column shape from MatrixColumn but renders a click-to-toggle
// tile (no router-link) instead of the read-only TechniqueCard.
//
// Action context — buttons in the bottom bar adapt to the current
// route. /graph?hunt=X gets "+ Add to graph"; everywhere gets
// "Guess actor" + "TTP-seed first selected".

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useTtpSelection } from '@/composables/useTtpSelection';
import { useMatrix } from '@/composables/useMatrix';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';

const ttp = useTtpSelection();
const router = useRouter();
const route = useRoute();

const platform = ref('');
const search = ref('');
const showSubtechniques = ref(true);

const { columns, loading } = useMatrix(() => ({
  platform: platform.value || null,
  search: search.value.trim() || null,
}));

const visibleColumns = computed(() =>
  columns.value
    .map((c) => ({
      ...c,
      techniques: showSubtechniques.value
        ? c.techniques
        : c.techniques.filter((t) => !t.isSubtechnique),
    }))
    .filter((c) => c.techniques.length > 0),
);

// ─── Actions (context-sensitive) ──────────────────────────────────
// `/graph?hunt=X` adds the "Add to graph" action. Other actions are
// always present.
const isOnHuntGraph = computed(() => route.path === '/graph' && Boolean(route.query.hunt));

function onGuessActor(): void {
  if (ttp.count.value === 0) return;
  ttp.close();
  router.push({ path: '/hunts/new', query: { mode: 'guess' } });
}

function onTtpSeedFirst(): void {
  const first = ttp.selected.value[0];
  if (!first) return;
  ttp.close();
  router.push({ path: '/graph', query: { ttp: first.id } });
}

// `/graph?hunt=X` cooperative handoff — drop chosen TTPs as cytoscape
// nodes via a global event. GraphView listens. Simpler than a tight
// import coupling drawer → graph internals.
function onAddToGraph(): void {
  if (ttp.count.value === 0) return;
  window.dispatchEvent(new CustomEvent('helyx:add-ttps-to-graph', {
    detail: { ttps: ttp.selected.value.slice() },
  }));
  ttp.close();
}

// ─── Esc to close ─────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ttp.isOpen.value) ttp.close();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

// Close drawer auto-clear search? No — keep filter sticky during a
// session so re-opens are fast. Selection persists across opens too.
watch(() => ttp.isOpen.value, (open) => {
  if (open) {
    // Lock body scroll while drawer is open.
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="ttp.isOpen.value" class="fixed inset-0 bg-base/60 backdrop-blur-sm z-40" @click="ttp.close()" />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-200"
      enter-from-class="translate-y-full"
      leave-active-class="transition-transform duration-200"
      leave-to-class="translate-y-full"
    >
      <aside
        v-if="ttp.isOpen.value"
        class="fixed bottom-0 left-0 right-0 z-50 h-[75vh] bg-base border-t border-rule-strong shadow-2xl flex flex-col"
        @click.stop
      >
        <!-- Top: title + filters -->
        <header class="border-b border-rule-strong px-6 py-3 shrink-0">
          <div class="flex items-baseline justify-between gap-4 mb-3">
            <div>
              <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">ttp picker</p>
              <h2 class="text-[16px] text-ink mt-0.5">ATT&amp;CK Matrix · click to select</h2>
            </div>
            <button type="button" @click="ttp.close()" class="font-mono text-[11px] text-ink-faint hover:text-ink">esc · close</button>
          </div>
          <div class="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <label class="flex items-center gap-2 text-ink-dim">
              <span class="text-ink-faint">platform</span>
              <select v-model="platform" class="h-8 rounded-md bg-surface border border-rule px-2 text-ink focus:outline-none focus:border-ink-dim">
                <option value="">all</option>
                <option v-for="p in ['windows', 'macos', 'linux', 'network', 'containers', 'office-suite', 'iaas', 'saas']" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
            <Input v-model="search" type="search" placeholder="technique name or id" class="!h-8 w-[220px]" />
            <label class="flex items-center gap-2 text-ink-dim cursor-pointer select-none">
              <input v-model="showSubtechniques" type="checkbox" class="h-4 w-4 rounded-[2px] border border-rule bg-surface accent-[var(--signal)]" />
              <span class="text-ink-faint">sub-techniques</span>
            </label>
          </div>
        </header>

        <!-- Middle: matrix tree -->
        <div class="flex-1 overflow-x-auto overflow-y-hidden">
          <div class="flex h-full">
            <p v-if="loading && visibleColumns.length === 0" class="m-auto text-[13px] text-ink-dim">loading matrix…</p>
            <section
              v-for="col in visibleColumns"
              :key="col.tactic.id"
              class="w-[180px] shrink-0 border-r border-rule h-full flex flex-col"
            >
              <header class="border-b border-rule-strong px-3 py-2 bg-base/95 sticky top-0 z-10">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="text-[12px] font-medium text-ink truncate">{{ col.tactic.name }}</p>
                  <span class="font-mono text-[10px] text-ink-faint tabular-nums">{{ col.techniques.length }}</span>
                </div>
              </header>
              <div class="flex-1 overflow-y-auto px-1.5 py-2">
                <button
                  v-for="t in col.techniques"
                  :key="t.id"
                  type="button"
                  @click="ttp.toggle({ id: t.id, name: t.name, isSubtechnique: t.isSubtechnique })"
                  :class="[
                    'block w-full text-left rounded-[2px] border px-2 py-1.5 transition mb-0.5',
                    t.isSubtechnique ? 'pl-4' : '',
                    ttp.has(t.id)
                      ? 'border-signal bg-signal/10 text-ink'
                      : 'border-transparent hover:bg-surface text-ink-dim hover:text-ink',
                  ]"
                >
                  <p class="font-mono text-[10px] tabular-nums" :class="ttp.has(t.id) ? 'text-signal' : 'text-ink-faint'">
                    {{ t.id }}
                  </p>
                  <p class="text-[11px] line-clamp-1">{{ t.name }}</p>
                </button>
              </div>
            </section>
          </div>
        </div>

        <!-- Bottom: selection bar + actions -->
        <footer class="border-t border-rule-strong px-6 py-3 shrink-0 bg-surface/30">
          <div class="flex items-center gap-3 mb-2">
            <span class="font-mono text-[11px] text-ink-faint tabular-nums shrink-0">
              {{ ttp.count.value }} selected
            </span>
            <div class="flex flex-wrap gap-1 flex-1 min-w-0 max-h-[60px] overflow-y-auto">
              <span
                v-for="s in ttp.selected.value"
                :key="s.id"
                class="inline-flex items-center gap-1 font-mono text-[10px] bg-base/80 border border-rule-strong rounded-sm px-1.5 py-0.5"
                :title="s.name"
              >
                <span :class="s.isSubtechnique ? 'text-ink-dim' : 'text-signal'">{{ s.id }}</span>
                <button type="button" class="text-ink-faint hover:text-sev-crit" @click="ttp.remove(s.id)" aria-label="remove">✕</button>
              </span>
            </div>
            <button
              v-if="ttp.count.value > 0"
              type="button"
              class="shrink-0 font-mono text-[10px] text-ink-faint hover:text-sev-crit"
              @click="ttp.clear()"
            >clear all</button>
          </div>
          <div class="flex items-center justify-end gap-2">
            <Button
              v-if="isOnHuntGraph"
              variant="ghost"
              size="sm"
              :disabled="ttp.count.value === 0"
              @click="onAddToGraph"
            >+ Add to graph</Button>
            <Button
              variant="ghost"
              size="sm"
              :disabled="ttp.count.value === 0"
              @click="onTtpSeedFirst"
              :title="'Materialize first selected TTP — ' + (ttp.selected.value[0]?.id ?? '')"
            >Materialize first →</Button>
            <Button
              variant="primary"
              size="sm"
              :disabled="ttp.count.value === 0"
              @click="onGuessActor"
            >Guess actor →</Button>
          </div>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
