-- Explicit, one-time transfer of legacy scheduling facts. Installing this
-- function does not migrate users or change the default for new onboarding.
drop function public.transition_career_agent_schedules(boolean);
create function public.transition_career_agent_schedules(
 p_dry_run boolean default true,
 p_cutover_at timestamptz default now()
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 candidate record; setting public.talent_setting; item public.talent_agent_schedules;
 action text; operation_key text; operation_id uuid; before_row jsonb; plan jsonb;
 base_days integer; cadence_days integer; cadence_seconds double precision;
 enabled boolean; next_at timestamptz; legacy_due timestamptz; anchor_at timestamptz; anchor_source text;
 eligible integer:=0; created integer:=0; corrected integer:=0; adopted integer:=0;
 preserved integer:=0; skipped_active integer:=0; skipped_legacy integer:=0; already_migrated integer:=0;
 targets jsonb:='[]'::jsonb; planning_at timestamptz:=greatest(p_cutover_at,now());
 -- Exact persisted bootstrap values, not a classification of user prose.
 bootstrap_instruction constant text:='Continue useful Career work from the current Brief, conversation, pending work and contact history. Decide whether contact is useful or owed, and adjust this schedule when the context warrants. Respect current contact settings and explicit user instructions.';
begin
 if p_cutover_at is null or not isfinite(p_cutover_at) then raise exception 'A finite cutover timestamp is required'; end if;
 if p_dry_run is null then raise exception 'Dry run must be explicit'; end if;
 for candidate in
   select t.user_id,coalesce(t.created_at,u.created_at) as original_created_at from public.talent_setting t
   join public.talent_users u on u.user_id=t.user_id and u.deleted_at is null
   where t.is_onboarding_done is true and coalesce(t.created_at,u.created_at)<=p_cutover_at
   order by t.user_id
 loop
   -- Onboarding already locks the setting before taking the check-in lock.
   -- Use the same order; schedule edits/claims serialize on the schedule row.
   if not p_dry_run then
     select * into setting from public.talent_setting where user_id=candidate.user_id for update;
     perform pg_advisory_xact_lock(hashtextextended(candidate.user_id::text||':career_check_in',0));
   else
     select * into setting from public.talent_setting where user_id=candidate.user_id;
   end if;
   if setting.is_onboarding_done is not true or not exists(
     select 1 from public.talent_users where user_id=candidate.user_id and deleted_at is null
   ) then continue; end if;
   operation_key:='career_scheduler_transition:v2:'||candidate.user_id::text;
   if exists(select 1 from public.talent_external_operations where user_id=candidate.user_id
     and kind='career_schedule_mutation' and idempotency_key=operation_key) then
     already_migrated:=already_migrated+1; continue;
   end if;
   if exists(select 1 from public.opportunity_discovery_run r where r.talent_id=candidate.user_id
     and r.status in ('queued','running','handed_off')) then
     skipped_active:=skipped_active+1;
     if exists(select 1 from public.opportunity_discovery_run r where r.talent_id=candidate.user_id
       and r.status in ('queued','running') and coalesce(r.trigger_payload->>'runContract','') not in (
         'career_agent_v1','career_internal_evaluation_v1','career_follow_external_evaluation_v1','career_external_context_v1'
       )) then skipped_legacy:=skipped_legacy+1; end if;
     continue;
   end if;
   if p_dry_run then
     select * into item from public.talent_agent_schedules where talent_id=candidate.user_id
       and (schedule_key='career_check_in' or (schedule_key is null and target_refs->>'legacySchedulerReview'='true'))
       order by (schedule_key='career_check_in') desc nulls last,created_at,id limit 1;
   else
     select * into item from public.talent_agent_schedules where talent_id=candidate.user_id
       and (schedule_key='career_check_in' or (schedule_key is null and target_refs->>'legacySchedulerReview'='true'))
       order by (schedule_key='career_check_in') desc nulls last,created_at,id limit 1 for update;
   end if;
   before_row:=case when item.id is null then null else to_jsonb(item) end;
   if item.id is null then
     action:='create';
   elsif item.created_at>p_cutover_at then
     preserved:=preserved+1; continue;
   elsif item.schedule_key is null then
     -- Preserve an earlier explicit transition's timing, instructions and pause.
     action:='adopt';
   elsif item.revision=1 and item.directive_revision=1 and item.last_operation_id is null
     and item.last_run_id is null and item.conversation_id is null and item.source_message_id is null
     and item.created_at=item.updated_at and item.interval_days=3 and item.recurrence is null
     and item.target_refs='{}'::jsonb and item.timezone='Asia/Seoul'
     and item.title='Career check-in' and item.instruction=bootstrap_instruction
     and ((item.status='active' and item.next_run_at=item.created_at+interval '3 days')
       or (item.status='paused' and item.next_run_at is null)) then
     action:='correct_bootstrap';
   else
     preserved:=preserved+1; continue;
   end if;

   base_days:=greatest(1,least(coalesce(setting.periodic_interval_days,3),7));
   cadence_days:=base_days*case when setting.status='passive' then 2 else 1 end;
   enabled:=(coalesce(setting.get_external_recommendation,true) and coalesce(setting.status,'')<>'stopped')
     or (coalesce(setting.get_internal_recommendation,true) and coalesce(setting.profile_visibility,'')<>'dont_share');
   select next_check_at into legacy_due from public.opportunity_scheduler_state where talent_id=candidate.user_id;
   anchor_at:=null;
   anchor_source:='legacy_next_check';
   next_at:=legacy_due;
   if next_at is null then
     -- Missing scheduler cursor: preserve the phase of actual contact or signup,
     -- instead of restarting every account's clock at the time of this migration.
     select max(sent_at) into anchor_at from public.talent_opportunity_delivery
       where talent_id=candidate.user_id and status='sent' and sent_at<=planning_at;
     anchor_source:='last_sent_delivery';
     if anchor_at is null then
       select max(created_at) into anchor_at from public.talent_messages
         where user_id=candidate.user_id and role='user' and message_type='profile_submit' and created_at<=planning_at;
       anchor_source:='profile_submission';
     end if;
     if anchor_at is null then anchor_at:=candidate.original_created_at; anchor_source:='account_created'; end if;
     next_at:=anchor_at+make_interval(days=>cadence_days);
   end if;
   if not enabled then next_at:=null;
   elsif next_at<=planning_at then
     -- Missed periodic checks are not a backlog of promised messages. Advance by
     -- whole existing intervals, retaining each user's phase; never enqueue here.
     cadence_seconds:=cadence_days*86400.0;
     next_at:=next_at+make_interval(secs=>(floor(extract(epoch from(planning_at-next_at))/cadence_seconds)+1)*cadence_seconds);
   end if;
   if action='adopt' then
     next_at:=item.next_run_at;
   end if;
   plan:=jsonb_build_object('talentId',candidate.user_id,'action',action,
     'scheduleId',item.id,'before',case when item.id is null then null else jsonb_build_object(
       'status',item.status,'intervalDays',item.interval_days,'nextRunAt',item.next_run_at,'revision',item.revision) end,
     'after',jsonb_build_object('status',case when action='adopt' then item.status when enabled then 'active' else 'paused' end,
       'intervalDays',case when action='adopt' then item.interval_days else cadence_days end,'nextRunAt',next_at),
     'source',jsonb_build_object('legacyStatus',setting.status,'baseIntervalDays',base_days,
       'legacyNextCheckAt',legacy_due,'anchorAt',anchor_at,'anchorSource',anchor_source));
   eligible:=eligible+1;
   targets:=targets||jsonb_build_array(plan);
   if p_dry_run then continue; end if;

   if action='create' then
     insert into public.talent_agent_schedules(talent_id,schedule_key,title,instruction,interval_days,next_run_at,status)
       values(candidate.user_id,'career_check_in','Career check-in',bootstrap_instruction,cadence_days,next_at,
         case when enabled then 'active' else 'paused' end) returning * into item;
     created:=created+1;
   elsif action='correct_bootstrap' then
     update public.talent_agent_schedules set interval_days=cadence_days,next_run_at=next_at,
       status=case when enabled then 'active' else 'paused' end,
       revision=revision+1,directive_revision=directive_revision+1,updated_at=now()
       where id=item.id returning * into item;
     corrected:=corrected+1;
   else
     update public.talent_agent_schedules set schedule_key='career_check_in' where id=item.id returning * into item;
     adopted:=adopted+1;
   end if;
   -- Reuse the existing mutation ledger: retries must never re-seed an edited
   -- schedule. Keep the full before/after execution fact for cutover review.
   insert into public.talent_external_operations(user_id,kind,idempotency_key,status,request,result)
     values(candidate.user_id,'career_schedule_mutation',operation_key,'completed',
       plan||jsonb_build_object('actor','migration','cutoverAt',p_cutover_at,'beforeSchedule',before_row),to_jsonb(item))
     returning id into operation_id;
   if action<>'adopt' then
     update public.talent_agent_schedules set last_operation_id=operation_id where id=item.id returning * into item;
     update public.talent_external_operations set result=to_jsonb(item) where id=operation_id;
   end if;
 end loop;
 return jsonb_build_object('dryRun',p_dry_run,'cutoverAt',p_cutover_at,'planningAt',planning_at,'eligible',eligible,
   'created',created,'corrected',corrected,'adopted',adopted,'preservedExisting',preserved,
   'alreadyMigrated',already_migrated,'skippedActiveRuns',skipped_active,'skippedActiveLegacy',skipped_legacy,'targets',targets);
end $$;
revoke all on function public.transition_career_agent_schedules(boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.transition_career_agent_schedules(boolean,timestamptz) to service_role;
