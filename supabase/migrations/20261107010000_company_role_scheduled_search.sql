-- Whether each Role gets the scheduled company search, and when.
--
-- The web To-do and the chat show "다음 정기 탐색" from this, so it uses the
-- worker's own rule (harper_worker opp/company_first_search: repository.py
-- scheduled_role_rows and COMPANY_DELIVERY_SQL, scheduler.py): an active
-- internal Role that has not expired, has a request and is not test-only,
-- with a free or paid matching slot, automatic search turned on and a way to
-- deliver (an enabled Slack channel the Role has not opted out of, or role
-- email with recipients). Days and hour default the way the worker does.
--
-- Read-only; no table changes.

create or replace function public.company_role_scheduled_search_v1(p_role_ids uuid[])
returns table(role_id uuid, eligible boolean, days text[], hour integer)
language sql stable security invoker set search_path = '' as $$
  select
    role.role_id,
    coalesce(
      lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(role.status, ''))) = 'active'
      and not coalesce(role.is_expired, false)
      and (role.expires_at is null or role.expires_at > now())
      and nullif(btrim(internal_role.request), '') is not null
      and coalesce(lower(btrim(role.information ->> 'testOnly')), '') not in ('true', '1', 'yes', 'on')
      and coalesce(internal_role.is_company_first_search, false)
      and public.role_matching_slot_type_v1(role.role_id, now()) in ('free', 'paid')
      and (
        exists (
          select 1 from public.company_slack_channels channel
          join public.company_slack_integrations integration
            on integration.company_workspace_id = channel.company_workspace_id
            and integration.slack_team_id = channel.slack_team_id
          where channel.company_workspace_id = role.company_workspace_id and channel.is_enabled = true
            and integration.status = 'active' and integration.bot_token_ciphertext is not null
            and not exists (
              select 1 from public.company_role_notification_channels opt_out
              where opt_out.channel_id = channel.id and opt_out.role_id = role.role_id
            )
        )
        or (
          public.company_role_candidate_email_enabled_v1(role.role_id)
          and exists (select 1 from public.company_role_email_recipients_v1(role.role_id))
        )
      ),
      false
    ) as eligible,
    coalesce(internal_role.intro_search_date, array['Mon', 'Wed', 'Fri']::text[]) as days,
    coalesce(internal_role.intro_search_time, 9)::integer as hour
  from public.company_roles role
  join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
  where role.role_id = any(p_role_ids);
$$;

revoke all on function public.company_role_scheduled_search_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.company_role_scheduled_search_v1(uuid[]) to service_role;
