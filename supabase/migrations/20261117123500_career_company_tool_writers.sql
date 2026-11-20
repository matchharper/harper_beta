-- Resolve a Role, posting or owned opportunity under the caller's current
-- access before writing. The shared record retains only the public company and
-- independently public observations, never the private opportunity.
create function public.career_write_employer_datum_v1(
  p_user uuid, p_target jsonb, p_label text, p_content text,
  p_source_refs jsonb, p_data_ref jsonb, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  resolution jsonb;
  company_target jsonb;
begin
  if p_user is null or coalesce(p_target->>'kind','') not in ('role','posting','opportunity') then
    return jsonb_build_object('status','unavailable');
  end if;
  resolution := career_read_public_company_targets_v1(p_user,jsonb_build_array(p_target))->0;
  if resolution->>'status'='found' then
    company_target := resolution->'companyRef';
  elsif resolution->>'status'='missing' and resolution ? 'identity' then
    company_target := resolution->'identity';
  end if;
  if company_target is null then
    return coalesce(resolution-'targetRef',jsonb_build_object('status','unavailable'));
  end if;
  return career_write_company_datum_v1(company_target,p_label,p_content,p_source_refs,p_data_ref,p_request_id);
end $$;

-- A directory correction retains its existing revision check and fieldSources
-- behavior. A versioned web_resource is pinned to the supplied observation.
create function public.career_write_company_directory_fields_v1(
  p_id bigint, p_revision bigint, p_fields jsonb, p_source_refs jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare exact_sources jsonb;
begin
  exact_sources := career_exact_company_sources_v1(p_source_refs);
  return career_upsert_public_company_v1(p_id,p_revision,p_fields,exact_sources)
    || jsonb_build_object('sourceRefs',exact_sources);
end $$;

revoke all on function public.career_write_employer_datum_v1(uuid,jsonb,text,text,jsonb,jsonb,uuid),
  public.career_write_company_directory_fields_v1(bigint,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.career_write_employer_datum_v1(uuid,jsonb,text,text,jsonb,jsonb,uuid),
  public.career_write_company_directory_fields_v1(bigint,bigint,jsonb,jsonb) to service_role;
