-- Email button decisions point at the mail they were made in (#253).
--
-- Each recipient gets their own candidate mail, and each mail is its own
-- presentation (company_email_action_links.presentation_id). A Pass or intro
-- request from a mail button did not pass that presentation, so the decision
-- took the latest email presentation of the person (the fallback in
-- set_company_decision_presentation_v1), which can be another recipient's
-- later mail.
--
-- pass_company_intro_with_presentation_v1 is pass_company_intro_v2 plus
-- p_presentation_id: what the decision was made on. It is kept only when it is
-- about the same Role and person; otherwise the decision falls back as before.
--
-- request_company_intro_for_career_with_presentation_v1 runs the Career
-- request (request_company_intro_for_career_v1, 20261106084304) unchanged, so a
-- mail button request reaches the candidate the same way as every other
-- request. That function records the decision itself, so the presentation goes
-- down as a transaction-local hint (harper.decision_presentation_id) that the
-- decision's presentation trigger reads, with the same Role and person check.
--
-- v2 and the Career function stay as they are for their other callers (web,
-- chat, Slack, role start, and the web version running during the deploy).
--
-- The accept/decline connection buttons go through the stage path, which has
-- no presentation input. For them, and any email decision without one, the
-- fallback now prefers the decider's own mail over other recipients' mails.

create or replace function public.pass_company_intro_with_presentation_v1(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_channel text,
  p_reason_text text default null,
  p_source_message_id bigint default null,
  p_presentation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_intro record;
begin
  v_result := public.pass_company_intro_v1(
    p_intro_candidate_id, p_company_workspace_id, p_company_user_id
  );
  if v_result->>'status' = 'passed' then
    select intro.role_id, intro.talent_id, intro.revision into strict v_intro
    from public.company_intro_candidates intro
    where intro.id = p_intro_candidate_id;
    v_result := v_result || jsonb_build_object(
      'decisionId',
      public.record_company_decision_v1(
        p_company_workspace_id, v_intro.role_id, 'member_candidate',
        v_intro.talent_id, 'pass', p_channel, p_company_user_id,
        'company_intro:' || p_intro_candidate_id::text || ':pass:r' || v_intro.revision::text,
        p_intro_candidate_id, p_reason_text, '{}', '{}'::jsonb,
        p_source_message_id,
        (select presentation.id from public.company_presentations presentation
          where presentation.id = p_presentation_id
            and presentation.role_id = v_intro.role_id
            and presentation.subject_kind = 'member_candidate'
            and presentation.subject_id = v_intro.talent_id)
      )
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.request_company_intro_for_career_with_presentation_v1(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_next_stage_id uuid,
  p_intro_recipient_emails text[],
  p_company_appeal text,
  p_channel text,
  p_source_message_id bigint default null,
  p_presentation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform set_config('harper.decision_presentation_id', coalesce(p_presentation_id::text, ''), true);
  v_result := public.request_company_intro_for_career_v1(
    p_intro_candidate_id, p_company_workspace_id, p_company_user_id, p_next_stage_id,
    p_intro_recipient_emails, p_company_appeal, p_channel, p_source_message_id
  );
  -- Later decisions in the same transaction fall back as usual.
  perform set_config('harper.decision_presentation_id', '', true);
  return v_result;
end;
$$;

revoke all on function public.pass_company_intro_with_presentation_v1(uuid, uuid, uuid, text, text, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.request_company_intro_for_career_with_presentation_v1(uuid, uuid, uuid, uuid, text[], text, text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.pass_company_intro_with_presentation_v1(uuid, uuid, uuid, text, text, bigint, uuid)
  to service_role;
grant execute on function public.request_company_intro_for_career_with_presentation_v1(uuid, uuid, uuid, uuid, text[], text, text, bigint, uuid)
  to service_role;

-- Decisions without an explicit presentation: a mail button's hint first (the
-- Career request above), then as before (20261105110000), plus an email
-- decision takes the decider's own mail first.
create or replace function public.set_company_decision_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hint text := current_setting('harper.decision_presentation_id', true);
begin
  if new.presentation_id is null and new.subject_id is not null
    and v_hint ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select presentation.id into new.presentation_id
    from public.company_presentations presentation
    where presentation.id = v_hint::uuid
      and presentation.role_id = new.role_id
      and presentation.subject_kind = new.subject_kind
      and presentation.subject_id = new.subject_id;
  end if;
  if new.presentation_id is null and new.subject_id is not null then
    select presentation.id into new.presentation_id
    from public.company_presentations presentation
    where presentation.role_id = new.role_id
      and presentation.subject_kind = new.subject_kind
      and presentation.subject_id = new.subject_id
      and presentation.presented_at <= new.created_at
    order by
      (presentation.surface = case new.channel
        when 'email' then 'email' when 'slack' then 'slack_card'
        when 'role_start' then 'role_start' when 'todo' then 'todo'
        else 'inbox_card' end) desc,
      -- Each recipient gets their own mail.
      (new.channel = 'email' and presentation.surface = 'email' and exists (
        select 1 from public.company_email_outbox mail
        where mail.id = (presentation.delivery_ref->>'emailOutboxId')::uuid
          and mail.recipient_id = new.actor_user_id
      )) desc,
      (presentation.intro_candidate_id is not distinct from new.intro_candidate_id) desc,
      presentation.presented_at desc,
      presentation.id desc
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_decision_presentation_v1()
  from public, anon, authenticated, service_role;
