-- A home or other property (b12/RInmueble): always an asset, valued by INE's housing price index
-- of its region from the date its value refers to. Where it is, never the address: municipality
-- and m². Its value is the ledger's: the opening and any later value by hand ('ajuste').
create table property (
  account_id text primary key references money_account (id) on delete cascade,
  kind text not null check (kind in ('habitual', 'segunda', 'alquiler', 'local', 'garaje', 'terreno')),
  municipality_code text not null references municipality (code),
  area_m2 integer not null check (area_m2 between 1 and 100000),
  purchase_year smallint check (purchase_year between 1900 and 2100),
  purchase_cents bigint check (purchase_cents between 1 and 99999999999),
  -- 'm2': m² × the Ministry's €/m² of the municipality (or its province); 'propio': the user's.
  value_method text not null check (value_method in ('m2', 'propio')),
  -- The day the opening value refers to: the Ministry's quarter, or the day the user gave it.
  value_on date not null,
  -- Yearly rise in the projection, chosen by the user; never last year's change.
  growth_bp integer not null default 200 check (growth_bp between -1000 and 2000),
  -- Its mortgage, if any: then «Tuyo de verdad» is the value minus what is owed.
  mortgage_account_id text references money_account (id) on delete set null
);
create index property_mortgage on property (mortgage_account_id);

-- The mortgage must be a debt its owner can change, like the property itself.
create function property_mortgage_access() returns trigger language plpgsql as $$
begin
  if new.mortgage_account_id is not null and not exists (
    select 1 from money_account d
    join account_access x on x.account_id = d.id and x.role in ('propietario', 'editor')
    join account_access y on y.user_id = x.user_id and y.account_id = new.account_id
      and y.role in ('propietario', 'editor')
    where d.id = new.mortgage_account_id and d.kind in ('deuda_hipoteca', 'deuda_prestamo')
  ) then
    raise exception 'property % links a debt its owner cannot change', new.account_id
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger property_mortgage_access before insert or update on property
  for each row execute function property_mortgage_access();
