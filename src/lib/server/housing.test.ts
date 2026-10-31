import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import {
  importHousing,
  normalize,
  parseIndex,
  parseMunicipalM2,
  parseMunicipalities,
  parseProvinceM2,
  refreshHousingIndex,
} from './housing.ts';
import { readXls, readXlsx } from './sheets.ts';

const file = (name: string) => readFileSync(new URL(`./testdata/${name}`, import.meta.url));

describe('sheets', () => {
  it('reads every sheet of an .xls, accents and long strings included', () => {
    const sheets = readXls(file('valor-tasado.xls'));
    expect(sheets.map((s) => s.name)).toEqual(['T1A2026', 'T2A2026 ']);
    const rows = sheets[1]!.rows;
    expect(rows[17]).toEqual([null, 'Almería', 'Ejido (El)', 'n.r', null, 1371.6, null, 20]);
    expect(rows[18]![2]).toBe('Écija');
    expect(rows[21]![2]).toBe(`Ñandú ${'x'.repeat(300)}`);
  });

  it('reads the first sheet of an .xlsx, numbers and escaped text included', () => {
    const rows = readXlsx(file('municipios.xlsx'));
    expect(rows[1]).toEqual(['CODAUTO', 'CPRO', 'CMUN', 'DC', 'NOMBRE']);
    expect(rows[4]).toEqual(['04', 7, 40, 1, 'Palma']);
    expect(rows[6]![4]).toBe('Níjar & <Co>');
  });
});

const list = () => parseMunicipalities(readXlsx(file('municipios.xlsx')));

describe('housing data', () => {
  it('matches the Ministry’s names to INE’s codes, and fails on one it cannot', () => {
    expect(normalize('Ejido (El)')).toBe(normalize('Ejido, El'));
    expect(list()[2]).toEqual({ code: '07040', name: 'Palma', region: '04' });
    const sheets = readXls(file('valor-tasado.xls'));
    // The fixture's last name has no value: skipped, not unmatched.
    expect(parseMunicipalM2(sheets, list())).toEqual({
      quarter: '2026-04-01',
      rows: [
        { area: '04902', eurM2Cents: 137160 },
        { area: '41039', eurM2Cents: 123150 },
        { area: '07040', eurM2Cents: 400000 },
      ],
    });
    expect(() =>
      parseMunicipalM2(
        sheets,
        list().filter((m) => m.name !== 'Écija'),
      ),
    ).toThrow('unmatched Écija');
  });

  it('takes each province’s latest value, the one-province regions from their total', () => {
    const csv = `\uFEFFAño;Trimestre;Valor;Régimen;CPRO;Provincia;Comunidad_Autónoma;CODAUTO
2026;1;1400;Libre;41;Sevilla;Andalucía;1
2026;2;1450.5;Libre;41;Sevilla;Andalucía;1
2026;3;;Libre;41;Sevilla;Andalucía;1
2026;2;1200;Protegida;41;Sevilla;Andalucía;1
2026;2;4089.6;Libre;;Total CCAA;Madrid, Comunidad de;13
2026;2;1350.1;Libre;;Total CCAA;Murcia, Region de;
2026;2;2355;Libre;;Total CCAA;Total nacional;`;
    expect(parseProvinceM2(csv)).toEqual([
      { area: '41', quarter: '2026-04-01', eurM2Cents: 145050 },
      { area: '28', quarter: '2026-04-01', eurM2Cents: 408960 },
      { area: '30', quarter: '2026-04-01', eurM2Cents: 135010 },
    ]);
  });

  const ipv = [
    {
      Nombre: 'Andalucía. Vivienda segunda mano. Índice. ',
      MetaData: [{ Codigo: '01' }],
      Data: [
        { Anyo: 2026, T3_Periodo: 'T1', Valor: 108.09 },
        { Anyo: 2026, T3_Periodo: 'T2', Valor: 111.393 },
      ],
    },
    { Nombre: 'Andalucía. Vivienda nueva. Índice. ', MetaData: [{ Codigo: '01' }], Data: [] },
    { Nombre: 'Ceuta. Vivienda segunda mano. Índice. ', MetaData: [{ Codigo: '18' }], Data: [] },
    {
      Nombre: 'Nacional. Vivienda segunda mano. Índice. ',
      MetaData: [{ Codigo: '00' }],
      Data: [{ Anyo: 2026, T3_Periodo: 'T2', Valor: 111.682 }],
    },
  ];

  it('reads the second-hand index of each region', () => {
    expect(parseIndex(ipv)).toEqual([
      { region: '01', quarter: '2026-01-01', indexE3: 108090 },
      { region: '01', quarter: '2026-04-01', indexE3: 111393 },
      { region: '00', quarter: '2026-04-01', indexE3: 111682 },
    ]);
  });

  it('loads it all, again without duplicates, and the cron keeps the index current', async () => {
    const db = createPgliteDb();
    await migrate(db);
    const many = Array.from({ length: 8000 }, (_, i) => ({
      code: String(10000 + i),
      name: `Pueblo ${i}`,
      region: '01',
    }));
    const data = {
      municipalities: [...list(), ...many],
      municipal: parseMunicipalM2(readXls(file('valor-tasado.xls')), list()),
      provinces: [{ area: '41', quarter: '2026-04-01', eurM2Cents: 145050 }],
      index: parseIndex(ipv),
    };
    expect(await importHousing(db, data)).toEqual({
      municipalities: 8005,
      municipal: 3,
      provinces: 1,
      index: 3,
    });
    await importHousing(db, data);
    expect(
      await db.query(`select code, name, search, region from municipality where code = '04902'`),
    ).toEqual([{ code: '04902', name: 'Ejido, El', search: 'el ejido', region: '01' }]);
    expect(await db.query(`select count(*)::int as n from housing_m2`)).toEqual([{ n: 4 }]);
    // A revision of the last quarter replaces it.
    const revised = [{ ...ipv[3]!, Data: [{ Anyo: 2026, T3_Periodo: 'T2', Valor: 112 }] }];
    expect(await refreshHousingIndex(db, async () => Response.json(revised))).toBe(1);
    expect(await db.query(`select index_e3 from housing_index where region = '00'`)).toEqual([
      { index_e3: 112000 },
    ]);
    await expect(
      refreshHousingIndex(db, async () => new Response('', { status: 503 })),
    ).rejects.toThrow('ipv: 503');
    await expect(importHousing(db, { ...data, municipalities: list() })).rejects.toThrow('only 5');
    await db.close();
  });
});
