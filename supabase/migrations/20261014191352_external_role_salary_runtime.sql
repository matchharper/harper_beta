-- Apply only after all role readers hide predicted compensation. Old readers
-- cannot distinguish a prediction from a published salary.
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.invalidate_external_role_derived_data()
returns trigger language plpgsql set search_path='' as $$
declare source_changed boolean; pay_changed boolean;
begin
  if new.name is distinct from old.name then
    new.title_embedding:=null; new.title_embedding_text:=null;
  end if;
  source_changed:=jsonb_build_array(new.name,new.description,new.company_workspace_id,new.location_text,new.country_code,new.type)
    is distinct from jsonb_build_array(old.name,old.description,old.company_workspace_id,old.location_text,old.country_code,old.type);
  pay_changed:=jsonb_build_array(new.salary_min,new.salary_max,new.salary_currency,new.salary_period,new.salary_range)
    is distinct from jsonb_build_array(old.salary_min,old.salary_max,old.salary_currency,old.salary_period,old.salary_range);
  if old.salary_is_predicted and (source_changed or pay_changed) then
    -- An ordinary source salary write replaces the prediction. A source-only
    -- change clears its obsolete prediction without deleting published pay.
    if not pay_changed then
      new.salary_min:=null;new.salary_max:=null;new.salary_currency:=null;new.salary_period:=null;
    end if;
    new.salary_is_predicted:=false;
  end if;
  return new;
end $$;
drop trigger invalidate_external_role_derived_data on public.company_roles;
create trigger invalidate_external_role_derived_data before update of name,description,company_workspace_id,location_text,country_code,type,salary_min,salary_max,salary_currency,salary_period,salary_range
  on public.company_roles for each row execute function public.invalidate_external_role_derived_data();

drop function public.save_external_role_summaries_v2(text,jsonb);
create function public.save_external_role_summaries_v2(p_locale text,p_rows jsonb)
returns table(role_id uuid,summary jsonb)
language plpgsql security invoker set search_path='' as $$
begin
  if p_locale not in ('ko','en') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10 then raise exception 'Invalid summary batch'; end if;
  update public.company_roles cr set summary=jsonb_set(coalesce(cr.summary,'{}'::jsonb),array[p_locale],x->'payload',true)
    from jsonb_array_elements(p_rows) x
    where cr.role_id=(x->>'roleId')::uuid and cr.name=x->>'roleName'
      and coalesce(cr.description,'')=x->>'description' and cr.company_workspace_id=(x->>'companyWorkspaceId')::uuid
      and nullif(btrim(cr.summary->p_locale->>'content'),'') is null;
  return query select cr.role_id,cr.summary from public.company_roles cr
    join jsonb_array_elements(p_rows) x on cr.role_id=(x->>'roleId')::uuid
    where cr.name=x->>'roleName' and coalesce(cr.description,'')=x->>'description'
      and cr.company_workspace_id=(x->>'companyWorkspaceId')::uuid;
end $$;
revoke all on function public.save_external_role_summaries_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.save_external_role_summaries_v2(text,jsonb) to service_role;

create function public.save_external_role_salary_predictions(p_rows jsonb)
returns table(role_id uuid,salary_min numeric,salary_max numeric)
language plpgsql security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10 then raise exception 'Invalid salary batch'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x where
    (x->>'min')::numeric<=0 or (x->>'max')::numeric<(x->>'min')::numeric
    or (x->>'min')::numeric is null or (x->>'max')::numeric is null
    or (x->>'min')::numeric='NaN'::numeric or (x->>'max')::numeric='NaN'::numeric
    or (x->>'max')::numeric='Infinity'::numeric) then raise exception 'Invalid salary endpoints';end if;
  return query update public.company_roles cr
    set salary_min=(x->>'min')::numeric,salary_max=(x->>'max')::numeric,
      salary_currency='KRW',salary_period='year',salary_is_predicted=true
    from jsonb_array_elements(p_rows) x
    where cr.role_id=(x->>'roleId')::uuid and cr.source_type='external'
      and lower(coalesce(cr.information->>'testOnly','false'))<>'true'
      and cr.salary_min is null and cr.salary_max is null and nullif(btrim(cr.salary_range),'') is null
      and md5(jsonb_build_array(cr.name,cr.description,cr.company_workspace_id,cr.location_text,cr.country_code,cr.type)::text)=x->>'sourceHash'
    returning cr.role_id,cr.salary_min,cr.salary_max;
end $$;
revoke all on function public.save_external_role_salary_predictions(jsonb) from public,anon,authenticated;
grant execute on function public.save_external_role_salary_predictions(jsonb) to service_role;
alter table public.company_roles drop column opportunity_quality_score;

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

  -- A salary prediction changes only retrieval-derived fields.
  if tg_op='UPDATE' and new.salary_is_predicted and
     (to_jsonb(new)-array['salary_min','salary_max','salary_currency','salary_period','salary_is_predicted']) =
     (to_jsonb(old)-array['salary_min','salary_max','salary_currency','salary_period','salary_is_predicted']) then return new;end if;
  -- Derived geography, summary correction is not a competing source write.
  -- Source identity, location text, liveness and timestamps must be unchanged.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['country_code', 'work_mode', 'summary'])
         = (to_jsonb(old) - array['country_code', 'work_mode', 'summary']) then
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

CREATE OR REPLACE FUNCTION public.invalidate_matching_source_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_new jsonb; v_old jsonb; v_talent uuid; v_role uuid; v_workspace uuid;
begin
  v_new:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  -- country_code is derived from the unchanged role location. A work_mode
  -- correction still invalidates matching through the ordinary comparison.
  if tg_table_name='company_roles' and tg_op='UPDATE' and v_new->>'salary_is_predicted'='true' and
    (v_new-array['salary_min','salary_max','salary_currency','salary_period','salary_is_predicted']) =
    (v_old-array['salary_min','salary_max','salary_currency','salary_period','salary_is_predicted']) then return new;end if;
  if tg_table_name='company_roles' then
    v_new:=v_new-'country_code';
    if v_old is not null then v_old:=v_old-'country_code'; end if;
  end if;
  if tg_table_name='talent_contexts' then
    if coalesce(v_new->>'collection','')<>'brief' and coalesce(v_old->>'collection','')<>'brief' then return coalesce(new,old); end if;
    v_new:=jsonb_build_object('talent_id',v_new->>'talent_id','collection',v_new->'collection','content',v_new->'content','label',v_new->'label','deleted_at',v_new->'deleted_at');
    if v_old is not null then v_old:=jsonb_build_object('talent_id',v_old->>'talent_id','collection',v_old->'collection','content',v_old->'content','label',v_old->'label','deleted_at',v_old->'deleted_at'); end if;
  elsif tg_table_name='talent_setting' then
    v_new:=jsonb_build_object('user_id',v_new->>'user_id','profile_visibility',v_new->'profile_visibility','get_internal_recommendation',v_new->'get_internal_recommendation','blocked_companies',v_new->'blocked_companies','is_onboarding_done',v_new->'is_onboarding_done');
    if v_old is not null then v_old:=jsonb_build_object('user_id',v_old->>'user_id','profile_visibility',v_old->'profile_visibility','get_internal_recommendation',v_old->'get_internal_recommendation','blocked_companies',v_old->'blocked_companies','is_onboarding_done',v_old->'is_onboarding_done'); end if;
  elsif tg_table_name='talent_users' then
    v_new:=jsonb_build_object('user_id',v_new->>'user_id','name',v_new->'name','headline',v_new->'headline','bio',v_new->'bio','location',v_new->'location','current_location',v_new->'current_location','deleted_at',v_new->'deleted_at');
    if v_old is not null then v_old:=jsonb_build_object('user_id',v_old->>'user_id','name',v_old->'name','headline',v_old->'headline','bio',v_old->'bio','location',v_old->'location','current_location',v_old->'current_location','deleted_at',v_old->'deleted_at'); end if;
  elsif tg_table_name='company_internal_roles' then
    v_new:=jsonb_build_object('role_id',v_new->>'role_id','request',v_new->'request','criteria',v_new->'criteria');
    if v_old is not null then v_old:=jsonb_build_object('role_id',v_old->>'role_id','request',v_old->'request','criteria',v_old->'criteria'); end if;
  elsif tg_table_name='company_workspace' then
    v_new:=jsonb_build_object('company_workspace_id',v_new->>'company_workspace_id','company_name',v_new->'company_name','company_description',v_new->'company_description','brief',v_new->'brief','pitch',v_new->'pitch');
    if v_old is not null then v_old:=jsonb_build_object('company_workspace_id',v_old->>'company_workspace_id','company_name',v_old->'company_name','company_description',v_old->'company_description','brief',v_old->'brief','pitch',v_old->'pitch'); end if;
  end if;
  if tg_op='UPDATE' and (v_new-array['updated_at','created_at','last_evaluated_at','last_consumed_change_id','embedding','embedding_model','embedding_content_hash','embedding_updated_at'])
    is not distinct from (v_old-array['updated_at','created_at','last_evaluated_at','last_consumed_change_id','embedding','embedding_model','embedding_content_hash','embedding_updated_at']) then return new; end if;
  if tg_table_name like 'talent_%' then
    v_talent:=coalesce(v_new->>'talent_id',v_new->>'user_id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended('matching-source-talent:'||v_talent::text,0));
    update public.talent_opportunity_fit set expires_at=least(expires_at,now())
      where talent_id=v_talent and fit_contract_version='talent_role_fit_v2';
    update public.talent_opportunity_matching_review set closed_at=now(),close_reason='source_changed'
      where talent_id=v_talent and closed_at is null and recommendation_id is null;
    if tg_table_name in ('talent_users','talent_experiences','talent_educations','talent_extras') then
      perform public.enqueue_matching_input_refresh_v1(v_talent,'profile_changed');
    end if;
  else
    for v_role in select role_id from public.company_roles
      where role_id=nullif(v_new->>'role_id','')::uuid
        or (tg_table_name='company_workspace' and company_workspace_id=(v_new->>'company_workspace_id')::uuid)
      order by role_id
    loop
      perform pg_advisory_xact_lock(hashtextextended('matching-source-role:'||v_role::text,0));
      update public.talent_opportunity_fit set expires_at=least(expires_at,now())
        where opportunity_id=v_role and fit_contract_version='talent_role_fit_v2';
      update public.talent_opportunity_matching_review set closed_at=now(),close_reason='source_changed'
        where opportunity_id=v_role and closed_at is null and recommendation_id is null;
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $function$
;
