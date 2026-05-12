// H6 — On-demand OTX (AlienVault) lookup. Lazy query; caller triggers
// via lookup(value, kind). Results cached in-component, errors surface
// via toast. No DB persist v1 — transient enrichment.

import { ref } from 'vue';
import { useApolloClient } from '@vue/apollo-composable';
import gql from 'graphql-tag';

export const OTX_IOC_KINDS = ['ipv4', 'ipv6', 'domain', 'hostname', 'url', 'file_md5', 'file_sha1', 'file_sha256', 'cve'] as const;
export type OtxIocKind = (typeof OTX_IOC_KINDS)[number];

const OTX_LOOKUP = gql`
  query OtxLookup($value: String!, $kind: OtxIocKind!) {
    otxLookup(value: $value, kind: $kind) {
      queriedValue queriedKind pulseCount
      adversaries attackIds malwareFamilies tags
      pulses {
        id name description author modifiedAt
        tags attackIds adversary malwareFamilies
        targetedCountries industries references
      }
    }
  }
`;

export interface OtxPulse {
  id: string;
  name: string;
  description: string;
  author: string;
  modifiedAt: string | null;
  tags: string[];
  attackIds: string[];
  adversary: string;
  malwareFamilies: string[];
  targetedCountries: string[];
  industries: string[];
  references: string[];
}

export interface OtxLookupResult {
  queriedValue: string;
  queriedKind: OtxIocKind;
  pulseCount: number;
  adversaries: string[];
  attackIds: string[];
  malwareFamilies: string[];
  tags: string[];
  pulses: OtxPulse[];
}

export function useOtxLookup() {
  const { client } = useApolloClient();
  const result = ref<OtxLookupResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function lookup(value: string, kind: OtxIocKind): Promise<void> {
    if (!value) return;
    loading.value = true;
    error.value = null;
    try {
      const r = await client.query<{ otxLookup: OtxLookupResult }>({
        query: OTX_LOOKUP,
        variables: { value, kind },
        fetchPolicy: 'cache-first', // 24h within session is fine for OTX
      });
      result.value = r.data.otxLookup;
    } catch (e) {
      const msg = (e as Error).message || 'OTX lookup failed';
      error.value = msg.includes('OTX_API_KEY')
        ? 'OTX_API_KEY missing — set in backend .env'
        : msg;
      result.value = null;
    } finally {
      loading.value = false;
    }
  }

  function reset(): void {
    result.value = null;
    error.value = null;
  }

  return { result, loading, error, lookup, reset };
}
