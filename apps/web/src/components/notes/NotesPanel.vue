<script setup lang="ts">
// H4 — generic notes panel. Drop into any detail page:
//   <NotesPanel entity-type="CVE" :entity-id="cve.id" />
//
// Lists existing notes (newest first), shows inline editor for new
// notes, per-note edit/delete with author guard. Markdown rendered
// via DOMPurify-sanitized marked output (xss-safe).

import { ref, toRef } from 'vue';
import { useNotes, useNoteMutations, type NoteEntityType, type Note } from '@/composables/useNotes';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { useAuthStore } from '@/stores/auth';
import { renderMarkdown } from '@/utils/markdown';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ entityType: NoteEntityType; entityId: string }>();
const entityTypeRef = toRef(props, 'entityType');
const entityIdRef = toRef(props, 'entityId');

const { notes, loading, error } = useNotes(() => entityTypeRef.value, () => entityIdRef.value);
const { create, update, remove, submitting } = useNoteMutations();
const { show: showToast } = useToast();
const { confirm } = useConfirm();
const auth = useAuthStore();

// New note draft
const draft = ref('');
const draftFocused = ref(false);

async function onAdd(): Promise<void> {
  const body = draft.value.trim();
  if (!body) return;
  const created = await create(entityTypeRef.value, entityIdRef.value, body);
  if (created) {
    draft.value = '';
    draftFocused.value = false;
    showToast('Note added', 'success');
  } else {
    showToast('Failed to add note', 'error');
  }
}

// Per-note edit state — keyed by note id.
const editingId = ref<string | null>(null);
const editBuffer = ref('');

function startEdit(note: Note): void {
  editingId.value = note.id;
  editBuffer.value = note.body;
}
function cancelEdit(): void {
  editingId.value = null;
  editBuffer.value = '';
}
async function saveEdit(): Promise<void> {
  if (!editingId.value) return;
  const body = editBuffer.value.trim();
  if (!body) return;
  const r = await update(editingId.value, body, entityTypeRef.value, entityIdRef.value);
  if (r) {
    cancelEdit();
    showToast('Note saved', 'success');
  } else {
    showToast('Failed to save note', 'error');
  }
}

async function onDelete(note: Note): Promise<void> {
  const ok = await confirm({
    title: 'Delete this note?',
    message: 'This cannot be undone.',
    variant: 'danger',
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  const r = await remove(note.id, entityTypeRef.value, entityIdRef.value);
  if (r) showToast('Note deleted', 'success');
  else showToast('Failed to delete', 'error');
}

function canMutate(note: Note): boolean {
  if (!auth.user) return false;
  if (note.authorUserId === auth.user.id) return true;
  return auth.activeOrgRole === 'OWNER';
}

function fmtDate(s: string): string {
  return s.slice(0, 16).replace('T', ' ');
}
function authorLabel(note: Note): string {
  return note.authorEmail ?? note.authorUserId.slice(0, 8);
}
</script>

<template>
  <section>
    <div class="flex items-baseline gap-3 mb-3">
      <h3 class="font-mono text-[10px] uppercase tracking-wider text-ink-dim">notes · {{ notes.length }}</h3>
      <div class="flex-1 border-b border-rule" />
    </div>

    <p v-if="loading && notes.length === 0" class="text-[12px] text-ink-faint">loading…</p>
    <p v-else-if="error" class="text-[12px] text-sev-crit">failed: {{ error.message }}</p>

    <ul v-if="notes.length" class="space-y-3 mb-4">
      <li v-for="n in notes" :key="n.id" class="border border-rule rounded-md bg-surface/30">
        <header class="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2 border-b border-rule">
          <div class="flex items-baseline gap-2 text-[10px] font-mono text-ink-faint">
            <span class="text-ink-dim">{{ authorLabel(n) }}</span>
            <span>·</span>
            <span>{{ fmtDate(n.updatedAt) }}</span>
            <span v-if="n.updatedAt !== n.createdAt" class="italic">(edited)</span>
          </div>
          <div v-if="canMutate(n) && editingId !== n.id" class="flex items-center gap-2">
            <button
              type="button"
              class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink transition"
              @click="startEdit(n)"
            >edit</button>
            <button
              type="button"
              class="font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-sev-crit transition"
              :disabled="submitting"
              @click="onDelete(n)"
            >delete</button>
          </div>
        </header>

        <!-- Edit mode -->
        <div v-if="editingId === n.id" class="p-4 space-y-3">
          <textarea
            v-model="editBuffer"
            class="w-full min-h-[120px] bg-base/60 border border-rule rounded p-2 text-[12px] font-mono text-ink focus:outline-none focus:border-signal/40"
            placeholder="markdown supported — **bold**, *italic*, `code`, [link](url)"
          />
          <div class="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" @click="cancelEdit">Cancel</Button>
            <Button variant="primary" size="sm" :loading="submitting" :disabled="!editBuffer.trim()" @click="saveEdit">Save</Button>
          </div>
        </div>

        <!-- Read mode -->
        <div
          v-else
          class="prose-notes px-4 py-3 text-[13px] text-ink-mid leading-relaxed"
          v-html="renderMarkdown(n.body)"
        />
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-[12px] text-ink-faint italic mb-4">no notes yet — add the first one.</p>

    <!-- Add new note -->
    <div class="border border-rule rounded-md bg-surface/20" :class="{ 'border-signal/30': draftFocused }">
      <textarea
        v-model="draft"
        class="w-full min-h-[80px] bg-transparent p-3 text-[12px] font-mono text-ink placeholder:text-ink-faint focus:outline-none resize-y"
        placeholder="add a note — markdown supported. **bold** *italic* `code` [link](url) - lists"
        @focus="draftFocused = true"
        @blur="draftFocused = draft.length > 0"
      />
      <div class="flex items-center justify-between gap-2 px-3 py-2 border-t border-rule" v-if="draftFocused || draft">
        <span class="font-mono text-[10px] text-ink-faint">{{ draft.length }} / 10000</span>
        <Button variant="primary" size="sm" :loading="submitting" :disabled="!draft.trim()" @click="onAdd">Add note</Button>
      </div>
    </div>
  </section>
</template>

<style>
/* Scoped CSS for rendered markdown — terse, monospace pre/code, restrained */
.prose-notes p { margin: 0 0 0.6em 0; }
.prose-notes p:last-child { margin-bottom: 0; }
.prose-notes ul, .prose-notes ol { margin: 0.4em 0 0.6em 1.2em; padding: 0; }
.prose-notes li { margin: 0.2em 0; }
.prose-notes h1, .prose-notes h2, .prose-notes h3 {
  margin: 0.8em 0 0.3em 0;
  font-weight: 500;
  color: var(--ink);
}
.prose-notes h1 { font-size: 1.15em; }
.prose-notes h2 { font-size: 1.05em; }
.prose-notes h3 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-dim); }
.prose-notes code {
  background: var(--rule-strong);
  padding: 0.05em 0.35em;
  border-radius: 3px;
  font-size: 0.92em;
  color: var(--signal);
}
.prose-notes pre {
  background: var(--rule);
  padding: 0.6em 0.8em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.prose-notes pre code {
  background: transparent;
  padding: 0;
  color: var(--ink);
}
.prose-notes a {
  color: var(--signal);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose-notes a:hover { color: var(--ink); }
.prose-notes blockquote {
  border-left: 2px solid var(--rule-strong);
  padding-left: 0.8em;
  margin: 0.5em 0;
  color: var(--ink-dim);
  font-style: italic;
}
.prose-notes hr { border: none; border-top: 1px solid var(--rule-strong); margin: 0.8em 0; }
.prose-notes strong { color: var(--ink); font-weight: 600; }
.prose-notes em { color: var(--ink-dim); }
</style>
