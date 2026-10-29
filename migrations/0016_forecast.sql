-- The cash forecast of the last run (see Forecast in src/lib/engine/insight.ts): while nothing
-- it depends on changes, the next run only simulates the new days of its horizon.
alter table engine_state add column forecast jsonb;
