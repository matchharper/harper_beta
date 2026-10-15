-- These metadata fields have no consumers. Retain the numeric quality score,
-- its source-change invalidation, and the existing atomic summary write contract.
set local lock_timeout = '5s';
set local statement_timeout = '15s';
lock table public.company_roles in access exclusive mode;

create or replace function public.invalidate_external_role_derived_data()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    new.title_embedding := null;
    new.title_embedding_text := null;
  end if;
  if new.name is distinct from old.name or new.description is distinct from old.description
     or new.company_workspace_id is distinct from old.company_workspace_id then
    new.opportunity_quality_score := null;
  end if;
  return new;
end $$;
drop function public.save_external_role_summaries_v2(text,jsonb,text);
create or replace function public.save_external_role_summaries_v2(p_locale text,p_rows jsonb)
returns table(role_id uuid,summary jsonb,opportunity_quality_score real)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_locale not in ('ko','en') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10 then raise exception 'Invalid summary batch'; end if;
  update public.company_roles cr set summary=jsonb_set(coalesce(cr.summary,'{}'::jsonb),array[p_locale],x->'payload',true),
    opportunity_quality_score=(x->>'opportunityQualityScore')::real
    from jsonb_array_elements(p_rows) x
    where cr.role_id=(x->>'roleId')::uuid and cr.name=x->>'roleName'
      and coalesce(cr.description,'')=x->>'description' and cr.company_workspace_id=(x->>'companyWorkspaceId')::uuid
      and nullif(btrim(cr.summary->p_locale->>'content'),'') is null;
  -- Return the winning locale (including a concurrent writer's), never overwrite an existing summary.
  return query select cr.role_id,cr.summary,cr.opportunity_quality_score
    from public.company_roles cr join jsonb_array_elements(p_rows) x on cr.role_id=(x->>'roleId')::uuid
    where cr.name=x->>'roleName' and coalesce(cr.description,'')=x->>'description'
      and cr.company_workspace_id=(x->>'companyWorkspaceId')::uuid;
end $$;
revoke all on function public.save_external_role_summaries_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.save_external_role_summaries_v2(text,jsonb) to service_role;

-- Preserve ingestion guards while permitting derived-only summaries and quality.
CREATE OR REPLACE FUNCTION public.guard_linkedin_role_write_for_vc_primary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fallback_workspace text;
begin
  if new.source_provider is null
     or new.source_provider not in (
       'linkedin',
       'linkedin_jobs',
       'linkedin_jobs_scraping'
     ) then
    return new;
  end if;

  -- Derived geography, summary and quality correction is not a competing source write.
  -- Source identity, location text, liveness and timestamps must be unchanged.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['country_code', 'work_mode', 'summary', 'opportunity_quality_score'])
         = (to_jsonb(old) - array['country_code', 'work_mode', 'summary', 'opportunity_quality_score']) then
    return new;
  end if;

  -- A transition to ended that changes only liveness metadata is a
  -- deactivation, not a competing LinkedIn ingestion write. Let it proceed
  -- without taking the workspace advisory lock and without suppressing it for
  -- an operational VC identity. Reactivation and content/source changes still
  -- follow the serialized guard path below.
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(new.status, ''))) = 'ended'
     and (
       to_jsonb(new) - array[
         'status',
         'is_expired',
         'expired_at',
         'updated_at'
       ]
     ) = (
       to_jsonb(old) - array[
         'status',
         'is_expired',
         'expired_at',
         'updated_at'
       ]
     ) then
    return new;
  end if;

  perform public.lock_company_role_ingest(new.company_workspace_id);

  fallback_workspace := current_setting(
    'harper.allow_linkedin_vc_fallback_workspace',
    true
  );
  if fallback_workspace = new.company_workspace_id::text then
    return new;
  end if;

  if public.vc_identity_is_operational(new.company_workspace_id) then
    return null;
  end if;

  return new;
end;
$function$
;


alter table public.company_roles
  drop column opportunity_quality_assessment,
  drop column opportunity_quality_version;
