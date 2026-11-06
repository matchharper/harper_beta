-- Role start's passed people are shown in role start, not in the inbox (#253).
--
-- Role start passes the first-three people the team rated 맞지 않음 the way
-- the inbox Pass button does (a card, then pass_company_intro_v2 with channel
-- role_start), so no later search proposes them again. The card is inserted
-- ready and passed at once, so the inbox_card trigger recorded a showing in
-- the inbox that never happened. Their showing is the role_start presentation
-- (company_role_start_sessions.first_candidates), and the Pass points at it.
--
-- pass_role_start_candidate_v1 inserts that card and passes it in one call.
-- While it inserts, harper.company_card_shown_in names the surface that
-- showed the person ('role_start'), and record_company_card_presentation_v1
-- records no inbox_card. Every other card write is recorded as before.

create or replace function public.record_company_card_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'ready' or new.presentation is null then
    return new;
  end if;
  -- Shown on another surface, which records its own presentation.
  if coalesce(current_setting('harper.company_card_shown_in', true), '') <> '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'ready'
     and old.presentation is not distinct from new.presentation then
    return new;
  end if;
  perform public.record_company_presentation_v1(
    new.company_workspace_id, new.role_id, 'member_candidate', new.talent_id, 'inbox_card',
    'card:' || new.id::text || ':' || new.revision::text,
    new.presentation,
    jsonb_build_object('selectionRunId', new.selection_run_id),
    new.id, new.revision,
    public.company_card_evaluation_id_v1(new.role_id, new.talent_id, new.selection_run_id, now()),
    new.shared_material_id
  );
  return new;
end;
$$;

revoke all on function public.record_company_card_presentation_v1()
  from public, anon, authenticated, service_role;

-- Returns the new card's id, or null when the person already has a card for
-- the Role (nothing is written then).
create or replace function public.pass_role_start_candidate_v1(
  p_company_workspace_id uuid,
  p_role_id uuid,
  p_talent_id uuid,
  p_company_user_id uuid,
  p_selection_run_id uuid,
  p_selection_reason text,
  p_presentation jsonb,
  p_role_fingerprint text,
  p_talent_fingerprint text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Already recorded for this Role (a rerun, or the inbox): nothing new.
  if exists (
    select 1 from public.company_intro_candidates intro
    where intro.role_id = p_role_id and intro.talent_id = p_talent_id
  ) then
    return null;
  end if;
  perform set_config('harper.company_card_shown_in', 'role_start', true);
  insert into public.company_intro_candidates (
    company_workspace_id, role_id, talent_id, selection_run_id,
    selection_reason, presentation, role_fingerprint, talent_fingerprint
  ) values (
    p_company_workspace_id, p_role_id, p_talent_id, p_selection_run_id,
    p_selection_reason, coalesce(p_presentation, '{}'::jsonb),
    p_role_fingerprint, p_talent_fingerprint
  )
  on conflict do nothing
  returning id into v_id;
  perform set_config('harper.company_card_shown_in', '', true);
  if v_id is not null then
    perform public.pass_company_intro_v2(
      v_id, p_company_workspace_id, p_company_user_id, 'role_start'
    );
  end if;
  return v_id;
end;
$$;

revoke all on function public.pass_role_start_candidate_v1(uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.pass_role_start_candidate_v1(uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text)
  to service_role;
