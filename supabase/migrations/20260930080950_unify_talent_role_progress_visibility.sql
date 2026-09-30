-- Add row-level audience scopes and safe display text before moving the
-- candidate-only activity rows into this table.
alter table public.talent_progress
  add column if not exists open_to_talent boolean not null default false,
  add column if not exists open_to_company boolean not null default false,
  add column if not exists talent_text text,
  add column if not exists company_text text;

create or replace function public.set_talent_progress_audiences_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  -- Only the selected, recipient-safe text is returned to UI/agent readers.
  -- Unknown kinds and Ops notes stay private until their writer defines a scope.
  if new.kind in ('memo', 'saved_stage_changed') then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.talent_text := coalesce(new.talent_text, new.text);
    new.company_text := null;
  elsif new.kind = 'candidate_requested_connection' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.talent_text := '이 역할의 우선 검토를 요청했습니다.';
    new.company_text := null;
  elsif new.kind = 'internal_fit_question_asked' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.talent_text := 'Harper가 이 역할의 적합성을 확인하는 질문을 보냈습니다.';
    new.company_text := null;
  elsif new.kind = 'internal_followup_sent' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.talent_text := 'Harper가 이 역할에 대한 진행 확인 연락을 보냈습니다.';
    new.company_text := 'Harper가 후보자에게 이 역할의 진행 확인 연락을 보냈습니다.';
  elsif new.kind = 'internal_process_stopped_notified' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.talent_text := 'Harper가 이 역할의 프로세스 종료를 안내했습니다.';
    new.company_text := 'Harper가 후보자에게 이 역할의 프로세스 종료를 안내했습니다.';
  elsif new.kind = 'company_request_followup_sent' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.talent_text := 'Harper가 이 역할에 관한 회사의 요청을 다시 안내했습니다.';
    new.company_text := 'Harper가 후보자에게 회사의 요청을 다시 안내했습니다.';
  elsif new.kind = 'candidate_role_recommendation_presented' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.talent_text := 'Harper가 이 역할을 제안했습니다.';
    new.company_text := null;
  elsif new.kind = 'candidate_role_recommendation_accepted' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.talent_text := '이 역할의 제안을 수락했습니다.';
    new.company_text := null;
  elsif new.kind = 'org_candidate_activity' then
    new.open_to_company := true;
    new.open_to_talent := new.metadata ->> 'eventType' in
      ('candidate_contact_sent', 'candidate_message_delivered', 'candidate_response_received');
    new.company_text := coalesce(new.company_text, new.text);
    new.talent_text := case new.metadata ->> 'eventType'
      when 'candidate_contact_sent' then '회사에서 이 역할에 관한 연락을 보냈습니다.'
      when 'candidate_message_delivered' then '이 역할에 관한 메시지가 회사에 전달됐습니다.'
      when 'candidate_response_received' then '이 역할에 관한 답변이 도착했습니다.'
      else null end;
  elsif new.kind = 'org_stage_change' then
    new.open_to_talent := false;
    new.open_to_company := true;
    new.talent_text := null;
    new.company_text := case
      when new.metadata ->> 'stage' = 'process_stopped'
        and new.metadata ->> 'stopReason' = 'candidate'
        then '후보자가 진행 중단을 요청하여 이 포지션의 프로세스가 종료되었습니다.'
          || case when nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'stopNote') else '' end
      when new.metadata ->> 'stage' = 'connected'
        or nullif(btrim(new.metadata ->> 'acceptReason'), '') is not null
        then '수락했습니다.'
          || case when nullif(btrim(new.metadata ->> 'acceptReason'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'acceptReason') else '' end
      when new.metadata ->> 'stage' = 'process_stopped'
        or nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
        then '거절했습니다.'
          || case when nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'stopNote') else '' end
      else new.text end;
  elsif new.kind in ('org_note', 'org_candidate_role_move') then
    new.open_to_talent := false;
    new.open_to_company := true;
    new.talent_text := null;
    new.company_text := coalesce(new.company_text, new.text);
  elsif new.kind = 'org_slack_profile_view' then
    new.open_to_talent := false;
    new.open_to_company := true;
    new.talent_text := null;
    new.company_text := '후보자 프로필을 열람했습니다.';
  elsif new.kind = 'intro_to_company' then
    new.open_to_talent := false;
    new.open_to_company := new.metadata ->> 'deliveryStatus' = 'sent';
    new.talent_text := null;
    new.company_text := case when new.open_to_company
      then 'Harper가 후보자 정보를 회사에 전달했습니다.' else null end;
  elsif new.kind = 'manual_note' then
    new.open_to_talent := false;
    new.open_to_company := false;
    new.talent_text := null;
    new.company_text := null;
  end if;
  return new;
end;
$function$;

revoke all on function public.set_talent_progress_audiences_v1()
  from public, anon, authenticated;

drop trigger if exists talent_progress_audiences on public.talent_progress;
create trigger talent_progress_audiences
before insert or update of kind, text, metadata
on public.talent_progress
for each row execute function public.set_talent_progress_audiences_v1();

-- Visibility-only backfill does not change evidence for Behavior Context.
alter table public.talent_progress disable trigger talent_progress_behavior_context_change;
alter table public.talent_progress disable trigger talent_progress_company_intro_route;
update public.talent_progress set kind = kind;

alter table public.talent_progress enable trigger talent_progress_behavior_context_change;
alter table public.talent_progress enable trigger talent_progress_company_intro_route;

alter table public.talent_progress
  add constraint talent_progress_talent_public_text_check
    check (not open_to_talent or nullif(btrim(talent_text), '') is not null),
  add constraint talent_progress_company_public_text_check
    check (not open_to_company or nullif(btrim(company_text), '') is not null);

create index if not exists talent_progress_talent_feed_idx
  on public.talent_progress (talent_id, role_id, created_at desc, id desc)
  where open_to_talent;
create index if not exists talent_progress_company_feed_idx
  on public.talent_progress (role_id, talent_id, created_at desc, id desc)
  where open_to_company;
