begin;
-- Publishers take the same short transaction locks before re-reading source
-- snapshots. Source writes either precede that read, or invalidate its result
-- after publication; a result can never silently outlive an intervening edit.
create or replace function public.invalidate_matching_source_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new jsonb; v_old jsonb; v_talent uuid; v_role uuid; v_workspace uuid;
begin
  v_new:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old:=case when tg_op='INSERT' then null else to_jsonb(old) end;
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
end $$;
revoke all on function public.invalidate_matching_source_v1() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['talent_users','talent_setting','talent_contexts','talent_experiences','talent_educations','talent_extras','talent_behavior_contexts','company_roles','company_internal_roles','company_behavior_contexts','company_workspace'] loop
    execute format('create trigger invalidate_matching_source before insert or update or delete on public.%I for each row execute function public.invalidate_matching_source_v1()',t);
  end loop;
end $$;
commit;
