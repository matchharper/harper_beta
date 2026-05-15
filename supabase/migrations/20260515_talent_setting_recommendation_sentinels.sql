update public.talent_setting
set periodic_interval_days = greatest(2, least(coalesce(periodic_interval_days, 3), 7))
where periodic_interval_days <> -1
  and periodic_interval_days not between 2 and 7;

alter table public.talent_setting
  drop constraint if exists talent_setting_periodic_interval_check;

alter table public.talent_setting
  add constraint talent_setting_periodic_interval_check
  check (periodic_interval_days = -1 or periodic_interval_days between 2 and 7);

alter table public.talent_setting
  drop constraint if exists talent_setting_recommendation_batch_size_check;

alter table public.talent_setting
  add constraint talent_setting_recommendation_batch_size_check
  check (recommendation_batch_size = -1 or recommendation_batch_size between 1 and 20);

alter table public.talent_setting
  drop constraint if exists talent_setting_recommendation_mode_check;

alter table public.talent_setting
  add constraint talent_setting_recommendation_mode_check
  check (
    (
      periodic_interval_days = -1
      and recommendation_batch_size in (-1, 1)
    )
    or (
      periodic_interval_days between 2 and 7
      and recommendation_batch_size between 1 and 20
    )
  );
