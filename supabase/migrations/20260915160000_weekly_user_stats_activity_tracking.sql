begin;

create index if not exists logs_type_user_created_idx
  on public.logs (type, user_id, created_at);

create unique index if not exists logs_test_fixture_talent_marker_uidx
  on public.logs (user_id)
  where type = 'analytics_excluded_test_fixture_talent'
    and user_id is not null;

create or replace function public.mark_weekly_stats_test_fixture_talents_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.information ->> 'testOnly', 'false') <> 'true'
     or jsonb_typeof(new.information -> 'testTalentIds') <> 'array' then
    return new;
  end if;

  insert into public.logs (type, user_id, meta_data)
  select
    'analytics_excluded_test_fixture_talent',
    fixture.talent_id::uuid,
    jsonb_build_object(
      'source', 'company_roles.information.testTalentIds',
      'roleId', new.role_id
    )
  from jsonb_array_elements_text(new.information -> 'testTalentIds')
    as fixture(talent_id)
  where nullif(btrim(fixture.talent_id), '') is not null
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists company_roles_mark_weekly_stats_test_fixture_talents
  on public.company_roles;
create trigger company_roles_mark_weekly_stats_test_fixture_talents
after insert or update of information on public.company_roles
for each row
execute function public.mark_weekly_stats_test_fixture_talents_v1();

insert into public.logs (type, user_id, meta_data)
select distinct
  'analytics_excluded_test_fixture_talent',
  fixture.talent_id::uuid,
  jsonb_build_object(
    'source', 'company_roles.information.testTalentIds_backfill',
    'roleId', role.role_id
  )
from public.company_roles role
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(role.information -> 'testTalentIds') = 'array'
      then role.information -> 'testTalentIds'
    else '[]'::jsonb
  end
)
  as fixture(talent_id)
where coalesce(role.information ->> 'testOnly', 'false') = 'true'
  and jsonb_typeof(role.information -> 'testTalentIds') = 'array'
  and nullif(btrim(fixture.talent_id), '') is not null
on conflict do nothing;

create or replace function public.record_weekly_stats_login_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_logined_at is null
     or new.last_logined_at is not distinct from old.last_logined_at
     or exists (
       select 1
       from public.logs marker
       where marker.type = 'analytics_excluded_test_fixture_talent'
         and marker.user_id = new.user_id
     ) then
    return new;
  end if;

  insert into public.logs (type, user_id, created_at, meta_data)
  values (
    'weekly_stats_activity:login',
    new.user_id,
    new.last_logined_at,
    jsonb_build_object('source', 'talent_users.last_logined_at')
  );

  return new;
end;
$$;

drop trigger if exists talent_users_record_weekly_stats_login_activity
  on public.talent_users;
create trigger talent_users_record_weekly_stats_login_activity
after update of last_logined_at on public.talent_users
for each row
execute function public.record_weekly_stats_login_activity_v1();

create or replace function public.record_weekly_stats_recommendation_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := jsonb_strip_nulls(
    jsonb_build_object(
      'source', 'talent_opportunity_recommendation',
      'opportunityId', new.id,
      'roleId', new.role_id
    )
  );
begin
  if exists (
       select 1
       from public.logs marker
       where marker.type = 'analytics_excluded_test_fixture_talent'
         and marker.user_id = new.talent_id
     )
     or exists (
       select 1
       from public.company_roles role
       where role.role_id = new.role_id
         and coalesce(role.information ->> 'testOnly', 'false') = 'true'
     ) then
    return new;
  end if;

  if new.viewed_at is not null
     and new.viewed_at is distinct from old.viewed_at then
    insert into public.logs (type, user_id, created_at, meta_data)
    values (
      'weekly_stats_activity:recommendation_view',
      new.talent_id,
      new.viewed_at,
      v_metadata
    );
  end if;

  if new.clicked_at is not null
     and new.clicked_at is distinct from old.clicked_at then
    insert into public.logs (type, user_id, created_at, meta_data)
    values (
      'weekly_stats_activity:recommendation_click',
      new.talent_id,
      new.clicked_at,
      v_metadata
    );
  end if;

  if new.feedback_at is not null
     and new.feedback_at is distinct from old.feedback_at then
    insert into public.logs (type, user_id, created_at, meta_data)
    values (
      'weekly_stats_activity:recommendation_feedback',
      new.talent_id,
      new.feedback_at,
      v_metadata || jsonb_build_object('feedback', new.feedback)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists talent_recommendations_record_weekly_stats_activity
  on public.talent_opportunity_recommendation;
create trigger talent_recommendations_record_weekly_stats_activity
after update of viewed_at, clicked_at, feedback_at
on public.talent_opportunity_recommendation
for each row
execute function public.record_weekly_stats_recommendation_activity_v1();

insert into public.logs (type, user_id, created_at, meta_data)
select
  'weekly_stats_activity:login',
  talent.user_id,
  talent.last_logined_at,
  jsonb_build_object('source', 'talent_users.last_logined_at_backfill')
from public.talent_users talent
where talent.last_logined_at is not null
  and not exists (
    select 1
    from public.logs marker
    where marker.type = 'analytics_excluded_test_fixture_talent'
      and marker.user_id = talent.user_id
  )
  and not exists (
    select 1
    from public.logs activity
    where activity.type = 'weekly_stats_activity:login'
      and activity.user_id = talent.user_id
      and activity.created_at = talent.last_logined_at
  );

insert into public.logs (type, user_id, created_at, meta_data)
select
  event.type,
  recommendation.talent_id,
  event.occurred_at,
  jsonb_strip_nulls(
    jsonb_build_object(
      'source', 'talent_opportunity_recommendation_backfill',
      'opportunityId', recommendation.id,
      'roleId', recommendation.role_id,
      'feedback', case
        when event.type = 'weekly_stats_activity:recommendation_feedback'
          then recommendation.feedback
        else null
      end
    )
  )
from public.talent_opportunity_recommendation recommendation
cross join lateral (
  values
    ('weekly_stats_activity:recommendation_view', recommendation.viewed_at),
    ('weekly_stats_activity:recommendation_click', recommendation.clicked_at),
    ('weekly_stats_activity:recommendation_feedback', recommendation.feedback_at)
) event(type, occurred_at)
where event.occurred_at is not null
  and not exists (
    select 1
    from public.logs marker
    where marker.type = 'analytics_excluded_test_fixture_talent'
      and marker.user_id = recommendation.talent_id
  )
  and not exists (
    select 1
    from public.company_roles role
    where role.role_id = recommendation.role_id
      and coalesce(role.information ->> 'testOnly', 'false') = 'true'
  )
  and not exists (
    select 1
    from public.logs activity
    where activity.type = event.type
      and activity.user_id = recommendation.talent_id
      and activity.created_at = event.occurred_at
      and activity.meta_data ->> 'opportunityId' = recommendation.id::text
  );

comment on function public.record_weekly_stats_login_activity_v1() is
  'Freezes login/session timestamps into append-only logs for reproducible user stats.';
comment on function public.record_weekly_stats_recommendation_activity_v1() is
  'Freezes recommendation view, click, and feedback timestamps into append-only logs for reproducible user stats.';
comment on function public.mark_weekly_stats_test_fixture_talents_v1() is
  'Persists canonical testTalentIds as analytics exclusions even after fixture role cleanup.';

revoke all on function public.record_weekly_stats_login_activity_v1()
  from public, anon, authenticated;
revoke all on function public.record_weekly_stats_recommendation_activity_v1()
  from public, anon, authenticated;
revoke all on function public.mark_weekly_stats_test_fixture_talents_v1()
  from public, anon, authenticated;

commit;
