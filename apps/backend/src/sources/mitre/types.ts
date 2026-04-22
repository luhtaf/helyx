import { z } from 'zod';

const ExternalReference = z.object({
  source_name: z.string(),
  external_id: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const KillChainPhase = z.object({
  kill_chain_name: z.string(),
  phase_name: z.string(),
}).passthrough();

export const IntrusionSet = z.object({
  type: z.literal('intrusion-set'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  external_references: z.array(ExternalReference).optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  revoked: z.boolean().optional(),
  x_mitre_deprecated: z.boolean().optional(),
}).passthrough();

export const AttackPattern = z.object({
  type: z.literal('attack-pattern'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  external_references: z.array(ExternalReference).optional(),
  kill_chain_phases: z.array(KillChainPhase).optional(),
  x_mitre_platforms: z.array(z.string()).optional(),
  x_mitre_detection: z.string().optional(),
  x_mitre_data_sources: z.array(z.string()).optional(),
  x_mitre_is_subtechnique: z.boolean().optional(),
  revoked: z.boolean().optional(),
  x_mitre_deprecated: z.boolean().optional(),
}).passthrough();

export const DataSource = z.object({
  type: z.literal('x-mitre-data-source'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  external_references: z.array(ExternalReference).optional(),
  x_mitre_platforms: z.array(z.string()).optional(),
  revoked: z.boolean().optional(),
  x_mitre_deprecated: z.boolean().optional(),
}).passthrough();

export const DataComponent = z.object({
  type: z.literal('x-mitre-data-component'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  x_mitre_data_source_ref: z.string(),
  revoked: z.boolean().optional(),
  x_mitre_deprecated: z.boolean().optional(),
}).passthrough();

export const Relationship = z.object({
  type: z.literal('relationship'),
  id: z.string(),
  relationship_type: z.string(),
  source_ref: z.string(),
  target_ref: z.string(),
  revoked: z.boolean().optional(),
}).passthrough();

const StixObject = z.union([
  IntrusionSet,
  AttackPattern,
  DataSource,
  DataComponent,
  Relationship,
  z.object({ type: z.string() }).passthrough(),
]);

export const StixBundle = z.object({
  type: z.literal('bundle').optional(),
  id: z.string().optional(),
  objects: z.array(StixObject),
}).passthrough();

export type IntrusionSet = z.infer<typeof IntrusionSet>;
export type AttackPattern = z.infer<typeof AttackPattern>;
export type DataSource = z.infer<typeof DataSource>;
export type DataComponent = z.infer<typeof DataComponent>;
export type Relationship = z.infer<typeof Relationship>;
export type StixBundle = z.infer<typeof StixBundle>;
