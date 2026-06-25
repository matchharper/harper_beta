-- Run this after deploying the code that removes /my/ats.
begin;

drop table if exists public.candidate_outreach_message;
drop table if exists public.candidate_outreach;
drop table if exists public.candidate_outreach_workspace;

commit;
