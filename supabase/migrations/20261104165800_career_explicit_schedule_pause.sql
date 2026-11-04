-- Explicit pause/cancel supersedes a settings pause at the write boundary.
-- This also protects callers deployed before the daily collector.
create or replace function public.write_career_schedule(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_agent_schedules; operation public.talent_external_operations; action text:=p_input->>'action'; body jsonb; operation_id uuid; future_only boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_schedule:'||p_request_id,0));
 select * into operation from public.talent_external_operations where user_id=p_user_id and kind='career_schedule_mutation' and idempotency_key=p_request_id;
 if found then return operation.result; end if;
 if p_conversation_id is not null and not exists(select 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id) then raise exception 'Conversation unavailable'; end if;
 if p_input#>'{target_refs,companyFollowupIds}' is not null then
   if jsonb_typeof(p_input#>'{target_refs,companyFollowupIds}')<>'array' then raise exception 'companyFollowupIds must be an array'; end if;
   if exists(select 1 from jsonb_array_elements_text(p_input#>'{target_refs,companyFollowupIds}') target(id)
     where not exists(select 1 from public.company_talent_followups f where f.id=target.id::uuid and f.talent_id=p_user_id)) then
     raise exception 'Company follow-up unavailable';
   end if;
 end if;
 if action='create' then
   insert into public.talent_agent_schedules(talent_id,conversation_id,source_message_id,title,instruction,target_refs,timezone,next_run_at,recurrence,interval_days)
   values(p_user_id,p_conversation_id,(p_input->>'source_message_id')::bigint,p_input->>'title',p_input->>'instruction',coalesce(p_input->'target_refs','{}'),p_input->>'timezone',(p_input->>'next_run_at')::timestamptz,p_input->>'recurrence',(p_input->>'interval_days')::double precision) returning * into item;
 else
   select * into item from public.talent_agent_schedules where id=(p_input->>'schedule_id')::uuid and talent_id=p_user_id for update;
   if not found then raise exception 'Schedule unavailable'; end if;
   if item.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Schedule revision conflict'; end if;
   if action not in ('update','pause','resume','cancel') then raise exception 'Invalid schedule action'; end if;
   -- Only an occurrence modifying its own future schedule keeps its current
   -- authority. A concurrent user edit still increments directive_revision.
   future_only:=exists(select 1 from public.opportunity_discovery_run r
     where r.id=(p_input->>'background_run_id')::uuid and r.id=item.last_run_id
       and r.talent_id=p_user_id and r.status='handed_off'
       and r.trigger_payload->'sourceEvents' @> jsonb_build_array(jsonb_build_object(
         'sourceKind','schedule','sourceId',item.id,'revision',item.directive_revision)));
   update public.talent_agent_schedules set
     title=case when p_input ? 'title' then p_input->>'title' else title end,
     instruction=case when p_input ? 'instruction' then p_input->>'instruction' else instruction end,
     target_refs=(case when p_input ? 'target_refs' then p_input->'target_refs' else target_refs end)
       - case when action in ('pause','cancel') then array['externalPolicyPaused'] else '{}'::text[] end,
     timezone=case when p_input ? 'timezone' then p_input->>'timezone' else timezone end,
     -- Inactive status stops collection. Retain the date so one-time work can
     -- resume without losing the user's saved time.
     next_run_at=case when p_input ? 'next_run_at' then (p_input->>'next_run_at')::timestamptz else next_run_at end,
     recurrence=case when p_input ? 'recurrence' then p_input->>'recurrence' else recurrence end,
     interval_days=case when p_input ? 'interval_days' then (p_input->>'interval_days')::double precision else interval_days end,
     status=case action when 'pause' then 'paused' when 'cancel' then 'cancelled' when 'resume' then 'active' else case when p_input->>'next_run_at' is not null and status in ('completed','triggered') then 'active' else status end end,
     revision=revision+1,
     directive_revision=directive_revision+case when future_only then 0 when action in ('pause','cancel')
       or (p_input ? 'instruction' and p_input->>'instruction' is distinct from instruction)
       or (p_input ? 'target_refs' and p_input->'target_refs' is distinct from target_refs) then 1 else 0 end,
     updated_at=now() where id=item.id returning * into item;
 end if;
 body:=to_jsonb(item);
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
 values(p_user_id,p_conversation_id,'career_schedule_mutation',p_request_id,'completed',
   p_input||jsonb_build_object('appliesTo',case when future_only then 'future_occurrences' else 'current_and_future' end),body)
 returning id into operation_id;
 update public.talent_agent_schedules set last_operation_id=operation_id where id=item.id returning * into item;
 body:=to_jsonb(item)||jsonb_build_object('last_change',jsonb_build_object('id',operation_id,
   'request',p_input||jsonb_build_object('appliesTo',case when future_only then 'future_occurrences' else 'current_and_future' end),'created_at',now()));
 update public.talent_external_operations set result=body where id=operation_id;
 return body;
end $$;

