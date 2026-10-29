import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { importOrder } from './hacienda-cli.ts';
import { parseAnexoI, parseAnexoIV } from './hacienda.ts';

// Lines as `pdftotext -table` gives them from BOE-A-2025-26357 (public text).
const TEXT = `                                                    ANEXO I
                                                    Marca: ABARTH
                            Modelo-Tipo                                                                               cv   Valor
124  1.4 Spider / TB Multiair 6V Aut.               2016        2021          1368  4        G        125   10,61     170  33.400
500  1.4 16v Monster Energy Yamaha E6D (2021)       2021                      1368  4        G        121   10,61     165  23.600
ABARTH 500 BEV SCORPIONISSIMA CABRIO        320  km  2023                            Elc      113   21,93  154  38.500
Núm. 308                                        Martes 23 de diciembre de 2025                              Sec. I.       Pág. 171583
                                                    Marca: ALPINE
A110 2P Coupe (2022-)                           2022               1798         4        G        185          252  50.000
                                                               ANEXO II
Not a car                                       2022               1798         4        G        185   10,00   252  1.000
                                                   ANEXO IV
                                              Años de uso        Porcentajes
                                     Hasta 1 año.                    100
                                     Más de 1 año, hasta 2.           84
                                     Más de 2 años, hasta 3.          67                                    Verificable en https://www.boe.es
                                           Más de 12 años.                     10
          ya matriculados, para autocaravanas, campers y vehículos vivienda:
                    Hasta 1 año                100
`;

describe('Hacienda order', () => {
  it('reads one model per line under its brand, electric ones without displacement', () => {
    expect(parseAnexoI(TEXT)).toEqual([
      {
        brand: 'ABARTH',
        model: '124 1.4 Spider / TB Multiair 6V Aut.',
        period: '2016-2021',
        fuel: 'G',
        cc: 1368,
        cylinders: 4,
        kw: 125,
        cvf: 10.61,
        valueCents: 3_340_000,
      },
      {
        brand: 'ABARTH',
        model: '500 1.4 16v Monster Energy Yamaha E6D (2021)',
        period: '2021-',
        fuel: 'G',
        cc: 1368,
        cylinders: 4,
        kw: 121,
        cvf: 10.61,
        valueCents: 2_360_000,
      },
      {
        brand: 'ABARTH',
        model: 'ABARTH 500 BEV SCORPIONISSIMA CABRIO 320 km',
        period: '2023-',
        fuel: 'Elc',
        cc: null,
        cylinders: null,
        kw: 113,
        cvf: 21.93,
        valueCents: 3_850_000,
      },
      {
        brand: 'ALPINE',
        model: 'A110 2P Coupe (2022-)',
        period: '2022-',
        fuel: 'G',
        cc: 1798,
        cylinders: 4,
        kw: 185,
        cvf: null,
        valueCents: 5_000_000,
      },
    ]);
  });

  it('reads the car table of Anexo IV, not the campers one, with the page margin in the way', () => {
    expect(parseAnexoIV(TEXT)).toEqual([
      { yearsOver: 0, pctBp: 10_000 },
      { yearsOver: 1, pctBp: 8_400 },
      { yearsOver: 2, pctBp: 6_700 },
      { yearsOver: 12, pctBp: 1_000 },
    ]);
  });
});

describe('importOrder', () => {
  let db: Db;
  beforeEach(async () => {
    db = createPgliteDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  it('stores a year once, models and percentages', async () => {
    expect(await importOrder(db, TEXT, 2026)).toEqual({ models: 4, percentages: 4 });
    await expect(importOrder(db, TEXT, 2026)).rejects.toThrow(/already/);
    expect(
      await db.query(
        `select brand, value_cents::float8 as v from vehicle_base where model like 'A110%'`,
      ),
    ).toEqual([{ brand: 'ALPINE', v: 5_000_000 }]);
    expect(await db.query(`select pct_bp from vehicle_depreciation where years_over = 12`)).toEqual(
      [{ pct_bp: 1000 }],
    );
  });
});
