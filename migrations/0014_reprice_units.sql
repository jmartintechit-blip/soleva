-- A plan spends a fixed amount: repricing a provisional buy at the day's real close changes its
-- units too, so qty_e8 joins what a provisional movement may change, once.
create or replace function movement_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise exception 'movements are append-only: void it' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.voided_at is not null then
    raise exception 'movement % is voided', old.id using errcode = 'P0001';
  end if;
  if (new.id, new.account_id, new.day, new.seq, new.kind, new.instrument_id,
      new.fee_cents, new.withholding_cents, new.transfer_id, new.origin_movement_id, new.source,
      new.rule_id, new.occurrence_key, new.replaces_id, new.note, new.created_at)
     is distinct from
     (old.id, old.account_id, old.day, old.seq, old.kind, old.instrument_id,
      old.fee_cents, old.withholding_cents, old.transfer_id, old.origin_movement_id, old.source,
      old.rule_id, old.occurrence_key, old.replaces_id, old.note, old.created_at)
     or ((new.qty_e8, new.price_e8, new.fx_e8, new.amount_cents, new.provisional)
         is distinct from (old.qty_e8, old.price_e8, old.fx_e8, old.amount_cents, old.provisional)
         and not old.provisional)
     or (new.provisional and not old.provisional) then
    raise exception 'movements are append-only: void it and enter it again' using errcode = 'P0001';
  end if;
  return new;
end $$;
