-- Public, candidate-independent observations of a role's application form.
-- The activity and approved reviews pin an observation ID so later inspections
-- never remap an existing applicant's answers or submission evidence.
create table public.role_application_inspections (
  id uuid primary key,
  role_ref text not null,
  checked_at timestamptz not null,
  payload jsonb not null
);
create index role_application_inspections_role_checked
  on public.role_application_inspections(role_ref, checked_at desc);
alter table public.role_application_inspections enable row level security;
revoke all on public.role_application_inspections from public, anon, authenticated, service_role;
grant select, insert on public.role_application_inspections to service_role;
comment on table public.role_application_inspections is
  'Immutable public form observations only. No applicant answers, documents, credentials, browser sessions or submission history.';

-- Copy existing observations. The original activity rows, payloads and revisions
-- remain completely unchanged; the currently deployed reader still uses them.
-- Explicit projection prevents unrelated application data from becoming shared.
do $$
declare
  activity record;
  source_payload jsonb;
  form_paths jsonb;
  path_value jsonb;
  form_path text[];
  source_form jsonb;
  public_form jsonb;
  field jsonb;
  fields jsonb;
  limitations jsonb;
  shared_id uuid;
  role_ref text;
  attempt record;
begin
  for activity in select payload, updated_at from public.talent_simulate_application loop
    source_payload := activity.payload;
    role_ref := coalesce('role:' || nullif(source_payload#>>'{activity,roleId}', ''), source_payload->>'roleRef');
    form_paths := '[ ["applicationForm"], ["applicationReview","form"], ["browser","reviewedApplication","form"] ]'::jsonb;
    for attempt in select ordinality - 1 as idx from jsonb_array_elements(coalesce(source_payload#>'{browser,previousAttempts}', '[]'::jsonb)) with ordinality loop
      form_paths := form_paths || jsonb_build_array(jsonb_build_array('browser','previousAttempts',attempt.idx::text,'reviewedApplication','form'));
    end loop;
    for path_value in select value from jsonb_array_elements(form_paths) loop
      select array_agg(value order by ordinality) into form_path from jsonb_array_elements_text(path_value) with ordinality;
      source_form := source_payload #> form_path;
      if jsonb_typeof(source_form) is distinct from 'object' then continue; end if;
      select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into public_form
        from jsonb_each(source_form) where key = any(array['status','url','checkedAt','text','limitations']);
      fields := '[]'::jsonb;
      for field in select value from jsonb_array_elements(coalesce(source_form->'fields','[]'::jsonb)) loop
        fields := fields || jsonb_build_array((select jsonb_object_agg(key,value) from jsonb_each(field)
          where key = any(array['label','type','multiple','name','optionValue','required','options','instructions','fileTypes','maxLength'])));
      end loop;
      limitations := coalesce(source_form->'limitations','[]'::jsonb);
      if coalesce(source_form#>>'{submission,reason}', '') <> '' and not limitations @> jsonb_build_array(source_form#>>'{submission,reason}') then
        limitations := limitations || jsonb_build_array(source_form#>>'{submission,reason}');
      end if;
      public_form := public_form || jsonb_build_object('fields',fields,'limitations',limitations);
      if source_form#>>'{submission,status}' is not null then
        public_form := public_form || jsonb_build_object('submission',jsonb_build_object('status',source_form#>>'{submission,status}'));
      end if;
      shared_id := md5(role_ref || public_form::text)::uuid;
      insert into public.role_application_inspections(id, role_ref, checked_at, payload)
        values(shared_id, role_ref, coalesce((source_form->>'checkedAt')::timestamptz, activity.updated_at), public_form)
        on conflict(id) do nothing;
    end loop;
  end loop;
end $$;
