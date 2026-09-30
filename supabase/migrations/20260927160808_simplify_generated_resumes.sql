-- Resume generation now publishes directly to talent_documents.
-- Keep structured_content, revision, and the revision trigger for document editing.
drop function if exists public.claim_resume_job_v1(uuid,text,text,text,uuid,integer);
drop function if exists public.commit_resume_job_v1(uuid,uuid,uuid,text,jsonb,text,bigint,text,integer);
drop function if exists public.fail_resume_job_v1(uuid,uuid,uuid);
drop function if exists public.sweep_resume_jobs_v1();
drop table if exists public.talent_resume_cleanup;
drop table if exists public.talent_resume_jobs;
-- Existing document and Storage policies remain unchanged.
