<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSektors, type Stakeholder, type StakeholderInput } from '@/composables/useStakeholders';
import type { RawStakeholder } from '@/composables/useReconciliationInbox';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

// Three modes inferred from props:
//   raw=null,  existing=null    → empty create (manual)
//   raw!=null, existing=null    → create-from-raw (reconciliation)
//   raw=null,  existing!=null   → edit existing stakeholder
const props = defineProps<{
  raw: RawStakeholder | null;
  existing?: Stakeholder | null;
  loading: boolean;
  open: boolean;
}>();
const emit = defineEmits<{
  // For create modes — emits StakeholderInput (includes slug).
  (e: 'submit', input: StakeholderInput): void;
  // For edit mode — emits the partial update (slug omitted, immutable).
  (e: 'update', id: string, input: Omit<StakeholderInput, 'slug'>): void;
  (e: 'cancel'): void;
}>();

const isEdit = computed(() => Boolean(props.existing));

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
const coordsLon = ref('');
const coordsLat = ref('');
const sektorId = ref('');
const notes = ref('');

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

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  if (props.existing) {
    // Edit mode: pre-populate from existing entity.
    name.value = props.existing.name;
    slug.value = props.existing.slug;
    aliases.value = props.existing.aliases.join(', ');
    city.value = props.existing.city ?? '';
    coordsLon.value = props.existing.coords?.[0]?.toString() ?? '';
    coordsLat.value = props.existing.coords?.[1]?.toString() ?? '';
    sektorId.value = props.existing.sektor?.id ?? '';
    notes.value = props.existing.notes ?? '';
  } else if (props.raw) {
    name.value = props.raw.rawName;
    slug.value = slugify(props.raw.rawName);
    sektorId.value = findSektorIdFromRaw(props.raw.rawSektor);
    aliases.value = '';
    city.value = '';
    coordsLon.value = '';
    coordsLat.value = '';
    notes.value = '';
  } else {
    name.value = '';
    slug.value = '';
    sektorId.value = '';
    aliases.value = '';
    city.value = '';
    coordsLon.value = '';
    coordsLat.value = '';
    notes.value = '';
  }
  slugTouched.value = false;
}, { immediate: true });

watch(sektors, (list) => {
  if (props.open && props.raw && !sektorId.value && list.length > 0) {
    sektorId.value = findSektorIdFromRaw(props.raw.rawSektor);
  }
});

watch(name, (n) => {
  // Auto-derive slug ONLY in create mode + while user hasn't manually edited.
  if (!isEdit.value && !slugTouched.value) slug.value = slugify(n);
});

function onSlugInput(v: string): void {
  slug.value = v;
  slugTouched.value = true;
}

// Build StakeholderInput.coords from string fields (skip if either invalid).
function parsedCoords(): [number, number] | undefined {
  const lon = parseFloat(coordsLon.value);
  const lat = parseFloat(coordsLat.value);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
  return [lon, lat];
}

function onSubmit(): void {
  if (!name.value) return;
  const aliasArr = aliases.value.split(',').map((a) => a.trim()).filter(Boolean);
  const coords = parsedCoords();
  if (isEdit.value && props.existing) {
    emit('update', props.existing.id, {
      name: name.value,
      aliases: aliasArr,
      city: city.value || undefined,
      coords,
      sektorId: sektorId.value || undefined,
      notes: notes.value || undefined,
    });
    return;
  }
  if (!slug.value) return;
  emit('submit', {
    slug: slug.value,
    name: name.value,
    aliases: aliasArr,
    city: city.value || undefined,
    coords,
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
              {{ existing ? 'edit stakeholder' : (raw ? 'create stakeholder from raw' : 'new stakeholder') }}
            </p>
            <h2 class="text-[18px] text-ink mt-1">
              {{ existing?.name ?? raw?.rawName ?? 'Manual entry' }}
            </h2>
          </header>
          <form class="space-y-4" @submit.prevent="onSubmit">
            <Input v-model="name" label="Display name" required placeholder="Kementerian ESDM" />
            <Input
              v-if="!isEdit"
              :model-value="slug"
              label="Slug"
              required
              placeholder="kementerian-esdm"
              @update:model-value="onSlugInput"
            />
            <div v-else>
              <p class="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-faint">Slug (immutable)</p>
              <p class="font-mono text-[13px] text-ink-dim border border-rule rounded-md px-3 py-2 bg-surface/40">{{ slug }}</p>
            </div>
            <Input v-model="aliases" label="Aliases (comma-separated)" placeholder="K-ESDM, Kemen ESDM" />
            <Input v-model="city" label="City" placeholder="Jakarta" />
            <div class="grid grid-cols-2 gap-3">
              <Input v-model="coordsLon" label="Longitude" placeholder="106.8456" />
              <Input v-model="coordsLat" label="Latitude" placeholder="-6.2088" />
            </div>
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
                {{ existing ? 'Save changes' : (raw ? 'Create + resolve' : 'Create stakeholder') }}
              </Button>
              <Button type="button" variant="ghost" @click="emit('cancel')">Cancel (Esc)</Button>
            </div>
          </form>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
