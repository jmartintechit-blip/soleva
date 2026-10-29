// Yearly: loads Hacienda's new order of average car prices from its BOE PDF.
//   npm run hacienda -- <BOE PDF> <year>   (DATABASE_URL from .env; once for dev, once for main)
// Needs pdftotext (xpdf, comes with Git for Windows) for its -table mode: one model per line.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Db } from './db/index.ts';
import { createNeonDb } from './db/index.ts';
import { parseAnexoI, parseAnexoIV } from './hacienda.ts';

export async function importOrder(db: Db, text: string, year: number) {
  const models = parseAnexoI(text);
  const pct = parseAnexoIV(text);
  if (models.length === 0) throw new Error('Anexo I: no models read');
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.query<{ n: number }>(
      `select count(*)::int as n from vehicle_base where order_year = $1`,
      [year],
    );
    if (n > 0) throw new Error(`order ${year} is already loaded`);
    for (let i = 0; i < models.length; i += 5000) {
      const c = models.slice(i, i + 5000);
      await tx.query(
        `insert into vehicle_base (order_year, brand, model, period, fuel, cc, cylinders, kw, cvf, value_cents)
         select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::smallint[],
           $8::numeric[], $9::numeric[], $10::bigint[])`,
        [
          year,
          c.map((r) => r.brand),
          c.map((r) => r.model),
          c.map((r) => r.period),
          c.map((r) => r.fuel),
          c.map((r) => r.cc),
          c.map((r) => r.cylinders),
          c.map((r) => r.kw),
          c.map((r) => r.cvf),
          c.map((r) => r.valueCents),
        ],
      );
    }
    await tx.query(
      `insert into vehicle_depreciation (order_year, years_over, pct_bp)
       select $1, * from unnest($2::smallint[], $3::int[])`,
      [year, pct.map((p) => p.yearsOver), pct.map((p) => p.pctBp)],
    );
    return { models: models.length, percentages: pct.length };
  });
}

if (import.meta.main) {
  const [pdf, year] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!pdf || !/^\d{4}$/.test(year ?? '') || !url) {
    console.error('Usage: npm run hacienda -- <BOE PDF> <year>, with DATABASE_URL set');
    process.exit(1);
  }
  const { stdout } = await promisify(execFile)('pdftotext', ['-table', '-enc', 'UTF-8', pdf, '-'], {
    maxBuffer: 256 * 1024 * 1024,
  });
  const db = createNeonDb(url);
  try {
    console.log(await importOrder(db, stdout, Number(year)));
  } finally {
    await db.close();
  }
}
