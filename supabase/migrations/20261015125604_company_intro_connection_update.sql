-- Keep acceptance history immediate; notify the company after the connection completes.
-- Existing events are not replayed or rewritten. Apply alongside the web notification change.
create or replace function public.record_company_intro_decision_progress_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_delivery jsonb;
  v_delivered_at timestamptz;
begin
  if new.close_reason='talent_declined' and
     (old.close_reason is distinct from new.close_reason or old.talent_decision_at is distinct from new.talent_decision_at) then
    insert into public.talent_progress(talent_id,role_id,recommendation_id,kind,text,metadata,open_to_company,open_to_talent)
    values(new.talent_id,new.role_id,new.recommendation_id,'company_intro_decision',
      '후보자가 이 회사의 제안을 거절했습니다.',
      jsonb_build_object('introCandidateId',new.id,'decision','declined','decidedAt',new.talent_decision_at),true,true);
    perform public.enqueue_company_update_v1(new.company_workspace_id,new.role_id,
      'intro-declined:'||new.id::text,
      'Tell the company about the candidate decision and what it means for their hiring conversation.',
      jsonb_build_object('candidateName',(select name from public.talent_users where user_id=new.talent_id),
        'roleName',(select name from public.company_roles where role_id=new.role_id),
        'candidateDecision','declined','decisionAt',new.talent_decision_at,
        'companyIntroCandidateId',new.id,'talentId',new.talent_id,'roleId',new.role_id,
        'companyIntroWasRequestedAt',new.requested_at,'candidateReceivedIntroAt',new.candidate_sent_at,
        'privateReasonShared',false));
  elsif new.status in ('connecting','connected') and new.talent_decision_at is not null
      and old.talent_decision_at is distinct from new.talent_decision_at then
    insert into public.talent_progress(talent_id,role_id,recommendation_id,kind,text,metadata,open_to_company,open_to_talent)
    values(new.talent_id,new.role_id,new.recommendation_id,'company_intro_decision',
      '후보자가 이 회사의 연결 제안을 수락했습니다.',
      jsonb_build_object('introCandidateId',new.id,'decision','accepted','decidedAt',new.talent_decision_at),true,true);
  end if;
  if new.status='connected' and old.status is distinct from new.status
      and new.talent_decision_at is not null then
    select metadata, created_at into v_delivery, v_delivered_at
    from public.talent_progress
    where talent_id=new.talent_id and role_id=new.role_id
      and recommendation_id=new.recommendation_id and kind='org_stage_change'
      and metadata->>'workspaceId'=new.company_workspace_id::text
      and (nullif(metadata->>'introEmailMessageId','') is not null
        or nullif(metadata->>'introEmailResendId','') is not null)
    order by created_at desc limit 1;
    perform public.enqueue_company_update_v1(new.company_workspace_id,new.role_id,
      'intro-accepted:'||new.id::text,
      'Update the company on the candidate’s acceptance and completed introduction, connecting this outcome to who the earlier Intro was for, which role it concerned, and when it was sent.',
      jsonb_build_object('candidateName',(select name from public.talent_users where user_id=new.talent_id),
        'roleName',(select name from public.company_roles where role_id=new.role_id),
        'candidateDecision','accepted','decisionAt',new.talent_decision_at,
        'companyIntroCandidateId',new.id,'talentId',new.talent_id,'roleId',new.role_id,
        'recommendationId',new.recommendation_id,
        'companyIntroWasRequestedAt',new.requested_at,'candidateReceivedIntroAt',new.candidate_sent_at,
        'connectedAt',new.connected_at,'introductionEmailSent',v_delivery is not null,
        'introductionEmailRecordedAt',v_delivered_at));
  end if;
  return new;
end;
$function$;
revoke all on function public.record_company_intro_decision_progress_v1() from public, anon, authenticated;
