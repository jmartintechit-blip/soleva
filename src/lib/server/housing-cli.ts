// Quarterly (after the Ministry publishes, mid-month after each quarter): loads INE's
// municipalities, the Ministry of Housing's values per m² and INE's whole housing price index.
//   npm run vivienda   (DATABASE_URL from .env; once for dev, once for main)
import { createNeonDb } from './db/index.ts';
import {
  SOURCES,
  importHousing,
  parseIndex,
  parseMunicipalM2,
  parseMunicipalities,
  parseProvinceM2,
} from './housing.ts';
import { readXls, readXlsx } from './sheets.ts';

async function get(url: string) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Usage: npm run vivienda, with DATABASE_URL set');
    process.exit(1);
  }
  // This year's list, or last year's until INE publishes it.
  const yy = new Date().getFullYear() % 100;
  const list = await get(SOURCES.municipalities.replace('{yy}', String(yy))).catch(() =>
    get(SOURCES.municipalities.replace('{yy}', String(yy - 1))),
  );
  const municipalities = parseMunicipalities(readXlsx(list));
  const [xls, csv, ipv] = await Promise.all([
    get(SOURCES.municipalM2),
    get(SOURCES.provinceM2),
    get(`${SOURCES.index}200`),
  ]);
  const db = createNeonDb(url);
  try {
    console.log(
      await importHousing(db, {
        municipalities,
        municipal: parseMunicipalM2(readXls(xls), municipalities),
        provinces: parseProvinceM2(new TextDecoder().decode(csv)),
        index: parseIndex(JSON.parse(new TextDecoder().decode(ipv))),
      }),
    );
  } finally {
    await db.close();
  }
}
