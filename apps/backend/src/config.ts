import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function findEnvFile(start: string, maxDepth = 6): string | null {
  let dir = start;
  for (let i = 0; i < maxDepth; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const here = dirname(fileURLToPath(import.meta.url));
const envPath = findEnvFile(here);
if (envPath) loadDotenv({ path: envPath });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BACKEND_HOST: z.string().default('0.0.0.0'),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  NEO4J_URI: z.string().min(1),
  NEO4J_USER: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),
  NEO4J_DATABASE: z.string().default('neo4j'),
  NVD_API_KEY: z.string().optional(),
  // H6 — OTX (AlienVault) lookup-on-demand. Optional; resolver throws
  // an actionable error if missing. Get free key at otx.alienvault.com.
  OTX_API_KEY: z.string().optional(),
  OTX_BASE_URL: z.string().default('https://otx.alienvault.com/api/v1'),
  NVD_BASE_URL: z.string().default('https://services.nvd.nist.gov/rest/json/cves/2.0'),
  ELK_BASE_URL: z.string().default('http://elk.th'),
  ELK_USERNAME: z.string().optional(),
  ELK_PASSWORD: z.string().optional(),
  ELK_CVE_INDEX: z.string().default('list-cve'),
  ELK_SPIDERFOOT_INDEX: z.string().default('nasional_cve_new-*'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  COOKIE_SECURE: z.coerce.boolean().default(process.env.NODE_ENV === 'production'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().default(0),
  // F2 — separate secret tier for data-at-rest CTI signing key encryption.
  // 64 hex chars (32 bytes). Optional at config level; cti/sign/keypair.ts
  // throws a loud, actionable error at first signing attempt if missing,
  // so non-CTI code paths keep working in stripped-down dev envs.
  // Generate: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  CTI_SIGNING_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'CTI_SIGNING_MASTER_KEY must be 64 hex chars (32 bytes)').optional(),
  // Disable in-process node-cron scheduler. Set true when migrating jobs
  // to a separate runtime (Kubernetes CronJob, dedicated worker tier).
  // The CLI path `pnpm scheduler:run <name>` still works regardless.
  SCHEDULER_DISABLED: z.coerce.boolean().default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof schema>;
