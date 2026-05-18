import type { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../logger.js';
import { ASSET_KINDS } from '../assets/types.js';
import {
  bumpScannerIngest, createScanReport, getScannerByTokenHash, hashToken,
} from './repo.js';
import { checkScannerRate } from './rate-limit.js';
import type { HelyxDiscoveryV1Payload } from './types.js';

// Inbound ingest endpoint — POST /api/v1/scanner/ingest
//
// Auth: Bearer token in Authorization header. Token = sha256-hashed
// at rest; we hash the inbound plaintext + look up :Scanner by hash.
//
// Validates:
//   - bearer present + scanner exists + status='active' + not expired
//   - body parses as HelyxDiscoveryV1Payload
//   - each item.kind is a valid AssetKind
//
// On success: 202 with {reportId, itemsAccepted}. Audit logged.

// z.enum needs a mutable string tuple; ASSET_KINDS is readonly. Cast at
// the schema boundary so zod is happy without spreading at every call.
const ASSET_KIND_VALUES = [...ASSET_KINDS] as [string, ...string[]];

const ItemSchema = z.object({
  kind: z.enum(ASSET_KIND_VALUES),
  name: z.string().trim().min(1).max(255),
  hostname: z.string().trim().max(255).optional(),
  ipAddresses: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
  parentName: z.string().trim().min(1).max(255).optional(),
});

const PayloadSchema = z.object({
  format: z.literal('helyx-discovery-v1'),
  items: z.array(ItemSchema).min(1).max(5000),
});

interface IngestErr {
  code: string;
  detail: string;
  status: number;
}

function err(code: string, detail: string, status: number): IngestErr {
  return { code, detail, status };
}

export async function scannerIngestHandler(req: Request, res: Response): Promise<void> {
  // Bearer token
  const auth = req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    res.status(401).json({ error: err('NO_BEARER', 'Authorization Bearer token required', 401) });
    return;
  }
  const token = (m[1] ?? '').trim();
  if (!token.startsWith('scn_') || token.length < 20) {
    res.status(401).json({ error: err('BAD_TOKEN_SHAPE', 'token must look like scn_<hex>', 401) });
    return;
  }

  const scanner = await getScannerByTokenHash(hashToken(token));
  if (!scanner) {
    res.status(401).json({ error: err('TOKEN_NOT_FOUND', 'token not registered', 401) });
    return;
  }
  if (scanner.status !== 'active') {
    res.status(403).json({ error: err('SCANNER_DISABLED', `scanner status: ${scanner.status}`, 403) });
    return;
  }
  if (scanner.expiresAt && new Date(scanner.expiresAt).getTime() < Date.now()) {
    res.status(403).json({ error: err('SCANNER_EXPIRED', `expired at ${scanner.expiresAt}`, 403) });
    return;
  }

  // Per-scanner throttle — bounds blast radius of a leaked token within
  // its lifetime. Degrades open: a Redis blip must not wedge ingestion
  // (token + active-scanner checks already gate this path).
  try {
    const rate = await checkScannerRate(scanner.id);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.resetSeconds));
      res.status(429).json({
        error: err(
          'RATE_LIMITED',
          `scanner over ${rate.limit}/window — retry in ${rate.resetSeconds}s`,
          429,
        ),
      });
      logger.warn(
        { scannerId: scanner.id, tenantId: scanner.tenantId, count: rate.count, limit: rate.limit },
        'scanner ingest rate-limited',
      );
      return;
    }
  } catch (e) {
    logger.warn({ err: String(e), scannerId: scanner.id }, 'scanner rate check failed — allowing (degrade-open)');
  }

  // Body parse
  const parsed = PayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: err('BAD_PAYLOAD', parsed.error.issues[0]?.message ?? 'invalid payload', 400),
      issues: parsed.error.issues.slice(0, 5),
    });
    return;
  }
  const payload: HelyxDiscoveryV1Payload = parsed.data;

  // Persist
  try {
    const result = await createScanReport(
      scanner.tenantId,
      scanner.id,
      'token',
      payload.format,
      payload,
      JSON.stringify(req.body),
    );
    await bumpScannerIngest(scanner.id);
    logger.info(
      {
        scannerId: scanner.id, tenantId: scanner.tenantId,
        reportId: result.reportId, items: result.itemsAccepted,
      },
      'scanner ingest accepted',
    );
    res.status(202).json({
      reportId: result.reportId,
      itemsAccepted: result.itemsAccepted,
      reviewUrl: `/admin/inventory-inbox/${result.reportId}`,
    });
  } catch (e) {
    const err = e as Error;
    logger.error({ err, scannerId: scanner.id }, 'scanner ingest persist failed');
    res.status(500).json({ error: { code: 'PERSIST_FAILED', detail: err.message, status: 500 } });
  }
}
