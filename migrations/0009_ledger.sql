-- The ledger: every change of money or units in an account, one row each. Balances and positions
-- come from here. Append-only: a mistake is voided and entered again, so history (and FIFO for
-- taxes, v2) never changes behind anyone's back.
create table movement (
  id text primary key default gen_random_uuid()::text,
  account_id text not null references money_account (id) on delete cascade,
  day date not null,
  -- Order within the day: FIFO needs to know which buy came first.
  seq integer not null default 0 check (seq >= 0),
  kind text not null check (kind in (
    'apertura', 'ingreso', 'gasto', 'transferencia', 'compra', 'venta', 'dividendo', 'interes',
    'comision', 'retencion', 'amortizacion', 'ajuste', 'traspaso_valores', 'split'
  )),
  -- Effect on the account's cash, signed (a buy is negative, a dividend positive).
  amount_cents bigint not null default 0 check (abs(amount_cents) <= 99999999999),
  -- Units moved, signed, with the price and the euro rate of that day: each buy is a FIFO lot.
  -- Deferred: deleting a user removes her estimates and her movements in the same statement.
  instrument_id text references instrument (id) deferrable initially deferred,
  qty_e8 bigint check (qty_e8 <> 0),
  price_e8 bigint check (price_e8 > 0),
  fx_e8 bigint check (fx_e8 > 0),
  fee_cents bigint not null default 0 check (fee_cents between 0 and 99999999999),
  withholding_cents bigint not null default 0 check (withholding_cents between 0 and 99999999999),
  -- The two legs of a transfer (cash) or of a fund switch between accounts (units).
  transfer_id text,
  -- A fund switch keeps the tax cost: each incoming leg continues one lot of the origin.
  origin_movement_id text references movement (id) deferrable initially deferred,
  source text not null check (source in ('manual', 'regla', 'motor', 'cuadre', 'migracion')),
  rule_id text,
  -- What generated it (rule:day:leg, interes:account:period…): never twice.
  occurrence_key text check (length(occurrence_key) between 1 and 200),
  -- Bought before that day's close was published: repriced once, when it is.
  provisional boolean not null default false,
  voided_at timestamptz,
  replaces_id text references movement (id) deferrable initially deferred,
  note text check (length(note) <= 200),
  created_at timestamptz not null default now(),
  check (kind not in ('compra', 'venta', 'traspaso_valores', 'split')
    or (instrument_id is not null and qty_e8 is not null)),
  check (kind <> 'compra' or (qty_e8 > 0 and price_e8 is not null and amount_cents <= 0)),
  check (kind <> 'venta' or (qty_e8 < 0 and price_e8 is not null and amount_cents >= 0)),
  check (kind not in ('split', 'traspaso_valores') or amount_cents = 0),
  check (kind not in ('transferencia', 'traspaso_valores') or transfer_id is not null),
  check (origin_movement_id is null or kind = 'traspaso_valores'),
  check (not provisional or kind in ('compra', 'venta'))
);
create unique index movement_occurrence on movement (occurrence_key) where occurrence_key is not null;
create index movement_account_day on movement (account_id, day, seq);
create index movement_instrument on movement (instrument_id);
create index movement_transfer on movement (transfer_id) where transfer_id is not null;

-- Invariant a: a transfer never changes net worth. At commit, its live legs are exactly two, in
-- different accounts, and add up to zero (in cash, or in units for a fund switch).
create function movement_transfer_check() returns trigger language plpgsql as $$
declare
  t text := coalesce(new.transfer_id, old.transfer_id);
  legs int; accounts int; cash bigint; units numeric;
begin
  select count(*), count(distinct account_id), coalesce(sum(amount_cents), 0),
         coalesce(sum(qty_e8), 0)
    into legs, accounts, cash, units
    from movement where transfer_id = t and voided_at is null;
  if legs not in (0, 2) or (legs = 2 and (accounts <> 2 or cash <> 0 or units <> 0)) then
    raise exception 'transfer % does not balance', t using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger movement_transfer_check after insert or update on movement
  deferrable initially deferred for each row when (new.transfer_id is not null)
  execute function movement_transfer_check();

-- Append-only. Allowed: voiding once, and repricing a provisional buy or sale once its close is
-- out. Deleting only comes from deleting the account or the user (a cascade).
create function movement_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise exception 'movements are append-only: void it' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.voided_at is not null then
    raise exception 'movement % is voided', old.id using errcode = 'P0001';
  end if;
  if (new.id, new.account_id, new.day, new.seq, new.kind, new.instrument_id, new.qty_e8,
      new.fee_cents, new.withholding_cents, new.transfer_id, new.origin_movement_id, new.source,
      new.rule_id, new.occurrence_key, new.replaces_id, new.note, new.created_at)
     is distinct from
     (old.id, old.account_id, old.day, old.seq, old.kind, old.instrument_id, old.qty_e8,
      old.fee_cents, old.withholding_cents, old.transfer_id, old.origin_movement_id, old.source,
      old.rule_id, old.occurrence_key, old.replaces_id, old.note, old.created_at)
     or ((new.price_e8, new.fx_e8, new.amount_cents, new.provisional)
         is distinct from (old.price_e8, old.fx_e8, old.amount_cents, old.provisional)
         and not old.provisional)
     or (new.provisional and not old.provisional) then
    raise exception 'movements are append-only: void it and enter it again' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger movement_guard before update or delete on movement
  for each row execute function movement_guard();

-- Cache of what each account holds, rebuilt from the ledger whenever in doubt.
create table position (
  account_id text not null references money_account (id) on delete cascade,
  instrument_id text not null references instrument (id) deferrable initially deferred,
  qty_e8 bigint not null check (qty_e8 >= 0),
  -- What the units still held cost, in euros (average cost; FIFO comes from the ledger).
  cost_cents bigint not null check (cost_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, instrument_id)
);
create index position_instrument on position (instrument_id);

-- The daily engine's watermark: every day up to here is generated for this user.
create table engine_state (
  user_id text primary key references "user" (id) on delete cascade,
  processed_through date not null,
  updated_at timestamptz not null default now()
);
