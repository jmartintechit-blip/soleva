-- What the engine tells the user, and the history it keeps so charts and returns never replay
-- years of ledger.

-- Information about the user's own plan, never advice. One open alert per thing (dedupe_key).
create table alert (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references "user" (id) on delete cascade,
  kind text not null check (kind in ('sin_saldo', 'plan_supera', 'fin_promocion', 'precio_viejo')),
  account_id text references money_account (id) on delete cascade,
  instrument_id text references instrument (id) on delete cascade,
  -- The day it is about (when the money runs out, when the promotion ends…).
  day date not null,
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  state text not null default 'abierta' check (state in ('abierta', 'vista', 'resuelta')),
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index alert_open on alert (user_id) where state <> 'resuelta';

-- Net worth at the end of each day, and what came in from outside it that day (an income is a
-- flow, a transfer between own accounts never is): "what you put in" vs "what your money made".
create table user_day (
  user_id text not null references "user" (id) on delete cascade,
  day date not null,
  total_cents bigint not null,
  flows_cents bigint not null,
  primary key (user_id, day)
);

-- Each account at the end of each month: the evolution charts, and the v0 closes after the
-- cut-over.
create table account_month (
  account_id text not null references money_account (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  value_cents bigint not null,
  flows_cents bigint not null,
  primary key (account_id, month)
);
