-- Topic reads search the company's own published notes. A product-name lookup
-- can produce several candidate companies, so retrieve all on one round trip.
create function public.career_read_company_topic_evidence_v1(
  p_companies bigint[], p_query text, p_offset integer, p_limit integer, p_include_sources boolean
) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with terms as (select unnest(tsvector_to_array(to_tsvector('simple', p_query))) term),
  matches as (
    select w.company_db_id, d.id, d.checked_at, score.word_matches,
      row_number() over (partition by w.company_db_id order by score.word_matches desc,d.checked_at desc,d.id) pos,
      count(*) over (partition by w.company_db_id) total
    from company_workspace w join company_datas d using(company_workspace_id)
    cross join lateral (
      select count(*) word_matches from terms
      where strpos(lower(d.label || ' ' || d.content), term)>0
    ) score
    where w.company_db_id=any(p_companies) and w.is_public_data_home and score.word_matches>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'companyId', c.id::text, 'items', coalesce(page.items,'[]'::jsonb), 'total',coalesce(page.total,0),
    'observations', case when p_include_sources then career_company_evidence_v1(c.id,p_query,p_offset,p_limit)
                         else '[]'::jsonb end
  )),'[]'::jsonb)
  from unnest(p_companies) c(id) left join lateral (
    select jsonb_agg(career_company_datum_json_v1(d) order by m.pos) items,max(m.total) total
    from matches m join company_datas d on d.id=m.id
    where m.company_db_id=c.id and m.pos>greatest(0,p_offset) and m.pos<=greatest(0,p_offset)+greatest(0,p_limit)
  ) page on true
$$;
revoke all on function public.career_read_company_topic_evidence_v1(bigint[],text,integer,integer,boolean)
  from public,anon,authenticated;
grant execute on function public.career_read_company_topic_evidence_v1(bigint[],text,integer,integer,boolean)
  to service_role;
