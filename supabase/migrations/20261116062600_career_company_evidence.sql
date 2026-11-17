-- The directory index keeps complete source bodies. An agent reading or
-- scoring a company can instead request the public evidence for its question.
create function public.career_company_evidence_v1(
  p_company bigint, p_query text, p_offset integer, p_limit integer
) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.observed_at desc, page.id), '[]'::jsonb)
  from (
    select o.id, d.title, o.source_url, o.observed_at, o.published_at,
      coalesce(d.source_fetched_at, o.source_fetched_at) as source_fetched_at,
      o.provenance->>'coverage' as coverage,
      case when p_query <> '' then o.content end as content
    from documents d
    join career_public_observations o on o.id = d.current_observation_id
    where d.source_scope = 'public' and o.deleted_at is null
      and exists (
        select 1 from career_public_observations linked
        where linked.resource_ref->>'id' = d.id::text and linked.deleted_at is null
          and linked.about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',p_company::text))
      )
      and (p_query = '' or to_tsvector('simple', coalesce(d.title,'') || ' ' || o.content)
        @@ websearch_to_tsquery('simple', p_query))
    order by o.observed_at desc, o.id
    offset greatest(0,p_offset) limit greatest(1,p_limit)
  ) page
$$;
revoke all on function public.career_company_evidence_v1(bigint,text,integer,integer) from public,anon,authenticated;
grant execute on function public.career_company_evidence_v1(bigint,text,integer,integer) to service_role;
