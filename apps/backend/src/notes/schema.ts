// H4 — markdown notes per entity. Generic shape: caller passes the
// entityType + entityId pair. Detail pages call notesFor; mutations
// take a Note id (which carries entityType internally) so update/delete
// don't need re-passing.
export const noteTypeDefs = /* GraphQL */ `
  enum NoteEntityType {
    CVE
    Asset
    Stakeholder
    Hunt
    DetectionRule
    Case
    ThreatActor
    AttackPattern
    Sektor
    CWE
  }

  type Note {
    id: ID!
    entityType: NoteEntityType!
    entityId: ID!
    body: String!
    authorUserId: ID!
    """Email of the original author. Null if user was deleted."""
    authorEmail: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """List all markdown notes attached to a specific entity. ANALYST role."""
    notesFor(entityType: NoteEntityType!, entityId: ID!): [Note!]!
  }

  extend type Mutation {
    """Create a markdown note on an entity. ANALYST role. Returns the
    created note (for cache update). Body is stored verbatim;
    sanitization runs at render time on the client."""
    createNote(entityType: NoteEntityType!, entityId: ID!, body: String!): Note!

    """Edit a note's body. ANALYST role; only the original author or
    OWNER can update."""
    updateNote(id: ID!, body: String!): Note!

    """Hard-delete a note. ANALYST role; only the original author or
    OWNER can delete."""
    deleteNote(id: ID!): Boolean!
  }
`;
