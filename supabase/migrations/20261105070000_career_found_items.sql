-- Items Harper finds in chat or background work stay visible outside the chat.
-- 1) A posting found on the web (including a hiring post) can be copied for this
--    talent without a card, evaluated like collected postings, then published to
--    '새 기회'. The copy stays out of other talents' searches.
-- 2) Things that are not postings (events, articles, posts) are saved as content
--    suggestions shown in Career home ('볼 만한 것') until they expire.
begin;

CREATE OR REPLACE FUNCTION public.import_talent_job_link(p_talent_id uuid, p_saved_stage text, p_existing_role_id uuid, p_workspace_id uuid, p_role jsonb, p_workspace jsonb, p_preserve_existing_progress boolean DEFAULT false)
 RETURNS TABLE(role_id uuid, recommendation_id uuid, role_source_provider text, created_role boolean, created_workspace boolean, created_recommendation boolean, saved_stage text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := timezone('utc', now());
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_created_role boolean := false;
  v_created_workspace boolean := false;
  v_created_recommendation boolean := false;
  v_company_db_id integer;
  v_url_variants text[];
begin
  if p_talent_id is null or not exists (
    select 1 from public.talent_users where user_id = p_talent_id
  ) then
    raise exception 'talent_not_found';
  end if;

  -- A null stage copies the posting for this talent's evaluation without
  -- creating a card; the card is published later through the list writer.
  if p_saved_stage is not null
     and p_saved_stage not in ('saved', 'applied', 'connected', 'closed') then
    raise exception 'invalid_saved_stage';
  end if;

  if p_role ? 'hiringPost' and jsonb_typeof(p_role->'hiringPost') <> 'object' then
    raise exception 'invalid_import_payload';
  end if;

  if jsonb_typeof(coalesce(p_role, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_workspace, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_import_payload';
  end if;

  select coalesce(array_agg(distinct value), '{}'::text[])
    into v_url_variants
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(p_role->'roleUrlVariants') = 'array'
        then p_role->'roleUrlVariants'
      else '[]'::jsonb
    end
  ) as item(value)
  where nullif(btrim(value), '') is not null;

  perform pg_advisory_xact_lock(
    hashtextextended(
      coalesce(
        nullif(p_role->>'userSubmittedSourceJobId', ''),
        nullif(p_role->>'canonicalUrl', ''),
        p_existing_role_id::text,
        'career_job_link_import'
      ),
      0
    )
  );

  if p_existing_role_id is not null then
    select * into v_role
    from public.company_roles
    where company_roles.role_id = p_existing_role_id
      and lower(coalesce(source_type, '')) = 'external';

    if not found then
      raise exception 'external_role_not_found';
    end if;
  else
    select * into v_role
    from public.company_roles candidate
    where lower(coalesce(candidate.source_type, '')) = 'external'
      and (
        (
          nullif(p_role->>'providerJobId', '') is not null
          and candidate.source_provider = p_role->>'provider'
          and candidate.source_job_id = p_role->>'providerJobId'
        )
        or (
          nullif(p_role->>'userSubmittedSourceJobId', '') is not null
          and candidate.source_provider = 'user_submitted'
          and candidate.source_job_id = p_role->>'userSubmittedSourceJobId'
        )
        or (
          candidate.external_jd_url is not null
          and candidate.external_jd_url = any(v_url_variants)
        )
      )
    order by
      (candidate.source_provider = 'user_submitted') asc,
      candidate.updated_at desc
    limit 1;
  end if;

  if v_role.role_id is null then
    if nullif(btrim(p_role->>'title'), '') is null
       or nullif(btrim(p_role->>'companyName'), '') is null
       or nullif(btrim(p_role->>'canonicalUrl'), '') is null then
      raise exception 'job_details_required';
    end if;

    if p_workspace_id is not null then
      select * into v_workspace
      from public.company_workspace
      where company_workspace_id = p_workspace_id
        and coalesce(is_internal, false) = false;

      if not found then
        raise exception 'external_workspace_not_found';
      end if;
    else
      select * into v_workspace
      from public.company_workspace candidate
      where coalesce(candidate.is_internal, false) = false
        and (
          nullif(p_workspace->>'careerUrl', '') is not null
          and candidate.career_url = p_workspace->>'careerUrl'
        )
      order by candidate.external_roles_enabled desc, candidate.updated_at desc
      limit 1;

      if v_workspace.company_workspace_id is null then
        v_company_db_id := case
          when coalesce(p_workspace->>'companyDbId', '') ~ '^[0-9]+$'
            then (p_workspace->>'companyDbId')::integer
          else null
        end;

        insert into public.company_workspace (
          company_name,
          published_name,
          company_db_id,
          career_url,
          logo_url,
          company_description,
          external_roles_enabled,
          has_career_page,
          is_internal,
          is_scrape_original,
          created_at,
          updated_at
        ) values (
          left(
            btrim(coalesce(nullif(p_workspace->>'companyName', ''), p_role->>'companyName')),
            240
          ),
          left(
            btrim(coalesce(nullif(p_workspace->>'companyName', ''), p_role->>'companyName')),
            240
          ),
          v_company_db_id,
          nullif(left(btrim(p_workspace->>'careerUrl'), 2048), ''),
          nullif(left(btrim(p_workspace->>'companyLogoUrl'), 2048), ''),
          nullif(left(btrim(p_workspace->>'companyDescription'), 10000), ''),
          false,
          nullif(btrim(p_workspace->>'careerUrl'), '') is not null,
          false,
          false,
          v_now,
          v_now
        )
        returning * into v_workspace;
        v_created_workspace := true;
      end if;
    end if;

    insert into public.company_roles (
      company_workspace_id,
      name,
      description,
      external_jd_url,
      information,
      is_expired,
      expires_at,
      location_text,
      salary_range,
      source_job_id,
      source_provider,
      source_type,
      status,
      summary,
      type,
      work_mode,
      created_at,
      updated_at
    ) values (
      v_workspace.company_workspace_id,
      left(btrim(p_role->>'title'), 500),
      nullif(left(p_role->>'description', 40000), ''),
      left(btrim(p_role->>'canonicalUrl'), 2048),
      jsonb_build_object(
        'userSubmitted', true,
        'jobLinkImport', jsonb_build_object(
          'canonicalUrl', p_role->>'canonicalUrl',
          'provider', p_role->>'provider',
          'providerCompanyId', p_role->>'providerCompanyId',
          'providerCompanyUrl', p_role->>'providerCompanyUrl',
          'providerJobId', p_role->>'providerJobId',
          'extractedBy', p_role->>'extractedBy'
        )
      )
      || case when jsonb_typeof(p_role->'hiringPost') = 'object'
           then jsonb_build_object('hiringPost', p_role->'hiringPost') else '{}'::jsonb end
      || case when p_saved_stage is null
           then jsonb_build_object('submittedTalentIds', jsonb_build_array(p_talent_id::text)) else '{}'::jsonb end,
      false,
      -- The daily link check cannot open LinkedIn, so what Harper finds there
      -- (a hiring post, or a LinkedIn job page) ends 30 days after posting.
      -- A deadline the posting itself states ends it sooner (least skips nulls).
      least(
        case
          when jsonb_typeof(p_role->'hiringPost') = 'object'
            then coalesce(nullif(p_role->'hiringPost'->>'postedAt', '')::timestamptz, v_now) + interval '30 days'
          when p_saved_stage is null and p_role->>'provider' = 'linkedin'
            then v_now + interval '30 days'
        end,
        nullif(p_role->>'deadline', '')::timestamptz
      ),
      nullif(left(btrim(p_role->>'location'), 500), ''),
      nullif(left(btrim(p_role->>'salaryRange'), 240), ''),
      left(btrim(p_role->>'userSubmittedSourceJobId'), 500),
      'user_submitted',
      'external',
      'active',
      '{}'::jsonb,
      case
        when jsonb_typeof(p_role->'employmentTypes') = 'array'
          then array(
            select distinct left(btrim(value), 80)
            from jsonb_array_elements_text(p_role->'employmentTypes') as item(value)
            where nullif(btrim(value), '') is not null
            limit 8
          )
        else '{}'::text[]
      end,
      case
        when p_role->>'workMode' in ('remote', 'hybrid', 'onsite')
          then p_role->>'workMode'
        else null
      end,
      v_now,
      v_now
    )
    returning * into v_role;
    v_created_role := true;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_talent_id::text || ':' || v_role.role_id::text, 1)
  );

  if p_saved_stage is null then
    -- Only the importing talent may evaluate and publish a user-submitted copy;
    -- other talents' searches keep excluding it.
    if v_role.source_provider = 'user_submitted'
       and not coalesce(v_role.information->'submittedTalentIds', '[]'::jsonb) ? p_talent_id::text then
      update public.company_roles
      set information = jsonb_set(
            coalesce(information, '{}'::jsonb), '{submittedTalentIds}',
            coalesce(information->'submittedTalentIds', '[]'::jsonb) || to_jsonb(p_talent_id::text))
          || case when jsonb_typeof(p_role->'hiringPost') = 'object' and not coalesce(information, '{}'::jsonb) ? 'hiringPost'
               then jsonb_build_object('hiringPost', p_role->'hiringPost') else '{}'::jsonb end,
          updated_at = v_now
      where company_roles.role_id = v_role.role_id
      returning * into v_role;
    end if;

    select * into v_recommendation
    from public.talent_opportunity_recommendation candidate
    where candidate.talent_id = p_talent_id
      and candidate.role_id = v_role.role_id
    order by candidate.updated_at desc, candidate.created_at desc
    limit 1;

    return query
    select v_role.role_id, v_recommendation.id, v_role.source_provider,
      v_created_role, v_created_workspace, false, v_recommendation.saved_stage;
    return;
  end if;

  select * into v_recommendation
  from public.talent_opportunity_recommendation candidate
  where candidate.talent_id = p_talent_id
    and candidate.role_id = v_role.role_id
  order by candidate.updated_at desc, candidate.created_at desc
  limit 1
  for update;

  if v_recommendation.id is null then
    insert into public.talent_opportunity_recommendation (
      talent_id,
      role_id,
      kind,
      opportunity_type,
      saved_stage,
      feedback,
      feedback_at,
      evidence,
      fit_reasons,
      fit_summary,
      preference_fit,
      tradeoffs,
      recommended_at,
      created_at,
      updated_at
    ) values (
      p_talent_id,
      v_role.role_id,
      'user_link_import',
      'external_jd',
      p_saved_stage,
      'like',
      v_now,
      '[]'::jsonb,
      '[]'::jsonb,
      null,
      '{}'::jsonb,
      '[]'::jsonb,
      v_now,
      v_now,
      v_now
    )
    returning * into v_recommendation;
    v_created_recommendation := true;
  elsif not (
    coalesce(p_preserve_existing_progress, false)
    and v_recommendation.saved_stage is not null
    and v_recommendation.saved_stage <> 'hidden'
  ) then
    update public.talent_opportunity_recommendation
    set
      saved_stage = p_saved_stage,
      feedback = 'like',
      feedback_at = v_now,
      feedback_reason = null,
      dismissed_at = null,
      recommended_at = v_now,
      updated_at = v_now
    where id = v_recommendation.id
    returning * into v_recommendation;
  end if;

  return query
  select
    v_role.role_id,
    v_recommendation.id,
    v_role.source_provider,
    v_created_role,
    v_created_workspace,
    v_created_recommendation,
    v_recommendation.saved_stage;
end;
$function$;

create or replace function public.write_career_opportunities(p_talent uuid,p_operation text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_op public.talent_matching_operations; item jsonb; rec public.talent_opportunity_recommendation;
  role public.company_roles; target uuid:=nullif(p_command->>'matchingId','')::uuid;
  action text:=p_command->>'action'; all_lists boolean:=coalesce((p_command->>'allLists')::boolean,false);
  kept uuid[]:='{}'; changed uuid[]:='{}'; member_id uuid; result jsonb; receipt jsonb; current_revision text;
begin
  perform pg_advisory_xact_lock(hashtextextended('career-matching:'||p_talent::text,0));
  select * into old_op from public.talent_matching_operations where talent_id=p_talent and operation_id=p_operation;
  if found then
    if old_op.command is distinct from p_command then raise exception 'Operation identity reused with different command'; end if;
    return old_op.result;
  end if;
  if target is not null and not exists(select 1 from public.talent_matchings where id=target and talent_id=p_talent) then raise exception 'Matching unavailable'; end if;
  if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then raise exception 'Talent unavailable'; end if;
  if action not in ('add','update','archive','restore','replace','reset') then raise exception 'Unknown list operation'; end if;
  current_revision:=public.career_opportunity_list_revision(p_talent,target,all_lists);
  if (action in ('add','restore','replace','reset') or p_command ? 'expectedRevision') and current_revision is distinct from p_command->>'expectedRevision' then raise exception 'List changed; read its current revision'; end if;
  if all_lists and action not in ('reset','archive') then raise exception 'Select one list for writes'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_command->'items','[]'::jsonb)) loop
    select * into rec from public.talent_opportunity_recommendation r where r.talent_id=p_talent
      and (case when nullif(item->>'recommendationId','') is not null then r.id=public.current_talent_recommendation_id_v1((item->>'recommendationId')::uuid) else r.role_id=(item->>'roleId')::uuid end)
      and r.id=public.current_talent_recommendation_id_v1(r.id)
      order by r.created_at desc,r.id desc limit 1 for update;
    if not found then
      if action not in ('add','replace') then raise exception 'Recommendation unavailable'; end if;
      select * into strict role from public.company_roles where role_id=(item->>'roleId')::uuid;
      if role.source_type='internal' then
        -- Public availability and sharing boundaries remain enforced; private
        -- scoring is not a Career agent publication prerequisite.
        perform public.read_career_internal_role_v1(p_talent,role.role_id);
        insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
          values(p_talent,role.role_id,'career_agent','internal_recommendation',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_build_object('operationId',p_operation)) returning * into rec;
        if target is not null then
          delete from public.talent_opportunity_memberships where talent_id=p_talent and recommendation_id=rec.id and matching_id is null;
        end if;
      else
      if coalesce(role.is_expired,false) or role.status in ('closed','expired','inactive','archived','ended') or (role.expires_at is not null and role.expires_at<=now()) or lower(coalesce(role.information->>'testOnly','false'))='true' then raise exception 'Role is unavailable'; end if;
      if not exists(select 1 from public.company_workspace where company_workspace_id=role.company_workspace_id and external_roles_enabled=true)
        -- A posting this talent imported stays private to them but is publishable to their own list.
        and not (role.source_provider='user_submitted' and coalesce(role.information->'submittedTalentIds','[]'::jsonb) ? p_talent::text)
        then raise exception 'Company opportunities unavailable'; end if;
      if exists(select 1 from public.talent_setting s,unnest(coalesce(s.blocked_companies,'{}')) b where s.user_id=p_talent and (b=role.company_workspace_id::text or exists(select 1 from public.company_workspace c where c.company_workspace_id=role.company_workspace_id and c.company_name ilike '%'||b||'%'))) then raise exception 'Company is blocked'; end if;
      if not exists(select 1 from public.talent_external_evaluations e where e.id=(item->>'evaluationId')::uuid and e.talent_id=p_talent and e.role_id=role.role_id) then raise exception 'Evaluation reference unavailable'; end if;
      insert into public.talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,rank,fit_summary,fit_reasons,tradeoffs,evidence)
        values(p_talent,role.role_id,'career_agent','external_jd',coalesce((item->>'rank')::integer,0),coalesce(item->>'explanation',''),'[]','[]',jsonb_build_object('evaluationId',item->>'evaluationId')) returning * into rec;
      end if;
    end if;
    if action in ('add','restore','replace') then
      select * into strict role from public.company_roles where role_id=rec.role_id;
      if coalesce(role.is_expired,false) or role.status in ('closed','expired','inactive','archived','ended') or (role.expires_at is not null and role.expires_at<=now()) then raise exception 'Role is unavailable'; end if;
      if lower(coalesce(role.information->>'testOnly','false'))='true' and not coalesce(role.information->'testTalentIds','[]'::jsonb) ? p_talent::text then raise exception 'Test Role unavailable'; end if;
      if exists(select 1 from public.talent_setting s,unnest(coalesce(s.blocked_companies,'{}')) b where s.user_id=p_talent and (b=role.company_workspace_id::text or exists(select 1 from public.company_workspace c where c.company_workspace_id=role.company_workspace_id and c.company_name ilike '%'||b||'%'))) then raise exception 'Company is blocked'; end if;
    end if;
    if nullif(item->>'roleId','') is not null and rec.role_id<>(item->>'roleId')::uuid then raise exception 'Recommendation role mismatch'; end if;
    if action='archive' and all_lists then
      update public.talent_opportunity_memberships set archived_at=now(),revision=revision+1,updated_at=now() where talent_id=p_talent and public.current_talent_recommendation_id_v1(recommendation_id)=rec.id;
    elsif action='update' then
      select m.id into member_id from public.talent_opportunity_memberships m
      where m.talent_id=p_talent and m.matching_id is not distinct from target
        and public.current_talent_recommendation_id_v1(m.recommendation_id)=rec.id
      order by (m.recommendation_id=rec.id) desc,m.updated_at desc,m.id desc limit 1;
      if member_id is null then raise exception 'Membership unavailable'; end if;
      update public.talent_opportunity_memberships set
        explanation=coalesce(item->>'explanation',explanation),rank=coalesce((item->>'rank')::integer,rank),
        revision=revision+1,updated_at=now() where id=member_id;
    else
      insert into public.talent_opportunity_memberships(talent_id,matching_id,recommendation_id,role_id,explanation,rank,archived_at)
        values(p_talent,target,rec.id,rec.role_id,coalesce(item->>'explanation',rec.fit_summary,''),coalesce((item->>'rank')::integer,0),case when action='archive' then now() else null end)
        on conflict(talent_id,(coalesce(matching_id,'00000000-0000-0000-0000-000000000000'::uuid)),recommendation_id)
        do update set explanation=coalesce(item->>'explanation',talent_opportunity_memberships.explanation),rank=coalesce((item->>'rank')::integer,talent_opportunity_memberships.rank),
          archived_at=case when action='archive' then now() when action in ('restore','add','replace') then null else talent_opportunity_memberships.archived_at end,
          revision=talent_opportunity_memberships.revision+1,updated_at=now() returning id into member_id;
      kept:=array_append(kept,member_id);
    end if;
    changed:=array_append(changed,rec.id);
  end loop;
  if action in ('replace','reset') then
    update public.talent_opportunity_memberships set archived_at=now(),revision=revision+1,updated_at=now()
    where talent_id=p_talent and (all_lists or matching_id is not distinct from target) and archived_at is null and not(id=any(kept));
  end if;
  insert into public.talent_matching_operations values(p_talent,p_operation,p_command,'{"listRevision":null}',now());
  receipt:=jsonb_build_object('action',action,'matchingId',target,'allLists',all_lists,'recommendationIds',changed,'listRevision',public.career_opportunity_list_revision(p_talent,target,all_lists));
  update public.talent_matching_operations set result=receipt where talent_id=p_talent and operation_id=p_operation;
  return receipt;
end $$;

create table public.career_content_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.talent_users(user_id) on delete cascade,
  kind text not null check (kind in ('event', 'article', 'post')),
  url text not null,
  title text not null,
  source text,
  reason text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  published_at timestamptz,
  expires_at timestamptz not null,
  status text not null default 'new'
    check (status in ('new', 'seen', 'opened', 'dismissed', 'removed')),
  status_at timestamptz,
  origin text not null check (origin in ('user_request', 'harper_offer', 'harper_background')),
  conversation_id uuid,
  run_id uuid,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);
create index career_content_suggestions_visible
  on public.career_content_suggestions(user_id, expires_at)
  where status in ('new', 'seen', 'opened');
alter table public.career_content_suggestions enable row level security;
revoke all on public.career_content_suggestions from anon, authenticated;
grant select on public.career_content_suggestions to authenticated;
grant all on public.career_content_suggestions to service_role;
create policy career_content_suggestions_owner_read on public.career_content_suggestions
  for select to authenticated using ((select auth.uid()) = user_id);

-- add: Harper saves one item. The same link is kept once per user, so a dismissed
--      item is never re-shown.
-- remove: Harper withdraws an item it saved.
-- react: the user's own seen / opened / dismissed from the Career home.
-- Items end by date (expires_at); nothing re-checks their links.
create function public.manage_career_content_suggestion(
  p_user_id uuid, p_operation text, p_id uuid default null, p_item jsonb default null,
  p_origin text default null, p_conversation_id uuid default null, p_run_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.career_content_suggestions; v_kind text; v_starts timestamptz; v_ends timestamptz; v_expires timestamptz;
  v_deadline timestamptz;
begin
  if p_conversation_id is not null
     and not exists (select 1 from talent_conversations where id = p_conversation_id and user_id = p_user_id)
    then raise exception 'Conversation not owned'; end if;
  if p_operation = 'add' then
    if p_item is null or not (p_item ?& array['kind', 'url', 'title', 'reason'])
       or (p_item->>'kind') not in ('event', 'article', 'post')
       or coalesce(p_origin, '') not in ('user_request', 'harper_offer', 'harper_background')
       or nullif(btrim(p_item->>'title'), '') is null or nullif(btrim(p_item->>'reason'), '') is null
       or (p_item->>'url') !~* '^https?://'
      then raise exception 'Invalid content suggestion'; end if;
    v_kind := p_item->>'kind';
    v_starts := nullif(p_item->>'startsAt', '')::timestamptz;
    v_ends := nullif(p_item->>'endsAt', '')::timestamptz;
    v_deadline := nullif(p_item->>'deadline', '')::timestamptz;
    if v_kind = 'event' then
      if v_starts is null then raise exception 'Event date required'; end if;
      v_expires := coalesce(v_ends, v_starts + interval '1 day');
      if v_expires <= now() then raise exception 'Event already ended'; end if;
    else
      v_expires := now() + interval '30 days';
    end if;
    -- A deadline stated in the item itself (apply by, registration closes) ends it sooner.
    v_expires := least(v_expires, v_deadline);
    if v_expires <= now() then raise exception 'Deadline passed'; end if;
    insert into career_content_suggestions(user_id, kind, url, title, source, reason, starts_at, ends_at,
        location, published_at, expires_at, origin, conversation_id, run_id)
      values (p_user_id, v_kind, btrim(p_item->>'url'), left(btrim(p_item->>'title'), 300),
        nullif(left(btrim(p_item->>'source'), 80), ''), left(btrim(p_item->>'reason'), 400), v_starts, v_ends,
        nullif(left(btrim(p_item->>'location'), 120), ''), nullif(p_item->>'publishedAt', '')::timestamptz,
        v_expires, p_origin, p_conversation_id, p_run_id)
      on conflict (user_id, url) do nothing returning * into r;
    if r.id is null then
      select * into r from career_content_suggestions where user_id = p_user_id and url = btrim(p_item->>'url');
      return jsonb_build_object('status', 'already_saved', 'id', r.id, 'item', to_jsonb(r));
    end if;
    return jsonb_build_object('status', 'saved', 'id', r.id, 'item', to_jsonb(r));
  end if;

  select * into r from career_content_suggestions where id = p_id and user_id = p_user_id for update;
  if r.id is null then return jsonb_build_object('status', 'not_found', 'id', p_id); end if;
  if p_operation = 'remove' then
    if r.status in ('new', 'seen', 'opened') then
      update career_content_suggestions set status = 'removed', status_at = now(), updated_at = now(), revision = revision + 1
        where id = r.id returning * into r;
    end if;
  elsif p_operation = 'react' then
    if coalesce(p_item->>'reaction', '') not in ('seen', 'opened', 'dismissed') then raise exception 'Unknown reaction'; end if;
    -- Reactions move forward only: new -> seen -> opened; dismissed is final.
    if r.status in ('new', 'seen', 'opened') and not (
         (p_item->>'reaction' = 'seen' and r.status <> 'new')
      or (p_item->>'reaction' = 'opened' and r.status = 'opened')) then
      update career_content_suggestions set status = p_item->>'reaction', status_at = now(), updated_at = now(), revision = revision + 1
        where id = r.id returning * into r;
    end if;
  else raise exception 'Unknown operation'; end if;
  return jsonb_build_object('status', r.status, 'id', r.id, 'item', to_jsonb(r));
end $$;
revoke all on function public.manage_career_content_suggestion(uuid, text, uuid, jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.manage_career_content_suggestion(uuid, text, uuid, jsonb, text, uuid, uuid) to service_role;

commit;
