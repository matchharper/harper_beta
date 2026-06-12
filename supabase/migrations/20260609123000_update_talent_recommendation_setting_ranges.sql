update talent_setting
set periodic_interval_days = greatest(1, least(coalesce(periodic_interval_days, 3), 7))
where periodic_interval_days not between 1 and 7;

update talent_setting
set recommendation_batch_size = greatest(3, least(coalesce(recommendation_batch_size, 3), 10))
where recommendation_batch_size not between 3 and 10;

alter table talent_setting
  drop constraint if exists talent_setting_periodic_interval_days_check;

alter table talent_setting
  add constraint talent_setting_periodic_interval_days_check
  check (periodic_interval_days between 1 and 7);

alter table talent_setting
  drop constraint if exists talent_setting_recommendation_batch_size_check;

alter table talent_setting
  add constraint talent_setting_recommendation_batch_size_check
  check (recommendation_batch_size between 3 and 10);

alter table talent_setting
  drop constraint if exists talent_setting_periodic_sentinel_pair_check;
