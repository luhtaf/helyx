import type { Migration } from './types.js';
import { m001_initial_schema } from './m001_initial_schema.js';
import { m002_sync_state } from './m002_sync_state.js';
import { m003_tenant_schema } from './m003_tenant_schema.js';
import { m004_asset_schema } from './m004_asset_schema.js';
import { m005_drop_matches_cpe } from './m005_drop_matches_cpe.js';
import { m006_threat_intel_schema } from './m006_threat_intel_schema.js';
import { m007_hunt_schema } from './m007_hunt_schema.js';

export const migrations: Migration[] = [
  m001_initial_schema,
  m002_sync_state,
  m003_tenant_schema,
  m004_asset_schema,
  m005_drop_matches_cpe,
  m006_threat_intel_schema,
  m007_hunt_schema,
];
