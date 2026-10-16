-- Applied to production as 20261016033347 on 2026-10-16 (DB only).
-- Automatic defaults and date anchoring are already durable in company_talent_followups.
-- Scheduling/LLM reads use that table. Keep explicit actions and delivery receipts in progress.
create or replace function public.record_company_followup_event_v1(p_id uuid,p_event text,p_details jsonb default '{}')
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare f public.company_talent_followups;
begin
  select * into strict f from public.company_talent_followups where id=p_id;
  if p_event = 'date_anchored' or (
    p_event = 'scheduled' and f.idempotency_key =
      'initial:'||f.source_kind||':'||f.source_id::text||':'||f.delay_days::text
  ) then return; end if;
  insert into public.talent_progress(talent_id,role_id,recommendation_id,company_user_id,user_id,kind,text,metadata)
    values(f.talent_id,f.role_id,f.recommendation_id,coalesce(f.updated_by,f.created_by),'harper_worker','company_followup',
      '회사 요청의 후속 연락 기록',jsonb_build_object('eventType',p_event,'followupId',f.id,
      'sourceKind',f.source_kind,'sourceId',f.source_id,'dueAt',f.due_at,'revision',f.revision)||p_details);
end $$;
