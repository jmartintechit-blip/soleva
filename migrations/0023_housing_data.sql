-- Official, public data to value a home: no user's. Loaded by `npm run vivienda` (municipalities
-- and the Ministry's values) and kept up to date by the cron (INE's index).

-- Spain's municipalities on 1 January (INE): the code's first two digits are its province;
-- region is INE's code of its autonomous community (01 Andalucía … 19 Melilla).
create table municipality (
  code text primary key check (code ~ '^[0-9]{5}$'),
  name text not null check (length(name) between 1 and 100),
  -- Lowercase and without accents, for the search.
  search text not null,
  region text not null check (region ~ '^(0[1-9]|1[0-9])$')
);

-- Average appraised value of free housing, in € per m², from the Ministry of Housing: of a
-- municipality over 25.000 inhabitants (5 digits) or of a province (2), the latest quarter.
create table housing_m2 (
  area text primary key check (area ~ '^[0-9]{2}([0-9]{3})?$'),
  quarter date not null check (extract(day from quarter) = 1 and extract(month from quarter) in (1, 4, 7, 10)),
  eur_m2_cents integer not null check (eur_m2_cents > 0)
);

-- INE's housing price index, second-hand homes, per region ('00' Spain), base 2025 = 100, ×1000.
create table housing_index (
  region text not null check (region ~ '^[0-9]{2}$'),
  quarter date not null check (extract(day from quarter) = 1 and extract(month from quarter) in (1, 4, 7, 10)),
  index_e3 integer not null check (index_e3 > 0),
  primary key (region, quarter)
);
