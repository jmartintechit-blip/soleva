-- The day's value by kind of asset ({liquidez: cents, …}), for Inicio's breakdown.
alter table user_day add column classes jsonb not null default '{}';
