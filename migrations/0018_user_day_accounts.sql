-- Each account's value and own flows that day ({account: [value_cents, flows_cents]}), so Inicio
-- shows what each account made in any period without replaying the ledger.
alter table user_day add column accounts jsonb not null default '{}';
