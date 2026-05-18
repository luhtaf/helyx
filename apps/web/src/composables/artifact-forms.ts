// Per-type artifact form SoT. One descriptor table drives the generic
// AddArtifactModal — adding/altering a type's fields = edit THIS file
// only (mirrors backend artifacts/kinds.ts + schema.ts inputs). Base
// fields (observedAt, severity, confidence, host, notes, tags) are
// handled by the modal; specs here are ONLY the type-specific fields.

import gql from 'graphql-tag';
import type { DocumentNode } from 'graphql';
import type { ArtifactType } from './artifact-kinds';
import {
  IOC_TYPES, DIRECTIONS, NET_PROTOCOLS, REGISTRY_HIVES, REGISTRY_ACTIONS,
  PERSISTENCE_MECHANISMS, ACCOUNT_ACTIONS, MEMORY_FINDINGS, DETECTION_ENGINES,
} from './artifact-kinds';

export type FieldKind =
  | 'text' | 'number' | 'textarea' | 'select'
  | 'checkbox' | 'taglist' | 'datetime';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
}

export interface ArtifactFormSpec {
  /** GraphQL mutation; returns { id }. */
  mutation: DocumentNode;
  /** Response field name, e.g. createIocArtifact. */
  respKey: string;
  /** Type-specific fields (base handled by the modal). */
  fields: FieldSpec[];
  /** NOTE needs author=ID! injected from the auth store, not a field. */
  injectsAuthorAsUserId?: boolean;
}

// 11 explicit mutations — matches the backend's "verbose but explicit"
// input/mutation list. Each returns just { id }; the modal toasts +
// refetches the Case query, so no need to over-select.
const M = (pascal: string): DocumentNode => gql`
  mutation Create${pascal}Artifact($caseId: ID!, $input: ${pascal}ArtifactInput!) {
    create${pascal}Artifact(caseId: $caseId, input: $input) { id }
  }
`;

export const ARTIFACT_FORM_SPECS: Record<ArtifactType, ArtifactFormSpec> = {
  IOC: {
    mutation: M('Ioc'), respKey: 'createIocArtifact',
    fields: [
      { key: 'iocType', label: 'IOC type', kind: 'select', required: true, options: IOC_TYPES },
      { key: 'value', label: 'Value', kind: 'text', required: true, placeholder: '1.2.3.4 / evil.com / <hash>' },
      { key: 'direction', label: 'Direction', kind: 'select', options: DIRECTIONS },
      { key: 'firstSeen', label: 'First seen', kind: 'datetime' },
      { key: 'lastSeen', label: 'Last seen', kind: 'datetime' },
      { key: 'source', label: 'Source', kind: 'text', placeholder: 'feed / analyst' },
    ],
  },
  FILE: {
    mutation: M('File'), respKey: 'createFileArtifact',
    fields: [
      { key: 'filename', label: 'Filename', kind: 'text', required: true },
      { key: 'filepath', label: 'Path', kind: 'text' },
      { key: 'md5', label: 'MD5', kind: 'text' },
      { key: 'sha1', label: 'SHA1', kind: 'text' },
      { key: 'sha256', label: 'SHA256', kind: 'text' },
      { key: 'sizeBytes', label: 'Size (bytes)', kind: 'number' },
      { key: 'mime', label: 'MIME', kind: 'text' },
      { key: 'signed', label: 'Signed', kind: 'checkbox' },
      { key: 'signer', label: 'Signer', kind: 'text' },
      { key: 'behavior', label: 'Behavior', kind: 'taglist', placeholder: 'persistence; c2; …' },
    ],
  },
  PROCESS: {
    mutation: M('Process'), respKey: 'createProcessArtifact',
    fields: [
      { key: 'name', label: 'Process name', kind: 'text', required: true },
      { key: 'pid', label: 'PID', kind: 'number' },
      { key: 'commandLine', label: 'Command line', kind: 'textarea' },
      { key: 'parentName', label: 'Parent', kind: 'text' },
      { key: 'user', label: 'User', kind: 'text' },
      { key: 'startedAt', label: 'Started at', kind: 'datetime' },
      { key: 'ttpHints', label: 'TTP hints', kind: 'taglist', placeholder: 'T1059; T1055' },
    ],
  },
  NETWORK: {
    mutation: M('Network'), respKey: 'createNetworkArtifact',
    fields: [
      { key: 'protocol', label: 'Protocol', kind: 'select', required: true, options: NET_PROTOCOLS },
      { key: 'srcIp', label: 'Src IP', kind: 'text', required: true },
      { key: 'srcPort', label: 'Src port', kind: 'number' },
      { key: 'dstIp', label: 'Dst IP', kind: 'text', required: true },
      { key: 'dstPort', label: 'Dst port', kind: 'number' },
      { key: 'direction', label: 'Direction', kind: 'select', options: DIRECTIONS },
      { key: 'bytes', label: 'Bytes', kind: 'number' },
      { key: 'connectionStartedAt', label: 'Conn started', kind: 'datetime' },
    ],
  },
  REGISTRY: {
    mutation: M('Registry'), respKey: 'createRegistryArtifact',
    fields: [
      { key: 'hive', label: 'Hive', kind: 'select', required: true, options: REGISTRY_HIVES },
      { key: 'keyPath', label: 'Key path', kind: 'text', required: true },
      { key: 'valueName', label: 'Value name', kind: 'text' },
      { key: 'valueData', label: 'Value data', kind: 'textarea' },
      { key: 'action', label: 'Action', kind: 'select', required: true, options: REGISTRY_ACTIONS },
    ],
  },
  PERSISTENCE: {
    mutation: M('Persistence'), respKey: 'createPersistenceArtifact',
    fields: [
      { key: 'mechanism', label: 'Mechanism', kind: 'select', required: true, options: PERSISTENCE_MECHANISMS },
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'target', label: 'Target', kind: 'text' },
      { key: 'user', label: 'User', kind: 'text' },
      { key: 'createdAtSrc', label: 'Created at (source)', kind: 'datetime' },
    ],
  },
  ACCOUNT: {
    mutation: M('Account'), respKey: 'createAccountArtifact',
    fields: [
      { key: 'username', label: 'Username', kind: 'text', required: true },
      { key: 'domain', label: 'Domain', kind: 'text' },
      { key: 'action', label: 'Action', kind: 'select', required: true, options: ACCOUNT_ACTIONS },
      { key: 'privileges', label: 'Privileges', kind: 'taglist', placeholder: 'SeDebugPrivilege; …' },
      { key: 'sourceIp', label: 'Source IP', kind: 'text' },
    ],
  },
  LOG_FINDING: {
    mutation: M('LogFinding'), respKey: 'createLogFindingArtifact',
    fields: [
      { key: 'logSource', label: 'Log source', kind: 'text', required: true, placeholder: 'auth.log / Security' },
      { key: 'eventId', label: 'Event ID', kind: 'text' },
      { key: 'timestamp', label: 'Timestamp', kind: 'datetime', required: true },
      { key: 'rawLine', label: 'Raw line', kind: 'textarea' },
      { key: 'observation', label: 'Observation', kind: 'textarea', required: true },
    ],
  },
  MEMORY: {
    mutation: M('Memory'), respKey: 'createMemoryArtifact',
    fields: [
      { key: 'processName', label: 'Process name', kind: 'text', required: true },
      { key: 'pid', label: 'PID', kind: 'number' },
      { key: 'finding', label: 'Finding', kind: 'select', required: true, options: MEMORY_FINDINGS },
      { key: 'evidence', label: 'Evidence', kind: 'textarea' },
      { key: 'toolUsed', label: 'Tool used', kind: 'text', placeholder: 'Volatility / …' },
    ],
  },
  DETECTION_HIT: {
    mutation: M('DetectionHit'), respKey: 'createDetectionHitArtifact',
    fields: [
      { key: 'ruleSource', label: 'Engine', kind: 'select', required: true, options: DETECTION_ENGINES },
      { key: 'ruleId', label: 'Rule ID', kind: 'text', required: true },
      { key: 'ruleName', label: 'Rule name', kind: 'text', required: true },
      { key: 'firedAt', label: 'Fired at', kind: 'datetime', required: true },
      { key: 'count', label: 'Count', kind: 'number' },
    ],
  },
  NOTE: {
    mutation: M('Note'), respKey: 'createNoteArtifact',
    injectsAuthorAsUserId: true,
    fields: [
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'body', label: 'Body', kind: 'textarea', required: true },
    ],
  },
};
