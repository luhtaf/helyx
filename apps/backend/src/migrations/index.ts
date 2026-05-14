import type { Migration } from './types.js';
import { m001_initial_schema } from './m001_initial_schema.js';
import { m002_sync_state } from './m002_sync_state.js';
import { m003_tenant_schema } from './m003_tenant_schema.js';
import { m004_asset_schema } from './m004_asset_schema.js';
import { m005_drop_matches_cpe } from './m005_drop_matches_cpe.js';
import { m006_threat_intel_schema } from './m006_threat_intel_schema.js';
import { m007_hunt_schema } from './m007_hunt_schema.js';
import { m008_tactic_schema } from './m008_tactic_schema.js';
import { m009_data_component_schema } from './m009_data_component_schema.js';
import { m010_detection_strategy_schema } from './m010_detection_strategy_schema.js';
import { m011_master_data_schema } from './m011_master_data_schema.js';
import { m012_seed_sektor } from './m012_seed_sektor.js';
import { m013_ca_case_schema } from './m013_ca_case_schema.js';
import { m014_audit_schema } from './m014_audit_schema.js';
import { m015_stakeholder_asset_link } from './m015_stakeholder_asset_link.js';
import { m016_detection_rule_schema } from './m016_detection_rule_schema.js';
import { m017_release_policy_schema } from './m017_release_policy_schema.js';
import { m018_cti_org_keypair } from './m018_cti_org_keypair.js';
import { m019_stix_export } from './m019_stix_export.js';
import { m020_cti_ioc_intel } from './m020_cti_ioc_intel.js';
import { m021_cti_keypair_rotation } from './m021_cti_keypair_rotation.js';
import { m022_redaction_profile } from './m022_redaction_profile.js';
import { m023_notes } from './m023_notes.js';
import { m024_pdn_egress } from './m024_pdn_egress.js';
import { m025_cti_push } from './m025_cti_push.js';
import { m026_scanner } from './m026_scanner.js';

export const migrations: Migration[] = [
  m001_initial_schema,
  m002_sync_state,
  m003_tenant_schema,
  m004_asset_schema,
  m005_drop_matches_cpe,
  m006_threat_intel_schema,
  m007_hunt_schema,
  m008_tactic_schema,
  m009_data_component_schema,
  m010_detection_strategy_schema,
  m011_master_data_schema,
  m012_seed_sektor,
  m013_ca_case_schema,
  m014_audit_schema,
  m015_stakeholder_asset_link,
  m016_detection_rule_schema,
  m017_release_policy_schema,
  m018_cti_org_keypair,
  m019_stix_export,
  m020_cti_ioc_intel,
  m021_cti_keypair_rotation,
  m022_redaction_profile,
  m023_notes,
  m024_pdn_egress,
  m025_cti_push,
  m026_scanner,
];
