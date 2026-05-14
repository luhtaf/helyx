<script setup lang="ts">
// Manual rule add — operator workflow gap. Currently rules come from
// generateRulesFromHunt or upserted in bulk via importers. Sometimes
// operator needs to author one by hand (custom YARA, ad-hoc Sigma).
//
// Backend createDetectionRule accepts:
//   kind! (YARA/SURICATA/SIGMA/CUSTOM), name!, description?,
//   content!, tags?, status?, derivedFromArtifactIds?, detectsTechniqueIds?
//
// v1 form covers the common case: kind + name + content + tags. The
// link fields (artifacts, techniques) defer to a follow-up — they
// need their own pickers.

import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { RULE_KINDS, type RuleKind } from '@/composables/rule-kinds';
import type { CreateRuleInput } from '@/composables/useRules';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean; loading: boolean }>();
const emit = defineEmits<{
  (e: 'submit', input: CreateRuleInput): void;
  (e: 'cancel'): void;
}>();

const kind = ref<RuleKind>('YARA');
const name = ref('');
const description = ref('');
const content = ref('');
const tagsRaw = ref('');

const SAMPLE: Record<RuleKind, string> = {
  YARA: `rule example_marker {
  meta:
    description = "matches example marker bytes"
  strings:
    $a = "EXAMPLE"
  condition:
    $a
}`,
  SURICATA: `alert tcp any any -> any 80 (msg:"example HTTP marker"; content:"example"; sid:1000001; rev:1;)`,
  SIGMA: `title: Example Process Marker
description: Triggers on example.exe execution
status: experimental
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\\example.exe'
  condition: selection`,
  CUSTOM: `# Free-form rule body — operator-defined format.`,
};

function reset(): void {
  kind.value = 'YARA';
  name.value = '';
  description.value = '';
  content.value = SAMPLE.YARA;
  tagsRaw.value = '';
}

watch(() => props.open, (isOpen) => { if (isOpen) reset(); });
// When operator switches kind, swap sample only if content matches
// the previous kind's sample (so we don't blast their work).
watch(kind, (next, prev) => {
  if (prev && content.value.trim() === SAMPLE[prev].trim()) {
    content.value = SAMPLE[next];
  }
});

function onKey(e: KeyboardEvent): void {
  if (!props.open) return;
  if (e.key === 'Escape') { e.preventDefault(); emit('cancel'); }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function onSubmit(): void {
  if (!name.value.trim() || !content.value.trim()) return;
  const tags = tagsRaw.value
    .split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  emit('submit', {
    kind: kind.value,
    name: name.value.trim(),
    description: description.value.trim() || undefined,
    content: content.value,
    tags: tags.length > 0 ? tags : undefined,
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-[55] bg-base/70 backdrop-blur-sm" @click="emit('cancel')">
        <Transition
          enter-active-class="transition-transform duration-200 ease-out"
          enter-from-class="translate-x-full"
          leave-active-class="transition-transform duration-150 ease-in"
          leave-to-class="translate-x-full"
          appear
        >
          <aside class="fixed top-0 right-0 bottom-0 w-[640px] bg-base border-l border-rule-strong shadow-2xl flex flex-col" @click.stop>
            <header class="px-6 py-5 border-b border-rule-strong">
              <p class="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">detection · manual add</p>
              <h2 class="text-[18px] text-ink font-medium tracking-tight">New detection rule</h2>
            </header>

            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div class="grid grid-cols-12 gap-3">
                <div class="col-span-3">
                  <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">kind <span class="text-sev-crit">*</span></label>
                  <select
                    v-model="kind"
                    class="w-full px-2 py-2 bg-surface border border-rule-strong rounded text-[12px] focus:outline-none focus:border-signal/40 transition"
                  >
                    <option v-for="k in RULE_KINDS" :key="k" :value="k">{{ k }}</option>
                  </select>
                </div>
                <div class="col-span-9">
                  <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">name <span class="text-sev-crit">*</span></label>
                  <input
                    v-model="name"
                    type="text"
                    placeholder="e.g. APT41 PowerShell beacon"
                    class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                  />
                </div>
              </div>

              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">description</label>
                <input
                  v-model="description"
                  type="text"
                  placeholder="(optional one-liner — what this rule catches)"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>

              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">content <span class="text-sev-crit">*</span></label>
                <textarea
                  v-model="content"
                  class="w-full min-h-[280px] px-3 py-2 bg-surface border border-rule-strong rounded text-[11px] font-mono text-ink-mid focus:outline-none focus:border-signal/40 transition resize-y"
                  spellcheck="false"
                />
                <p class="mt-1 font-mono text-[10px] text-ink-faint">
                  Sample auto-loads per kind. Approve via /rules/&lt;id&gt; after create — push needs F2 approval.
                </p>
              </div>

              <div>
                <label class="block font-mono text-[10px] uppercase tracking-wider text-ink-dim mb-1.5">tags</label>
                <input
                  v-model="tagsRaw"
                  type="text"
                  placeholder="comma-separated — apt41, powershell, beacon"
                  class="w-full px-3 py-2 bg-surface border border-rule-strong rounded text-[13px] focus:outline-none focus:border-signal/40 transition"
                />
              </div>
            </div>

            <footer class="px-6 py-4 border-t border-rule-strong flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
              <Button variant="primary" size="sm" :loading="loading" :disabled="!name.trim() || !content.trim()" @click="onSubmit">
                Create rule
              </Button>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
