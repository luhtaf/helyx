<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import { useSbomUpload, type SbomIngestResult } from '@/composables/useSbomUpload';

const props = defineProps<{ assetId: string; isOpen: boolean }>();
const emit = defineEmits<{ close: []; ingested: [SbomIngestResult] }>();

const { upload, loading, error } = useSbomUpload();
const file = ref<File | null>(null);
const result = ref<SbomIngestResult | null>(null);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const fileSize = computed(() => {
  if (!file.value) return '';
  const mib = file.value.size / (1024 * 1024);
  return mib >= 1 ? `${mib.toFixed(1)} MiB` : `${Math.max(1, Math.round(file.value.size / 1024))} KiB`;
});

watch(
  () => props.isOpen,
  (open) => {
    if (!open) {
      file.value = null;
      result.value = null;
      error.value = null;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    }
  },
);

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer);
});

function setFile(next: File | null): void {
  file.value = next;
  result.value = null;
  error.value = null;
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  setFile(input.files?.[0] ?? null);
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  setFile(event.dataTransfer?.files?.[0] ?? null);
}

function onDragover(event: DragEvent): void {
  event.preventDefault();
}

async function onUpload(): Promise<void> {
  if (!file.value) return;
  const payload = await upload(props.assetId, file.value);
  result.value = payload;
  closeTimer = setTimeout(() => {
    emit('ingested', payload);
  }, 1500);
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center px-4"
    @click.self="emit('close')"
  >
    <Card class="w-full max-w-[560px]">
      <template #header>
        <p class="font-mono text-[10px] uppercase tracking-wider text-ink">ingest sbom</p>
      </template>

      <div class="space-y-5">
        <label class="block">
          <input
            type="file"
            accept=".json,application/json"
            class="sr-only"
            @change="onFileChange"
          >
          <div
            class="border border-dashed border-rule p-8 text-center transition hover:border-ink-dim"
            @dragover="onDragover"
            @drop="onDrop"
          >
            <p class="font-mono text-[11px] text-ink">drop CycloneDX json or click to choose</p>
            <p class="mt-2 text-[12px] text-ink-faint">Trivy CycloneDX 1.x json only</p>
          </div>
        </label>

        <p v-if="file" class="font-mono text-[11px] text-ink-dim break-all">
          {{ file.name }} · {{ fileSize }}
        </p>

        <p
          v-if="error"
          class="border-l-2 border-sev-crit pl-3 text-[12px] text-sev-crit"
        >
          {{ error }}
        </p>

        <div
          v-if="result"
          class="border-l-2 border-signal pl-3 text-[12px] text-ink-dim"
        >
          ingested {{ result.componentCount }} components · {{ result.componentsWithExplicitCpe }} explicit cpe · {{ result.productLinkCount }} product links · {{ result.skippedNoPurl }} skipped
        </div>

        <div class="flex items-center justify-end gap-3">
          <Button variant="secondary" size="sm" @click="emit('close')">cancel</Button>
          <Button variant="primary" size="sm" :loading="loading" :disabled="!file || !!result" @click="onUpload">
            upload
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>
