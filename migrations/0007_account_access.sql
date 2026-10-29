-- Who may see and use each money account. Today only its owner; sharing (v1) adds rows with
-- another role, so no query has to change. Every new repository reads accounts through here.
create table account_access (
  account_id text not null references money_account (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null check (role in ('propietario', 'editor', 'lector')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_access_user on account_access (user_id);
-- One owner per account: the user in money_account.user_id, whose deletion takes the account.
create unique index account_access_one_owner on account_access (account_id)
  where role = 'propietario';

insert into account_access (account_id, user_id, role)
  select id, user_id, 'propietario' from money_account;

create function money_account_owner() returns trigger language plpgsql as $$
begin
  insert into account_access (account_id, user_id, role) values (new.id, new.user_id, 'propietario');
  return new;
end $$;
create trigger money_account_owner after insert on money_account
  for each row execute function money_account_owner();

-- The ledger's account kinds join the v0 ones; the cut-over (B11) maps inversion → broker,
-- deuda → deuda_prestamo and otro → bien. Cash is in euros for the beta.
alter table money_account
  drop constraint money_account_kind_check,
  add constraint money_account_kind_check check (kind in (
    'efectivo', 'remunerada', 'inversion', 'pension', 'cripto', 'inmueble', 'vehiculo', 'otro',
    'deuda', 'broker', 'deuda_hipoteca', 'deuda_prestamo', 'bien', 'deposito', 'letra'
  )),
  add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column opened_on date;
