export { type SensorStack, type SensorStatus, type StakeholderStatus, type StakeholderKind } from './kinds.js';
import type { SensorStack, SensorStatus, StakeholderStatus, StakeholderKind } from './kinds.js';

export interface SektorRow {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
}

export interface StakeholderRow {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  city: string | null;
  coords: [number, number] | null;
  notes: string | null;
  status: StakeholderStatus;
  kind: StakeholderKind;
  sektorId: string | null;
  sensorStack: SensorStack | null;
  sensorStatus: SensorStatus | null;
  sensorAgentCount: number | null;
  sensorDeployedAt: string | null;
  sensorNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholderInput {
  slug: string;
  name: string;
  aliases?: string[];
  city?: string;
  coords?: [number, number];
  notes?: string;
  sektorId?: string;
  kind?: StakeholderKind;
}
