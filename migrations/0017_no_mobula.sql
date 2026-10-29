-- Crypto is priced by Yahoo too (ETH-EUR): Mobula's free plan gives no API access. Its name leaves
-- the price source checks.
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as t, conname from pg_constraint
    where contype = 'c' and conrelid in ('instrument'::regclass, 'price'::regclass)
      and pg_get_constraintdef(oid) like '%mobula%'
  loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
  end loop;
end $$;
alter table instrument
  add constraint instrument_price_source_check
    check (price_source in ('yahoo', 'marketstack', 'manual')),
  add constraint instrument_source_id_check2
    check ((price_source in ('yahoo', 'marketstack')) = (source_id is not null));
alter table price
  add constraint price_source_check check (source in ('yahoo', 'marketstack', 'manual'));
