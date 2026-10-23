-- Where a person says they can relocate to (ISO alpha-2), read only from what
-- they wrote. Empty means unknown. An on-site Role's location condition lets a
-- person living outside the Role's country through only when this lists it.
alter table public.talent_location_facets
  add column if not exists relocation_countries text[] not null default '{}';
