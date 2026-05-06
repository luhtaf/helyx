export type SensorStack = 'WAZUH_FULL' | 'ELK_FULL' | 'WAZUH_AGENT' | 'MIXED';
export type SensorStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';
export type StakeholderStatus = 'ACTIVE' | 'ARCHIVED';

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
}
