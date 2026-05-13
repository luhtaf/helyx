// H4 — markdown notes per entity. Generic composable: caller passes
// entityType + entityId. List query is reactive (re-fetches on entityId
// change); mutations refetch via Apollo cache invalidation.

import { computed, ref, watch } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export const NOTE_ENTITY_TYPES = [
  'CVE', 'Asset', 'Stakeholder', 'Hunt', 'DetectionRule',
  'Case', 'ThreatActor', 'AttackPattern', 'Sektor', 'CWE',
] as const;
export type NoteEntityType = (typeof NOTE_ENTITY_TYPES)[number];

export interface Note {
  id: string;
  entityType: NoteEntityType;
  entityId: string;
  body: string;
  authorUserId: string;
  authorEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

const NOTE_FIELDS = `
  id entityType entityId body
  authorUserId authorEmail
  createdAt updatedAt
`;

const LIST_QUERY = gql`
  query NotesFor($entityType: NoteEntityType!, $entityId: ID!) {
    notesFor(entityType: $entityType, entityId: $entityId) { ${NOTE_FIELDS} }
  }
`;

const CREATE_MUTATION = gql`
  mutation CreateNote($entityType: NoteEntityType!, $entityId: ID!, $body: String!) {
    createNote(entityType: $entityType, entityId: $entityId, body: $body) { ${NOTE_FIELDS} }
  }
`;

const UPDATE_MUTATION = gql`
  mutation UpdateNote($id: ID!, $body: String!) {
    updateNote(id: $id, body: $body) { ${NOTE_FIELDS} }
  }
`;

const DELETE_MUTATION = gql`
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`;

export function useNotes(entityType: () => NoteEntityType, entityId: () => string) {
  const variables = computed(() => ({ entityType: entityType(), entityId: entityId() }));
  const { result, loading, error, refetch } = useQuery<{ notesFor: Note[] }>(
    LIST_QUERY,
    variables,
    { fetchPolicy: 'cache-and-network' },
  );
  const notes = computed<Note[]>(() => result.value?.notesFor ?? []);
  // Re-fetch when entityId changes (composable instance reused across page)
  watch(entityId, () => refetch());
  return { notes, loading, error, refetch };
}

export function useNoteMutations() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  function refetchList(entityType: NoteEntityType, entityId: string) {
    return [{ query: LIST_QUERY, variables: { entityType, entityId } }];
  }

  async function create(entityType: NoteEntityType, entityId: string, body: string): Promise<Note | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ createNote: Note }>({
        mutation: CREATE_MUTATION,
        variables: { entityType, entityId, body },
        refetchQueries: refetchList(entityType, entityId),
        awaitRefetchQueries: true,
      });
      return r.data?.createNote ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function update(id: string, body: string, entityType: NoteEntityType, entityId: string): Promise<Note | null> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ updateNote: Note }>({
        mutation: UPDATE_MUTATION,
        variables: { id, body },
        refetchQueries: refetchList(entityType, entityId),
        awaitRefetchQueries: true,
      });
      return r.data?.updateNote ?? null;
    } catch (e) {
      error.value = e as Error;
      return null;
    } finally {
      submitting.value = false;
    }
  }

  async function remove(id: string, entityType: NoteEntityType, entityId: string): Promise<boolean> {
    submitting.value = true;
    error.value = null;
    try {
      const r = await client.mutate<{ deleteNote: boolean }>({
        mutation: DELETE_MUTATION,
        variables: { id },
        refetchQueries: refetchList(entityType, entityId),
        awaitRefetchQueries: true,
      });
      return r.data?.deleteNote ?? false;
    } catch (e) {
      error.value = e as Error;
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return { create, update, remove, submitting, error };
}
