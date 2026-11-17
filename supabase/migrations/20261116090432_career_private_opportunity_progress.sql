-- Mail can establish an application before there is a job posting or Role.
alter table public.career_opportunities add column application_stage text
  check (application_stage in ('applied', 'connected', 'offer', 'closed'));

-- A Role can acquire its first recommendation after an unlisted opportunity was tracked.
-- Keep one owner for progress when that binding or a merge happens.
create function public.career_bind_private_application_stage_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing_stage text;
begin
  if new.recommendation_id is null or new.application_stage is null then return new; end if;
  select saved_stage into strict existing_stage from talent_opportunity_recommendation
    where id=new.recommendation_id and talent_id=new.talent_id for update;
  if existing_stage is null or existing_stage='saved' then
    perform move_talent_role_saved_stage_v1(new.talent_id,new.recommendation_id,new.application_stage,false);
  elsif existing_stage<>new.application_stage then
    raise exception 'Reconcile the two application stages before linking' using errcode='40001';
  end if;
  new.application_stage:=null;
  return new;
end $$;
create trigger bind_private_application_stage
  before insert or update of recommendation_id,application_stage on public.career_opportunities
  for each row when (new.recommendation_id is not null and new.application_stage is not null)
  execute function public.career_bind_private_application_stage_v1();
revoke all on function public.career_bind_private_application_stage_v1() from public,anon,authenticated;

create or replace function public.career_write_opportunity_v1(p_user uuid,p_id uuid,p_expected_revision bigint,p_patch jsonb,p_actor text default 'agent')
returns public.career_opportunities language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.career_opportunities; ref jsonb; rec uuid; legacy talent_opportunity_recommendation; internal_role boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('career-opportunity:'||p_id::text,0));
 if p_patch->'primary_ref'->>'kind'='role' then
  perform pg_advisory_xact_lock(hashtextextended('career-role-opportunity:'||p_user::text||':'||(p_patch->'primary_ref'->>'id'),0));
 end if;
 select * into item from career_opportunities where id=p_id for update;
 if found and item.talent_id<>p_user then raise exception 'Opportunity unavailable'; end if;
 if item.id is null then
  if p_expected_revision<>0 then raise exception 'Opportunity unavailable'; end if;
 else
  if item.revision<>p_expected_revision then raise exception 'Opportunity revision conflict' using errcode='40001'; end if;
 end if;
 for ref in select value from jsonb_array_elements(coalesce(p_patch->'evidence_refs','[]')||coalesce(p_patch->'related_refs','[]')||
  case when p_patch ? 'primary_ref' then jsonb_build_array(p_patch->'primary_ref') else '[]'::jsonb end) loop
  if not career_resource_available_v1(p_user,ref) then raise exception 'Source unavailable'; end if;
 end loop;
 rec:=coalesce((p_patch->>'recommendation_id')::uuid,item.recommendation_id);
 if rec is null and coalesce(p_patch->'primary_ref',item.primary_ref)->>'kind'='role' then
  select id into rec from talent_opportunity_recommendation where talent_id=p_user
   and role_id::text=coalesce(p_patch->'primary_ref',item.primary_ref)->>'id' order by recommended_at desc,id desc limit 1;
  if rec is null and exists(select 1 from company_roles where role_id::text=coalesce(p_patch->'primary_ref',item.primary_ref)->>'id' and source_type='internal') then
   raise exception 'Publish this selected internal Role through the existing recommendation writer first';
  end if;
 end if;
 if rec is not null and not exists(select 1 from talent_opportunity_recommendation where id=rec and talent_id=p_user) then raise exception 'Recommendation unavailable'; end if;
 if rec is not null then rec:=current_talent_recommendation_id_v1(rec);end if;
 if rec is not null and p_patch ? 'application_stage' then
  raise exception 'Use set_stage on the linked Role recommendation';
 end if;
 if item.id is null and rec is not null then
  select * into item from career_opportunities where talent_id=p_user and recommendation_id=rec and merged_into_id is null and deleted_at is null for update;
  if found then return item;end if;
 end if;
 if rec is not null then
  select * into legacy from talent_opportunity_recommendation where id=rec and talent_id=p_user for update;
  if not (jsonb_build_array(coalesce(p_patch->'primary_ref',item.primary_ref))||coalesce(p_patch->'related_refs',item.related_refs,'[]'))
    @> jsonb_build_array(jsonb_build_object('kind','role','id',legacy.role_id::text)) then raise exception 'Recommendation Role does not match opportunity references'; end if;
  if p_patch ? 'saved' then
   if not (p_patch->>'saved')::boolean and legacy.saved_stage is not null and legacy.saved_stage<>'saved' then
    raise exception 'Opportunity has existing progress' using errcode='40001';
   end if;
   if not (p_patch->>'saved')::boolean or legacy.saved_stage is null then
    select source_type='internal' into internal_role from company_roles where role_id=legacy.role_id;
    perform update_talent_role_feedback_v2(p_user,rec,case when not (p_patch->>'saved')::boolean then null when internal_role then 'keep' else 'like' end,
     null,case when (p_patch->>'saved')::boolean then 'saved' else null end,now(),legacy.updated_at,'career');
   end if;
  end if;
 end if;
 if item.id is null then
  insert into career_opportunities(id,talent_id,primary_ref,title,body,related_refs,evidence_refs,presentation,recommendation_id,display_order,application_stage,saved_at,archived_at)
  values(p_id,p_user,p_patch->'primary_ref',p_patch->>'title',coalesce(p_patch->>'body',''),coalesce(p_patch->'related_refs','[]'),
   coalesce(p_patch->'evidence_refs','[]'),coalesce(p_patch->'presentation','{}'),rec,coalesce((p_patch->>'display_order')::numeric,0),p_patch->>'application_stage',case when rec is null and (p_patch->>'saved')::boolean then now() else null end,case when (p_patch->>'archived')::boolean then now() else null end) returning * into item;
 else
  update career_opportunities set revision=revision+1,updated_at=now(),
   primary_ref=coalesce(p_patch->'primary_ref',primary_ref),title=coalesce(p_patch->>'title',title),body=coalesce(p_patch->>'body',body),
   related_refs=coalesce(p_patch->'related_refs',related_refs),evidence_refs=coalesce(p_patch->'evidence_refs',evidence_refs),
   presentation=coalesce(p_patch->'presentation',presentation),recommendation_id=rec,
   display_order=case when p_patch ? 'display_order' and (p_actor='user' or order_source<>'user') then (p_patch->>'display_order')::numeric else display_order end,
   order_source=case when p_patch ? 'display_order' and p_actor='user' then 'user' else order_source end,
   application_stage=case when p_patch ? 'application_stage' then p_patch->>'application_stage' else application_stage end,
   saved_at=case when p_patch ? 'saved' and rec is null then case when (p_patch->>'saved')::boolean then coalesce(saved_at,now()) else null end else saved_at end,
   archived_at=case when p_patch ? 'archived' then case when (p_patch->>'archived')::boolean then now() else null end else archived_at end
  where id=p_id and talent_id=p_user returning * into item;
 end if;
 return item;
end $$;

create or replace function public.career_merge_opportunities_v1(p_user uuid,p_from uuid,p_to uuid,p_from_revision bigint,p_to_revision bigint)
returns public.career_opportunities language plpgsql security invoker set search_path=public,pg_temp as $$
declare a career_opportunities; b career_opportunities; cursor_id uuid; seen uuid[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('career-alias:'||p_user::text,0));
 select * into a from career_opportunities where id=p_from and talent_id=p_user for update;
 if not found then raise exception 'Opportunity unavailable'; end if;
 select * into b from career_opportunities where id=p_to and talent_id=p_user for update;
 if not found then raise exception 'Opportunity unavailable'; end if;
 if a.revision<>p_from_revision or b.revision<>p_to_revision then raise exception 'Opportunity revision conflict' using errcode='40001'; end if;
 cursor_id:=p_to;
 while cursor_id is not null loop
  if cursor_id=p_from or cursor_id=any(seen) then raise exception 'Opportunity alias cycle'; end if;
  seen:=array_append(seen,cursor_id);
  select merged_into_id into cursor_id from career_opportunities where id=cursor_id and talent_id=p_user;
 end loop;
 if b.merged_into_id is not null then raise exception 'Read the canonical target before merging'; end if;
 if a.recommendation_id is not null and b.recommendation_id is not null and a.recommendation_id<>b.recommendation_id then raise exception 'Resolve current legacy recommendation before merging'; end if;
 if a.application_stage is not null and b.application_stage is not null and a.application_stage<>b.application_stage then
  raise exception 'Resolve conflicting application stages before merging' using errcode='40001';
 end if;
 update career_opportunities set merged_into_id=p_to,recommendation_id=null,revision=revision+1,updated_at=now() where id=p_from;
 update career_opportunities set recommendation_id=coalesce(b.recommendation_id,a.recommendation_id),
  related_refs=(select coalesce(jsonb_agg(distinct r),'[]') from jsonb_array_elements(b.related_refs||a.related_refs||jsonb_build_array(a.primary_ref)) r where r<>b.primary_ref),
  evidence_refs=(select coalesce(jsonb_agg(distinct r),'[]') from jsonb_array_elements(b.evidence_refs||a.evidence_refs) r),
  application_stage=coalesce(b.application_stage,a.application_stage),saved_at=coalesce(b.saved_at,a.saved_at),revision=revision+1,updated_at=now() where id=p_to returning * into b;
 return b;
end $$;

create or replace function public.career_list_opportunities_v1(p_user uuid,p_saved boolean,p_archived boolean,p_offset integer,p_limit integer,p_unbound boolean default false)
returns table(id uuid,total_count bigint) language sql stable security invoker set search_path=public,pg_temp as $$
 select o.id,count(*) over() from career_opportunities o left join talent_opportunity_recommendation r on r.id=o.recommendation_id and r.talent_id=o.talent_id
 where o.talent_id=p_user and o.deleted_at is null and o.merged_into_id is null and (not p_unbound or o.recommendation_id is null)
  and (not p_unbound or p_archived or o.application_stage is null)
  and ((p_archived and o.archived_at is not null) or (not p_archived and o.archived_at is null))
  and (p_saved is null or p_saved=(case when o.recommendation_id is null then o.saved_at is not null or exists(select 1 from career_opportunity_work_v1(p_user,o.id::text,false,0,1))
    else r.saved_stage is not null and r.saved_stage<>'hidden' end))
 order by o.display_order,o.id offset p_offset limit p_limit
$$;
