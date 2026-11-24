-- A saved company overview is written in whatever language its sources used.
-- Readers see it in their own language: {"ko": {"revision", "content"}, "en": ...}.
-- A version belongs to the revision it was written from; a rewrite of the
-- entry bumps the revision, so readers ignore the old versions.
alter table public.company_datas add column localized jsonb not null default '{}'::jsonb;

create function public.career_save_company_datum_language_v1(p_data_ref jsonb,p_language text,p_content text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_language not in ('ko','en') or nullif(btrim(p_content),'') is null
      or p_data_ref->>'kind' is distinct from 'company_datum'
      or pg_input_is_valid(p_data_ref->>'id','uuid') is distinct from true then
    raise exception 'Invalid company material language version';
  end if;
  -- Merges one language, so concurrent readers of the other language keep theirs.
  update company_datas set localized=localized||jsonb_build_object(p_language,
      jsonb_build_object('revision',revision::text,'content',p_content))
    where id=(p_data_ref->>'id')::uuid and revision::text=p_data_ref->>'revision';
  return found;
end $$;
revoke all on function public.career_save_company_datum_language_v1(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.career_save_company_datum_language_v1(jsonb,text,text) to service_role;
