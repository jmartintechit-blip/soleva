import type { Day } from '#lib/engine/day.ts';
import { parseEuros } from '#lib/engine/money.ts';
import { type AutoFrequency, perMonth } from '#lib/engine/schedule.ts';
import { MAX_CENTS } from './accounts.ts';
import { ruleAccounts } from './auto-rules.ts';
import type { Db } from './db/index.ts';
import { ensureInstrument } from './product.ts';

// Investment plans (b12/RPlan): several products bought with one account's cash, weekly,
// fortnightly or monthly; without enough cash, not bought (and an alert) or brought from another
// account. Soleva writes each buy down at that day's close: it never executes anything.

export const PLAN_FREQUENCIES = ['semanal', 'quincenal', 'mensual'] as const;
type Quote = Parameters<typeof ensureInstrument>[1];

export interface PlanLegInput {
  // A product already in a plan or held, or one picked from the search by its listing.
  instrumentId?: string;
  symbol?: string;
  amountCents: number;
}
export interface PlanInput {
  accountId: string;
  frequency: (typeof PLAN_FREQUENCIES)[number];
  // semanal: the weekday; mensual: the day of the month (31 = the last); quincenal: none.
  day: number | null;
  startOn: Day;
  shortfall: 'no_comprar' | 'otra_cuenta';
  shortfallAccountId: string | null;
  legs: PlanLegInput[];
}

// The first `weekday` (1 = Monday) on or after `from`.
export function nextWeekday(from: Day, weekday: number): Day {
  const d = new Date(`${from}T00:00:00Z`);
  const now = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() + ((weekday - now + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const LEG_ID = /^(sym:\S{1,30}|[\w-]{1,60})$/;

// RPlan's form: its account, how often and when, what to do without cash, and its products
// (leg_id: an instrument, or "sym:" and a listing; leg_amount: euros; leg_name: what it showed).
export function readPlanForm(form: FormData, today: Day) {
  const one = (k: string) => String(form.get(k) ?? '').trim();
  const values = {
    account: one('account'),
    frequency: one('frequency'),
    day: one('day'),
    shortfall: one('shortfall'),
    shortfallAccount: one('shortfall_account'),
    start: one('start'),
  };
  const ids = form.getAll('leg_id').map(String);
  const amounts = form.getAll('leg_amount').map((v) => String(v).trim());
  const names = form.getAll('leg_name').map(String);
  const legs = ids.map((id, i) => ({ id, name: names[i] ?? '', amount: amounts[i] ?? '' }));
  const errors: Record<string, string> = {};
  const frequency = PLAN_FREQUENCIES.find((f) => f === values.frequency);
  const n = Number(values.day);
  if (!frequency) errors.frequency = 'Elige cada cuánto';
  else if (!Number.isInteger(n) || n < 1 || n > (frequency === 'mensual' ? 31 : 7))
    errors.day = 'Elige el día';
  const shortfall = values.shortfall === 'otra_cuenta' ? 'otra_cuenta' : 'no_comprar';
  if (shortfall === 'otra_cuenta' && !values.shortfallAccount)
    errors.shortfall = 'Elige de qué cuenta';
  const parsed = legs.map((l) => ({ ...l, cents: parseEuros(l.amount) }));
  if (!legs.length) errors.legs = 'Añade al menos un producto';
  else if (legs.length > 50) errors.legs = 'Como mucho 50 productos';
  else if (parsed.some((l) => l.cents === null || l.cents <= 0 || l.cents > MAX_CENTS))
    errors.legs = 'Pon el importe de cada producto, por ejemplo 250';
  else if (parsed.some((l) => !LEG_ID.test(l.id))) errors.legs = 'Vuelve a elegir los productos';
  if (Object.keys(errors).length) return { ok: false as const, values, legs, errors };
  // A fortnightly plan counts from its first day: the chosen weekday, from today (or as it was).
  const keep = isDay(values.start) ? values.start : null;
  const startOn =
    frequency === 'quincenal'
      ? keep && nextWeekday(keep, n) === keep
        ? keep
        : nextWeekday(today, n)
      : (keep ?? today);
  return {
    ok: true as const,
    values,
    legs,
    input: {
      accountId: values.account,
      frequency: frequency!,
      day: frequency === 'quincenal' ? null : n,
      startOn,
      shortfall,
      shortfallAccountId: shortfall === 'otra_cuenta' ? values.shortfallAccount : null,
      legs: parsed.map((l) =>
        l.id.startsWith('sym:')
          ? { symbol: l.id.slice(4), amountCents: l.cents! }
          : { instrumentId: l.id, amountCents: l.cents! },
      ),
    } satisfies PlanInput,
  };
}

// What RPlan needs about the account a plan buys in: null unless it is a broker or crypto
// account the user can change. Also what comes into it a month by rules (for «faltan … al
// mes»), its cash today, and the user's other cash accounts to cover a shortfall.
export async function planContext(db: Db, userId: string, accountId: string) {
  const [account] = await db.query<{ id: string; name: string; cash: number }>(
    `select a.id, a.name,
            coalesce((select sum(m.amount_cents) from movement m
                      where m.account_id = a.id and m.voided_at is null), 0)::float8 as cash
     from money_account a join account_access x on x.account_id = a.id and x.user_id = $1
       and x.role in ('propietario', 'editor')
     where a.id = $2 and a.kind in ('broker', 'cripto', 'inversion')`,
    [userId, accountId],
  );
  if (!account) return null;
  const incomes = await db.query<{ frequency: AutoFrequency; cents: number }>(
    `select frequency, amount_cents::float8 as cents from auto_rule
     where user_id = $1 and to_account_id = $2 and active and kind in ('ingreso', 'transferencia')`,
    [userId, accountId],
  );
  const others = (await ruleAccounts(db, userId)).filter((a) => a.id !== accountId);
  return {
    account,
    monthlyIn: Math.round(incomes.reduce((s, r) => s + r.cents * perMonth(r.frequency), 0)),
    others,
  };
}

// A plan's products with their names, in order.
export async function planLegs(db: Db, ruleId: string) {
  return db.query<{ instrumentId: string; name: string; isin: string | null; cents: number }>(
    `select l.instrument_id as "instrumentId", i.name, i.isin, l.amount_cents::float8 as cents
     from auto_rule_leg l join instrument i on i.id = l.instrument_id
     where l.rule_id = $1 order by l.seq`,
    [ruleId],
  );
}

const refused = (error: unknown) => (error as { code?: string }).code === 'P0001';

// Saves a plan (new with `id` null) and its products, which replace the old ones: what it
// already bought stays. A listing picked from the search becomes a shared instrument (its price
// asked to the provider); 'sin_precio' when one cannot be priced now; null when the plan or an
// account is not the user's to change, or a product is not one they can use.
export async function savePlan(
  db: Db,
  userId: string,
  id: string | null,
  p: PlanInput,
  priced: (symbol: string) => Promise<Quote | null>,
): Promise<string | null | 'sin_precio'> {
  const context = await planContext(db, userId, p.accountId);
  if (!context) return null;
  const quotes = new Map<string, Quote>();
  for (const l of p.legs)
    if (l.symbol && !quotes.has(l.symbol)) {
      const q = await priced(l.symbol);
      if (!q) return 'sin_precio';
      quotes.set(l.symbol, q);
    }
  // Only shared instruments or the user's own.
  const known = [...new Set(p.legs.flatMap((l) => (l.instrumentId ? [l.instrumentId] : [])))];
  if (known.length) {
    const [{ n }] = await db.query<{ n: number }>(
      `select count(*)::int as n from instrument
       where id = any($1) and (owner_user_id is null or owner_user_id = $2)`,
      [known, userId],
    );
    if (n !== known.length) return null;
  }
  try {
    return await db.transaction(async (tx) => {
      const params = [
        `Plan en ${context.account.name}`.slice(0, 60),
        p.frequency,
        p.day,
        p.startOn,
        p.accountId,
        p.shortfall,
        p.shortfallAccountId,
      ];
      let ruleId = id;
      if (ruleId === null) {
        const [row] = await tx.query<{ id: string }>(
          `insert into auto_rule (user_id, kind, name, frequency, day, start_on, from_account_id,
             shortfall, shortfall_account_id)
           values ($1, 'plan', $2, $3, $4, $5, $6, $7, $8) returning id`,
          [userId, ...params],
        );
        ruleId = row!.id;
      } else {
        const rows = await tx.query(
          `update auto_rule set name = $3, frequency = $4, day = $5, start_on = $6,
             from_account_id = $7, shortfall = $8, shortfall_account_id = $9, updated_at = now()
           where id = $1 and user_id = $2 and kind = 'plan' returning 1`,
          [ruleId, userId, ...params],
        );
        if (!rows.length) return null;
        await tx.query(`delete from auto_rule_leg where rule_id = $1`, [ruleId]);
      }
      const instrumentIds: string[] = [];
      for (const l of p.legs)
        instrumentIds.push(l.instrumentId ?? (await ensureInstrument(tx, quotes.get(l.symbol!)!)));
      await tx.query(
        `insert into auto_rule_leg (rule_id, seq, instrument_id, amount_cents)
         select $1, s - 1, i, a from unnest($2::text[], $3::bigint[]) with ordinality as t(i, a, s)`,
        [ruleId, instrumentIds, p.legs.map((l) => l.amountCents)],
      );
      return ruleId;
    });
  } catch (error) {
    if (refused(error)) return null;
    throw error;
  }
}
