import type { Migration } from './types.js';

const SEKTOR_ROWS: Array<{ slug: string; name: string; displayOrder: number }> = [
  { slug: 'administrasi-pemerintahan', name: 'Administrasi Pemerintahan', displayOrder: 1 },
  { slug: 'esdm',                       name: 'ESDM',                       displayOrder: 2 },
  { slug: 'pendidikan',                 name: 'Pendidikan',                 displayOrder: 3 },
  { slug: 'transportasi',               name: 'Transportasi',               displayOrder: 4 },
  { slug: 'keuangan',                   name: 'Keuangan',                   displayOrder: 5 },
  { slug: 'pertahanan',                 name: 'Pertahanan',                 displayOrder: 6 },
  { slug: 'pariwisata',                 name: 'Pariwisata',                 displayOrder: 7 },
  { slug: 'tik',                        name: 'TIK',                        displayOrder: 8 },
  { slug: 'kesehatan',                  name: 'Kesehatan',                  displayOrder: 9 },
  { slug: 'energi',                     name: 'Energi',                     displayOrder: 10 },
  { slug: 'perdagangan',                name: 'Perdagangan',                displayOrder: 11 },
  { slug: 'pangan',                     name: 'Pangan',                     displayOrder: 12 },
  { slug: 'industri',                   name: 'Industri',                   displayOrder: 13 },
  { slug: 'logistik',                   name: 'Logistik',                   displayOrder: 14 },
  { slug: 'ormas',                      name: 'Ormas',                      displayOrder: 15 },
  { slug: 'media',                      name: 'Media',                      displayOrder: 16 },
  { slug: 'perseorangan',               name: 'Perseorangan',               displayOrder: 17 },
];

const upsertCypher = SEKTOR_ROWS.map(
  (r) => `MERGE (s:Sektor {slug: '${r.slug}'})
          ON CREATE SET s.id = randomUUID(), s.name = '${r.name}', s.displayOrder = ${r.displayOrder}, s.createdAt = datetime(), s.updatedAt = datetime()
          ON MATCH  SET s.name = '${r.name}', s.displayOrder = ${r.displayOrder}, s.updatedAt = datetime()`,
);

export const m012_seed_sektor: Migration = {
  id: '012_seed_sektor',
  description: 'Seed 17 canonical sektor rows (idempotent via MERGE on slug)',
  up: upsertCypher,
};
