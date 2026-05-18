import type { SektorRow, StakeholderInput } from './types.js';

// Bulk stakeholder onboarding from a pasted/uploaded CSV. Built for the
// national-inventory onboarding case (Ditjen Pajak / sektoral lists land
// as spreadsheets). Treated as UNTRUSTED input — every field is bounded
// + trimmed, sektor is resolved against the known master list (never
// free-text written through).
//
// Expected header (case-insensitive, order-free):
//   name        (required)
//   slug        (optional — derived from name if absent)
//   sektor      (optional — matched by slug OR name, case-insensitive)
//   city        (optional)
//   aliases     (optional — semicolon-separated)
//   notes       (optional)
//
// Anything else in the header is ignored. Rows missing `name` are an
// error (reported, not silently dropped). Sektor that doesn't resolve is
// an error too — better to reject than misfile a stakeholder.

export interface CsvParseError {
  line: number;
  reason: string;
}

export interface ParsedCsv {
  rows: StakeholderInput[];
  errors: CsvParseError[];
}

const MAX_ROWS = 5000;
const MAX_FIELD = 1000;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

// Minimal RFC4180-ish single-line field splitter: handles "quoted,fields"
// and "" escaped quotes. We split the doc into physical lines first; a
// quoted newline inside a field is not supported (pragmatic — sektoral
// spreadsheets don't do this, and it keeps the parser auditable).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function resolveSektorId(raw: string, sektors: SektorRow[]): string | null | undefined {
  const needle = raw.toLowerCase().trim();
  if (!needle) return null; // blank sektor column = no sektor (not an error)
  const hit = sektors.find(
    (s) => s.slug.toLowerCase() === needle || s.name.toLowerCase() === needle,
  );
  return hit ? hit.id : undefined; // undefined = unresolved (error)
}

export function parseStakeholderCsv(csv: string, sektors: SektorRow[]): ParsedCsv {
  const errors: CsvParseError[] = [];
  const rows: StakeholderInput[] = [];

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l)
    .filter((l, idx) => idx === 0 || l.trim().length > 0); // keep header even if it looks empty-ish

  if (lines.length < 2) {
    return { rows, errors: [{ line: 0, reason: 'CSV needs a header row + at least one data row' }] };
  }

  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iName = col('name');
  const iSlug = col('slug');
  const iSektor = col('sektor');
  const iCity = col('city');
  const iAliases = col('aliases');
  const iNotes = col('notes');

  if (iName === -1) {
    return { rows, errors: [{ line: 1, reason: "header must include a 'name' column" }] };
  }

  const seenSlugs = new Set<string>();
  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_ROWS) {
    errors.push({ line: 0, reason: `too many rows (${dataLines.length}) — cap is ${MAX_ROWS}` });
    return { rows, errors };
  }

  dataLines.forEach((line, idx) => {
    const lineNo = idx + 2; // 1-based, +1 for header
    if (!line.trim()) return;
    const cells = splitCsvLine(line);
    const at = (i: number) => (i >= 0 && i < cells.length ? cells[i]!.slice(0, MAX_FIELD) : '');

    const name = at(iName);
    if (!name) {
      errors.push({ line: lineNo, reason: 'missing name' });
      return;
    }

    const slug = (at(iSlug) || slugify(name)).toLowerCase();
    if (!slug) {
      errors.push({ line: lineNo, reason: `cannot derive slug from name "${name}"` });
      return;
    }
    if (seenSlugs.has(slug)) {
      errors.push({ line: lineNo, reason: `duplicate slug "${slug}" within file` });
      return;
    }

    let sektorId: string | undefined;
    if (iSektor !== -1) {
      const resolved = resolveSektorId(at(iSektor), sektors);
      if (resolved === undefined) {
        errors.push({ line: lineNo, reason: `unknown sektor "${at(iSektor)}"` });
        return;
      }
      sektorId = resolved ?? undefined;
    }

    const aliases = iAliases === -1
      ? []
      : at(iAliases).split(';').map((a) => a.trim()).filter(Boolean).slice(0, 50);

    seenSlugs.add(slug);
    rows.push({
      slug,
      name,
      aliases,
      city: iCity === -1 ? undefined : (at(iCity) || undefined),
      notes: iNotes === -1 ? undefined : (at(iNotes) || undefined),
      sektorId,
    });
  });

  return { rows, errors };
}
