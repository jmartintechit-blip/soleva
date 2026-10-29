-- Rules that generate movements on their day (the v0 "rule" only proposed balances and goes at
-- the cut-over). A plan buys several products with the cash of one account.
create table auto_rule (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references "user" (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  kind text not null check (kind in ('transferencia', 'ingreso', 'gasto', 'plan')),
  frequency text not null check (
    frequency in ('semanal', 'quincenal', 'mensual', 'trimestral', 'anual', 'una_vez')
  ),
  -- semanal: ISO weekday (1 = Monday); mensual and longer: day of the month (31 = the last);
  -- quincenal and una_vez: none, they count from start_on.
  day smallint check (day between 1 and 31),
  start_on date not null,
  end_on date check (end_on >= start_on),
  from_account_id text references money_account (id) on delete cascade,
  to_account_id text references money_account (id) on delete cascade,
  -- Null for a plan: its legs carry the amounts.
  amount_cents bigint check (amount_cents between 1 and 99999999999),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (case frequency
    when 'semanal' then day between 1 and 7
    when 'quincenal' then day is null
    when 'una_vez' then day is null
    else day is not null end),
  check (case kind
    when 'transferencia' then from_account_id is not null and to_account_id is not null
      and from_account_id <> to_account_id and amount_cents is not null
    when 'ingreso' then from_account_id is null and to_account_id is not null and amount_cents is not null
    when 'gasto' then from_account_id is not null and to_account_id is null and amount_cents is not null
    else from_account_id is not null and to_account_id is null and amount_cents is null end)
);
create index auto_rule_user on auto_rule (user_id);
create index auto_rule_from on auto_rule (from_account_id);
create index auto_rule_to on auto_rule (to_account_id);

-- A rule may only use accounts its user can change (owner or editor), checked in the database.
create function auto_rule_access() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from unnest(array[new.from_account_id, new.to_account_id]) as a(id)
    where a.id is not null and not exists (
      select 1 from account_access x
      where x.account_id = a.id and x.user_id = new.user_id and x.role in ('propietario', 'editor')
    )
  ) then
    raise exception 'rule % uses an account its user cannot change', new.id using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger auto_rule_access before insert or update on auto_rule
  for each row execute function auto_rule_access();

create table auto_rule_leg (
  rule_id text not null references auto_rule (id) on delete cascade,
  seq smallint not null check (seq between 0 and 49),
  instrument_id text not null references instrument (id) deferrable initially deferred,
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  primary key (rule_id, seq),
  unique (rule_id, instrument_id)
);

-- What a rule generated stays: a rule with movements is paused, not deleted (its user going
-- still takes everything, hence deferred).
alter table movement add foreign key (rule_id) references auto_rule (id)
  deferrable initially deferred;
create index movement_rule on movement (rule_id) where rule_id is not null;
