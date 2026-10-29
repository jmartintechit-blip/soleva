-- The Banco de España publishes the Euribor with 3 decimals in % (3,247 % = 324,7 bp): one
-- decimal of a basis point keeps it exact.
alter table index_rate alter column rate_bp type numeric(7, 1);
