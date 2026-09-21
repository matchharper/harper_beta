-- A sheet row and a linked record can be different entities. Declare clickable
-- cells in source metadata so the web grid stays generic as sheets evolve.
alter table gtm_view.sources
  add column cell_navigation jsonb not null default '[]'::jsonb;

alter table gtm_view.sources
  add constraint gtm_sources_cell_navigation_array
  check (jsonb_typeof(cell_navigation) = 'array');

update gtm_view.sources
set cell_navigation = '[{"column":"name","source":"creators","id_field":"id","tab":"conversation"}]'::jsonb
where id in ('creators', 'connected', 'performance_creator');

update gtm_view.sources
set cell_navigation = '[{"column":"creator_name","source":"creators","id_field":"creator_id","tab":"conversation"}]'::jsonb
where id in ('review', 'outreach', 'contents', 'feed');

-- These sources can show the creator name through their creator_id relation
-- when a team member adds that column to a sheet.
update gtm_view.sources
set cell_navigation = '[{"column":"creator_id.name","source":"creators","id_field":"creator_id","tab":"conversation"}]'::jsonb
where id in ('collaborations', 'accounts');

-- The record workspace decorates the base catalog. Extend that decoration
-- without replacing any newer action handling in the public wrapper.
do $migration$
declare definition text; patched text;
begin
  select pg_get_functiondef(
    'gtm_view.record_workspace(text,jsonb,text)'::regprocedure
  ) into definition;
  if position('''cell_navigation'',registered.cell_navigation' in definition) > 0 then
    return;
  end if;
  patched := replace(
    definition,
    '''navigation'',registered.navigation,''record_fields'',gtm_view.record_fields(registered.id)',
    '''navigation'',registered.navigation,''cell_navigation'',registered.cell_navigation,''record_fields'',gtm_view.record_fields(registered.id)'
  );
  if patched = definition then
    raise exception 'GTM catalog decoration changed';
  end if;
  execute patched;
end $migration$;
