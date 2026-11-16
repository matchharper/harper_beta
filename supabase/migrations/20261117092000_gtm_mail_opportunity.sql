-- 후보자 아웃바운드 (#4): a person who signs up or signs in from a #4 candidate mail gets the mail's Role in 내 기회.
--
-- The Role stays as it is: a customer's Role, or a 'Harper GTM' Role (information.purpose 'gtm_outreach'), which
-- keeps the existing member seal (information.testOnly) so recommendations, Career search, scheduled search, Role
-- start and contact never reach anyone else. For a GTM Role the person from the mail is added to the seal's own
-- allow list (information.testTalentIds, with information.testFixture), the list every member-facing reader already
-- checks; several people from mails about the same posting see the same Role. Their interest then reaches the GTM
-- Role's inbox like any internal opportunity.
--
-- One exception in shared code: people added to a GTM Role's allow list are real candidates, so the analytics
-- trigger that marks a test Role's allow list as test accounts (mark_weekly_stats_test_fixture_talents_v1) skips
-- GTM Roles. Activity on the GTM Role itself is still left out of the activity counts like any sealed Role.
--
-- The guard stops the migration when the trigger function is neither the definition checked on production on
-- 2026-11-17 nor one that already has this migration's line, so a later change is never silently reverted.

do $$
declare
  definition text := pg_get_functiondef('public.mark_weekly_stats_test_fixture_talents_v1()'::regprocedure);
begin
  if to_regclass('public.gtm_mails') is null then
    raise exception 'apply 20261117090000_gtm_mails_opens.sql first';
  end if;
  if md5(definition) <> '2159fcd602c9e78be54a76bd3035d81c' and position('gtm_outreach' in definition) = 0 then
    raise exception 'gtm_mail_opportunity: mark_weekly_stats_test_fixture_talents_v1 is not the definition checked on 2026-11-17 (md5 %); re-copy it and keep the added line', md5(definition);
  end if;
end;
$$;

-- 1. The analytics trigger, copied from production (2026-11-17) with the GTM Role line added.
CREATE OR REPLACE FUNCTION public.mark_weekly_stats_test_fixture_talents_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.information ->> 'testOnly', 'false') <> 'true'
     or jsonb_typeof(new.information -> 'testTalentIds') <> 'array'
     -- #4 (added 20261117092000): a GTM Role's allow list holds real people from its mails, not test accounts.
     or coalesce(new.information ->> 'purpose', '') = 'gtm_outreach' then
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
$function$;

-- 2. The mail's Role in the person's 내 기회. Called on the server when someone who opened Harper from a #4 candidate
--    mail is signed in, and only when the mail's posting was not imported as an outside posting. Idempotent: the
--    same person and Role keep one recommendation. Returns status 'added' with the recommendation, or why nothing
--    was added: no_role (the mail has no Role), unavailable (the Role is closed, or a sealed Role that is not a GTM
--    Role), blocked (the person blocked the company, by its workspace or the posting's company name).
create or replace function public.ensure_gtm_mail_opportunity_v1(p_talent uuid, p_mail uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mail record;
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_is_gtm boolean;
  v_allowed jsonb;
  v_rec public.talent_opportunity_recommendation;
  v_created boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent, 0));
  if not exists (select 1 from public.talent_users where user_id = p_talent and deleted_at is null) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select mail.id, mail.audience, mail.status, mail.role_id into v_mail
  from public.gtm_mails mail where mail.id = p_mail;
  if v_mail.id is null or v_mail.audience <> 'candidate' or v_mail.status <> 'sent' or v_mail.role_id is null then
    return jsonb_build_object('status', 'no_role');
  end if;

  select * into v_role from public.company_roles where role_id = v_mail.role_id for update;
  if v_role.role_id is null
    or lower(btrim(coalesce(v_role.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(v_role.status, ''))) not in ('active', 'paused', 'top_priority')
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= now())
    or not exists (select 1 from public.company_internal_roles internal_role where internal_role.role_id = v_role.role_id)
  then
    return jsonb_build_object('status', 'unavailable');
  end if;

  v_is_gtm := v_role.company_workspace_id = '93ecd68d-1cf4-4af8-a5c1-b7cb7e4cb848'::uuid
    and coalesce(v_role.information ->> 'purpose', '') = 'gtm_outreach';
  if lower(coalesce(v_role.information ->> 'testOnly', 'false')) in ('true', '1', 'yes', 'on') and not v_is_gtm then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select * into v_workspace from public.company_workspace where company_workspace_id = v_role.company_workspace_id;
  if exists (
    select 1
    from public.talent_setting setting, unnest(coalesce(setting.blocked_companies, '{}'::text[])) blocked(name)
    where setting.user_id = p_talent
      and (blocked.name = v_workspace.company_workspace_id::text
        or lower(btrim(blocked.name)) in (
          lower(btrim(coalesce(v_workspace.company_name, ''))),
          lower(btrim(coalesce(v_workspace.published_name, ''))),
          lower(btrim(coalesce(v_role.information #>> '{gtm,companyName}', '')))))
      and nullif(btrim(blocked.name), '') is not null
  ) then
    return jsonb_build_object('status', 'blocked');
  end if;

  if v_is_gtm then
    v_allowed := coalesce(v_role.information -> 'testTalentIds', '[]'::jsonb);
    if jsonb_typeof(v_allowed) <> 'array' then v_allowed := '[]'::jsonb; end if;
    if not (v_allowed ? p_talent::text) or nullif(v_role.information ->> 'testFixture', '') is null then
      update public.company_roles
      set information = information || jsonb_build_object(
        'testFixture', coalesce(nullif(information ->> 'testFixture', ''), 'gtm_outreach'),
        'testTalentIds', case when v_allowed ? p_talent::text then v_allowed else v_allowed || to_jsonb(p_talent::text) end)
      where role_id = v_role.role_id;
    end if;
  end if;

  select * into v_rec from public.talent_opportunity_recommendation
  where talent_id = p_talent and role_id = v_role.role_id
  order by created_at desc, id desc limit 1 for update;
  if not found then
    insert into public.talent_opportunity_recommendation(talent_id, role_id, opportunity_type, kind, evidence,
      fit_reasons, preference_fit, tradeoffs)
    values (p_talent, v_role.role_id, 'internal_recommendation', 'match',
      jsonb_build_array(jsonb_build_object('source', 'gtm_mail', 'mailId', p_mail)), '[]', '{}', '[]')
    returning * into v_rec;
    v_created := true;
    insert into public.talent_opportunity_tag(talent_id, opportunity_id, tag)
    values (p_talent, v_role.role_id, '내부:추천') on conflict do nothing;
  end if;
  -- Older writers have a membership trigger; ON CONFLICT also handles those.
  insert into public.talent_opportunity_memberships(talent_id, recommendation_id, role_id, explanation, rank, archived_at)
  values (p_talent, v_rec.id, v_role.role_id, '', coalesce(v_rec.rank, 0),
    case when v_rec.feedback = 'dislike' or v_rec.saved_stage = 'hidden' then now() else null end)
  on conflict do nothing;

  return jsonb_build_object('status', 'added', 'recommendationId', v_rec.id, 'roleId', v_role.role_id,
    'created', v_created);
end;
$$;

revoke all on function public.ensure_gtm_mail_opportunity_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_gtm_mail_opportunity_v1(uuid, uuid) to service_role;
