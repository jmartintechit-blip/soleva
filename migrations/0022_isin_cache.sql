-- The ISIN each listing was found to have in ESMA's register (FIRDS answers in 1–3 s): asked once,
-- then read from here. Shared and public data, no user's.
create table isin_cache (
  symbol text primary key check (length(symbol) between 1 and 30),
  isin text not null check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  created_at timestamptz not null default now()
);
