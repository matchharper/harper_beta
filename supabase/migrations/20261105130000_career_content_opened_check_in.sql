-- Harper cannot see event sites, so it learns about a sign-up by asking.
-- When the user opens an event or sign-up link from "볼 만한 것", the next
-- morning's daily batch hands Harper one source: ask once, with a follow-up
-- card, whether they signed up. This uses the existing daily sources, like
-- company follow-up dates and today's appointments; nothing else changes.
-- The source drops out if, before then, the user closed the item, Harper moved
-- it to the schedule (removed), or it started or expired.
begin;

create function public.capture_career_content_opened()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status = 'opened' and old.status in ('new', 'seen') and new.kind in ('event', 'signup') then
    perform public.record_career_daily_source(new.user_id, 'content_opened', new.id::text, '1',
      -- 09:00 KST the next day, when the daily batch can run.
      ((now() at time zone 'Asia/Seoul')::date + 1 + time '09:00') at time zone 'Asia/Seoul',
      jsonb_build_object('contentSuggestionId', new.id, 'summary', format(
        'On %s the user opened this %s from 볼 만한 것: "%s" %s%s%s. Harper cannot see whether they signed up. '
        'Ask once, in the user''s language, with one follow-up card through manage_action_items: the title asks whether they signed up, '
        'and its button sends a short chat message saying they signed up for it (action send_message). '
        'When they confirm, keep it in their schedule as manage_content_suggestions describes. '
        'Finish quietly if they already said whether they signed up. Do not ask again. Content item %s.',
        to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
        case new.kind when 'event' then 'event' else 'sign-up' end,
        new.title, new.url,
        coalesce(', starts ' || to_char(new.starts_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'), ''),
        coalesce(', closes ' || to_char(new.deadline at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'), ''),
        new.id)));
  end if;
  return new;
end $$;
create trigger capture_career_content_opened after update of status on public.career_content_suggestions
  for each row execute function public.capture_career_content_opened();
revoke all on function public.capture_career_content_opened() from public, anon, authenticated;
grant execute on function public.capture_career_content_opened() to service_role;

-- Same as 20261104153622 (checked against production on 2026-11-05), plus the
-- content_opened branch: still worth asking while the item is shown, unstarted
-- and unexpired.
create or replace function public.career_daily_source_current(p_id uuid,p_talent uuid,p_now timestamptz default now(),p_run_id uuid default null)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare s public.career_daily_sources; f public.company_talent_followups; authority jsonb;
begin
 select * into s from public.career_daily_sources where id=p_id and talent_id=p_talent;
 if not found or s.cancelled_at is not null or (p_run_id is not null and s.run_id is distinct from p_run_id) then return false; end if;
 if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then return false; end if;
 -- The invocation must be able to resume after its own delivery. This is an
 -- owned effect, not a concurrent cancellation of its input.
 if s.source_kind in ('process_closure','role_closure') and exists(
   select 1 from public.talent_opportunity_recommendation r join public.talent_progress p on p.recommendation_id=r.id
   where r.id=(s.event->>'recommendationId')::uuid and r.talent_id=p_talent and r.saved_stage='closed'
     and p.kind='internal_process_stopped_notified' and p.metadata->>'discoveryRunId'=s.run_id::text) then return true; end if;
 if s.source_kind='process_closure' then
   return public.career_closure_recommendation_current((s.event->>'recommendationId')::uuid,p_talent)
     and exists(select 1 from public.talent_progress p where p.id=s.source_id::uuid
       and p.metadata->>'notifyCandidateOnClosure' is distinct from 'false'
       and not exists(select 1 from public.talent_progress later where later.talent_id=p_talent
         and later.role_id=p.role_id and later.kind='org_stage_change' and later.created_at>p.created_at));
 elsif s.source_kind='role_closure' then
   return public.career_closure_recommendation_current((s.event->>'recommendationId')::uuid,p_talent)
     and exists(select 1 from public.company_roles r where r.role_id=s.source_id::uuid and r.status in ('ended','deleted'))
     and exists(select 1 from public.talent_opportunity_recommendation r where r.id=(s.event->>'recommendationId')::uuid
       and coalesce(r.processed_stage,'') not in ('final_offer','process_stopped','archived','rejected'));
 elsif s.source_kind='talent_selection' then
   return exists(select 1 from public.talent_opportunity_matching_review m
     join public.company_roles r on r.role_id=m.opportunity_id
     join public.talent_setting t on t.user_id=m.talent_id
     where m.id=s.source_id::uuid and m.talent_id=p_talent and m.decision in ('candidate_first','both')
       and (m.discovery_run_id is null or m.discovery_run_id=s.run_id)
       and r.source_type='internal' and m.closed_at is null and (m.recommendation_id is null or exists(select 1 from public.talent_opportunity_recommendation rec
         join public.opportunity_discovery_run run on run.id=s.run_id
         where rec.id=m.recommendation_id and rec.kind='career_agent' and rec.created_at>=run.created_at)) and r.status='active' and not coalesce(r.is_expired,false)
       and (r.expires_at is null or r.expires_at>p_now)
       and lower(btrim(coalesce(r.information->>'testOnly','false'))) not in ('true','1','yes','on')
       and t.get_internal_recommendation is distinct from false and t.profile_visibility is distinct from 'dont_share'
       and not exists(select 1 from unnest(coalesce(t.blocked_companies,'{}')) blocked
         join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
         where lower(btrim(blocked)) in (lower(btrim(w.company_name)),lower(btrim(w.published_name)),lower(w.company_workspace_id::text))));
 elsif s.source_kind='appointment' then
   return exists(select 1 from public.meeting_schedules m where m.id=s.source_id::uuid and m.talent_id=p_talent
     and m.version::text=s.source_revision and m.status='confirmed'
     and (m.confirmed_start_at>p_now or (m.confirmed_start_at is null
       and m.source_refs->>'calendarDate'=(p_now at time zone 'Asia/Seoul')::date::text)));
 elsif s.source_kind='company_followup' then
   select * into f from public.company_talent_followups where id=s.source_id::uuid and talent_id=p_talent;
   if not found or f.revision::text<>s.source_revision then return false; end if;
   if f.status='delivered' and f.delivery_run_id=s.run_id then return true; end if;
   if f.status<>'pending' then return false; end if;
   authority:=public.company_followup_source_v1(f.source_kind,f.source_id);
   return coalesce((authority->>'active')::boolean,false) and authority->>'originalSentAt' is not null;
 elsif s.source_kind='content_opened' then
   return exists(select 1 from public.career_content_suggestions c where c.id=s.source_id::uuid and c.user_id=p_talent
     and c.status='opened' and c.expires_at>p_now and (c.starts_at is null or c.starts_at>p_now));
 end if;
 return false;
end $$;

commit;
