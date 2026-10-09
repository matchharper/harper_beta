-- General-role accepted candidates are reviewed before the company handoff.
-- Service-only guards, existing matching-review storage, existing pending pipeline.
begin;
alter table public.company_first_slack_outbox
  add column delivery_kind text not null default 'company_first';
drop index public.company_first_slack_outbox_run_channel_chunk_idx;
create unique index company_first_slack_outbox_run_channel_chunk_idx
  on public.company_first_slack_outbox(run_id,channel_id,delivery_kind,chunk_index);

create or replace function public.accepted_role_pair_is_available_v1(p_recommendation_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.talent_opportunity_recommendation rec
    join public.company_roles role on role.role_id=rec.role_id
    join public.company_internal_roles internal_role on internal_role.role_id=role.role_id
    join public.company_workspace workspace on workspace.company_workspace_id=role.company_workspace_id
    join public.talent_users talent on talent.user_id=rec.talent_id
    join public.talent_setting setting on setting.user_id=rec.talent_id
    where rec.id=p_recommendation_id and rec.feedback='like' and rec.saved_stage='connected'
      and coalesce(rec.opportunity_type,'') <> 'intro_request'
      and public.current_talent_recommendation_id_v1(rec.id)=rec.id
      and internal_role.is_harper_tailored_role is false
      and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
      and (role.expires_at is null or role.expires_at>now())
      and coalesce(lower(btrim(role.information->>'testOnly')),'') not in ('true','1','yes','on')
      and public.role_matching_slot_type_v1(role.role_id,now()) in ('free','paid')
      and talent.deleted_at is null and setting.is_onboarding_done is true
      and setting.profile_visibility in ('open_to_matches','exceptional_only')
      and setting.get_internal_recommendation is not false
      and not exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      and not exists (select 1 from public.talent_opportunity_recommendation newer
        where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
          and (newer.created_at,newer.id)>(rec.created_at,rec.id))
      and not exists (select 1 from public.company_intro_candidates intro
        where intro.talent_id=rec.talent_id and intro.role_id=rec.role_id)
      and not exists (select 1 from public.talent_opportunity_tag tag
        where tag.talent_id=rec.talent_id and tag.opportunity_id=rec.role_id
          and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브')
            or tag.tag like '내부단계:%'))
      and not exists (select 1 from public.talent_progress progress
        where progress.talent_id=rec.talent_id and progress.role_id=rec.role_id
          and progress.kind='intro_to_company'
          and (progress.metadata->>'slackSent'='true' or progress.metadata->>'deliveryStatus' in ('pending','sent')))
      and not exists (select 1 from public.talent_opportunity_matching_review review
        join public.talent_opportunity_fit fit on fit.talent_id=review.talent_id and fit.opportunity_id=review.opportunity_id
        where review.recommendation_id=rec.id and review.decision='reject' and review.closed_at is null
          and fit.expires_at>now() and review.input_fingerprint=fit.input_fingerprint)
  );
$$;
revoke all on function public.accepted_role_pair_is_available_v1(uuid) from public,anon,authenticated;
grant execute on function public.accepted_role_pair_is_available_v1(uuid) to service_role;

-- Keep the ordinary ready-card guard; accepted connections have their own
-- permission, current acceptance, and pending-stage checks.
create or replace function public.company_first_outbox_is_deliverable_v1(p_outbox_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_first_slack_outbox outbox
    join public.company_slack_channels channel on channel.id=outbox.channel_id
      and channel.company_workspace_id=outbox.company_workspace_id and channel.is_enabled
    join public.company_slack_integrations integration on integration.company_workspace_id=outbox.company_workspace_id
      and integration.status='active' and integration.bot_token_ciphertext is not null
    where outbox.id=p_outbox_id and cardinality(outbox.candidate_ids)>0
      and outbox.delivery_kind in ('company_first','accepted_connection')
      and not exists (
        select 1 from unnest(outbox.candidate_ids) candidate(id)
        left join public.company_intro_candidates intro on intro.id=candidate.id and intro.company_workspace_id=outbox.company_workspace_id
        left join public.company_roles role on role.role_id=intro.role_id
        left join public.company_internal_roles internal_role on internal_role.role_id=intro.role_id
        left join public.company_workspace workspace on workspace.company_workspace_id=outbox.company_workspace_id
        left join public.talent_users talent on talent.user_id=intro.talent_id
        left join public.talent_setting setting on setting.user_id=intro.talent_id
        left join public.talent_opportunity_recommendation rec on rec.id=intro.recommendation_id
        where intro.id is null or talent.user_id is null or talent.deleted_at is not null
          or setting.user_id is null or setting.is_onboarding_done is not true or setting.get_internal_recommendation is false
          or setting.profile_visibility is null
          or (outbox.delivery_kind='company_first' and setting.profile_visibility<>'open_to_matches')
          or (outbox.delivery_kind='accepted_connection' and setting.profile_visibility not in ('open_to_matches','exceptional_only'))
          or exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
            where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
          or role.role_id is null or role.source_type<>'internal' or role.status<>'active' or coalesce(role.is_expired,false)
          or (role.expires_at is not null and role.expires_at<=now())
          or coalesce(lower(btrim(role.information->>'testOnly')),'') in ('true','1','yes','on')
          or public.role_matching_slot_type_v1(role.role_id,now())='unavailable'
          or exists (select 1 from public.company_role_notification_channels opt_out
            where opt_out.role_id=intro.role_id and opt_out.channel_id=outbox.channel_id)
          or (outbox.delivery_kind='company_first' and (intro.status<>'ready' or internal_role.is_company_first_search is not true))
          or (outbox.delivery_kind='accepted_connection' and (
            intro.status<>'closed' or intro.close_reason is distinct from 'route_replaced'
            or intro.presentation->>'deliveryKind' is distinct from 'accepted_connection'
            or internal_role.is_harper_tailored_role is distinct from false
            or rec.id is null or rec.feedback is distinct from 'like' or rec.saved_stage is distinct from 'connected'
            or rec.opportunity_type='intro_request'
            or public.current_talent_recommendation_id_v1(rec.id)<>rec.id
            or rec.talent_id<>intro.talent_id or rec.role_id<>intro.role_id
            or exists (select 1 from public.talent_opportunity_recommendation newer
              where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
                and (newer.created_at,newer.id)>(rec.created_at,rec.id))
            or not exists (select 1 from public.talent_opportunity_tag tag
              where tag.talent_id=intro.talent_id and tag.opportunity_id=intro.role_id and tag.tag='내부:연결대기')
            or exists (select 1 from public.talent_opportunity_tag tag
              where tag.talent_id=intro.talent_id and tag.opportunity_id=intro.role_id
                and (tag.tag in ('내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브') or tag.tag like '내부단계:%'))
          ))
      )
  );
$$;
revoke all on function public.company_first_outbox_is_deliverable_v1(uuid) from public,anon,authenticated;
grant execute on function public.company_first_outbox_is_deliverable_v1(uuid) to service_role;
-- Accepted handoffs do not consume the ordinary company-first ready backlog.
do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.enqueue_company_matching_search_v1(uuid,uuid,uuid)'::regprocedure) into v_definition;
  if position('if coalesce(v_ready_count, 0) >= v_ready_backlog_limit then' in v_definition)=0 then
    raise exception 'accepted_review_enqueue_patch_anchor_missing';
  end if;
  v_definition := replace(v_definition,
    'if coalesce(v_ready_count, 0) >= v_ready_backlog_limit then',
    'if coalesce(v_ready_count, 0) >= v_ready_backlog_limit and not exists (
       select 1 from public.talent_opportunity_recommendation rec
       where rec.role_id=p_role_id and public.accepted_role_pair_is_available_v1(rec.id)
     ) then');
  execute v_definition;
end $patch$;
commit;
