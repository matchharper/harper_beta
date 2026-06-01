alter table public.official_jobs
  drop constraint if exists official_jobs_required_text_check;

alter table public.official_jobs
  add constraint official_jobs_required_text_check check (
    length(btrim(company_name)) > 0
    and length(btrim(role_title)) > 0
    and length(btrim(location)) > 0
    and length(btrim(slug)) > 0
  );

update public.official_jobs
set vertical = ''
where ashby_job_posting_id is not null
  and lower(btrim(vertical)) = 'ashby';
