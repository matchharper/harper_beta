alter table public.talent_setting
  add column if not exists setting_locale text;

update public.talent_setting
set setting_locale = preferred_locale
where setting_locale is null;

insert into public.talent_setting (
  user_id,
  setting_locale,
  preferred_locale
)
select
  tu.user_id,
  'ko',
  'ko'
from public.talent_users as tu
left join public.talent_setting as ts
  on ts.user_id = tu.user_id
where ts.user_id is null
on conflict (user_id) do nothing;

do $$
begin
  alter table public.talent_setting
    add constraint talent_setting_preferred_locale_check
    check (preferred_locale in ('ko', 'en'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.talent_setting
    add constraint talent_setting_setting_locale_check
    check (setting_locale is null or setting_locale in ('ko', 'en'));
exception
  when duplicate_object then null;
end $$;

update public.talent_setting as ts
set preferred_locale = case
  when coalesce(tu.location, '') ilike any (array['%Korea%', '%대한민국%', '%한국%'])
    or coalesce(tu.current_location, '') ilike any (array['%Korea%', '%대한민국%', '%한국%'])
    then 'ko'
  else coalesce(ts.setting_locale, ts.preferred_locale, 'ko')
end
from public.talent_users as tu
where tu.user_id = ts.user_id;
