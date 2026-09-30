-- Preserve the public closure cause in the single shared text.
create or replace function public.set_talent_progress_audiences_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_original_text text := new.text;
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.kind in ('memo', 'saved_stage_changed') then
    new.open_to_talent := true;
    new.open_to_company := false;
  elsif new.kind = 'candidate_requested_connection' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := '이 역할의 우선 검토를 요청했습니다.';
  elsif new.kind = 'internal_fit_question_asked' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := 'Harper가 이 역할의 적합성을 확인하는 질문을 보냈습니다.';
  elsif new.kind = 'internal_followup_sent' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.text := 'Harper가 이 역할의 진행 확인 연락을 보냈습니다.';
  elsif new.kind = 'internal_process_stopped_notified' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.text := case new.metadata ->> 'closureKind'
      when 'role_ended' then 'Harper가 이 역할의 채용 종료를 안내했습니다.'
      when 'company_process_stopped' then 'Harper가 회사의 결정으로 이 역할의 프로세스 종료를 안내했습니다.'
      else 'Harper가 이 역할의 프로세스 종료를 안내했습니다.' end;
  elsif new.kind = 'company_request_followup_sent' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.text := 'Harper가 이 역할에 관한 회사의 요청을 다시 안내했습니다.';
  elsif new.kind = 'candidate_role_recommendation_presented' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := 'Harper가 이 역할을 제안했습니다.';
  elsif new.kind = 'candidate_role_recommendation_accepted' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := '이 역할의 제안을 수락했습니다.';
  elsif new.kind = 'org_candidate_activity' then
    new.open_to_talent := coalesce(new.metadata ->> 'eventType' in
      ('candidate_contact_sent', 'candidate_message_delivered',
       'candidate_response_received'), false);
    new.open_to_company := new.open_to_talent;
    -- The same delivered message is available to both parties.
  elsif new.kind = 'org_stage_change' then
    -- A candidate's actual process stop is shared with both parties, unlike
    -- their private Career saved-stage changes.
    new.open_to_talent := coalesce(
      new.metadata ->> 'stage' = 'process_stopped'
        and new.metadata ->> 'stopReason' = 'candidate',
      false
    );
    new.open_to_company := true;
    new.text := case
      when new.metadata ->> 'stage' = 'process_stopped'
        and new.metadata ->> 'stopReason' = 'candidate'
        then '후보자가 진행 중단을 요청하여 이 포지션의 프로세스가 종료되었습니다.'
          || case when nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'stopNote') else '' end
      when new.metadata ->> 'stage' = 'connected'
        or nullif(btrim(new.metadata ->> 'acceptReason'), '') is not null
        then '회사에서 이 역할의 진행을 수락했습니다.'
          || case when nullif(btrim(new.metadata ->> 'acceptReason'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'acceptReason') else '' end
      when new.metadata ->> 'stage' = 'process_stopped'
        or nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
        then '회사에서 이 역할의 채용 프로세스를 중단했습니다.'
          || case when nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'stopNote') else '' end
      else new.text end;
  elsif new.kind in ('org_note', 'org_candidate_role_move') then
    new.open_to_talent := false;
    new.open_to_company := true;
  elsif new.kind = 'org_slack_profile_view' then
    new.open_to_talent := false;
    new.open_to_company := true;
    new.text := '후보자 프로필을 열람했습니다.';
  elsif new.kind = 'intro_to_company' then
    new.open_to_talent := false;
    new.open_to_company := coalesce(new.metadata ->> 'deliveryStatus' = 'sent', false);
    if new.open_to_company then
      new.text := 'Harper가 후보자 정보를 회사에 전달했습니다.';
    end if;
  else
    new.open_to_talent := false;
    new.open_to_company := false;
  end if;

  if new.text is distinct from v_original_text
      and not (new.metadata ? '_internal_original_text') then
    new.metadata := new.metadata || jsonb_build_object(
      '_internal_original_text', v_original_text
    );
  end if;
  return new;
end;
$function$;

-- A direct audience-flag update must pass the same classification rule.
drop trigger if exists talent_progress_audiences on public.talent_progress;
create trigger talent_progress_audiences
before insert or update of kind, text, metadata, open_to_talent, open_to_company
on public.talent_progress
for each row execute function public.set_talent_progress_audiences_v1();

-- Refresh affected public wording; leave unrelated progress and behavior cache untouched.
alter table public.talent_progress disable trigger talent_progress_behavior_context_change;
update public.talent_progress
set kind = kind
where kind = 'internal_process_stopped_notified'
   or (kind = 'org_stage_change'
       and (metadata ->> 'stage' in ('connected', 'process_stopped')
            or nullif(btrim(metadata ->> 'acceptReason'), '') is not null
            or nullif(btrim(metadata ->> 'stopNote'), '') is not null));
alter table public.talent_progress enable trigger talent_progress_behavior_context_change;
