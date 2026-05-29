alter table public.official_jobs
  add column if not exists ashby_job_posting_id text null;

alter table public.official_jobs
  drop constraint if exists official_jobs_ashby_job_posting_id_check;

alter table public.official_jobs
  add constraint official_jobs_ashby_job_posting_id_check check (
    ashby_job_posting_id is null
    or length(btrim(ashby_job_posting_id)) > 0
  );

create unique index if not exists official_jobs_ashby_job_posting_id_uidx
  on public.official_jobs (ashby_job_posting_id)
  where ashby_job_posting_id is not null;
