-- Applied to production as 20261016032644 on 2026-10-16 (DB only; web/Worker not deployed).
-- A delivered company-first proposal is a durable fact read by the Org candidate feed.
-- Reuse the progress PK for idempotency across retries and multiple Slack channels.
create or replace function public.company_presentation_progress_audience_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.kind = 'company_candidate_presented' then
    new.open_to_company := true;
    new.open_to_talent := false;
  end if;
  return new;
end $$;
revoke all on function public.company_presentation_progress_audience_v1() from public,anon,authenticated;
create trigger zz_company_presentation_progress_audience
before insert or update on public.talent_progress
for each row execute function public.company_presentation_progress_audience_v1();

create or replace function public.record_company_first_presentation_progress_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.delivery_kind <> 'company_first' or new.status <> 'sent' or old.status = 'sent' then
    return new;
  end if;
  insert into public.talent_progress
    (id,talent_id,role_id,kind,text,metadata,created_at)
  select md5('company_candidate_presented:'||new.run_id::text||':'||candidate.id::text)::uuid,
    candidate.talent_id,candidate.role_id,'company_candidate_presented',
    '후보자를 회사에 추천했습니다.',
    jsonb_build_object('companyIntroCandidateId',candidate.id,'runId',new.run_id,
      'outboxId',new.id,'deliveryStatus','sent'),coalesce(new.sent_at,now())
  from public.company_intro_candidates candidate
  where candidate.id=any(new.candidate_ids)
    and candidate.company_workspace_id=new.company_workspace_id
  on conflict(id) do nothing;
  return new;
end $$;
revoke all on function public.record_company_first_presentation_progress_v1() from public,anon,authenticated;
create trigger record_company_first_presentation_progress
after update of status on public.company_first_slack_outbox
for each row execute function public.record_company_first_presentation_progress_v1();
