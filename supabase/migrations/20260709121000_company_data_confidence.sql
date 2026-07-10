alter table public.company_data
  add column if not exists confidence numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_data'::regclass
      and conname = 'company_data_confidence_check'
  ) then
    alter table public.company_data
      add constraint company_data_confidence_check
      check (confidence is null or (confidence >= 0 and confidence <= 100));
  end if;
end $$;

comment on column public.company_data.confidence is
  '0-100 entity-match confidence that the cached funding data refers to the exact queried company.';
