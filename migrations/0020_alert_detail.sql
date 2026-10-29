-- The user's own numbers behind an alert (what leaves and comes in a month, the rate after a
-- promotion…), so its text can say them.
alter table alert add column detail jsonb not null default '{}';
