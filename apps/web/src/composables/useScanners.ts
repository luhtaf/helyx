// Scanner pipeline FE composables — list/create/rotate/disable/enable
// scanners, plus inventory inbox queries + review mutations.

import { computed, ref } from 'vue';
import { useApolloClient, useQuery } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export const SCANNER_STATUSES = ['active', 'disabled', 'expired'] as const;
export type ScannerStatus = (typeof SCANNER_STATUSES)[number];

export const SCAN_REPORT_STATUSES = ['pending', 'reviewed', 'rejected'] as const;
export type ScanReportStatus = (typeof SCAN_REPORT_STATUSES)[number];

export const DISCOVERED_STATUSES = [
  'pending', 'merged_to_existing', 'created_new', 'rejected',
] as const;
export type DiscoveredStatus = (typeof DISCOVERED_STATUSES)[number];

export interface Scanner {
  id: string;
  label: string;
  scope: string;
  tokenPrefix: string;
  status: ScannerStatus;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  lastIngestAt: string | null;
  totalIngests: number;
}

export interface ScannerCreated {
  scanner: Scanner;
  plaintextToken: string;
}

export interface ScanReport {
  id: string;
  scannerId: string;
  scannerLabel: string | null;
  ts: string;
  source: 'token' | 'manual';
  format: string;
  payloadHash: string;
  payloadSize: number;
  status: ScanReportStatus;
  itemCount: number;
  reviewerUserId: string | null;
  reviewedAt: string | null;
}

export interface DiscoveredAsset {
  id: string;
  reportId: string;
  kind: string;
  name: string;
  hostname: string | null;
  ipAddresses: string[];
  parentDiscoveredId: string | null;
  status: DiscoveredStatus;
  matchedAssetId: string | null;
  createdAt: string;
}

const SCANNER_FIELDS = `
  id label scope tokenPrefix status
  createdByUserId createdAt expiresAt
  lastSeenAt lastIngestAt totalIngests
`;
const REPORT_FIELDS = `
  id scannerId scannerLabel ts source format
  payloadHash payloadSize status itemCount
  reviewerUserId reviewedAt
`;
const DISCOVERED_FIELDS = `
  id reportId kind name hostname ipAddresses
  parentDiscoveredId status matchedAssetId createdAt
`;

const SCANNERS_QUERY = gql`
  query Scanners { scanners { ${SCANNER_FIELDS} } }
`;
const REPORTS_QUERY = gql`
  query ScanReports($filter: ScanReportFilter, $limit: Int) {
    scanReports(filter: $filter, limit: $limit) { ${REPORT_FIELDS} }
  }
`;
const DISCOVERED_QUERY = gql`
  query DiscoveredAssetsForReport($reportId: ID!) {
    discoveredAssetsForReport(reportId: $reportId) { ${DISCOVERED_FIELDS} }
  }
`;

const CREATE_SCANNER = gql`
  mutation CreateScanner($input: CreateScannerInput!) {
    createScanner(input: $input) {
      plaintextToken
      scanner { ${SCANNER_FIELDS} }
    }
  }
`;
const ROTATE_SCANNER = gql`
  mutation RotateScannerToken($id: ID!) {
    rotateScannerToken(id: $id) {
      plaintextToken
      scanner { ${SCANNER_FIELDS} }
    }
  }
`;
const DISABLE_SCANNER = gql`
  mutation DisableScanner($id: ID!) {
    disableScanner(id: $id) { ${SCANNER_FIELDS} }
  }
`;
const ENABLE_SCANNER = gql`
  mutation EnableScanner($id: ID!) {
    enableScanner(id: $id) { ${SCANNER_FIELDS} }
  }
`;

const MERGE_DISCOVERED = gql`
  mutation MergeDiscoveredToExisting($discoveredId: ID!, $assetId: ID!) {
    mergeDiscoveredToExisting(discoveredId: $discoveredId, assetId: $assetId) { ${DISCOVERED_FIELDS} }
  }
`;
const ACCEPT_DISCOVERED = gql`
  mutation AcceptDiscoveredAsNew($discoveredId: ID!) {
    acceptDiscoveredAsNew(discoveredId: $discoveredId) { ${DISCOVERED_FIELDS} }
  }
`;
const REJECT_DISCOVERED = gql`
  mutation RejectDiscovered($discoveredId: ID!, $reason: String) {
    rejectDiscovered(discoveredId: $discoveredId, reason: $reason) { ${DISCOVERED_FIELDS} }
  }
`;

const UPLOAD_MANUAL = gql`
  mutation UploadManualScanReport($payloadJson: String!) {
    uploadManualScanReport(payloadJson: $payloadJson) {
      reportId itemsAccepted
    }
  }
`;

// ─── Queries ────────────────────────────────────────────────────────

export function useScanners() {
  const { result, loading, error, refetch } = useQuery<{ scanners: Scanner[] }>(
    SCANNERS_QUERY, null, { fetchPolicy: 'cache-and-network' },
  );
  const scanners = computed<Scanner[]>(() => result.value?.scanners ?? []);
  const active = computed(() => scanners.value.filter((s) => s.status === 'active'));
  const disabled = computed(() => scanners.value.filter((s) => s.status === 'disabled'));
  const expired = computed(() => scanners.value.filter((s) => s.status === 'expired'));
  return { scanners, active, disabled, expired, loading, error, refetch };
}

export function useScanReports(filter: () => { status?: ScanReportStatus | null }, limit = 50) {
  const { result, loading, error, refetch } = useQuery<{ scanReports: ScanReport[] }>(
    REPORTS_QUERY,
    () => ({ filter: filter(), limit }),
    { fetchPolicy: 'cache-and-network' },
  );
  const reports = computed<ScanReport[]>(() => result.value?.scanReports ?? []);
  return { reports, loading, error, refetch };
}

export function useDiscoveredAssets(reportId: () => string) {
  const { result, loading, error, refetch } = useQuery<{ discoveredAssetsForReport: DiscoveredAsset[] }>(
    DISCOVERED_QUERY,
    () => ({ reportId: reportId() }),
    () => ({ enabled: Boolean(reportId()), fetchPolicy: 'cache-and-network' }),
  );
  const items = computed<DiscoveredAsset[]>(() => result.value?.discoveredAssetsForReport ?? []);
  return { items, loading, error, refetch };
}

// ─── Mutations ──────────────────────────────────────────────────────

export interface CreateScannerInput {
  label: string;
  scope: string;
  expiresAt?: string | null;
}

export function useScannerMutations() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function create(input: CreateScannerInput): Promise<ScannerCreated | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ createScanner: ScannerCreated }>({
        mutation: CREATE_SCANNER, variables: { input },
        refetchQueries: [{ query: SCANNERS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.createScanner ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  async function rotate(id: string): Promise<ScannerCreated | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ rotateScannerToken: ScannerCreated }>({
        mutation: ROTATE_SCANNER, variables: { id },
        refetchQueries: [{ query: SCANNERS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.rotateScannerToken ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  async function disable(id: string): Promise<Scanner | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ disableScanner: Scanner }>({
        mutation: DISABLE_SCANNER, variables: { id },
        refetchQueries: [{ query: SCANNERS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.disableScanner ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  async function enable(id: string): Promise<Scanner | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ enableScanner: Scanner }>({
        mutation: ENABLE_SCANNER, variables: { id },
        refetchQueries: [{ query: SCANNERS_QUERY }],
        awaitRefetchQueries: true,
      });
      return r.data?.enableScanner ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  return { create, rotate, disable, enable, submitting, error };
}

export function useUploadManualScan() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function submit(payloadJson: string): Promise<{ reportId: string; itemsAccepted: number } | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ uploadManualScanReport: { reportId: string; itemsAccepted: number } }>({
        mutation: UPLOAD_MANUAL, variables: { payloadJson },
        refetchQueries: ['ScanReports'],
        awaitRefetchQueries: true,
      });
      return r.data?.uploadManualScanReport ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  return { submit, submitting, error };
}

export function useDiscoveredMutations() {
  const { client } = useApolloClient();
  const submitting = ref(false);
  const error = ref<Error | null>(null);

  async function merge(discoveredId: string, assetId: string): Promise<DiscoveredAsset | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ mergeDiscoveredToExisting: DiscoveredAsset }>({
        mutation: MERGE_DISCOVERED, variables: { discoveredId, assetId },
        refetchQueries: ['DiscoveredAssetsForReport', 'ScanReports'],
        awaitRefetchQueries: true,
      });
      return r.data?.mergeDiscoveredToExisting ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  async function accept(discoveredId: string): Promise<DiscoveredAsset | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ acceptDiscoveredAsNew: DiscoveredAsset }>({
        mutation: ACCEPT_DISCOVERED, variables: { discoveredId },
        refetchQueries: ['DiscoveredAssetsForReport', 'ScanReports', 'Assets'],
        awaitRefetchQueries: true,
      });
      return r.data?.acceptDiscoveredAsNew ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  async function reject(discoveredId: string, reason: string | null): Promise<DiscoveredAsset | null> {
    submitting.value = true; error.value = null;
    try {
      const r = await client.mutate<{ rejectDiscovered: DiscoveredAsset }>({
        mutation: REJECT_DISCOVERED, variables: { discoveredId, reason },
        refetchQueries: ['DiscoveredAssetsForReport', 'ScanReports'],
        awaitRefetchQueries: true,
      });
      return r.data?.rejectDiscovered ?? null;
    } catch (e) { error.value = e as Error; return null; }
    finally { submitting.value = false; }
  }

  return { merge, accept, reject, submitting, error };
}
