do $$
begin
  if to_regclass('public.automation') is not null then
    delete from public.run_variants
    where run_id in (
      select runs.id
      from public.runs
      join public.automation on automation.id = runs.query_id
    );

    delete from public.runs_pages
    where run_id in (
      select runs.id
      from public.runs
      join public.automation on automation.id = runs.query_id
    );

    delete from public.synthesized_summary
    where run_id in (
      select runs.id
      from public.runs
      join public.automation on automation.id = runs.query_id
    );

    delete from public.runs
    using public.automation
    where runs.query_id = automation.id;

    delete from public.messages
    using public.automation
    where messages.query_id = automation.id;

    delete from public.queries
    using public.automation
    where queries.query_id = automation.id;
  end if;
end
$$;

drop table if exists public.automation_results;
drop table if exists public.automation;
