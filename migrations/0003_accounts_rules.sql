-- The user's money accounts and rules. "account" is taken by Better Auth (sign-in providers).
-- Amounts are cents (max 999.999.999,99 €), rates basis points. Text ids, so any id in a URL
-- just finds nothing (404) instead of failing a uuid cast.
create table money_account (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references "user" (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  kind text not null check (
    kind in ('efectivo', 'remunerada', 'inversion', 'pension', 'cripto', 'inmueble', 'vehiculo', 'otro', 'deuda')
  ),
  -- What it is worth, or what is owed for a 'deuda'.
  balance_cents bigint not null check (balance_cents between 0 and 99999999999),
  is_estimated boolean not null default false,
  -- Signed: negative is depreciation (cars, −1500 by default).
  annual_rate_bp integer not null default 0 check (annual_rate_bp between -10000 and 10000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index money_account_user on money_account (user_id);

create table rule (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references "user" (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  type text not null check (type in ('entra', 'sale', 'mueve')),
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  frequency text not null check (frequency in ('mensual', 'trimestral', 'anual', 'una_vez')),
  day smallint not null check (day between 1 and 31),
  -- First day of the month.
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1 and end_month >= start_month),
  from_account_id text,
  to_account_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (type = 'entra' and from_account_id is null and to_account_id is not null)
    or (type = 'sale' and from_account_id is not null and to_account_id is null)
    or (type = 'mueve' and from_account_id is not null and to_account_id is not null
        and from_account_id <> to_account_id)
  ),
  -- Composite keys: a rule can only point at accounts of its own user.
  foreign key (from_account_id, user_id) references money_account (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references money_account (id, user_id) on delete cascade
);
create index rule_user on rule (user_id);
