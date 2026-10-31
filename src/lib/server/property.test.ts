import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAccount } from './alta.ts';
import type { Db } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { createPgliteDb } from './db/pglite.ts';
import { runUser } from './engine-run.ts';
import { createProperty, m2Of, searchMunicipalities } from './property.ts';

let db: Db;
beforeEach(async () => {
  db = createPgliteDb();
  await migrate(db);
  for (const id of ['ana', 'eva'])
    await db.query(
      `insert into "user" (id, name, email, "emailVerified") values ($1, '', $2, true)`,
      [id, `${id}@x.es`],
    );
  await db.query(`insert into municipality values
    ('41039', 'Écija', 'ecija', '01'), ('41091', 'Sevilla', 'sevilla', '01'),
    ('41004', 'Alanís', 'alanis', '01'), ('51001', 'Ceuta', 'ceuta', '18'),
    ('49001', 'Abezames', 'abezames', '07')`);
  await db.query(`insert into housing_m2 values
    ('41039', '2026-04-01', 123150), ('41', '2026-04-01', 145050), ('51001', '2026-04-01', 221490)`);
  await db.query(`insert into housing_index values
    ('01', '2026-01-01', 108090), ('01', '2026-04-01', 111393), ('01', '2026-07-01', 114000),
    ('00', '2026-04-01', 111682), ('00', '2026-07-01', 113916)`);
});
afterEach(() => db.close());

const home = {
  name: 'Piso de Écija',
  kind: 'habitual' as const,
  municipalityCode: '41039',
  areaM2: 90,
  method: 'm2' as const,
  growthBp: 200,
};

describe('property', () => {
  it('finds municipalities by part of their name, without accents, those that start first', async () => {
    expect(await searchMunicipalities(db, 'ECI')).toEqual([
      { code: '41039', name: 'Écija', province: 'Sevilla' },
    ]);
    expect((await searchMunicipalities(db, 'la')).map((p) => p.name)).toEqual([
      'Alanís',
      'Sevilla',
    ]);
    expect(await searchMunicipalities(db, 'a')).toEqual([]);
  });

  it('gives the municipality’s €/m², else its province’s, brought to the latest index', async () => {
    expect(await m2Of(db, '41039')).toEqual({
      place: { code: '41039', name: 'Écija', province: 'Sevilla' },
      area: 'municipio',
      eurM2Cents: 123150,
      quarter: '2026-04-01',
      // × 114 / 111,393.
      todayEurM2Cents: 126032,
      region: '01',
    });
    expect(await m2Of(db, '41004')).toMatchObject({ area: 'provincia', eurM2Cents: 145050 });
    // Ceuta has no index of its own: Spain's.
    expect((await m2Of(db, '51001'))!.todayEurM2Cents).toBe(Math.round((221490 * 113916) / 111682));
    expect(await m2Of(db, '49001')).toBeNull();
    expect(await m2Of(db, '99999')).toBeNull();
  });

  it('opens at m² × €/m² from the Ministry’s quarter, and the engine indexes it from there', async () => {
    await db.query(
      `insert into engine_state (user_id, processed_through) values ('ana', '2026-11-01')`,
    );
    const id = (await createProperty(db, 'ana', '2026-11-01', home)) as string;
    expect(
      await db.query(
        `select a.kind, p.value_method, p.value_on::text, m.kind as mv, m.amount_cents::int as cents
         from money_account a join property p on p.account_id = a.id
         join movement m on m.account_id = a.id where a.id = $1`,
        [id],
      ),
    ).toEqual([
      {
        kind: 'inmueble',
        value_method: 'm2',
        value_on: '2026-04-01',
        mv: 'apertura',
        cents: 11_083_500,
      },
    ]);
    await runUser(db, 'ana', '2026-11-02');
    const [day] = await db.query<{ total: string; classes: Record<string, number> }>(
      `select total_cents::text as total, classes from user_day where user_id = 'ana' and day = '2026-11-02'`,
    );
    expect(day!.total).toBe('11342894');
    expect(day!.classes.inmuebles).toBe(11_342_894);
  });

  it('takes the user’s own value from today; no figure means no m² value', async () => {
    const id = await createProperty(db, 'ana', '2026-11-01', {
      ...home,
      method: 'propio',
      ownCents: 11_500_000,
      purchaseYear: 2018,
      purchaseCents: 9_800_000,
    });
    expect(
      await db.query(`select value_on::text, purchase_year from property where account_id = $1`, [
        id,
      ]),
    ).toEqual([{ value_on: '2026-11-01', purchase_year: 2018 }]);
    expect(
      await createProperty(db, 'ana', '2026-11-01', { ...home, municipalityCode: '49001' }),
    ).toBe('sin_dato');
  });

  it('links only a debt of the same user', async () => {
    const mine = await openAccount(db, 'ana', '2026-11-01', {
      name: 'Hipoteca',
      kind: 'deuda_hipoteca',
      cents: 6_240_000,
    });
    const hers = await openAccount(db, 'eva', '2026-11-01', {
      name: 'Hipoteca',
      kind: 'deuda_hipoteca',
      cents: 100,
    });
    const bank = await openAccount(db, 'ana', '2026-11-01', {
      name: 'Banco',
      kind: 'efectivo',
      cents: 100,
    });
    expect(
      await createProperty(db, 'ana', '2026-11-01', { ...home, mortgageAccountId: mine }),
    ).toBeTruthy();
    expect(
      await createProperty(db, 'ana', '2026-11-01', { ...home, mortgageAccountId: hers }),
    ).toBeNull();
    expect(
      await createProperty(db, 'ana', '2026-11-01', { ...home, mortgageAccountId: bank }),
    ).toBeNull();
    // Nothing half-made of the refused ones.
    expect(await db.query(`select count(*)::int as n from property`)).toEqual([{ n: 1 }]);
    expect(
      await db.query(`select count(*)::int as n from money_account where kind = 'inmueble'`),
    ).toEqual([{ n: 1 }]);
  });
});
