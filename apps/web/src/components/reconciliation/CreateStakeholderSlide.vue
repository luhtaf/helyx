<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useSektors, type StakeholderInput } from '@/composables/useStakeholders';
import type { RawStakeholder } from '@/composables/useReconciliationInbox';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{ raw: RawStakeholder | null; loading: boolean; open: boolean }>();
const emit = defineEmits<{
  (e: 'submit', input: StakeholderInput): void;
  (e: 'cancel'): void;
}>();

const { sektors } = useSektors();

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const slug = ref('');
const slugTouched = ref(false);
const name = ref('');
const aliases = ref('');
const city = ref('');
const sektorId = ref('');
const notes = ref('');

// rawSektor → sektorId lookup. Spiderfoot ParsedRecord stores Subsektor as
// human label like "Energi" / "Pemerintah Pusat"; the mapper has already
// translated it to one of our 17 sektor slugs at ingest time, so by the
// time we see RawStakeholder.rawSektor it MAY already be either the slug
// or the original label depending on source. Match either.
function findSektorIdFromRaw(raw: string | null | undefined): string {
  if (!raw) return '';
  const needle = raw.toLowerCase().trim();
  const hit = sektors.value.find((s) =>
    s.slug === needle ||
    s.name.toLowerCase() === needle ||
    s.slug === needle.replace(/\s+/g, '-'),
  );
  return hit?.id ?? '';
}

// Standalone mode: when slide opens without a raw row, reset everything and let
// slug auto-fill from name until the user manually edits it (slugTouched).
watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  if (props.raw) {
    name.value = props.raw.rawName;
    slug.value = slugify(props.raw.rawName);
    sektorId.value = findSektorIdFromRaw(props.raw.rawSektor);
  } else {
    name.value = '';
    slug.value = '';
    sektorId.value = '';
  }
  slugTouched.value = false;
  aliases.value = '';
  city.value = '';
  notes.value = '';
}, { immediate: true });

// Sektor list loads after slide mount on first open. When sektors arrive
// AFTER the watch above already ran, retry the lookup.
watch(sektors, (list) => {
  if (props.open && props.raw && !sektorId.value && list.length > 0) {
    sektorId.value = findSektorIdFromRaw(props.raw.rawSektor);
  }
});

watch(name, (n) => {
  if (!slugTouched.value) slug.value = slugify(n);
});

function onSlugInput(v: string): void {
  slug.value = v;
  slugTouched.value = true;
}

function onSubmit(): void {
  if (!slug.value || !name.value) return;
  emit('submit', {
    slug: slug.value,
    name: name.value,
    aliases: aliases.value.split(',').map((a) => a.trim()).filter(Boolean),
    city: city.value || undefined,
    sektorId: sektorId.value || undefined,
    notes: notes.value || undefined,
  });
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) emit('cancel');
}

onMounted(() => window.addEventListener('keydown', onEsc));
onUnmounted(() => window.removeEventListener('keydown', onEsc));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 bg-base/40 backdrop-blur-sm z-40" @click="emit('cancel')" />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-200"
      enter-from-class="translate-x-full"
      leave-active-class="transition-transform duration-200"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed top-0 right-0 h-screen w-[480px] bg-base border-l border-rule-strong z-50 overflow-y-auto"
      >
        <div class="p-8">
          <header class="mb-6">
            <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {{ raw ? 'create stakeholder from raw' : 'new stakeholder' }}
            </p>
            <h2 class="text-[18px] text-ink mt-1">{{ raw ? raw.rawName : 'Manual entry' }}</h2>
          </header>
          <form class="space-y-4" @submit.prevent="onSubmit">
            <Input v-model="name" label="Display name" required placeholder="Kementerian ESDM" />
            <Input :model-value="slug" label="Slug" required placeholder="kementerian-esdm" @update:model-value="onSlugInput" />
            <Input v-model="aliases" label="Aliases (comma-separated)" placeholder="K-ESDM, Kemen ESDM" />
            <Input v-model="city" label="City" placeholder="Jakarta" />
            <label class="block">
              <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Sektor</span>
              <select v-model="sektorId" class="block h-9 w-full rounded-md border border-rule-strong bg-surface px-3 text-sm text-ink">
                <option value="">— select sektor —</option>
                <option v-for="s in sektors" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Notes</span>
              <textarea v-model="notes" rows="3" class="block w-full rounded-md border border-rule-strong bg-surface p-3 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:ring-1 focus:ring-signal/30" />
            </label>
            <div class="flex items-center gap-3 pt-4">
              <Button type="submit" variant="primary" :loading="loading">
                {{ raw ? 'Create + resolve' : 'Create stakeholder' }}
              </Button>
              <Button type="button" variant="ghost" @click="emit('cancel')">Cancel (Esc)</Button>
            </div>
          </form>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
