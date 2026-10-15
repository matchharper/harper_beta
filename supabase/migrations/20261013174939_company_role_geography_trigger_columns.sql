-- Column-scoped triggers avoid reading/serializing large descriptions for
-- derived-country-only writes. Work-mode corrections still invalidate matching.
-- When adding a new non-derived role column, include it in these trigger lists.
set lock_timeout = '5s';
drop trigger company_roles_guard_linkedin_vc_primary on public.company_roles;
create trigger company_roles_guard_linkedin_vc_primary before insert or update of "role_id", "company_workspace_id", "name", "external_jd_url", "description", "information", "type", "status", "created_at", "updated_at", "priority", "source_type", "source_provider", "source_job_id", "posted_at", "expires_at", "location_text", "salary_range", "seniority_level", "description_summary", "is_expired", "request", "opportunity_search_tsv", "salary_min", "salary_max", "salary_currency", "salary_period", "summary", "expired_at" on public.company_roles for each row execute function public.guard_linkedin_role_write_for_vc_primary();
drop trigger invalidate_matching_source on public.company_roles;
create trigger invalidate_matching_source before insert or delete or update of "role_id", "company_workspace_id", "name", "external_jd_url", "description", "information", "type", "status", "created_at", "updated_at", "priority", "source_type", "source_provider", "source_job_id", "posted_at", "expires_at", "location_text", "work_mode", "salary_range", "seniority_level", "description_summary", "is_expired", "request", "opportunity_search_tsv", "salary_min", "salary_max", "salary_currency", "salary_period", "summary", "expired_at" on public.company_roles for each row execute function public.invalidate_matching_source_v1();
alter table public.company_roles validate constraint company_roles_country_code_format;
