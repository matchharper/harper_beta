import {
  buildBlockedCompanySql,
  previouslyRecommendedRoleExclusionSql,
} from "../talentOnboarding/jobPostingRecommendations";

export function eligibilitySql(args: {
  userId: string;
  blockedCompanies: string[];
  asOf?: string | null;
}) {
  return [
    "cr.source_type = 'external'",
    "COALESCE(cr.source_provider,'') <> 'user_submitted'",
    "COALESCE(cr.is_expired,false) = false",
    "(cr.expires_at IS NULL OR cr.expires_at > now())",
    "cr.status NOT IN ('expired','closed','inactive','archived','ended')",
    "cw.external_roles_enabled = true",
    "lower(coalesce(cr.information->>'testOnly','false')) <> 'true'",
    previouslyRecommendedRoleExclusionSql(args.userId, args.asOf),
    ...buildBlockedCompanySql(args.blockedCompanies),
  ]
    .filter(Boolean)
    .join(" AND ");
}
export const ROLE_SELECT = `cr.role_id::text, cr.company_workspace_id::text, cr.name AS role_name,
cr.description, cr.external_jd_url, cr.country_code, cr.location_text, cr.work_mode, cr.type, cr.posted_at,
cr.salary_min, cr.salary_max, cr.salary_currency, cr.salary_period, cr.salary_range, cr.seniority_level,
cr.summary, cr.salary_is_predicted,
cw.company_name,cw.company_description,cw.test_score AS company_test_score, cd.name AS company_db_name, cd.description AS company_db_description,
cd.short_description AS company_db_short_description,cd.location AS company_db_location,
cd.founded_year AS company_db_founded_year,cd.employee_count_range AS company_db_employee_count_range`;
export const ROLE_JOINS = `JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id
LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id`;
