-- Waiting list for the public web. Double opt-in: confirmed_at stays null until the email link
-- is used. Only a hash of the link token is stored.
create table waitlist (
  email text primary key check (email = lower(email) and length(email) <= 254),
  token_hash text not null unique,
  consent_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
