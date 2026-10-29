-- Things worth less every year: cars by Hacienda's tables, other goods by a curve per kind.

-- Anexo I of each yearly order (Orden HAC/1501/2025 for 2026): one row per model as published.
create table vehicle_base (
  id text primary key default gen_random_uuid()::text,
  order_year smallint not null check (order_year between 2020 and 2100),
  brand text not null check (length(brand) between 1 and 60),
  model text not null check (length(model) between 1 and 120),
  period text check (length(period) <= 20),
  fuel text check (length(fuel) <= 10),
  cc integer check (cc >= 0),
  cylinders smallint check (cylinders >= 0),
  kw numeric(7, 2) check (kw >= 0),
  cvf numeric(7, 2) check (cvf >= 0),
  value_cents bigint not null check (value_cents between 1 and 99999999999)
);
create index vehicle_base_search on vehicle_base (order_year, brand, model);

-- Anexo IV: what is left of the Anexo I value after so many whole years of use (0 = under one).
create table vehicle_depreciation (
  order_year smallint not null,
  years_over smallint not null check (years_over between 0 and 99),
  pct_bp integer not null check (pct_bp between 0 and 10000),
  primary key (order_year, years_over)
);

-- A car account: its model in the table, when it was first registered, and the user's own value,
-- which wins when set.
create table vehicle (
  account_id text primary key references money_account (id) on delete cascade,
  vehicle_base_id text references vehicle_base (id) on delete set null,
  first_registration date not null,
  override_cents bigint check (override_cents between 0 and 99999999999)
);

-- What is left of the purchase price after n years, per kind of good. Defaults, not facts:
-- the user can always revalue by hand (an 'ajuste' movement).
create table asset_curve (
  category text not null check (category in ('electronica', 'moto', 'mobiliario', 'joyas', 'otro')),
  years smallint not null check (years between 1 and 99),
  pct_bp integer not null check (pct_bp between 0 and 100000),
  primary key (category, years)
);
-- The last row of each kind holds from then on.
insert into asset_curve (category, years, pct_bp) values
  ('electronica', 1, 7000), ('electronica', 2, 5000), ('electronica', 3, 3500),
  ('electronica', 4, 2500), ('electronica', 5, 1500),
  ('moto', 1, 8500), ('moto', 2, 7200), ('moto', 3, 6200), ('moto', 4, 5400), ('moto', 5, 4700),
  ('moto', 6, 4100), ('moto', 7, 3600), ('moto', 8, 3200), ('moto', 9, 2800), ('moto', 10, 2500),
  ('mobiliario', 1, 8000), ('mobiliario', 2, 6500), ('mobiliario', 3, 5200),
  ('mobiliario', 4, 4200), ('mobiliario', 5, 3400), ('mobiliario', 6, 2500),
  ('joyas', 1, 10000),
  ('otro', 1, 8500), ('otro', 2, 7200), ('otro', 3, 6100), ('otro', 4, 5200), ('otro', 5, 4400),
  ('otro', 6, 4000);

create table asset (
  account_id text primary key references money_account (id) on delete cascade,
  category text not null check (category in ('electronica', 'moto', 'mobiliario', 'joyas', 'otro')),
  purchase_cents bigint not null check (purchase_cents between 1 and 99999999999),
  purchased_on date not null
);
