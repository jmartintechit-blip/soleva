-- Monthly close reminder by email, on by default. Days 1–28 exist in every month.
alter table settings
  add column reminder_day smallint not null default 1 check (reminder_day between 1 and 28),
  add column reminder_enabled boolean not null default true,
  -- The month last reminded about, so a retried cron never sends twice.
  add column reminded_month date;
