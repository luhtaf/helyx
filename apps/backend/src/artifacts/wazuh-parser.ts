import { z } from 'zod';

const WazuhAlert = z.object({
  rule: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    description: z.string().optional(),
    level: z.number().optional(),
  }).optional(),
  agent: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  '@timestamp': z.string().optional(),
  full_log: z.string().optional(),
  decoder: z.object({ name: z.string().optional() }).optional(),
}).passthrough();

export interface ParsedWazuhAlert {
  detectionHit: {
    ruleSource: 'WAZUH';
    ruleId: string;
    ruleName: string;
    firedAt: string;
    severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  logFinding: {
    logSource: string;
    timestamp: string;
    rawLine: string;
    observation: string;
  } | null;
}

export function parseWazuhAlert(json: string): ParsedWazuhAlert {
  const parsed = WazuhAlert.parse(JSON.parse(json));
  const level = parsed.rule?.level ?? 0;
  const severity: ParsedWazuhAlert['detectionHit']['severity'] =
    level >= 12 ? 'CRITICAL' :
    level >= 9  ? 'HIGH'     :
    level >= 6  ? 'MEDIUM'   :
    level >= 3  ? 'LOW'      :
                  'INFO';
  const firedAt = parsed['@timestamp'] ?? new Date().toISOString();
  return {
    detectionHit: {
      ruleSource: 'WAZUH',
      ruleId: parsed.rule?.id ?? 'unknown',
      ruleName: parsed.rule?.description ?? '(no description)',
      firedAt,
      severity,
    },
    logFinding: parsed.full_log ? {
      logSource: parsed.decoder?.name ?? 'wazuh',
      timestamp: firedAt,
      rawLine: parsed.full_log,
      observation: parsed.rule?.description ?? '(imported from Wazuh alert)',
    } : null,
  };
}
