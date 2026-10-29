-- One row per user, created on first save; until then the defaults of PROJECT_PLAN §4 apply.
create table settings (
  user_id text primary key references "user" (id) on delete cascade,
  prudent_bp integer not null default 300 check (prudent_bp between -5000 and 5000),
  base_bp integer not null default 600 check (base_bp between -5000 and 5000),
  optimistic_bp integer not null default 800 check (optimistic_bp between -5000 and 5000),
  inflation_bp integer not null default 250 check (inflation_bp between -2000 and 5000),
  -- The base trajectory fixed as "my plan", for the light: {"from": "YYYY-MM", "cents": [...]}.
  plan_baseline jsonb,
  updated_at timestamptz not null default now(),
  check (prudent_bp <= base_bp and base_bp <= optimistic_bp)
);
