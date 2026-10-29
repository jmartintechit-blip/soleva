-- What people hold and what it is worth. Quantities, prices and rates are integers scaled by
-- 10^8 (_e8): 8 decimals for crypto and fractional shares, and exact BigInt arithmetic.

-- Shared between users (one Yahoo listing, one row), except what a user creates for himself:
-- 'estimado' products (private markets, ELTIF) and manual ones no provider has.
create table instrument (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('etf', 'fondo', 'accion', 'etc', 'cripto', 'estimado')),
  name text not null check (length(name) between 1 and 120),
  isin text check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  ticker text check (length(ticker) between 1 and 20),
  -- Market identifier code of the exchange (XETR, XAMS…); null for crypto and funds.
  mic text check (mic ~ '^[A-Z0-9]{4}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  distribution text check (distribution in ('acumulacion', 'distribucion')),
  -- Who prices it and its symbol there; an 'estimado' has no public price, ever.
  price_source text check (price_source in ('yahoo', 'mobula', 'marketstack', 'manual')),
  source_id text check (length(source_id) between 1 and 60),
  owner_user_id text references "user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((kind = 'estimado') = (price_source is null)),
  check (kind <> 'estimado' or owner_user_id is not null),
  check ((price_source in ('yahoo', 'mobula', 'marketstack')) = (source_id is not null))
);
create unique index instrument_shared_source on instrument (price_source, source_id)
  where owner_user_id is null;
create index instrument_isin on instrument (isin);
create index instrument_owner on instrument (owner_user_id);

-- Daily close per instrument, in its own currency; one row per instrument and day for everyone.
create table price (
  instrument_id text not null references instrument (id) on delete cascade,
  day date not null,
  close_e8 bigint not null check (close_e8 > 0),
  source text not null check (source in ('yahoo', 'mobula', 'marketstack', 'manual')),
  fetched_at timestamptz not null default now(),
  primary key (instrument_id, day)
);

-- A user's own price when the provider has none or failed: it never changes anyone else's.
create table price_override (
  user_id text not null references "user" (id) on delete cascade,
  instrument_id text not null references instrument (id) on delete cascade,
  day date not null,
  close_e8 bigint not null check (close_e8 > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, instrument_id, day)
);

-- ECB reference rates: units of the currency per 1 euro (USD 1,0850 → 108500000).
create table fx_rate (
  currency text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'EUR'),
  day date not null,
  per_eur_e8 bigint not null check (per_eur_e8 > 0),
  primary key (currency, day)
);

-- Splits (and reverse splits): from that day, each old unit is ratio_num / ratio_den new ones.
create table corporate_action (
  id text primary key default gen_random_uuid()::text,
  instrument_id text not null references instrument (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('split')),
  ratio_num integer not null check (ratio_num > 0),
  ratio_den integer not null check (ratio_den > 0),
  unique (instrument_id, day, kind)
);
