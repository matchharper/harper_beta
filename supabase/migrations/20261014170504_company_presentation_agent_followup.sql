-- Record the optional company-side continuation with the actual delivery fact.
-- Presentations, writers, tables and constraints remain unchanged. These jobs
-- are staged by the existing enqueue RPC until a compatible runtime dispatches.
create or replace function public.enqueue_matching_presentation_followup_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role uuid;
begin
  if new.status not in ('sent','canceled') or old.status = new.status then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('matching-presentation:'||new.run_id::text,0));
  if exists(select 1 from company_first_slack_outbox where run_id=new.run_id and status in ('pending','failed','sending')) then return new; end if;
  for v_role in select distinct unnest(role_ids) from company_first_slack_outbox where run_id=new.run_id and status='sent' loop
    perform enqueue_company_update_v1(new.company_workspace_id,v_role,
      'candidate-presentation:'||new.run_id::text||':'||v_role::text,
      'The candidate presentation is already delivered. Continue only for useful authorized work or a consequential suggestion; otherwise finish silently. Do not repeat the presentation.',
      jsonb_build_object('companyMessageAlreadyDelivered',true,'selectionRunId',new.run_id,'candidatePresentationDelivered',true));
  end loop;
  return new;
end; $$;
revoke all on function public.enqueue_matching_presentation_followup_v1() from public,anon,authenticated;
create trigger enqueue_matching_presentation_followup after update of status on public.company_first_slack_outbox
for each row execute function public.enqueue_matching_presentation_followup_v1();

create or replace function public.enqueue_intro_presentation_followup_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_workspace uuid; v_key text;
begin
  if new.kind <> 'intro_to_company' or (new.metadata->>'deliveryStatus') is distinct from 'sent'
     or (old.metadata->>'deliveryStatus') is not distinct from 'sent' then return new; end if;
  v_key := nullif(new.metadata->>'idempotencyKey','');
  if v_key is null then return new; end if;
  select company_workspace_id into v_workspace from company_roles where role_id=new.role_id;
  if v_workspace is null then return new; end if;
  perform enqueue_company_update_v1(v_workspace,new.role_id,'presented:'||v_key,
    'The candidate introduction is already visible. Decide whether useful authorized work or a concrete suggestion remains; otherwise finish silently. Do not repeat the introduction.',
    jsonb_build_object('companyMessageAlreadyDelivered',true,'candidatePresentationDelivered',true));
  return new;
end; $$;
revoke all on function public.enqueue_intro_presentation_followup_v1() from public,anon,authenticated;
create trigger enqueue_intro_presentation_followup after update of metadata on public.talent_progress
for each row execute function public.enqueue_intro_presentation_followup_v1();
