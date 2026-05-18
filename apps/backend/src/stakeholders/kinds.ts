// Single source of truth for stakeholder + sensor enums.

export const SENSOR_STACKS = ['WAZUH_FULL', 'ELK_FULL', 'WAZUH_AGENT', 'MIXED'] as const;
export const SENSOR_STATUSES = ['ONLINE', 'DEGRADED', 'OFFLINE'] as const;
export const STAKEHOLDER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;

// Phase R — Stakeholder is polymorphic via this discriminator. Legacy
// rows (pre-m028) backfill to ORG; ORG is also the default when kind
// is omitted on create, so the field is non-breaking.
export const STAKEHOLDER_KINDS = ['ORG', 'SUBUNIT', 'VENDOR', 'PERSON', 'FACILITY'] as const;
export const DEFAULT_STAKEHOLDER_KIND: StakeholderKind = 'ORG';

export type SensorStack = (typeof SENSOR_STACKS)[number];
export type SensorStatus = (typeof SENSOR_STATUSES)[number];
export type StakeholderStatus = (typeof STAKEHOLDER_STATUSES)[number];
export type StakeholderKind = (typeof STAKEHOLDER_KINDS)[number];
