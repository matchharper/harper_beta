alter table public.talent_setting
  add column if not exists get_internal_recommendation boolean;

alter table public.talent_setting
  add column if not exists get_external_recommendation boolean;

update public.talent_setting
set
  get_internal_recommendation = coalesce(get_internal_recommendation, true),
  get_external_recommendation = coalesce(get_external_recommendation, true)
where get_internal_recommendation is null
   or get_external_recommendation is null;

alter table public.talent_setting
  alter column get_internal_recommendation set default true,
  alter column get_external_recommendation set default true,
  alter column get_internal_recommendation set not null,
  alter column get_external_recommendation set not null;
