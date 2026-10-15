-- Career visits remain eligible when scheduled recommendations are disabled.
-- Preserve onboarding, account, role eligibility, blocking, and deduplication guards.
create or replace function public.complete_external_recommendation_run(p_run_id uuid,p_rows jsonb,p_lease_token uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.external_recommendation_runs; result jsonb; ids uuid[];
begin
  select * into strict r from public.external_recommendation_runs where id=p_run_id for update;
  -- Serialize concurrent daily/manual saves for this talent, not just this run.
  perform 1 from public.talent_setting where user_id=r.talent_id for update;
  if r.status='completed' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'role_id',role_id)),'[]'::jsonb) into result
      from public.talent_opportunity_recommendation where external_experiment_run_id=p_run_id;
    return result;
  end if;
  if r.surface='daily' and (r.lease_token is distinct from p_lease_token or r.lease_expires_at<=now()) then raise exception 'Daily search lease lost'; end if;
  if r.surface='daily' and r.day_key is distinct from (now() at time zone r.time_zone)::date then
    update public.external_recommendation_runs set status='skipped',finished_at=now() where id=r.id;
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20 then raise exception 'Invalid recommendation list'; end if;
  with inserted as (
    insert into public.talent_opportunity_recommendation
      (talent_id,role_id,kind,opportunity_type,rank,score,fit_summary,fit_reasons,tradeoffs,evidence,external_experiment_run_id)
    select r.talent_id,cr.role_id,'recommend_job_postings','external_jd',(x->>'rank')::int,(x->>'score')::real,
      x->>'fit_summary',coalesce(x->'fit_reasons','[]'::jsonb),coalesce(x->'tradeoffs','[]'::jsonb),coalesce(x->'evidence','[]'::jsonb),r.id
    from jsonb_array_elements(p_rows) x
    join public.company_roles cr on cr.role_id=(x->>'role_id')::uuid
    join public.company_workspace cw on cw.company_workspace_id=cr.company_workspace_id
    left join public.company_db cd on cd.id=cw.company_db_id
    join public.talent_setting s on s.user_id=r.talent_id
    join public.talent_users u on u.user_id=r.talent_id and u.deleted_at is null
    where cr.source_type='external' and coalesce(cr.is_expired,false)=false
      and (cr.expires_at is null or cr.expires_at>now()) and cr.status not in ('closed','expired','inactive','archived','ended')
      and coalesce(cr.source_provider,'')<>'user_submitted' and cw.external_roles_enabled=true
      and lower(coalesce(cr.information->>'testOnly','false'))<>'true'
      and (case when r.surface='daily' then s.is_onboarding_done=true
        else s.get_external_recommendation is distinct from false end)
      and not exists (select 1 from unnest(s.blocked_companies) b where (nullif(btrim(b),'') is not null and (cw.company_name ilike '%'||btrim(b)||'%' or cd.name ilike '%'||btrim(b)||'%' or b=cw.company_workspace_id::text)))
      and not exists (select 1 from public.talent_opportunity_recommendation t where t.talent_id=r.talent_id and t.opportunity_type='external_jd' and (t.role_id=cr.role_id or exists (select 1 from public.company_roles prev where prev.role_id=t.role_id and prev.company_workspace_id=cr.company_workspace_id and lower(btrim(prev.name))=lower(btrim(cr.name)))))
    returning id,role_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'role_id',role_id)),'[]'::jsonb),coalesce(array_agg(role_id),'{}'::uuid[]) into result,ids from inserted;
  update public.external_recommendation_runs set status='completed',finished_at=now(),role_ids=ids where id=r.id;
  return result;
end $$;
revoke all on function public.complete_external_recommendation_run(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.complete_external_recommendation_run(uuid,jsonb,uuid) to service_role;

