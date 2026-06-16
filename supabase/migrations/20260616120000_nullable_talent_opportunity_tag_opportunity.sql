drop index if exists public.talent_opportunity_tag_unique_lower_idx;
drop index if exists public.talent_opportunity_tag_opportunity_idx;

alter table public.talent_opportunity_tag
  alter column opportunity_id drop not null;

create unique index if not exists talent_opportunity_tag_role_unique_lower_idx
  on public.talent_opportunity_tag (talent_id, opportunity_id, lower(btrim(tag)))
  where opportunity_id is not null;

create unique index if not exists talent_opportunity_tag_talent_unique_lower_idx
  on public.talent_opportunity_tag (talent_id, lower(btrim(tag)))
  where opportunity_id is null;

create index if not exists talent_opportunity_tag_opportunity_idx
  on public.talent_opportunity_tag (opportunity_id, updated_at desc)
  where opportunity_id is not null;
