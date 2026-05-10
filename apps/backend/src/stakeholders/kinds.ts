// Single source of truth for stakeholder + sensor enums.

export const SENSOR_STACKS = ['WAZUH_FULL', 'ELK_FULL', 'WAZUH_AGENT', 'MIXED'] as const;
export const SENSOR_STATUSES = ['ONLINE', 'DEGRADED', 'OFFLINE'] as const;
export const STAKEHOLDER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

export type SensorStack = (typeof SENSOR_STACKS)[number];
export type SensorStatus = (typeof SENSOR_STATUSES)[number];
export type StakeholderStatus = (typeof STAKEHOLDER_STATUSES)[number];
