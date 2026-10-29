-- How each kind of product earns or costs money, for the daily engine.

-- Interest on an account's cash: accrued every day on that day's real balance, paid on its day.
create table interest_config (
  account_id text primary key references money_account (id) on delete cascade,
  base_days smallint not null default 365 check (base_days in (360, 365)),
  pay_frequency text not null default 'mensual'
    check (pay_frequency in ('mensual', 'trimestral', 'semestral', 'anual')),
  pay_day smallint not null default 31 check (pay_day between 1 and 31),
  -- After this day the promotional tiers end and after_rate_bp applies to the whole balance.
  promo_until date,
  after_rate_bp integer check (after_rate_bp between 0 and 10000),
  withholding_bp integer not null default 1900 check (withholding_bp between 0 and 10000),
  check ((promo_until is null) = (after_rate_bp is null))
);

-- Marginal tiers: rate_bp on the part of the balance up to up_to_cents (null = the rest).
create table interest_tier (
  account_id text not null references interest_config (account_id) on delete cascade,
  up_to_cents bigint check (up_to_cents between 1 and 99999999999),
  rate_bp integer not null check (rate_bp between 0 and 10000)
);
create unique index interest_tier_band on interest_tier (account_id, coalesce(up_to_cents, -1));

-- Dividends of a holding when no provider gives them: per unit, in the instrument's currency.
create table dividend_config (
  account_id text not null references money_account (id) on delete cascade,
  instrument_id text not null references instrument (id) deferrable initially deferred,
  per_unit_e8 bigint not null check (per_unit_e8 > 0),
  -- Months of the year it pays (5 and 11 → May and November), on pay_day.
  pay_months smallint[] not null check (array_length(pay_months, 1) between 1 and 12
    and 1 <= all (pay_months) and 12 >= all (pay_months)),
  pay_day smallint not null check (pay_day between 1 and 31),
  -- Withheld at source abroad, then in Spain: an estimate, never tax advice.
  withholding_origin_bp integer not null default 0 check (withholding_origin_bp between 0 and 10000),
  withholding_es_bp integer not null default 1900 check (withholding_es_bp between 0 and 10000),
  primary key (account_id, instrument_id)
);

-- Products without a public price (private markets, ELTIF): they grow at the user's rate and
-- are always shown as an estimate.
create table estimate_config (
  account_id text not null references money_account (id) on delete cascade,
  instrument_id text not null references instrument (id) deferrable initially deferred,
  annual_rate_bp integer not null check (annual_rate_bp between -10000 and 10000),
  primary key (account_id, instrument_id)
);

-- Official monthly reference rates (Banco de España); can be negative, as the Euribor was.
create table index_rate (
  index text not null check (index in ('euribor_12m')),
  month date not null check (extract(day from month) = 1),
  rate_bp integer not null check (rate_bp between -1000 and 3000),
  primary key (index, month)
);

-- Mortgages and loans, French system. The payment leaves payer_account_id: interest is an
-- expense, the principal paid lowers the debt.
create table debt (
  account_id text primary key references money_account (id) on delete cascade,
  principal_cents bigint not null check (principal_cents between 1 and 99999999999),
  start_on date not null,
  first_payment_on date not null check (first_payment_on > start_on),
  term_months smallint not null check (term_months between 1 and 600),
  rate_type text not null check (rate_type in ('fijo', 'variable')),
  -- fijo: the rate; variable: the rate until the first review.
  initial_rate_bp integer not null check (initial_rate_bp between 0 and 3000),
  index text check (index in ('euribor_12m')),
  spread_bp integer check (spread_bp between -1000 and 3000),
  review_months smallint check (review_months in (6, 12)),
  floor_bp integer check (floor_bp between 0 and 3000),
  payer_account_id text references money_account (id) on delete set null,
  check ((rate_type = 'variable') = (index is not null and spread_bp is not null
    and review_months is not null)),
  check (rate_type = 'variable' or floor_bp is null)
);
