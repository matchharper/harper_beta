-- A company may end a candidate's process without a separate notice from
-- Harper. Its choice still promises that the candidate's screen shows the
-- closed status. A notice closes the saved stage after delivery
-- (commit_internal_process_closure_notice_v1); a withheld closure has no
-- delivery, so it closes here, records no notice and wakes no agent.
-- Eligibility is the notice path's own: an accepted internal process the
-- candidate has not already closed or hidden.
create function public.close_withheld_company_closure_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_recommendation uuid;
begin
 if new.kind='org_stage_change' and new.metadata->>'stage' in ('process_stopped','archived')
   and new.metadata->>'notifyCandidateOnClosure'='false' and new.recommendation_id is not null then
   v_recommendation:=public.current_talent_recommendation_id_v1(new.recommendation_id);
   if public.career_closure_recommendation_current(v_recommendation,new.talent_id) then
     update public.talent_opportunity_recommendation set saved_stage='closed',updated_at=now()
     where id=v_recommendation and talent_id=new.talent_id and coalesce(saved_stage,'') not in ('closed','hidden');
   end if;
 end if;
 return null;
end $$;
create trigger close_withheld_company_closure after insert on public.talent_progress
for each row execute function public.close_withheld_company_closure_v1();
revoke all on function public.close_withheld_company_closure_v1() from public,anon,authenticated;
