// FE single source of truth for stakeholder + sensor enums + filter
// supersets + visual maps. Mirror of backend stakeholders/kinds.ts.

export const SENSOR_STACKS = ['WAZUH_FULL', 'ELK_FULL', 'WAZUH_AGENT', 'MIXED'] as const;
export const SENSOR_STATUSES = ['ONLINE', 'DEGRADED', 'OFFLINE'] as const;
export const STAKEHOLDER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

export type SensorStack = (typeof SENSOR_STACKS)[number];
export type SensorStatus = (typeof SENSOR_STATUSES)[number];
export type StakeholderStatus = (typeof STAKEHOLDER_STATUSES)[number];

// Filter supersets — coverage views need extra synthetic options
// (ALL = no filter, NO_SENSOR / NONE = stakeholders without a sensor row).
export type SensorStatusFilter = 'ALL' | SensorStatus | 'NO_SENSOR';
export type SensorStackFilter = 'ALL' | SensorStack | 'NONE';

export const SENSOR_STATUS_COLORS: Record<SensorStatus, string> = {
  ONLINE:   'bg-sev-low/15 text-sev-low border-sev-low/30',
  DEGRADED: 'bg-sev-med/15 text-sev-med border-sev-med/30',
  OFFLINE:  'bg-sev-crit/15 text-sev-crit border-sev-crit/30',
};

export const SENSOR_STATUS_LABELS: Record<SensorStatus, string> = {
  ONLINE:   'online',
  DEGRADED: 'degraded',
  OFFLINE:  'offline',
};

export const SENSOR_STACK_LABELS: Record<SensorStack, string> = {
  WAZUH_FULL:  'Wazuh full',
  WAZUH_AGENT: 'Wazuh agent',
  ELK_FULL:    'ELK full',
  MIXED:       'mixed',
};

// Coverage-view tone hints (used by SensorsView filter chips).
export const SENSOR_STATUS_TONE: Record<SensorStatus, string> = {
  ONLINE:   'sev-low',
  DEGRADED: 'sev-med',
  OFFLINE:  'sev-crit',
};
