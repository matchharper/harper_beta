begin;
set local lock_timeout='5s';
-- INSERT ... ON CONFLICT ran the BEFORE INSERT pass before the conflict was known, so
-- unchanged upserts expired fits and closed decisions. INSERT now runs AFTER; UPDATE and
-- DELETE (and any UPDATE OF list) keep their deployed BEFORE definition. Do not add
-- INSERT back when recreating these triggers, e.g. the company_roles column list.
do $$ declare t text; v_def text; begin
  foreach t in array array['talent_users','talent_setting','talent_contexts','talent_experiences','talent_educations','talent_extras','talent_behavior_contexts','company_roles','company_internal_roles','company_behavior_contexts','company_workspace'] loop
    select pg_get_triggerdef(tg.oid) into strict v_def from pg_trigger tg
      where tg.tgrelid=format('public.%I',t)::regclass and tg.tgname='invalidate_matching_source';
    if v_def !~ '^CREATE TRIGGER invalidate_matching_source BEFORE INSERT OR DELETE OR UPDATE ' then
      raise exception 'unexpected invalidate_matching_source on %: %',t,v_def;
    end if;
    execute regexp_replace(v_def,'^CREATE TRIGGER invalidate_matching_source BEFORE INSERT OR DELETE OR UPDATE ',
      'CREATE OR REPLACE TRIGGER invalidate_matching_source BEFORE DELETE OR UPDATE ');
    -- Fits and decisions reference company_roles ON DELETE CASCADE, so a new role has none.
    if t<>'company_roles' then
      execute format('create trigger invalidate_matching_source_after_insert after insert on public.%I for each row execute function public.invalidate_matching_source_v1()',t);
    end if;
  end loop;
end $$;
commit;
