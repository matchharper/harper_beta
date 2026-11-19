-- Read-only snapshot for the offline user-company recommender prototype.
-- Run: scripts/recsys-prototype/extract.sh  (writes CSVs to output/recsys/data, which is gitignored)
-- No names, emails or free-text profiles of people are exported.
\set ON_ERROR_STOP on
begin transaction read only;
set local statement_timeout = '15min';

-- Recommendations shown to talents, mapped to company_workspace through the role.
\copy (select t.id, t.talent_id, t.role_id, coalesce(t.company_workspace_id, r.company_workspace_id) company_workspace_id, t.kind, t.opportunity_type, t.recommended_at, t.viewed_at, t.clicked_at, t.feedback, t.feedback_at, t.saved_stage, t.dismissed_at, t.rank, t.score from talent_opportunity_recommendation t left join company_roles r on r.role_id = t.role_id) to 'output/recsys/data/recs.csv' csv header

-- Companies (workspace is the company key) joined to company_db facts.
\copy (select w.company_workspace_id, w.company_name, w.company_db_id, w.linkedin_url, coalesce(w.is_internal,false) is_internal, w.has_career_page, left(coalesce(w.company_description,''),1500) description, c.employee_count_range, c.founded_year, c.location, left(coalesce(c.specialities,''),400) specialities, (c.investors is not null and c.investors <> '') has_investors, (c.crunchbase_information is not null) has_crunchbase from company_workspace w left join company_db c on c.id = w.company_db_id) to 'output/recsys/data/companies.csv' csv header

-- External roles (no description bodies).
\copy (select r.role_id, r.company_workspace_id, r.name, r.source_type, r.source_provider, r.status, r.seniority_level, r.work_mode, r.country_code, left(coalesce(r.location_text,''),120) location_text, r.salary_min, r.salary_max, r.salary_currency, r.salary_period, r.posted_at, r.created_at, r.expires_at, r.is_expired from company_roles r) to 'output/recsys/data/roles.csv' csv header

-- Company embedding: mean of external role-title embeddings.
\copy (select r.company_workspace_id, avg(r.title_embedding)::text emb, count(*) n from company_roles r join company_workspace w using (company_workspace_id) where r.title_embedding is not null and not coalesce(w.is_internal,false) group by 1) to 'output/recsys/data/company_emb.csv' csv header

-- Talent embedding: mean of profile chunk embeddings, plus the summary chunk alone.
\copy (select talent_id, avg(embedding)::text emb_all, (array_agg(embedding::text) filter (where chunk_key='summary'))[1] emb_summary, count(*) n from talent_profile_chunk_embeddings group by 1) to 'output/recsys/data/talent_emb.csv' csv header

-- Talents (no names, emails, resumes).
\copy (select u.user_id talent_id, u.created_at, u.deleted_at, f.country_code, f.city, f.remote_ok, f.relocation_ok, s.is_onboarding_done, s.blocked_companies from talent_users u left join talent_location_facets f on f.talent_id = u.user_id left join talent_setting s on s.user_id = u.user_id) to 'output/recsys/data/talents.csv' csv header

\copy (select talent_id, company_id, company_name, left(coalesce(role,''),120) role, start_date, end_date, months from talent_experiences) to 'output/recsys/data/talent_exp.csv' csv header
\copy (select talent_id, lower(btrim(school)) school, degree, field, start_date, end_date from talent_educations) to 'output/recsys/data/talent_edu.csv' csv header

-- Existing LLM evaluator output, aggregated to talent x company.
\copy (select e.talent_id, coalesce(e.company_workspace_id, r.company_workspace_id) company_workspace_id, max((e.assessment->'fit'->>'mutualFit')::float) mutual_fit, max((e.assessment->'fit'->>'candidateInterest')::float) candidate_interest, max((e.assessment->'fit'->>'companyInterest')::float) company_interest, max((e.assessment->'fit'->>'roleFit')::float) role_fit, max((e.assessment->'fit'->>'constraintPass')::float) constraint_pass, count(*) n_evals, min(e.evaluated_at) first_evaluated_at from talent_external_evaluations e left join company_roles r on r.role_id = e.role_id group by 1,2) to 'output/recsys/data/evals.csv' csv header

-- Career records of the people DB (anonymous ids only).
\copy (select candid_id, company_id, left(coalesce(role,''),80) role, start_date, end_date, months from experience_user) to 'output/recsys/data/experience_user.csv' csv header
\copy (select candid_id, lower(btrim(school)) school from edu_user where school is not null) to 'output/recsys/data/edu_user.csv' csv header
\copy (select id candid_id, is_korean, total_exp_months from candid) to 'output/recsys/data/candid.csv' csv header
\copy (select id, name, linkedin_url, employee_count_range, founded_year, location from company_db) to 'output/recsys/data/company_db.csv' csv header

commit;
