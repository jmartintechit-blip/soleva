-- A broker never leaves cash below zero. When a plan's buy finds too little cash: 'no_comprar'
-- (the default) records it as not done, with no units, and an alert says so; 'otra_cuenta' brings
-- the money from the account the user chose, then buys.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as t, conname from pg_constraint
    where contype = 'c' and ((conrelid = 'movement'::regclass and pg_get_constraintdef(oid) like '%''split''%'
                              and pg_get_constraintdef(oid) like '%''apertura''%')
                          or (conrelid = 'alert'::regclass and pg_get_constraintdef(oid) like '%''precio_viejo''%'))
  loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
  end loop;
end $$;

alter table movement
  add constraint movement_kind_check check (kind in (
    'apertura', 'ingreso', 'gasto', 'transferencia', 'compra', 'venta', 'dividendo', 'interes',
    'comision', 'retencion', 'amortizacion', 'ajuste', 'traspaso_valores', 'split', 'no_ejecutada'
  )),
  -- A buy that did not happen: which product, nothing moved.
  add constraint movement_not_done_check check (kind <> 'no_ejecutada'
    or (instrument_id is not null and amount_cents = 0 and qty_e8 is null));

alter table alert
  add constraint alert_kind_check check (kind in (
    'sin_saldo', 'plan_supera', 'fin_promocion', 'precio_viejo', 'compra_no_ejecutada'
  ));

alter table auto_rule
  add column shortfall text not null default 'no_comprar'
    check (shortfall in ('no_comprar', 'otra_cuenta')),
  -- Deleting that account leaves the plan without it: then it does not buy (and says so).
  add column shortfall_account_id text references money_account (id) on delete set null,
  add constraint auto_rule_shortfall_account_check check (
    kind = 'plan' or (shortfall = 'no_comprar' and shortfall_account_id is null));

create or replace function auto_rule_access() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from unnest(array[new.from_account_id, new.to_account_id, new.shortfall_account_id]) as a(id)
    where a.id is not null and not exists (
      select 1 from account_access x
      where x.account_id = a.id and x.user_id = new.user_id and x.role in ('propietario', 'editor')
    )
  ) then
    raise exception 'rule % uses an account its user cannot change', new.id using errcode = 'P0001';
  end if;
  return new;
end $$;
