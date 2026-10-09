begin;
alter table public.opportunity_discovery_run add column if not exists not_before timestamptz not null default now();
create unique index if not exists opportunity_matching_refresh_pending_talent_idx
  on public.opportunity_discovery_run(talent_id) where trigger='matching_refresh' and status='queued';

-- A committed matching input change queues work atomically. This helper is also
-- used by the profile-source trigger; Memory/embedding-only changes do not queue.
create or replace function public.enqueue_matching_input_refresh_v1(p_talent uuid,p_source text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.talent_setting where user_id=p_talent and is_onboarding_done=true
      and coalesce(profile_visibility,'')<>'dont_share' and coalesce(get_internal_recommendation,true)) then return; end if;
  insert into public.opportunity_discovery_run(talent_id,trigger,run_mode,target_recommendation_count,not_before,trigger_payload)
    values(p_talent,'matching_refresh','refresh',3,now()+interval '120 seconds',jsonb_build_object('source',p_source))
  on conflict(talent_id) where trigger='matching_refresh' and status='queued'
    do update set not_before=least(opportunity_discovery_run.created_at+interval '5 minutes',now()+interval '120 seconds'),updated_at=now();
end $$;
revoke all on function public.enqueue_matching_input_refresh_v1(uuid,text) from public,anon,authenticated;

create or replace function public.refresh_matching_after_brief_change_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_talent uuid:=coalesce(new.talent_id,old.talent_id);
begin
  if coalesce(new.collection,'')<>'brief' and coalesce(old.collection,'')<>'brief' then return null; end if;
  if tg_op='UPDATE' and row(new.content,new.label,new.deleted_at,new.collection)
      is not distinct from row(old.content,old.label,old.deleted_at,old.collection) then return null; end if;
  if not exists(select 1 from public.talent_setting where user_id=v_talent and is_onboarding_done=true
      and coalesce(profile_visibility,'')<>'dont_share' and coalesce(get_internal_recommendation,true)) then return null; end if;
  update public.talent_opportunity_fit set expires_at=least(expires_at,now())
    where talent_id=v_talent and fit_contract_version='talent_role_fit_v2';
  update public.talent_opportunity_matching_review set closed_at=now(),close_reason='source_changed'
    where talent_id=v_talent and recommendation_id is null and closed_at is null;
  perform public.enqueue_matching_input_refresh_v1(v_talent,'brief_changed');
  return null;
end $$;
revoke all on function public.refresh_matching_after_brief_change_v1() from public,anon,authenticated;
create trigger refresh_matching_after_brief_change
  after insert or update or delete on public.talent_contexts
  for each row execute function public.refresh_matching_after_brief_change_v1();

create unique index if not exists matching_clarification_sent_run_ref_idx
  on public.talent_progress(talent_id,(metadata->>'discoveryRunId'),(metadata->>'ref'))
  where kind='matching_clarification_sent';
commit;
