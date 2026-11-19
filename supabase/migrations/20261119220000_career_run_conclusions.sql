-- A scheduled or follow-change run's final text is not delivered to the candidate. It is what the
-- run concluded (what it checked, what it sent or why it stayed quiet), and the
-- next run of the same reservation or followed company starts from it
-- (docs/career-agent-harness-ko.md 5절 13번).
create function public.record_career_run_conclusion_v1(p_talent uuid, p_run uuid, p_text text)
returns void language sql security invoker set search_path = '' as $$
  update public.opportunity_discovery_run
  set coverage = coalesce(coverage, '{}'::jsonb)
    || jsonb_build_object('conclusion', jsonb_build_object('text', p_text, 'at', now()))
  where id = p_run and talent_id = p_talent and nullif(btrim(coalesce(p_text, '')), '') is not null;
$$;

-- The latest earlier conclusion for each reservation or followed company this run continues.
create function public.read_career_source_conclusions_v1(p_talent uuid, p_run uuid, p_sources jsonb)
returns table(source_kind text, source_id text, run_id uuid, conclusion text, concluded_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s->>'sourceKind', s->>'sourceId', r.id, r.coverage->'conclusion'->>'text', (r.coverage->'conclusion'->>'at')::timestamptz
  from jsonb_array_elements(p_sources) as s
  cross join lateral (
    select run.id, run.coverage
    from public.opportunity_discovery_run run
    where run.talent_id = p_talent and run.id <> p_run
      and run.coverage ? 'conclusion'
      and run.trigger_payload->'sourceEvents'
        @> jsonb_build_array(jsonb_build_object('sourceKind', s->>'sourceKind', 'sourceId', s->>'sourceId'))
    order by (run.coverage->'conclusion'->>'at')::timestamptz desc
    limit 1
  ) r;
$$;

revoke all on function public.record_career_run_conclusion_v1(uuid, uuid, text),
  public.read_career_source_conclusions_v1(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_career_run_conclusion_v1(uuid, uuid, text),
  public.read_career_source_conclusions_v1(uuid, uuid, jsonb) to service_role;
