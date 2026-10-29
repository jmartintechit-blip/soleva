-- Month closes. A draft is free to change; once confirmed, a balance only changes through a
-- close_amendment, which leaves a trace (invariant c). Deleting the user still cascades.
create table month_close (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references "user" (id) on delete cascade,
  -- First day of the month.
  month date not null check (extract(day from month) = 1),
  status text not null default 'borrador' check (status in ('borrador', 'confirmado')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'confirmado') = (confirmed_at is not null)),
  unique (user_id, month),
  unique (id, user_id)
);

create table month_close_line (
  close_id text not null,
  user_id text not null,
  -- Deferred no action: an account with closes can't be deleted (archive it), but deleting
  -- the user removes both before the check runs at commit.
  account_id text not null,
  -- Kept from the account at close time, so editing the account never rewrites history.
  is_debt boolean not null,
  proposed_cents bigint not null check (proposed_cents between 0 and 99999999999),
  confirmed_cents bigint not null check (confirmed_cents between 0 and 99999999999),
  primary key (close_id, account_id),
  foreign key (close_id, user_id) references month_close (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references money_account (id, user_id)
    deferrable initially deferred
);

create table close_amendment (
  id text primary key default gen_random_uuid()::text,
  close_id text not null,
  account_id text not null,
  -- Filled by the trigger from the line, never trusted from the caller.
  previous_cents bigint not null,
  new_cents bigint not null check (new_cents between 0 and 99999999999),
  reason text not null check (length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  foreign key (close_id, account_id) references month_close_line (close_id, account_id) on delete cascade
);
create index close_amendment_line on close_amendment (close_id, account_id);

-- pg_trigger_depth() = 1 means a direct statement; deeper means a cascade (deleting the user).
create function month_close_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'confirmado' and (tg_op = 'UPDATE' or pg_trigger_depth() = 1) then
    raise exception 'month_close % is confirmed', old.id using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger month_close_guard before update or delete on month_close
  for each row execute function month_close_guard();

create function month_close_line_guard() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from month_close
    where id = case when tg_op = 'DELETE' then old.close_id else new.close_id end
      and status = 'confirmado'
  ) and (
    (tg_op = 'INSERT')
    or (tg_op = 'DELETE' and pg_trigger_depth() = 1)
    or (tg_op = 'UPDATE' and coalesce(current_setting('soleva.amending', true), '') <> 'on')
  ) then
    raise exception 'month_close_line of a confirmed close: use close_amendment' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger month_close_line_guard before insert or update or delete on month_close_line
  for each row execute function month_close_line_guard();

create function close_amendment_apply() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from month_close where id = new.close_id and status = 'confirmado') then
    raise exception 'only confirmed closes take amendments' using errcode = 'P0001';
  end if;
  select confirmed_cents into new.previous_cents from month_close_line
    where close_id = new.close_id and account_id = new.account_id;
  perform set_config('soleva.amending', 'on', true);
  update month_close_line set confirmed_cents = new.new_cents
    where close_id = new.close_id and account_id = new.account_id;
  perform set_config('soleva.amending', 'off', true);
  return new;
end $$;
create trigger close_amendment_apply before insert on close_amendment
  for each row execute function close_amendment_apply();

create function close_amendment_frozen() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() = 1 then
    raise exception 'amendments are append-only' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger close_amendment_frozen before update or delete on close_amendment
  for each row execute function close_amendment_frozen();

-- Net worth per confirmed month (invariant b); computed, never stored twice.
create view net_worth_monthly as
select c.user_id, c.month,
  coalesce(sum(l.confirmed_cents) filter (where not l.is_debt), 0) as assets_cents,
  coalesce(sum(l.confirmed_cents) filter (where l.is_debt), 0) as debts_cents,
  coalesce(sum(case when l.is_debt then -l.confirmed_cents else l.confirmed_cents end), 0) as net_cents
from month_close c
left join month_close_line l on l.close_id = c.id
where c.status = 'confirmado'
group by c.user_id, c.month;
