// Common shapes for rule generators.
//
// Inputs come from a Hunt's IOC/Artifact set OR direct ad-hoc selection.
// Each generator returns a list of GeneratedRule + a stats summary so the
// caller can persist them as :DetectionRule nodes.

export interface RuleSeed {
  // Categorized inputs the generators consume. Generators only use the
  // fields they care about; pass everything available.
  fileHashes: Array<{ md5?: string | null; sha1?: string | null; sha256?: string | null; filename?: string | null; behavior?: string[] }>;
  ips: Array<{ value: string; direction?: string | null }>;
  domains: Array<{ value: string }>;
  urls: Array<{ value: string }>;
  processes: Array<{ name: string; commandLine?: string | null; parentName?: string | null }>;
  registries: Array<{ hive: string; keyPath: string; valueName?: string | null }>;
  techniqueIds: string[];     // MITRE T-codes (T1059, T1486, ...)
}

export interface GeneratedRule {
  kind: 'YARA' | 'SURICATA' | 'SIGMA';
  name: string;
  description: string;
  content: string;
  tags: string[];
  // Provenance — the artifact id(s) this rule was derived from.
  derivedFromArtifactIds: string[];
  // MITRE technique IDs this rule covers.
  detectsTechniqueIds: string[];
}

export interface GenerateStats {
  yaraCount: number;
  suricataCount: number;
  sigmaCount: number;
  skipped: { reason: string; count: number }[];
}
