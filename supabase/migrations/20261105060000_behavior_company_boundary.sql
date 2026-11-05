-- Candidate Behavior Context reads only what the candidate knows (D3, D10).
--
-- Behavior Context is a per-candidate summary that every company's search reads.
-- Its change queue (talent_behavior_context_changes) was filled from every
-- talent_progress row and every stage tag, with summaries that copied company
-- names, row text and metadata. Company records (Pass reasons, internal notes,
-- stop notes) and stages the candidate was never told about (hold, company stage
-- names, closures before the closure notice) reached the builder this way.
--
-- 1. Progress rows queue a change only when the candidate can see them
--    (open_to_talent) or for three kinds the candidate did or received:
--    recommendation feedback, Harper's clarification questions, and a delivered
--    introduction to the company (a cancelled or pending one still holds the
--    company-facing presentation). The summary no longer copies text/metadata;
--    the Worker re-reads the row through its own allowlist.
-- 2. Stage tags queue a change only for stages the candidate learns about
--    (recommended, accepted, declined, connection pending, connected, final
--    offer). Closures reach the candidate through the closure notice, which is a
--    candidate-visible progress row. Tag removals are not queued.
-- 3. Recommendation changes no longer queue or summarise processed_stage, the
--    company pipeline stage; the Worker re-reads the row with the
--    candidate-known stage.
-- 4. Summaries name the role only, never the company: Behavior is read by every
--    company's search.
-- 5. read_career_follow_scan stops hashing company Memory into the role
--    fingerprint, so a company Memory edit no longer marks a role as changed for
--    candidate-side follow scans.
--
-- Already queued summaries are ignored by the Worker for these two sources.

-- Same allowlist as TALENT_OWN_PROGRESS_KINDS in harper_worker
-- opp/agentic/behavior_context.py; change both together.
create or replace function public.talent_progress_reaches_behavior_v1(
  p_kind text, p_open_to_talent boolean, p_metadata jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (
    coalesce(p_open_to_talent, false)
    or p_kind in (
      'candidate_opportunity_feedback_changed',
      'matching_clarification_sent',
      'intro_to_company'
    )
  ) and not (
    p_kind = 'intro_to_company'
    and coalesce(p_metadata->>'deliveryStatus', '') <> 'sent'
  );
$$;

revoke all on function public.talent_progress_reaches_behavior_v1(text, boolean, jsonb) from public, anon, authenticated;

create or replace function public.enqueue_talent_progress_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  row_value public.talent_progress;
  operation_value text := lower(tg_op);
  fields text[] := '{}';
  role_label_value text := '';
  summary_value text;
begin
  row_value := case when tg_op = 'DELETE' then old else new end;
  -- An access receipt is not candidate behavior and must not enqueue a refresh.
  if row_value.kind='candidate_profile_opened'
    and (tg_op<>'UPDATE' or old.kind='candidate_profile_opened') then
    return case when tg_op='DELETE' then old else new end;
  end if;
  -- Company and Ops records never reach the candidate's Behavior queue.
  if not (
    public.talent_progress_reaches_behavior_v1(row_value.kind, row_value.open_to_talent, row_value.metadata)
    or (tg_op = 'UPDATE' and public.talent_progress_reaches_behavior_v1(old.kind, old.open_to_talent, old.metadata))
  ) then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    fields := array['kind', 'text', 'metadata', 'role_id', 'recommendation_id'];
  elsif tg_op = 'DELETE' then
    fields := array['kind', 'text', 'metadata', 'role_id', 'recommendation_id'];
  else
    if old.kind is distinct from new.kind then fields := array_append(fields, 'kind'); end if;
    if old.text is distinct from new.text then fields := array_append(fields, 'text'); end if;
    if old.metadata is distinct from new.metadata then fields := array_append(fields, 'metadata'); end if;
    if old.role_id is distinct from new.role_id then fields := array_append(fields, 'role_id'); end if;
    if old.recommendation_id is distinct from new.recommendation_id then fields := array_append(fields, 'recommendation_id'); end if;
    if old.open_to_talent is distinct from new.open_to_talent then fields := array_append(fields, 'open_to_talent'); end if;
    if cardinality(fields) = 0 then return new; end if;
  end if;

  select coalesce(nullif(btrim(role.name), ''), '')
    into role_label_value
  from public.company_roles role
  where role.role_id = row_value.role_id;

  -- No row text or metadata: the Worker reads the row itself, through the
  -- candidate-visible allowlist.
  summary_value := concat_ws('; ',
    case operation_value
      when 'insert' then 'opportunity progress recorded'
      when 'delete' then 'opportunity progress removed'
      else 'opportunity progress changed'
    end,
    case when role_label_value <> '' then 'role=' || role_label_value end,
    'kind=' || coalesce(row_value.kind, ''),
    case when operation_value = 'update' then 'fields=' || array_to_string(fields, ',') end
  );

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'progress',
    row_value.id::text,
    operation_value,
    fields,
    case
      when operation_value = 'insert' then coalesce(row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5(
      'progress|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.kind, '') || '|' || coalesce(row_value.text, '') || '|' ||
      coalesce(row_value.metadata::text, '') || '|' || coalesce(row_value.role_id::text, '') || '|' ||
      coalesce(row_value.recommendation_id::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.enqueue_opportunity_tag_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  operation_value text := lower(tg_op);
  role_label_value text := '';
begin
  -- The candidate is not told when a stage tag is removed.
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.talent_id is not distinct from new.talent_id
       and old.opportunity_id is not distinct from new.opportunity_id
       and old.tag is not distinct from new.tag then
      return new;
    end if;
  end if;
  -- Only stages the candidate learns about. Hold, company-defined stages and
  -- closures stay out; a closure reaches the candidate through the closure
  -- notice (a candidate-visible talent_progress row).
  if btrim(coalesce(new.tag, '')) not in (
    '내부:추천', '내부:수락', '내부:거절', '내부:연결대기', '내부:연결됨', '내부:최종오퍼'
  ) then
    return new;
  end if;

  select coalesce(nullif(btrim(role.name), ''), '')
    into role_label_value
  from public.company_roles role
  where role.role_id = new.opportunity_id;

  perform public.try_enqueue_talent_behavior_context_change(
    new.talent_id,
    'opportunity_tag',
    new.id::text,
    operation_value,
    array['tag', 'opportunity_id'],
    timezone('utc', now()),
    md5(
      'opportunity_tag|' || new.id::text || '|' || operation_value || '|' ||
      coalesce(new.tag, '') || '|' || coalesce(new.opportunity_id::text, '') ||
      '|txid=' || txid_current()::text
    ),
    concat_ws('; ',
      'opportunity process stage changed',
      case when role_label_value <> '' then 'role=' || role_label_value end
    )
  );
  return new;
end;
$function$;

create or replace function public.enqueue_recommendation_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  row_value public.talent_opportunity_recommendation;
  operation_value text := lower(tg_op);
  fields text[] := '{}';
  old_recorded boolean := false;
  new_recorded boolean := false;
  role_label_value text := '';
  summary_value text;
begin
  -- Do not enqueue a change solely because a no-feedback recommendation was
  -- hidden. This is the exact neutral state used for expired/kept postings.
  if tg_op <> 'DELETE'
     and new.feedback is null
     and new.saved_stage = 'hidden' then
    return new;
  end if;

  -- processed_stage is the company pipeline, not candidate behavior: it neither
  -- makes a recommendation "recorded" nor counts as a change. Stages the
  -- candidate learns about arrive through stage tags and closure notices.
  if tg_op <> 'INSERT' then
    old_recorded := not (
      old.feedback is null
      and old.saved_stage = 'hidden'
    ) and (
      old.feedback is not null
      or old.feedback_reason is not null
      or old.saved_stage is not null
      or old.viewed_at is not null
      or old.clicked_at is not null
      or old.dismissed_at is not null
    );
  end if;
  if tg_op <> 'DELETE' then
    new_recorded := not (
      new.feedback is null
      and new.saved_stage = 'hidden'
    ) and (
      new.feedback is not null
      or new.feedback_reason is not null
      or new.saved_stage is not null
      or new.viewed_at is not null
      or new.clicked_at is not null
      or new.dismissed_at is not null
    );
  end if;

  if tg_op = 'INSERT' then
    if not new_recorded then return new; end if;
    row_value := new;
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif tg_op = 'DELETE' then
    if not old_recorded then return old; end if;
    row_value := old;
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif old_recorded and not new_recorded then
    row_value := old;
    operation_value := 'delete';
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif not old_recorded and new_recorded then
    row_value := new;
    operation_value := 'insert';
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif old_recorded and new_recorded then
    row_value := new;
    if old.role_id is distinct from new.role_id then fields := array_append(fields, 'role_id'); end if;
    if old.feedback is distinct from new.feedback then fields := array_append(fields, 'feedback'); end if;
    if old.feedback_reason is distinct from new.feedback_reason then fields := array_append(fields, 'feedback_reason'); end if;
    if old.saved_stage is distinct from new.saved_stage then fields := array_append(fields, 'saved_stage'); end if;
    if old.viewed_at is distinct from new.viewed_at then fields := array_append(fields, 'viewed_at'); end if;
    if old.clicked_at is distinct from new.clicked_at then fields := array_append(fields, 'clicked_at'); end if;
    if old.dismissed_at is distinct from new.dismissed_at then fields := array_append(fields, 'dismissed_at'); end if;
    if cardinality(fields) = 0 then return new; end if;
  else
    return new;
  end if;

  select coalesce(nullif(btrim(role.name), ''), '')
    into role_label_value
  from public.company_roles role
  where role.role_id = row_value.role_id;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'recommendation recorded',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'feedback=' || coalesce(row_value.feedback, 'none'),
      'reason=' || coalesce(row_value.feedback_reason::text, 'none'),
      'saved_stage=' || coalesce(row_value.saved_stage, 'none'),
      'viewed=' || (row_value.viewed_at is not null)::text,
      'clicked=' || (row_value.clicked_at is not null)::text,
      'dismissed=' || (row_value.dismissed_at is not null)::text
    )
    when 'delete' then concat_ws('; ',
      'recommendation removed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'previous feedback=' || coalesce(row_value.feedback, 'none'),
      'previous reason=' || coalesce(row_value.feedback_reason::text, 'none'),
      'previous saved_stage=' || coalesce(row_value.saved_stage, 'none')
    )
    else concat_ws('; ',
      'recommendation changed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'fields=' || array_to_string(fields, ','),
      'feedback=' || coalesce(new.feedback, 'none'),
      'reason=' || coalesce(new.feedback_reason::text, 'none'),
      'saved_stage=' || coalesce(new.saved_stage, 'none'),
      'viewed=' || (new.viewed_at is not null)::text,
      'clicked=' || (new.clicked_at is not null)::text,
      'dismissed=' || (new.dismissed_at is not null)::text
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'recommendation',
    row_value.id::text,
    operation_value,
    fields,
    case
      when tg_op = 'INSERT'
        then coalesce(row_value.recommended_at, row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5(
      'recommendation|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.role_id::text, '') || '|' || coalesce(row_value.recommended_at::text, '') || '|' ||
      coalesce(row_value.feedback, '') || '|' || coalesce(row_value.feedback_reason::text, '') || '|' ||
      coalesce(row_value.saved_stage, '') || '|' ||
      coalesce(row_value.viewed_at::text, '') || '|' || coalesce(row_value.clicked_at::text, '') || '|' ||
      coalesce(row_value.dismissed_at::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

-- Same as 20261029182909, without the company Memory entries in the role
-- fingerprint.
create or replace function public.read_career_follow_scan(p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path='' as $$
 with follows as materialized (
   select f.* from public.talent_company_follow f join public.talent_users t on t.user_id=f.talent_id and t.deleted_at is null
   where f.unfollowed_at is null order by coalesce((f.scan_state->>'checkedAt')::timestamptz,'epoch'::timestamptz),f.id limit p_limit
 ), owners as materialized (
   select t.user_id,md5(jsonb_build_object('profile',jsonb_build_array(t.name,t.headline,t.bio,t.location,t.current_location),
     'experience',(select jsonb_agg(to_jsonb(e) order by e.id) from public.talent_experiences e where e.talent_id=t.user_id),
     'education',(select jsonb_agg(to_jsonb(e) order by e.id) from public.talent_educations e where e.talent_id=t.user_id),
     'extras',(select e.content from public.talent_extras e where e.talent_id=t.user_id),
     'context',(select jsonb_agg(jsonb_build_array(c.ref,c.revision,c.collection) order by c.ref) from public.talent_contexts c where c.talent_id=t.user_id and c.deleted_at is null),
     'behaviorSource',(select max(b.id) from public.talent_behavior_context_changes b where b.talent_id=t.user_id),
     'settings',(select jsonb_build_array(s.profile_visibility,s.get_external_recommendation,s.get_internal_recommendation,s.blocked_companies,s.status) from public.talent_setting s where s.user_id=t.user_id)
   )::text) as fingerprint from public.talent_users t where t.user_id in(select talent_id from follows)
 ), workspaces as materialized (
   select w.company_workspace_id,w.company_db_id from public.company_workspace w
   where exists(select 1 from follows f where (f.scope='company' and f.company_db_id=w.company_db_id) or (f.scope='workspace' and f.company_workspace_id=w.company_workspace_id))
 ), roles as materialized (
   select r.role_id,r.company_workspace_id,r.source_type,r.name,md5(jsonb_build_object('role',to_jsonb(r),
     'brief',case when r.source_type='internal' then public.company_role_search_brief_version_v1(r.role_id)::text else null end,
     'company',(select jsonb_build_array(w.company_description,w.brief,w.pitch) from public.company_workspace w where w.company_workspace_id=r.company_workspace_id)
   )::text) as fingerprint from public.company_roles r join workspaces w using(company_workspace_id)
   where r.status='active' and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>now())
   and coalesce(lower(btrim(r.information->>'testOnly')),'') not in ('true','1','yes','on')
 )
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('candidateFingerprint',o.fingerprint,
   'externalEnabled',(select coalesce(s.get_external_recommendation,true) and coalesce(s.status,'')<>'stopped' from public.talent_setting s where s.user_id=f.talent_id),
   'internalEnabled',(select coalesce(s.get_internal_recommendation,true) and coalesce(s.profile_visibility,'')<>'dont_share' from public.talent_setting s where s.user_id=f.talent_id),'roles',
   coalesce((select jsonb_agg(jsonb_build_object('roleId',r.role_id,'workspaceId',r.company_workspace_id,'sourceType',r.source_type,'name',r.name,'fingerprint',r.fingerprint) order by r.role_id)
     from roles r join workspaces w using(company_workspace_id) where (f.scope='company' and w.company_db_id=f.company_db_id) or (f.scope='workspace' and w.company_workspace_id=f.company_workspace_id)),'[]'::jsonb))), '[]'::jsonb)
 from follows f join owners o on o.user_id=f.talent_id
$$;
