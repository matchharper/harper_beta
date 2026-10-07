begin;
-- Expose delivery facts for already company-visible proposals only. No candidate
-- response, private question, email body or Career preference is returned.
create or replace function public.read_company_candidate_delivery_v1(
  p_company_workspace_id uuid,p_role_ids uuid[],p_talent_ids uuid[]
) returns table(talent_id uuid,role_id uuid,available_in_app_at timestamptz,email_sent_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select rec.talent_id,rec.role_id,min(rec.created_at),min(sent.sent_at)
  from public.talent_opportunity_recommendation rec
  join public.company_roles role on role.role_id=rec.role_id
  left join lateral (
    select min(delivery.sent_at) as sent_at
    from public.talent_opportunity_delivery delivery
    where delivery.talent_id=rec.talent_id and delivery.status='sent' and delivery.channel='email'
      and delivery.discovery_run_id=rec.discovery_run_id
      and delivery.payload->'recommendationExposures' @>
        jsonb_build_array(jsonb_build_object('recommendationId',rec.id::text))
  ) sent on true
  where role.company_workspace_id=p_company_workspace_id
    and rec.role_id=any(p_role_ids) and rec.talent_id=any(p_talent_ids)
    and rec.opportunity_type='internal_role'
    and exists(select 1 from public.company_intro_candidates intro
      where intro.company_workspace_id=p_company_workspace_id and intro.role_id=rec.role_id
        and intro.talent_id=rec.talent_id and intro.status in ('ready','awaiting_talent','connecting','connected'))
  group by rec.talent_id,rec.role_id
$$;
revoke all on function public.read_company_candidate_delivery_v1(uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.read_company_candidate_delivery_v1(uuid,uuid[],uuid[]) to service_role;
commit;
