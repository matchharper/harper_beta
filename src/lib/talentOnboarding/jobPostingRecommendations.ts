import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import { fetchRecentTalentActivitySummaries } from "@/lib/talentOnboarding/activityEvents";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  buildTalentProfileContext,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
} from "@/lib/talentOnboarding/server";
import { OpportunityType } from "@/lib/opportunityType";

if (typeof window !== "undefined") {
  throw new Error("jobPostingRecommendations must not run in the browser");
}

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type SearchCondition = {
  column: string;
  mode: "all" | "any";
  polarity: "include" | "exclude";
  values: string[];
};

type FtsKeyword = {
  terms: string[];
  weight: number;
};

type SearchPlan = {
  ftsKeywords: FtsKeyword[];
  must: SearchCondition[];
  rerankCriteria: string[];
  searchIntentSummary: string;
  should: SearchCondition[];
};

type RawRoleRow = {
  career_url?: string | null;
  company_db_description?: string | null;
  company_db_id?: number | null;
  company_db_location?: string | null;
  company_db_name?: string | null;
  company_db_short_description?: string | null;
  company_db_specialities?: string | null;
  company_description?: string | null;
  company_name?: string | null;
  company_test_score?: number | null;
  company_workspace_id?: string | null;
  description?: string | null;
  external_jd_url?: string | null;
  homepage_url?: string | null;
  information_text?: string | null;
  location_text?: string | null;
  posted_at?: string | null;
  role_id?: string | null;
  role_name?: string | null;
  salary_range?: string | null;
  search_rank?: number | null;
  seniority_level?: string | null;
  source_type?: string | null;
  status?: string | null;
  type?: string[] | null;
  updated_at?: string | null;
  work_mode?: string | null;
};

type RankedRole = {
  concerns: string[];
  goodPoints: string[];
  recommendationText: string | null;
  role: RawRoleRow;
  roleId: string;
  score: number;
};

type PreferenceFitStatus = "Satisfied" | "Neutral" | "Dissatisfied";

type RecommendationPreferenceFit = Record<
  string,
  {
    note: string;
    status: PreferenceFitStatus;
  }
>;

type RecommendationDetail = {
  fitReasons: string[];
  preferenceFit: RecommendationPreferenceFit;
  roleOverviewText: string | null;
  tradeoffs: string[];
};

type EnrichedRankedRole = RankedRole & {
  detail: RecommendationDetail;
  recommendationId: string | null;
};

const MAX_SEARCH_RESULTS = 200;
const PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE = 1000;
const RECENT_TALENT_ACTIVITY_SUMMARY_LIMIT = 5;
const SHORTLIST_CANDIDATE_MIN_COUNT = 30;
const SHORTLIST_CANDIDATE_TARGET_COUNT = 40;
const SHORTLIST_COMPANY_DESCRIPTION_LIMIT = 200;
const BROADENED_SEARCH_CANDIDATE_THRESHOLD = 5;
const FINAL_RECOMMENDATION_COUNT = 5;
const CONTINUATION_RECOMMENDATION_BATCH_LIMIT = 10;
const RECOMMEND_JOB_POSTINGS_MODEL_VERSION =
  "career_chat_recommend_job_postings_v3";
const PREFERENCE_FIT_KEYS = [
  "next_scope",
  "location",
  "compensation",
  "deal_breakers",
  "must_haves",
] as const;

const COLUMN_SQL: Record<string, string> = {
  "company_db.description": "cd.description",
  "company_db.investors": "cd.investors",
  "company_db.location": "cd.location",
  "company_db.name": "cd.name",
  "company_db.short_description": "cd.short_description",
  "company_db.specialities": "cd.specialities",
  "company_roles.description": "cr.description",
  "company_roles.information": "cr.information::text",
  "company_roles.location_text": "cr.location_text",
  "company_roles.name": "cr.name",
  "company_roles.seniority_level": "cr.seniority_level",
  "company_roles.source_type": "cr.source_type",
  "company_roles.type": "cr.type",
  "company_roles.work_mode": "cr.work_mode",
  "company_workspace.company_description": "cw.company_description",
  "company_workspace.company_name": "cw.company_name",
};

const ARRAY_COLUMNS = new Set(["cr.type"]);
const COMPANY_CONDITION_COLUMNS = new Set([
  "company_workspace.company_name",
  "company_db.name",
]);
const FTS_TEXT_CONDITION_COLUMNS = new Set([
  "company_roles.description",
  "company_roles.name",
]);
const FTS_RANK_WEIGHTS = "ARRAY[0.04,0.57,0.64,1.0]::real[]";
const MAX_FTS_KEYWORDS = 8;
const MAX_CONDITION_VALUES = 10;
const MAX_FTS_TERMS_PER_KEYWORD = 10;
const RERANK_BATCH_SIZE = 50;
const RERANK_BATCH_FINALIST_COUNT = 10;
const ROLE_DESCRIPTION_PROMPT_LIMIT = 3000;
const COMPANY_TEST_SCORE_MAX = 20;
const COMPANY_TEST_SCORE_SEARCH_RANK_DIVISOR = 100;
// Max boost is about +2.9 on the 0-10 rerank score.
const COMPANY_TEST_SCORE_RERANK_DIVISOR = 7;
const RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL = "grok-4-1-fast-reasoning";
const RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL = "grok-4-fast-reasoning";

const PLAN_SYSTEM_PROMPT = `You are a job-search query planner for Harper.
Return JSON only. Do not write SQL.

You receive a user/candidate brief and a Supabase schema. Decide which columns and values should be used to retrieve up to ${MAX_SEARCH_RESULTS} candidate job postings, then write reranking criteria.

Allowed output shape:
{
  "searchIntentSummary": "one Korean sentence",
  "must": [],
  "should": [
    { "column": "company_roles.location_text", "mode": "any", "values": ["Seoul", "서울"], "polarity": "include" }
  ],
  "ftsKeywords": [
    { "terms": ["Research Scientist", "Research Engineer", "Applied Scientist", "ML Researcher", "AI Researcher", "Machine Learning Engineer", "ML Engineer", "Researcher", "연구원", "머신러닝 엔지니어"], "weight": 1.2 },
    { "terms": ["TTS", "Text-to-Speech", "speech synthesis", "음성합성"], "weight": 2.8 }
  ],
  "rerankCriteria": ["Korean sentence 1", "Korean sentence 2", "Korean sentence 3"]
}

Rules:
- Use only these columns:
  company_roles.name, company_roles.description,
  company_roles.location_text, company_roles.work_mode, company_roles.type,
  company_roles.source_type,
  company_workspace.company_name, company_workspace.company_description,
  company_db.name, company_db.description, company_db.short_description, company_db.specialities, company_db.location, company_db.investors.
- For role name/description intent, always add ftsKeywords. The SQL builder searches company_roles.opportunity_search_tsv for these terms and uses weight for ts_rank_cd ordering.
- Retrieval contract: ftsKeywords are the first-pass role/domain gate. The SQL builder ORs all ftsKeywords groups together, so a posting can enter the candidate pool if it matches any single ftsKeywords group. Therefore every ftsKeywords group must be strong enough that a posting matching only that group is still plausibly relevant to the user's requested role.
- First-pass search must prioritize role fit above company, location, compensation, work style, culture, and prestige. Use ftsKeywords only for role family, title family, core technical/business domain, methods, tools, or responsibilities that define the work itself.
- Do not put preference-only concepts in ftsKeywords: company stage, company size, funding stage, investors, famous accelerators, location, remote/hybrid/onsite, salary, culture, benefits, brand prestige, "startup", "Series A", "YC", "a16z", "global", "Seoul", or similar context. Put these in should when a column exists, and in rerankCriteria otherwise.
- Exception: a context word may be in ftsKeywords only when it is literally the work domain or role family, not just a preference. Example: "Venture Capital Analyst" may use VC/investment terms; "LLM Researcher at VC-backed startups" must not use VC/startup terms as ftsKeywords.
- If the request combines a role with company/location/work-mode/company-stage preferences, keep ftsKeywords role/domain-only and express the preferences through should and rerankCriteria.
- Put synonyms for one concept in one ftsKeywords item. Example: ["TTS", "Text-to-Speech", "음성합성"].
- Set ftsKeywords.weight from 0.5 to 5.0. More distinctive domain/skill keywords should be heavier than generic role words. Example: for "TTS Researcher", TTS should be around 3.0-5.0 and Researcher around 0.8-1.5.
- Good example for "LLM Researcher at hot Seoul/remote startups": ftsKeywords should include LLM/large-language-model research terms, alignment/RLHF/SFT/DPO/PPO terms, and AI/ML researcher title-family terms. Put Seoul/remote/startup/investor preference in should/rerankCriteria, not ftsKeywords.
- Bad example: adding ["Startup", "Series A", "YC", "a16z"] to ftsKeywords for an LLM Researcher search, because a marketing or sales role at a startup could then pass the first retrieval gate.
- Avoid putting company_roles.name in must. Role titles are noisy, inconsistent, and often do not share exact wording; hard title substring filters hurt recall. Prefer ftsKeywords for title/role-family concepts and let rerankCriteria decide final fit.
- Use company_roles.name in must only when the user explicitly makes the exact title non-negotiable, such as "Research Scientist만" or "ML Engineer role only". If you do, use mode="any" and include 8-10 broad English/Korean variants, abbreviations, and adjacent titles that should still count. Never use mode="all" for company_roles.name title variants.
- Still use must/should for structured filters such as location_text, work_mode, type, company, source, and explicit exclusions.
- Never use company_roles.salary_range in must or should. Salary data is sparse, so salary requirements belong only in rerankCriteria.
- The SQL builder converts non-FTS condition values into ILIKE patterns. Example: column=company_roles.location_text, mode=any, values=["Seoul","서울"] becomes location_text ILIKE %Seoul% OR location_text ILIKE %서울%.
- Use "mode":"any" when synonyms or alternatives are acceptable. Use "mode":"all" only for truly required co-occurring concepts.
- Put truly non-negotiable requirements in must only when the user says "only", "must", "exclude", or clearly rejects alternatives. Put useful preferences in should. If unsure, prefer should.
- Prefer should for location_text, work_mode, type, and seniority unless the user explicitly makes them hard constraints, because some postings have sparse structured fields.
- Use polarity=exclude for explicit negative requirements only.
- Keep values short search tokens, not whole sentences. Maximum 8 total conditions and 10 values per condition.
- ftsKeywords should contain 2-6 high-signal role/domain concepts at most.
- rerankCriteria must be 3-4 Korean sentences and should explain how to score fit, concerns, and prioritization.`;

const BROADENED_PLAN_SYSTEM_PROMPT = `${PLAN_SYSTEM_PROMPT}

Second-pass broadening rules:
- You are creating a broader fallback SearchPlan after the first plan found too few roles.
- Return the same JSON shape only.
- This plan is still executed by the normal SQL builder: must conditions are ANDed, should conditions are soft preferences or fallback filters, and ftsKeywords groups are ORed together when present. Do not rely on preference-only ftsKeywords to broaden retrieval.
- Preserve explicit hard constraints from the user, especially company names and exclusions. If the original plan targeted a specific company, the broader plan must still target that company.
- For a specific company, prefer one company identity column, usually company_workspace.company_name. Do not duplicate the same company as separate must conditions across company_workspace.company_name and company_db.name unless both are truly required.
- Broaden noisy role/domain matching by using fewer or broader role/domain ftsKeywords, or by moving preferences to rerankCriteria. Do not broaden by adding company-stage, location, compensation, or prestige terms to ftsKeywords.
- Prefer moving location, work_mode, type, and seniority preferences to should or rerankCriteria unless the user made them explicit hard filters.
- Do not add weak generic terms like "full-time", "remote", or "US" as ftsKeywords.`;

const SHORTLIST_SYSTEM_PROMPT = `You are Harper's compact job-posting shortlist filter.
Return JSON only:
{
  "selectedRoleIds": ["role_id_1", "role_id_2"]
}

Rules:
- Select roleIds only from the candidate roles shown by the user.
- Select ${SHORTLIST_CANDIDATE_MIN_COUNT}-${SHORTLIST_CANDIDATE_TARGET_COUNT} roles when that many candidates are plausibly relevant. If fewer candidates are available or plausible, select all plausible candidates.
- Do not use hard-coded role category exclusions. Judge whether each role appears aligned with the user brief, current request, search intent, and compact card.
- Prefer one role per company when possible. Select a second role from the same company only if there are not enough credible companies or the roles are materially different and both are strong fits.
- Use the user's profile, current request, recent activity summaries, insights, and reranking criteria. The compact role cards intentionally omit detailed descriptions; shortlist for likely fit, then a later model will inspect full details.
- Preserve candidate order only as a weak tie-breaker.`;

const RERANK_SYSTEM_PROMPT = `You are Harper's job recommendation reranker.
Score each role from 0 to 10 for this specific user. Return JSON only.

Output:
{
  "rankedRoles": [
    {
      "roleId": "uuid",
      "score": 8.6,
      "goodPoints": ["short Korean phrase"],
      "concerns": ["short Korean phrase"],
      "recommendationText": "Korean explanation or null"
    }
  ]
}

Rules:
- Rank the best roles first.
- Return the requested number of roleIds for the current rerank stage when enough candidates exist.
- Use the user's profile, conversation, insights, preferences, and the reranking criteria.
- Company test score is Harper's internal company quality/priority score from 0 to 20. Treat it as important, but do not let it override a severe role mismatch.
- Strongly prefer company diversity in every rerank stage, including batch finalist selection and the final top 5.
- In a batch stage, the returned finalists should normally contain at most one role per company. Include a second role from the same company only when it is clearly a different role family and materially stronger than the best outside-company alternative.
- In the final top 5, do not include two roles from the same company unless there are fewer than 5 credible companies or the second same-company role is clearly different and much stronger than available alternatives.
- When multiple same-company roles are close in fit, rank only the strongest one high and push the others below comparable roles from other companies.
- If score is 9.0 or higher, recommendationText is required and must include both why it is good and one possible concern.
- If score is below 9.0, recommendationText may be null.
- Do not invent facts that are not in the role or company data.`;

const EXPLANATION_SYSTEM_PROMPT = `You write concise Korean recommendation notes.
Return JSON only:
{
  "explanations": [
    {
      "roleId": "uuid",
      "goodPoints": ["short Korean phrase"],
      "concerns": ["short Korean phrase"],
      "recommendationText": "2-3 Korean sentences"
    }
  ]
}

Each recommendationText must explain why the role is recommended and include one realistic concern.`;

const RECOMMENDATION_DETAIL_SYSTEM_PROMPT = `You write worker-compatible Korean job recommendation details.
Return JSON only:
{
  "details": [
    {
      "roleId": "uuid",
      "fitReasons": ["추천하는 이유", "추천하는 이유 2"],
      "tradeoffs": ["구체적 우려나 확인할 점"],
      "roleOverviewText": "회사 + Role에 대한 객관적 설명. 1-2 문장.",
      "preferenceFit": {
        "next_scope": {"status": "Satisfied|Neutral|Dissatisfied", "note": "짧은 한국어 한 문장"},
        "location": {"status": "Satisfied|Neutral|Dissatisfied", "note": "짧은 한국어 한 문장"},
        "compensation": {"status": "Satisfied|Neutral|Dissatisfied", "note": "짧은 한국어 한 문장"},
        "deal_breakers": {"status": "Satisfied|Neutral|Dissatisfied", "note": "짧은 한국어 한 문장"},
        "must_haves": {"status": "Satisfied|Neutral|Dissatisfied", "note": "짧은 한국어 한 문장"}
      }
    }
  ]
}

Rules:
- Return one detail object for each selected roleId from the user message.
- fitReasons are required. Write 1-2 personalized Korean reasons grounded in the candidate brief and role card.
- tradeoffs should contain 0-1 concrete concern. Leave it empty when there is no grounded downside.
- roleOverviewText is neutral company-and-role overview, not a recommendation reason. Do not mention the candidate in roleOverviewText.
- preferenceFit evaluates only explicit user insights for next_scope, location, compensation, deal_breakers, and must_haves. Omit keys when the matching user insight is missing or blank.
- Each preferenceFit note must be one short factual Korean sentence grounded in the role card and user insight.
- Do not invent facts that are missing from the role or company data.`;

const DEBUG_RECOMMEND_JOB_POSTINGS =
  process.env.DEBUG_RECOMMEND_JOB_POSTINGS === "1";

function cleanText(value: unknown, maxLength = 4000) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function cleanPlainText(value: unknown, maxLength = 4000) {
  const raw = typeof value === "string" ? value.replace(/<[^>]*>/g, " ") : "";
  return cleanText(raw, maxLength);
}

function clampBlock(value: unknown, maxLength = 4000) {
  const text = typeof value === "string" ? value.replace(/\r/g, "").trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function debugLog(label: string, payload: Record<string, unknown>) {
  if (!DEBUG_RECOMMEND_JOB_POSTINGS) return;
  console.info(
    `[recommend_job_postings:debug] ${label}`,
    JSON.stringify(payload, null, 2)
  );
}

function infoJson(label: string, payload: Record<string, unknown>) {
  console.info(
    `[recommend_job_postings] ${label}`,
    JSON.stringify(payload, null, 2)
  );
}

function asStringArray(value: unknown, maxItems = 8, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, string>();
  for (const item of value) {
    const text = cleanText(item, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase("ko-KR");
    if (!unique.has(key)) unique.set(key, text);
    if (unique.size >= maxItems) break;
  }
  return Array.from(unique.values());
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseMaybeJsonRecord(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (direct) return direct;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function parseMaybeJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const RPC_WRAPPER_KEYS = [
  "set_timeout_and_execute_raw_sql",
  "execute_raw_sql",
  "row_to_json",
  "json_build_object",
  "jsonb_build_object",
  "result",
  "row",
  "data",
];

function unwrapRpcArray(value: unknown): unknown[] | null {
  const parsed = parseMaybeJsonValue(value);
  if (Array.isArray(parsed)) return parsed;

  const record = parseMaybeJsonRecord(parsed);
  if (!record) return null;

  for (const key of RPC_WRAPPER_KEYS) {
    const nested = unwrapRpcArray(record[key]);
    if (nested) return nested;
  }

  const entries = Object.entries(record);
  if (entries.length === 1) {
    return unwrapRpcArray(entries[0][1]);
  }

  return null;
}

function flattenRpcRows(value: unknown): unknown[] {
  const parsed = parseMaybeJsonValue(value);
  const topLevel = Array.isArray(parsed) ? parsed : [parsed];
  const rows: unknown[] = [];

  for (const item of topLevel) {
    const unwrappedArray = unwrapRpcArray(item);
    if (unwrappedArray) {
      rows.push(...unwrappedArray);
      continue;
    }

    if (item !== null && item !== undefined) {
      rows.push(parseMaybeJsonValue(item));
    }
  }

  return rows;
}

function unwrapRpcRow(value: unknown): Record<string, unknown> | null {
  let record = parseMaybeJsonRecord(value);
  if (!record) return null;

  for (let depth = 0; depth < 3; depth += 1) {
    let unwrapped = false;
    for (const key of RPC_WRAPPER_KEYS) {
      const nested = parseMaybeJsonRecord(record[key]);
      if (nested) {
        record = nested;
        unwrapped = true;
        break;
      }
    }
    if (unwrapped) continue;

    const entries = Object.entries(record);
    if (entries.length === 1) {
      const nested = parseMaybeJsonRecord(entries[0][1]);
      if (nested) {
        record = nested;
        continue;
      }
    }
    break;
  }

  return record;
}

function stringField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function numberField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function stringArrayField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item : String(item ?? "")))
        .filter(Boolean);
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) =>
              typeof item === "string" ? item : String(item ?? "")
            )
            .filter(Boolean);
        }
      } catch {
        return [value].filter(Boolean);
      }
    }
  }
  return null;
}

function normalizeRoleRow(value: unknown): RawRoleRow | null {
  const record = unwrapRpcRow(value);
  if (!record) return null;

  return {
    career_url: stringField(record, "career_url", "careerUrl"),
    company_db_description: stringField(
      record,
      "company_db_description",
      "companyDbDescription"
    ),
    company_db_id:
      typeof record.company_db_id === "number"
        ? record.company_db_id
        : typeof record.companyDbId === "number"
          ? record.companyDbId
          : null,
    company_db_location: stringField(
      record,
      "company_db_location",
      "companyDbLocation"
    ),
    company_db_name: stringField(record, "company_db_name", "companyDbName"),
    company_db_short_description: stringField(
      record,
      "company_db_short_description",
      "companyDbShortDescription"
    ),
    company_db_specialities: stringField(
      record,
      "company_db_specialities",
      "companyDbSpecialities"
    ),
    company_description: stringField(
      record,
      "company_description",
      "companyDescription"
    ),
    company_name: stringField(record, "company_name", "companyName"),
    company_test_score: normalizeCompanyTestScore(
      numberField(record, "company_test_score", "companyTestScore")
    ),
    company_workspace_id: stringField(
      record,
      "company_workspace_id",
      "companyWorkspaceId"
    ),
    description: stringField(record, "description"),
    external_jd_url: stringField(record, "external_jd_url", "externalJdUrl"),
    homepage_url: stringField(record, "homepage_url", "homepageUrl"),
    information_text: stringField(
      record,
      "information_text",
      "informationText"
    ),
    location_text: stringField(record, "location_text", "locationText"),
    posted_at: stringField(record, "posted_at", "postedAt"),
    role_id: stringField(record, "role_id", "roleId"),
    role_name: stringField(record, "role_name", "roleName", "name"),
    salary_range: stringField(record, "salary_range", "salaryRange"),
    search_rank: numberField(record, "search_rank", "searchRank"),
    seniority_level: stringField(record, "seniority_level", "seniorityLevel"),
    source_type: stringField(record, "source_type", "sourceType"),
    status: stringField(record, "status"),
    type: stringArrayField(record, "type"),
    updated_at: stringField(record, "updated_at", "updatedAt"),
    work_mode: stringField(record, "work_mode", "workMode"),
  };
}

function rolePreview(row: RawRoleRow) {
  return {
    companyName: row.company_name ?? row.company_db_name ?? null,
    companyTestScore: row.company_test_score ?? null,
    employmentTypes: row.type ?? [],
    location: row.location_text ?? row.company_db_location ?? null,
    roleId: row.role_id ?? null,
    roleName: row.role_name ?? null,
    url: row.external_jd_url ?? row.career_url ?? row.homepage_url ?? null,
    workMode: row.work_mode ?? null,
  };
}

function hasRoleData(row: RawRoleRow) {
  return Boolean(
    cleanText(row.role_id, 120) ||
    cleanText(row.role_name, 120) ||
    cleanText(row.company_name, 120) ||
    cleanText(row.company_db_name, 120) ||
    cleanText(row.description, 120)
  );
}

function isMeaningfulRoleRow(row: RawRoleRow | null): row is RawRoleRow {
  return row !== null && hasRoleData(row);
}

function normalizeCondition(value: unknown): SearchCondition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const column = cleanText(record.column, 120);
  const sqlColumn = COLUMN_SQL[column];
  if (!sqlColumn) return null;

  const values = asStringArray(record.values, MAX_CONDITION_VALUES);
  if (values.length === 0) return null;

  const mode = record.mode === "all" ? "all" : "any";
  const polarity = record.polarity === "exclude" ? "exclude" : "include";

  return { column, mode, polarity, values };
}

function normalizeConditions(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  const conditions: SearchCondition[] = [];
  for (const item of value) {
    const condition = normalizeCondition(item);
    if (condition) conditions.push(condition);
    if (conditions.length >= maxItems) break;
  }
  return conditions;
}

function normalizeFtsKeyword(value: unknown): FtsKeyword | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const terms = asStringArray(
    Array.isArray(record.terms)
      ? record.terms
      : [record.term, record.query, record.keyword],
    MAX_FTS_TERMS_PER_KEYWORD,
    80
  );
  if (terms.length === 0) return null;

  return {
    terms,
    weight: clampNumber(record.weight, 0.5, 5, 1),
  };
}

function normalizeFtsKeywords(value: unknown) {
  if (!Array.isArray(value)) return [];
  const keywords: FtsKeyword[] = [];
  for (const item of value) {
    const keyword = normalizeFtsKeyword(item);
    if (keyword) keywords.push(keyword);
    if (keywords.length >= MAX_FTS_KEYWORDS) break;
  }
  return keywords;
}

function isPositiveFtsCondition(condition: SearchCondition) {
  return (
    condition.polarity === "include" &&
    FTS_TEXT_CONDITION_COLUMNS.has(condition.column)
  );
}

function deriveFtsKeywordsFromConditions(conditions: SearchCondition[]) {
  const keywords: FtsKeyword[] = [];
  for (const condition of conditions) {
    if (!isPositiveFtsCondition(condition)) continue;
    keywords.push({
      terms: condition.values,
      weight: condition.column === "company_roles.description" ? 1.4 : 1,
    });
  }
  return keywords;
}

function mergeFtsKeywords(
  plannedKeywords: FtsKeyword[],
  derivedKeywords: FtsKeyword[]
) {
  const merged: FtsKeyword[] = [];
  const seenTerms = new Set<string>();

  const pushKeyword = (keyword: FtsKeyword) => {
    const terms = keyword.terms.filter((term) => {
      const key = term.toLocaleLowerCase("ko-KR");
      if (seenTerms.has(key)) return false;
      seenTerms.add(key);
      return true;
    });
    if (terms.length === 0) return;
    merged.push({ terms, weight: keyword.weight });
  };

  plannedKeywords.forEach(pushKeyword);
  derivedKeywords.forEach(pushKeyword);
  return merged.slice(0, MAX_FTS_KEYWORDS);
}

function normalizePlan(raw: Record<string, unknown> | null): SearchPlan {
  const must = normalizeConditions(raw?.must, 4);
  const should = normalizeConditions(raw?.should, 6);
  const ftsKeywords = mergeFtsKeywords(
    normalizeFtsKeywords(raw?.ftsKeywords),
    deriveFtsKeywordsFromConditions(must.concat(should))
  );
  const rerankCriteria = asStringArray(raw?.rerankCriteria, 4, 280);
  const searchIntentSummary =
    cleanText(raw?.searchIntentSummary, 220) ||
    "사용자의 프로필과 선호를 바탕으로 맞는 채용공고를 찾는다.";

  return {
    ftsKeywords,
    must,
    should,
    searchIntentSummary,
    rerankCriteria:
      rerankCriteria.length > 0
        ? rerankCriteria
        : [
            "유저의 최근 경력과 핵심 역량이 role의 실제 업무와 직접 연결되는지 우선 평가한다.",
            "선호 지역, 근무 형태, 커리어 전환 의도와 맞는 공고를 더 높게 본다.",
            "회사/직무 설명이 부족하거나 기대 역량이 불명확하면 우려점으로 반영한다.",
          ],
  };
}

function isCompanyCondition(condition: SearchCondition) {
  return COMPANY_CONDITION_COLUMNS.has(condition.column);
}

function normalizedConditionKey(condition: SearchCondition) {
  const values = condition.values
    .map((value) => value.toLocaleLowerCase("ko-KR"))
    .sort()
    .join("\u0001");
  return [condition.column, condition.mode, condition.polarity, values].join(
    "\u0002"
  );
}

function uniqueConditions(conditions: SearchCondition[]) {
  const unique: SearchCondition[] = [];
  const seen = new Set<string>();
  for (const condition of conditions) {
    const key = normalizedConditionKey(condition);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(condition);
  }
  return unique;
}

function preferredCompanyMustCondition(plan: SearchPlan) {
  const companyMust = plan.must.filter(
    (condition) =>
      condition.polarity === "include" && isCompanyCondition(condition)
  );
  return (
    companyMust.find(
      (condition) => condition.column === "company_workspace.company_name"
    ) ??
    companyMust[0] ??
    null
  );
}

function preserveBroadenedHardConstraints(
  originalPlan: SearchPlan,
  broadenedPlan: SearchPlan
) {
  const must = [...broadenedPlan.must];
  const hasBroadenedCompanyMust = must.some(
    (condition) =>
      condition.polarity === "include" && isCompanyCondition(condition)
  );
  const originalCompanyMust = preferredCompanyMustCondition(originalPlan);
  if (originalCompanyMust && !hasBroadenedCompanyMust) {
    must.unshift(originalCompanyMust);
  }

  must.push(
    ...originalPlan.must.filter(
      (condition) =>
        !isCompanyCondition(condition) && !isPositiveFtsCondition(condition)
    ),
    ...originalPlan.should.filter(
      (condition) => condition.polarity === "exclude"
    )
  );

  return {
    ...broadenedPlan,
    must: uniqueConditions(must),
    should: uniqueConditions(broadenedPlan.should),
  };
}

function hasStrongRetrievalConstraints(plan: SearchPlan) {
  return plan.ftsKeywords.length > 0 || plan.must.length > 0;
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "1";
}

function ftsVectorSql() {
  return "COALESCE(cr.opportunity_search_tsv, ''::tsvector)";
}

function ftsTermQuerySql(term: string) {
  return `websearch_to_tsquery('simple', ${sqlLiteral(term)})`;
}

function ftsKeywordQuerySql(keyword: FtsKeyword) {
  const terms = keyword.terms.map(ftsTermQuerySql);
  if (terms.length === 0) return null;
  return terms.length === 1 ? terms[0] : `(${terms.join(" || ")})`;
}

function ftsAnyQuerySql(keywords: FtsKeyword[]) {
  const groups = keywords
    .map(ftsKeywordQuerySql)
    .filter((sql): sql is string => Boolean(sql));
  if (groups.length === 0) return null;
  return groups.length === 1 ? groups[0] : `(${groups.join(" || ")})`;
}

function ftsWhereSql(keywords: FtsKeyword[]) {
  const query = ftsAnyQuerySql(keywords);
  return query ? `${ftsVectorSql()} @@ ${query}` : null;
}

function ftsRankSql(keywords: FtsKeyword[]) {
  const vector = ftsVectorSql();
  const parts = keywords
    .map((keyword) => {
      const query = ftsKeywordQuerySql(keyword);
      if (!query) return null;
      return `${sqlNumber(keyword.weight)} * ts_rank_cd(${FTS_RANK_WEIGHTS}, ${vector}, ${query})`;
    })
    .filter((sql): sql is string => Boolean(sql));

  return parts.length > 0 ? `(${parts.join(" + ")})` : "0";
}

function ilikeExpression(sqlColumn: string, value: string) {
  const pattern = `%${value}%`;
  if (ARRAY_COLUMNS.has(sqlColumn)) {
    return `EXISTS (SELECT 1 FROM unnest(COALESCE(${sqlColumn}, ARRAY[]::text[])) AS array_item WHERE array_item ILIKE ${sqlLiteral(pattern)})`;
  }
  return `COALESCE(${sqlColumn}, '') ILIKE ${sqlLiteral(pattern)}`;
}

function conditionSql(condition: SearchCondition) {
  const sqlColumn = COLUMN_SQL[condition.column];
  if (!sqlColumn) return null;

  const parts = condition.values.map((value) =>
    ilikeExpression(sqlColumn, value)
  );
  if (parts.length === 0) return null;

  const joined =
    condition.mode === "all" ? parts.join(" AND ") : parts.join(" OR ");
  const wrapped = `(${joined})`;
  return condition.polarity === "exclude" ? `(NOT ${wrapped})` : wrapped;
}

function positiveConditionSql(condition: SearchCondition) {
  if (condition.polarity === "exclude") return null;
  return conditionSql(condition);
}

function softConditionScoreSql(condition: SearchCondition) {
  const sql = positiveConditionSql(condition);
  if (!sql) return null;
  return `(CASE WHEN ${sql} THEN 0.2 ELSE 0 END)`;
}

function softConditionRankSql(conditions: SearchCondition[]) {
  const parts = conditions
    .filter((condition) => !isPositiveFtsCondition(condition))
    .map(softConditionScoreSql)
    .filter((sql): sql is string => Boolean(sql));
  return parts.length > 0 ? `(${parts.join(" + ")})` : "0";
}

function buildBlockedCompanySql(blockedCompanies: string[]) {
  const filters = blockedCompanies
    .map((company) => cleanText(company, 100))
    .filter(Boolean)
    .slice(0, 20)
    .map(
      (company) =>
        `(COALESCE(cw.company_name, '') NOT ILIKE ${sqlLiteral(
          `%${company}%`
        )} AND COALESCE(cd.name, '') NOT ILIKE ${sqlLiteral(`%${company}%`)})`
    );

  return filters;
}

function previouslyRecommendedRoleExclusionSql(userId: string) {
  const normalizedUserId = cleanText(userId, 120);
  if (!normalizedUserId) return null;

  return `NOT EXISTS (
    SELECT 1
    FROM public.talent_opportunity_recommendation tor
    WHERE tor.talent_id::text = ${sqlLiteral(normalizedUserId)}
      AND tor.role_id = cr.role_id
  )`;
}

function buildRoleSearchSql(args: {
  blockedCompanies: string[];
  plan: SearchPlan;
  userId: string;
}) {
  const useFts = args.plan.ftsKeywords.length > 0;
  const ftsWhere = useFts ? ftsWhereSql(args.plan.ftsKeywords) : null;
  const companyTestScoreRankSql = `COALESCE(cw.test_score, 0) / ${COMPANY_TEST_SCORE_SEARCH_RANK_DIVISOR}.0`;
  const effectiveCompanyQualityLabelSql = `COALESCE(cwql.human_quality_label, cwql.llm_quality_label)`;
  const companyQualityLabelRankSql = `(CASE WHEN ${effectiveCompanyQualityLabelSql} = 2 THEN 0.25 ELSE 0 END)`;
  const searchRankSql = `(${ftsRankSql(args.plan.ftsKeywords)} + ${softConditionRankSql(args.plan.must.concat(args.plan.should))} + ${companyTestScoreRankSql} + ${companyQualityLabelRankSql})`;
  const baseWhere = [
    "COALESCE(cr.is_expired, false) = false",
    "LOWER(COALESCE(cr.status, '')) NOT IN ('expired', 'closed', 'inactive', 'archived')",
    `(${effectiveCompanyQualityLabelSql} IS NULL OR ${effectiveCompanyQualityLabelSql} <> 0)`,
    previouslyRecommendedRoleExclusionSql(args.userId),
    ...buildBlockedCompanySql(args.blockedCompanies),
  ].filter((sql): sql is string => Boolean(sql));
  const excludeWhere = args.plan.must
    .concat(args.plan.should)
    .filter((condition) => condition.polarity === "exclude")
    .map(conditionSql)
    .filter((sql): sql is string => Boolean(sql));

  if (useFts && ftsWhere) {
    const mustWhere = args.plan.must
      .filter((condition) => !isPositiveFtsCondition(condition))
      .map(conditionSql)
      .filter((sql): sql is string => Boolean(sql));

    baseWhere.push(...mustWhere, ftsWhere, ...excludeWhere);
  } else {
    const mustWhere = args.plan.must
      .map(conditionSql)
      .filter((sql): sql is string => Boolean(sql));
    const shouldWhere = args.plan.should
      .map(positiveConditionSql)
      .filter((sql): sql is string => Boolean(sql));

    baseWhere.push(...mustWhere);
    if (shouldWhere.length > 0) {
      baseWhere.push(`(${shouldWhere.join(" OR ")})`);
    }
  }

  return `
SELECT
  cr.role_id::text AS role_id,
  cr.company_workspace_id::text AS company_workspace_id,
  cr.name AS role_name,
  cr.description,
  cr.information::text AS information_text,
  cr.external_jd_url,
  cr.location_text,
  cr.work_mode,
  cr.type,
  cr.status,
  cr.source_type,
  cr.posted_at,
  cr.updated_at,
  cr.salary_range,
  cr.seniority_level,
  cw.company_name,
  cw.company_description,
  cw.test_score AS company_test_score,
  cw.homepage_url,
  cw.career_url,
  cw.linkedin_url,
  cd.id AS company_db_id,
  cd.name AS company_db_name,
  cd.description AS company_db_description,
  cd.short_description AS company_db_short_description,
  cd.specialities AS company_db_specialities,
  cd.location AS company_db_location,
  ${searchRankSql} AS search_rank
FROM public.company_roles cr
JOIN public.company_workspace cw
  ON cw.company_workspace_id = cr.company_workspace_id
LEFT JOIN public.company_db cd
  ON cd.id = cw.company_db_id
LEFT JOIN public.company_workspace_quality_label cwql
  ON cwql.company_workspace_id = cw.company_workspace_id
WHERE ${baseWhere.join("\n  AND ")}
ORDER BY
  search_rank DESC,
  COALESCE(cw.test_score, 0) DESC,
  COALESCE(cr.priority, 0) DESC,
  cr.posted_at DESC NULLS LAST,
  cr.updated_at DESC NULLS LAST
`.trim();
}

async function executeRoleSql(args: {
  admin: AdminClient;
  blockedCompanies: string[];
  plan: SearchPlan;
  userId: string;
}) {
  const sql = buildRoleSearchSql(args);
  const { data, error } = await (args.admin.rpc(
    "set_timeout_and_execute_raw_sql" as never,
    {
      limit_num: MAX_SEARCH_RESULTS,
      offset_num: 0,
      page_idx: 0,
      sql_query: sql,
    } as never
  ) as unknown as Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>);

  if (error) {
    throw new Error(error.message ?? "Failed to search company roles");
  }

  const rawRows = flattenRpcRows(data);
  const rows = rawRows
    .map((row) => normalizeRoleRow(row))
    .filter(isMeaningfulRoleRow);
  return {
    rawRows,
    rows,
    rpcContainerCount: Array.isArray(data) ? data.length : null,
    sql,
  };
}

async function fetchPreviouslyRecommendedRoleIds(args: {
  admin: AdminClient;
  userId: string;
}) {
  const roleIds = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await ((
      args.admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select("role_id")
      .eq("talent_id", args.userId)
      .range(
        offset,
        offset + PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE - 1
      ) as any);

    if (error) {
      throw new Error(
        error.message ?? "Failed to load previous job posting recommendations"
      );
    }

    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      const roleId = cleanText(row?.role_id, 120);
      if (roleId) roleIds.add(roleId);
    }

    if (rows.length < PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE) break;
    offset += PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE;
  }

  return roleIds;
}

function blockedCompanyKey(value: unknown) {
  return cleanText(value, 160).toLocaleLowerCase("ko-KR");
}

function isRoleFromBlockedCompany(
  role: RawRoleRow,
  blockedCompanies: string[]
) {
  if (blockedCompanies.length === 0) return false;

  const companyNames = [
    blockedCompanyKey(role.company_name),
    blockedCompanyKey(role.company_db_name),
  ].filter(Boolean);
  if (companyNames.length === 0) return false;

  return blockedCompanies.some((company) => {
    const blockedCompany = blockedCompanyKey(company);
    if (!blockedCompany) return false;
    return companyNames.some((companyName) =>
      companyName.includes(blockedCompany)
    );
  });
}

function filterSearchRowsForUserConstraints(args: {
  blockedCompanies: string[];
  previouslyRecommendedRoleIds: Set<string>;
  rows: RawRoleRow[];
}) {
  let blockedCompanyCount = 0;
  let previouslyRecommendedRoleCount = 0;
  const rows: RawRoleRow[] = [];

  for (const row of args.rows) {
    const roleId = cleanText(row.role_id, 120);
    if (roleId && args.previouslyRecommendedRoleIds.has(roleId)) {
      previouslyRecommendedRoleCount += 1;
      continue;
    }

    if (isRoleFromBlockedCompany(row, args.blockedCompanies)) {
      blockedCompanyCount += 1;
      continue;
    }

    rows.push(row);
  }

  return {
    blockedCompanyCount,
    filteredCount: blockedCompanyCount + previouslyRecommendedRoleCount,
    previouslyRecommendedRoleCount,
    rows,
  };
}

function applySearchRowUserFilters(args: {
  blockedCompanies: string[];
  label: string;
  previouslyRecommendedRoleIds: Set<string>;
  search: Awaited<ReturnType<typeof executeRoleSql>>;
}) {
  const filterResult = filterSearchRowsForUserConstraints({
    blockedCompanies: args.blockedCompanies,
    previouslyRecommendedRoleIds: args.previouslyRecommendedRoleIds,
    rows: args.search.rows,
  });

  if (
    filterResult.filteredCount > 0 ||
    args.blockedCompanies.length > 0 ||
    args.previouslyRecommendedRoleIds.size > 0
  ) {
    infoJson("candidate filters", {
      afterCandidateCount: filterResult.rows.length,
      beforeCandidateCount: args.search.rows.length,
      blockedCompanies: args.blockedCompanies,
      filteredBlockedCompanyCount: filterResult.blockedCompanyCount,
      filteredPreviouslyRecommendedRoleCount:
        filterResult.previouslyRecommendedRoleCount,
      knownPreviouslyRecommendedRoleCount:
        args.previouslyRecommendedRoleIds.size,
      label: args.label,
    });
  }

  return {
    ...args.search,
    rows: filterResult.rows,
  };
}

function formatInsightContent(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return "(none)";
  }
  const lines = Object.entries(content as Record<string, unknown>)
    .map(([key, value]) => {
      const text = clampBlock(value, 900);
      return text ? `- ${key}: ${text}` : "";
    })
    .filter(Boolean)
    .slice(0, 20);
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

function formatRecentConversation(
  messages: Awaited<ReturnType<typeof fetchRecentMessagesWithSummary>>
) {
  const lines = messages
    .slice(-16)
    .map((message) => {
      const role = message.role === "user" ? "User" : "Harper";
      return `${role}: ${clampBlock(
        formatTalentMessageContentForLlmPrompt(message),
        700
      )}`;
    })
    .filter((line) => line.length > 8);
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

function formatRecentTalentActivitySummaries(
  events: Awaited<ReturnType<typeof fetchRecentTalentActivitySummaries>>
) {
  const lines = events
    .map((event) => cleanText(event.summary, 700))
    .filter(Boolean)
    .slice(0, RECENT_TALENT_ACTIVITY_SUMMARY_LIMIT)
    .map((summary, index) => `${index + 1}. ${summary}`);

  return lines.length > 0 ? lines.join("\n") : "(none)";
}

function buildUserBrief(args: {
  activitySummaries: Awaited<
    ReturnType<typeof fetchRecentTalentActivitySummaries>
  >;
  currentRequest: string;
  insights: unknown;
  profileText: string;
  recentMessages: Awaited<ReturnType<typeof fetchRecentMessagesWithSummary>>;
}) {
  return [
    "[Current Request]",
    clampBlock(args.currentRequest, 1200) || "(none)",
    "",
    "[Structured Profile and Preferences]",
    clampBlock(args.profileText, 8000) || "(none)",
    "",
    "[Insights]",
    formatInsightContent(args.insights),
    "",
    "[Recent Talent Activity Summaries]",
    formatRecentTalentActivitySummaries(args.activitySummaries),
    "",
    "[Recent Conversation]",
    formatRecentConversation(args.recentMessages),
  ].join("\n");
}

async function buildSearchPlan(args: { request: string; userBrief: string }) {
  const raw = await runTalentAssistantCompletion({
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Supabase schema:",
          "- company_roles(role_id, company_workspace_id, name, description, information, opportunity_search_tsv, type, status, is_expired, location_text, work_mode, salary_range, source_type, posted_at, expires_at, external_jd_url, priority, updated_at)",
          "- company_workspace(company_workspace_id, company_name, company_description, homepage_url, career_url, linkedin_url, company_db_id)",
          "- company_db(id, name, description, short_description, specialities, location, website_url, linkedin_url, founded_year, investors, funding, employee_count_range)",
          "",
          args.userBrief,
        ].join("\n"),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL,
    temperature: 0.2,
  });

  return normalizePlan(parseJsonObject(raw));
}

async function buildBroadenedSearchPlan(args: {
  originalPlan: SearchPlan;
  request: string;
  strictCandidateCount: number;
  strictCandidates: RawRoleRow[];
  userBrief: string;
}) {
  const raw = await runTalentAssistantCompletion({
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: BROADENED_PLAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Supabase schema:",
          "- company_roles(role_id, company_workspace_id, name, description, information, opportunity_search_tsv, type, status, is_expired, location_text, work_mode, salary_range, source_type, posted_at, expires_at, external_jd_url, priority, updated_at)",
          "- company_workspace(company_workspace_id, company_name, company_description, homepage_url, career_url, linkedin_url, company_db_id)",
          "- company_db(id, name, description, short_description, specialities, location, website_url, linkedin_url, founded_year, investors, funding, employee_count_range)",
          "",
          args.userBrief,
          "",
          "[Original request]",
          clampBlock(args.request, 1200),
          "",
          "[Original strict SearchPlan]",
          JSON.stringify(args.originalPlan, null, 2),
          "",
          "[Strict search result]",
          `candidateCount=${args.strictCandidateCount}`,
          JSON.stringify(
            args.strictCandidates.slice(0, 5).map(rolePreview),
            null,
            2
          ),
          "",
          "Return a broader second-pass SearchPlan that can find additional plausible roles without dropping explicit hard constraints.",
        ].join("\n"),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL,
    temperature: 0.2,
  });

  const normalized = normalizePlan(parseJsonObject(raw));
  const broadened = preserveBroadenedHardConstraints(
    args.originalPlan,
    normalized
  );
  debugLog("broadened search plan raw", {
    normalized,
    originalPlan: args.originalPlan,
    raw: raw.slice(0, 4000),
    strictCandidateCount: args.strictCandidateCount,
  });

  return hasStrongRetrievalConstraints(broadened)
    ? broadened
    : args.originalPlan;
}

function formatRoleForPrompt(role: RawRoleRow, index: number) {
  return [
    `#${index + 1} roleId=${getRoleKey(role, index)}`,
    `Role: ${cleanText(role.role_name, 160) || "(unknown)"}`,
    `Company: ${cleanText(role.company_name, 160) || cleanText(role.company_db_name, 160) || "(unknown)"}`,
    `Company test score: ${formatCompanyTestScore(role.company_test_score)}`,
    `Location: ${cleanText(role.location_text, 160) || cleanText(role.company_db_location, 160) || "(unknown)"}`,
    `Work mode: ${cleanText(role.work_mode, 80) || "(unknown)"}`,
    `Employment type: ${Array.isArray(role.type) ? role.type.join(", ") : "(unknown)"}`,
    `Seniority: ${cleanText(role.seniority_level, 120) || "(unknown)"}`,
    `Salary: ${cleanText(role.salary_range, 160) || "(unknown)"}`,
    `Source type: ${cleanText(role.source_type, 120) || "(unknown)"}`,
    `Posted: ${cleanText(role.posted_at, 60) || "(unknown)"}`,
    `Company description: ${cleanText(role.company_description, 420) || cleanText(role.company_db_description, 420) || cleanText(role.company_db_short_description, 420) || "(none)"}`,
    `Company specialities: ${cleanText(role.company_db_specialities, 320) || "(none)"}`,
    `Role information: ${cleanText(role.information_text, 500) || "(none)"}`,
    `Role description: ${cleanText(role.description, ROLE_DESCRIPTION_PROMPT_LIMIT) || "(none)"}`,
  ].join("\n");
}

function compactRoleForShortlist(role: RawRoleRow, index: number) {
  return {
    company_description:
      cleanText(
        role.company_description,
        SHORTLIST_COMPANY_DESCRIPTION_LIMIT
      ) ||
      cleanText(
        role.company_db_description,
        SHORTLIST_COMPANY_DESCRIPTION_LIMIT
      ) ||
      cleanText(
        role.company_db_short_description,
        SHORTLIST_COMPANY_DESCRIPTION_LIMIT
      ) ||
      null,
    company_name:
      cleanText(role.company_name, 160) ||
      cleanText(role.company_db_name, 160) ||
      null,
    role_id: getRoleKey(role, index),
    role_location_text: cleanText(role.location_text, 160) || null,
    role_name: cleanText(role.role_name, 180) || null,
    role_type: Array.isArray(role.type) ? role.type : [],
  };
}

function roleUrl(role: RawRoleRow) {
  return (
    cleanText(role.external_jd_url, 500) ||
    cleanText(role.career_url, 500) ||
    cleanText(role.homepage_url, 500) ||
    null
  );
}

function normalizeScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(10, number));
}

function normalizeCompanyTestScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(COMPANY_TEST_SCORE_MAX, number));
}

function companyTestScoreBoost(value: unknown) {
  const score = normalizeCompanyTestScore(value);
  return score === null ? 0 : score / COMPANY_TEST_SCORE_RERANK_DIVISOR;
}

function applyCompanyTestScoreBoost(score: unknown, role: RawRoleRow) {
  return normalizeScore(
    normalizeScore(score) + companyTestScoreBoost(role.company_test_score)
  );
}

function formatCompanyTestScore(value: unknown) {
  const score = normalizeCompanyTestScore(value);
  return score === null ? "(unknown)" : `${score.toFixed(1)}/20`;
}

function roleById(rows: RawRoleRow[]) {
  return new Map(
    rows.map((row, index) => [getRoleKey(row, index), row] as const)
  );
}

function getRoleKey(role: RawRoleRow, index: number) {
  return cleanText(role.role_id, 120) || `candidate_${index}`;
}

function mergeRoleRows(primary: RawRoleRow[], secondary: RawRoleRow[]) {
  const rowsById = new Map<
    string,
    { firstSeen: number; row: RawRoleRow; score: number }
  >();
  let firstSeen = 0;

  const addRows = (rows: RawRoleRow[]) => {
    rows.forEach((row, index) => {
      const key = getRoleKey(row, index);
      const score =
        typeof row.search_rank === "number" && Number.isFinite(row.search_rank)
          ? row.search_rank
          : 0;
      const existing = rowsById.get(key);
      if (!existing) {
        rowsById.set(key, { firstSeen, row, score });
        firstSeen += 1;
        return;
      }
      if (score > existing.score) {
        existing.row = row;
        existing.score = score;
      }
    });
  };

  addRows(primary);
  addRows(secondary);

  return Array.from(rowsById.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.firstSeen - right.firstSeen;
    })
    .map((item) => item.row);
}

function sameRoleRowOrder(left: RawRoleRow[], right: RawRoleRow[]) {
  if (left.length !== right.length) return false;
  return left.every(
    (row, index) => getRoleKey(row, index) === getRoleKey(right[index], index)
  );
}

function roleLookupByKey(rows: RawRoleRow[]) {
  const lookup = new Map<string, RawRoleRow>();
  rows.forEach((row, index) => {
    const fallbackKey = getRoleKey(row, index);
    lookup.set(fallbackKey, row);
    const roleId = cleanText(row.role_id, 120);
    if (roleId) lookup.set(roleId, row);
  });
  return lookup;
}

function roleSelectionKey(role: RawRoleRow, fallbackIndex: number) {
  return cleanText(role.role_id, 120) || roleDedupeKey(role, fallbackIndex);
}

function selectedRowsFromRoleIds(args: {
  candidates: RawRoleRow[];
  selectedRoleIds: string[];
}) {
  const lookup = roleLookupByKey(args.candidates);
  const selected: RawRoleRow[] = [];
  const seen = new Set<string>();

  for (const roleId of args.selectedRoleIds) {
    const role = lookup.get(cleanText(roleId, 120));
    if (!role) continue;
    const key = roleSelectionKey(role, selected.length);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(role);
    if (selected.length >= SHORTLIST_CANDIDATE_TARGET_COUNT) break;
  }

  const minCount = Math.min(
    SHORTLIST_CANDIDATE_MIN_COUNT,
    args.candidates.length
  );
  for (let index = 0; selected.length < minCount; index += 1) {
    const role = args.candidates[index];
    if (!role) break;
    const key = roleSelectionKey(role, index);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(role);
  }

  return selected.slice(0, SHORTLIST_CANDIDATE_TARGET_COUNT);
}

async function shortlistRoles(args: {
  candidates: RawRoleRow[];
  plan: SearchPlan;
  userBrief: string;
}) {
  if (args.candidates.length <= SHORTLIST_CANDIDATE_TARGET_COUNT) {
    infoJson("shortlist skipped", {
      candidateCount: args.candidates.length,
      reason: "candidate_count_within_target",
    });
    return args.candidates;
  }

  const compactRoles = args.candidates.map(compactRoleForShortlist);
  const raw = await runTalentAssistantCompletion({
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: SHORTLIST_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          args.userBrief,
          "",
          "[Search intent]",
          args.plan.searchIntentSummary,
          "",
          "[Reranking criteria]",
          args.plan.rerankCriteria
            .map((item, index) => `${index + 1}. ${item}`)
            .join("\n"),
          "",
          "[Compact candidate roles]",
          JSON.stringify(compactRoles),
        ].join("\n"),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL,
    temperature: 0.1,
  });

  const parsed = parseJsonObject(raw);
  const selectedRoleIds = asStringArray(
    parsed?.selectedRoleIds,
    SHORTLIST_CANDIDATE_TARGET_COUNT,
    120
  );
  const selected = selectedRowsFromRoleIds({
    candidates: args.candidates,
    selectedRoleIds,
  });

  infoJson("shortlist completed", {
    candidateCount: args.candidates.length,
    compactRoleCount: compactRoles.length,
    llmSelectedRoleIdCount: selectedRoleIds.length,
    selectedCandidateCount: selected.length,
    selectedCandidates: selected.slice(0, 5).map(rolePreview),
  });
  debugLog("shortlist raw", {
    parsed,
    raw: raw.slice(0, 4000),
    selectedRoleIds,
  });

  return selected;
}

async function rerankRoles(args: {
  candidates: RawRoleRow[];
  plan: SearchPlan;
  userBrief: string;
}) {
  if (args.candidates.length <= RERANK_BATCH_SIZE) {
    return rerankRoleBatch({
      ...args,
      returnCount: FINAL_RECOMMENDATION_COUNT,
      stageLabel: "final",
    });
  }

  let round = 1;
  let roundCandidates = args.candidates;

  while (roundCandidates.length > RERANK_BATCH_SIZE) {
    const batches = chunkArray(roundCandidates, RERANK_BATCH_SIZE);
    const returnCount = Math.min(
      RERANK_BATCH_FINALIST_COUNT,
      RERANK_BATCH_SIZE
    );

    infoJson("rerank batch round", {
      batchCount: batches.length,
      batchSize: RERANK_BATCH_SIZE,
      candidateCount: roundCandidates.length,
      finalistTargetPerBatch: returnCount,
      round,
    });

    const batchResults = await Promise.all(
      batches.map((batch, index) =>
        rerankRoleBatch({
          candidates: batch,
          plan: args.plan,
          returnCount: Math.min(returnCount, batch.length),
          stageLabel: `round ${round} batch ${index + 1}/${batches.length}`,
          userBrief: args.userBrief,
        })
      )
    );

    const finalists = uniqueRoleRows(
      batchResults.flat().map((item) => item.role)
    );

    if (finalists.length >= roundCandidates.length) break;
    roundCandidates = finalists;
    round += 1;
  }

  return rerankRoleBatch({
    candidates: roundCandidates,
    plan: args.plan,
    returnCount: FINAL_RECOMMENDATION_COUNT,
    stageLabel: `final from ${roundCandidates.length} finalists`,
    userBrief: args.userBrief,
  });
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function roleDedupeKey(role: RawRoleRow, index: number) {
  const explicitId = cleanText(role.role_id, 120);
  if (explicitId) return explicitId;

  const fallback = [
    cleanText(role.company_workspace_id, 120),
    cleanText(role.company_name, 160) || cleanText(role.company_db_name, 160),
    cleanText(role.role_name, 160),
    cleanText(role.external_jd_url, 500),
  ]
    .filter(Boolean)
    .join("|")
    .toLocaleLowerCase("ko-KR");

  return fallback || `candidate_${index}`;
}

function uniqueRoleRows(rows: RawRoleRow[]) {
  const seen = new Set<string>();
  const unique: RawRoleRow[] = [];

  rows.forEach((row, index) => {
    const key = roleDedupeKey(row, index);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });

  return unique;
}

async function rerankRoleBatch(args: {
  candidates: RawRoleRow[];
  plan: SearchPlan;
  returnCount: number;
  stageLabel: string;
  userBrief: string;
}) {
  const raw = await runTalentAssistantCompletion({
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: RERANK_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          args.userBrief,
          "",
          "[Search intent]",
          args.plan.searchIntentSummary,
          "",
          "[Reranking criteria]",
          args.plan.rerankCriteria
            .map((item, index) => `${index + 1}. ${item}`)
            .join("\n"),
          "",
          "[Rerank stage]",
          `${args.stageLabel}. Return up to ${args.returnCount} roleIds from only the candidate roles shown below.`,
          "",
          "[Candidate roles]",
          args.candidates.map(formatRoleForPrompt).join("\n\n"),
        ].join("\n"),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL,
    temperature: 0.15,
  });

  const parsed = parseJsonObject(raw);
  debugLog("rerank raw", {
    candidateCount: args.candidates.length,
    raw: raw.slice(0, 4000),
    parsedKeys: parsed ? Object.keys(parsed) : [],
    returnCount: args.returnCount,
    stageLabel: args.stageLabel,
  });
  const rankedRows = Array.isArray(parsed?.rankedRoles)
    ? parsed?.rankedRoles
    : [];
  const rowsById = roleById(args.candidates);
  const ranked: RankedRole[] = [];
  const seen = new Set<string>();

  for (const item of rankedRows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const roleId = cleanText(record.roleId, 120);
    let role = rowsById.get(roleId);
    let resolvedRoleId = roleId;
    if (!role && rankedRows.length === 1 && args.candidates.length === 1) {
      resolvedRoleId = getRoleKey(args.candidates[0], 0);
      role = args.candidates[0];
    }
    if (!resolvedRoleId || !role || seen.has(resolvedRoleId)) continue;
    seen.add(resolvedRoleId);
    ranked.push({
      concerns: asStringArray(record.concerns, 4, 180),
      goodPoints: asStringArray(record.goodPoints, 4, 180),
      recommendationText: cleanText(record.recommendationText, 700) || null,
      role,
      roleId: resolvedRoleId,
      score: applyCompanyTestScoreBoost(record.score, role),
    });
  }

  for (let index = 0; index < args.candidates.length; index += 1) {
    const role = args.candidates[index];
    const roleId = getRoleKey(role, index);
    if (seen.has(roleId)) continue;
    ranked.push({
      concerns: [],
      goodPoints: [],
      recommendationText: null,
      role,
      roleId,
      score: applyCompanyTestScoreBoost(0, role),
    });
  }

  return ranked
    .sort((left, right) => right.score - left.score)
    .slice(0, args.returnCount);
}

function fallbackRecommendationText(item: RankedRole) {
  const role = item.role;
  const company = cleanText(role.company_name, 160) || "해당 회사";
  const title = cleanText(role.role_name, 160) || "해당 포지션";
  const good =
    item.goodPoints[0] ||
    cleanText(role.description, 160) ||
    "프로필과 연결될 수 있는 업무 내용이 있습니다";
  const concern =
    item.concerns[0] ||
    "공고 설명만으로는 팀의 실제 범위와 기대 수준을 추가 확인할 필요가 있습니다";
  return `${company}의 ${title}은 ${good}는 점에서 검토할 만합니다. 다만 ${concern}.`;
}

function buildRoleOverviewFallback(role: RawRoleRow) {
  const company =
    cleanText(role.company_name, 160) ||
    cleanText(role.company_db_name, 160) ||
    "해당 회사";
  const title = cleanText(role.role_name, 180) || "해당 포지션";
  const companyDescription =
    cleanPlainText(role.company_description, 260) ||
    cleanPlainText(role.company_db_description, 260) ||
    cleanPlainText(role.company_db_short_description, 260);
  const roleDescription =
    cleanPlainText(role.information_text, 220) ||
    cleanPlainText(role.description, 220);
  const sentences: string[] = [];

  if (companyDescription) {
    sentences.push(`${company}는 ${companyDescription.replace(/[.。]$/, "")}.`);
  } else {
    sentences.push(`${company}의 ${title} 포지션입니다.`);
  }
  if (roleDescription) {
    sentences.push(`이 역할은 ${roleDescription.replace(/[.。]$/, "")}.`);
  } else if (companyDescription) {
    sentences.push(`역할명은 ${title}입니다.`);
  }

  return cleanText(sentences.join(" "), 700) || null;
}

function normalizePreferenceFitStatus(
  value: unknown
): PreferenceFitStatus | null {
  const text = cleanText(value, 40).toLocaleLowerCase("ko-KR");
  if (text === "satisfied") return "Satisfied";
  if (text === "neutral") return "Neutral";
  if (text === "dissatisfied") return "Dissatisfied";
  return null;
}

function normalizeRecommendationPreferenceFit(
  value: unknown
): RecommendationPreferenceFit {
  const record = asRecord(value);
  if (!record) return {};

  const result: RecommendationPreferenceFit = {};
  for (const key of PREFERENCE_FIT_KEYS) {
    const item = asRecord(record[key]);
    if (!item) continue;
    const status = normalizePreferenceFitStatus(item.status);
    const note =
      cleanText(item.note, 180) ||
      cleanText(item.reason, 180) ||
      cleanText(item.sentence, 180);
    if (!status || !note) continue;
    result[key] = { note, status };
  }

  return result;
}

function normalizeRecommendationDetail(
  raw: Record<string, unknown> | null,
  item: RankedRole
): RecommendationDetail {
  const fitReasons = asStringArray(raw?.fitReasons, 2, 180);
  const tradeoffs = asStringArray(raw?.tradeoffs, 1, 220);
  const roleOverviewText =
    cleanText(raw?.roleOverviewText, 700) ||
    buildRoleOverviewFallback(item.role);

  return {
    fitReasons:
      fitReasons.length > 0
        ? fitReasons
        : [
            item.recommendationText ||
              item.goodPoints[0] ||
              fallbackRecommendationText(item),
          ]
            .filter(Boolean)
            .map((value) => cleanText(value, 180)),
    preferenceFit: normalizeRecommendationPreferenceFit(raw?.preferenceFit),
    roleOverviewText,
    tradeoffs:
      tradeoffs.length > 0
        ? tradeoffs
        : item.concerns.slice(0, 1).map((value) => cleanText(value, 220)),
  };
}

async function generateRecommendationDetails(args: {
  plan: SearchPlan;
  recommendations: RankedRole[];
  userBrief: string;
}) {
  if (args.recommendations.length === 0) return [];

  try {
    const raw = await runTalentAssistantCompletion({
      fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
      jsonMode: true,
      messages: [
        { role: "system", content: RECOMMENDATION_DETAIL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            args.userBrief,
            "",
            "[Search intent]",
            args.plan.searchIntentSummary,
            "",
            "[Reranking criteria]",
            args.plan.rerankCriteria
              .map((item, index) => `${index + 1}. ${item}`)
              .join("\n"),
            "",
            "[Selected roles]",
            args.recommendations
              .map((item, index) => formatRoleForPrompt(item.role, index))
              .join("\n\n"),
            "",
            "[Rerank results]",
            JSON.stringify(
              args.recommendations.map((item) => ({
                concerns: item.concerns,
                goodPoints: item.goodPoints,
                recommendationText: item.recommendationText,
                roleId: item.roleId,
                score: item.score,
              }))
            ),
          ].join("\n"),
        },
      ],
      primaryModel: RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL,
      temperature: 0.2,
    });

    const parsed = parseJsonObject(raw);
    const details = Array.isArray(parsed?.details) ? parsed.details : [];
    const detailsByRoleId = new Map<string, Record<string, unknown>>();

    for (const detail of details) {
      const record = asRecord(detail);
      const roleId = cleanText(record?.roleId, 120);
      if (roleId && record) detailsByRoleId.set(roleId, record);
    }

    debugLog("detail generation raw", {
      detailCount: detailsByRoleId.size,
      raw: raw.slice(0, 4000),
      recommendationCount: args.recommendations.length,
    });

    return args.recommendations.map((item) =>
      normalizeRecommendationDetail(
        detailsByRoleId.get(item.roleId) ?? null,
        item
      )
    );
  } catch (error) {
    console.warn("[recommend_job_postings] detail generation failed", {
      error: error instanceof Error ? error.message : String(error),
      recommendationCount: args.recommendations.length,
    });
    return args.recommendations.map((item) =>
      normalizeRecommendationDetail(null, item)
    );
  }
}

async function enrichRecommendationDetails(args: {
  plan: SearchPlan;
  recommendations: RankedRole[];
  userBrief: string;
}): Promise<EnrichedRankedRole[]> {
  const details = await generateRecommendationDetails({
    plan: args.plan,
    recommendations: args.recommendations,
    userBrief: args.userBrief,
  });

  return args.recommendations.map((item, index) => ({
    ...item,
    detail: details[index] ?? normalizeRecommendationDetail(null, item),
    recommendationId: null,
  }));
}

function opportunityTypeForRole(role: RawRoleRow) {
  const sourceType = cleanText(role.source_type, 80).toLocaleLowerCase("ko-KR");
  return sourceType === "internal"
    ? OpportunityType.InternalRecommendation
    : OpportunityType.ExternalJd;
}

function recommendationScoreForDb(score: unknown) {
  return Math.max(0, Math.min(1, normalizeScore(score) / 10));
}

function buildRecommendationEvidence(item: EnrichedRankedRole) {
  const role = item.role;
  return [
    {
      label: "role",
      text:
        cleanText(role.information_text, 700) ||
        cleanText(role.description, 700),
    },
    {
      label: "company",
      text:
        cleanText(role.company_description, 700) ||
        cleanText(role.company_db_description, 700) ||
        cleanText(role.company_db_short_description, 700),
    },
    {
      label: "search_intent",
      text: cleanText(item.recommendationText, 700),
    },
  ].filter((entry) => entry.text);
}

async function persistRecommendations(args: {
  admin: AdminClient;
  recommendations: EnrichedRankedRole[];
  userId: string;
}) {
  const now = new Date().toISOString();
  const rows = args.recommendations
    .map((item, index) => {
      const roleId = cleanText(item.role.role_id, 120);
      if (!roleId) return null;
      const fitReasons = item.detail.fitReasons.filter(Boolean);

      return {
        confidence: recommendationScoreForDb(item.score),
        evidence: buildRecommendationEvidence(item),
        fit_reasons: fitReasons,
        fit_summary: item.detail.roleOverviewText,
        kind: "recommendation",
        model_version: RECOMMEND_JOB_POSTINGS_MODEL_VERSION,
        opportunity_type: opportunityTypeForRole(item.role),
        preference_fit: item.detail.preferenceFit,
        rank: index + 1,
        recommended_at: now,
        recommendation_status: "ready",
        role_id: roleId,
        score: recommendationScoreForDb(item.score),
        talent_id: args.userId,
        tradeoffs: item.detail.tradeoffs.filter(Boolean),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return args.recommendations;

  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .insert(rows)
    .select("id, role_id") as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to save job posting recommendations"
    );
  }

  const insertedIdsByRoleId = new Map<string, string>();
  if (Array.isArray(data)) {
    for (const row of data) {
      const roleId = cleanText(row?.role_id, 120);
      const id = cleanText(row?.id, 120);
      if (roleId && id) insertedIdsByRoleId.set(roleId, id);
    }
  }

  return args.recommendations.map((item) => ({
    ...item,
    recommendationId:
      insertedIdsByRoleId.get(cleanText(item.role.role_id, 120)) ?? null,
  }));
}

function extractRequestedPostingCount(request: string) {
  const matches = Array.from(
    request.matchAll(/(\d{1,4})\s*(?:개|건|곳|포지션|공고|자리)/g)
  );
  const counts = matches
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return counts.length > 0 ? Math.max(...counts) : null;
}

function formatAnswerDraft(args: {
  candidateCount: number;
  plan: SearchPlan;
  recommendations: EnrichedRankedRole[];
  requestedCount: number | null;
}) {
  if (args.recommendations.length === 0) {
    return [
      "지금 조건으로 바로 추천할 만한 채용공고를 찾지 못했습니다.",
      "조건을 조금 넓혀서 직무명, 지역, 근무 형태 중 하나만 완화하면 다시 찾아볼 수 있습니다.",
    ].join("\n");
  }

  const lines = [
    `요청 조건과 프로필을 같이 보고 현재 채용공고 ${args.candidateCount}개를 검토한 뒤, 우선순위가 높은 ${args.recommendations.length}개를 포지션 탭에 저장했습니다.`,
    `검색 의도: ${args.plan.searchIntentSummary}`,
    "",
  ];

  if (
    typeof args.requestedCount === "number" &&
    args.requestedCount > FINAL_RECOMMENDATION_COUNT
  ) {
    lines.push(
      `요청하신 ${args.requestedCount}개를 한 번에 모두 보여드리기보다는, 지금은 바로 볼 만한 최대 ${FINAL_RECOMMENDATION_COUNT}개만 먼저 골랐습니다. 이후 주기 추천에서는 한 번에 최대 ${CONTINUATION_RECOMMENDATION_BATCH_LIMIT}개씩 더 넓게 찾아보되, 기준에 못 미치는 공고는 넣지 않겠습니다.`,
      ""
    );
  }

  args.recommendations.forEach((item, index) => {
    const role = item.role;
    const company =
      cleanText(role.company_name, 160) ||
      cleanText(role.company_db_name, 160) ||
      "Unknown Company";
    const title = cleanText(role.role_name, 180) || "Untitled Role";
    const location = cleanText(role.location_text, 160);
    const workMode = cleanText(role.work_mode, 100);
    const url = roleUrl(role);
    const meta = [location, workMode].filter(Boolean).join(" / ");
    const why =
      item.detail.fitReasons.length > 0
        ? item.detail.fitReasons.join(" ")
        : item.recommendationText || fallbackRecommendationText(item);
    const concern = item.detail.tradeoffs[0];
    const roleId = cleanText(item.roleId, 120);

    lines.push(
      `${index + 1}. ${company} - ${title} (${item.score.toFixed(1)}/10)`
    );
    if (meta) lines.push(`   조건: ${meta}`);
    lines.push(`   추천 이유: ${why}`);
    if (concern) lines.push(`   확인할 점: ${concern}`);
    if (index === 0 && roleId) lines.push(`   [posting](${roleId})`);
    if (url) lines.push(`   공고 링크: ${url}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

export async function runCareerJobPostingRecommendations(args: {
  admin: AdminClient;
  conversationId: string;
  request: string;
  userId: string;
}) {
  const request = cleanText(args.request, 1400);
  if (!request) {
    throw new Error("recommend_job_postings requires a request.");
  }
  const requestedCount = extractRequestedPostingCount(request);

  const startedAt = Date.now();
  console.info("[recommend_job_postings] start", {
    conversationId: args.conversationId,
    request,
    requestedCount,
    userId: args.userId,
  });

  const [
    profile,
    insights,
    setting,
    recentMessages,
    previouslyRecommendedRoleIds,
    activitySummaries,
  ] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchRecentMessagesWithSummary({
      admin: args.admin,
      conversationId: args.conversationId,
      fallbackLimit: 4,
      recentLimit: 4,
      userId: args.userId,
    }),
    fetchPreviouslyRecommendedRoleIds({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchRecentTalentActivitySummaries({
      admin: args.admin,
      limit: RECENT_TALENT_ACTIVITY_SUMMARY_LIMIT,
      userId: args.userId,
    }),
  ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    userId: args.userId,
    talentUser: profile,
  });
  const profileText = buildTalentProfileContext({
    includeCareerMoveIntent: false,
    includeResumeFileName: false,
    includeResumeText: false,
    includeRowIds: false,
    profile,
    structuredProfile,
    setting,
  });
  const userBrief = buildUserBrief({
    activitySummaries,
    currentRequest: request,
    insights: insights?.content ?? null,
    profileText,
    recentMessages,
  });
  let plan = await buildSearchPlan({ request, userBrief });
  const blockedCompanies = normalizeTalentBlockedCompanies(
    setting?.blocked_companies ?? []
  );
  infoJson("search plan", {
    ftsKeywords: plan.ftsKeywords,
    must: plan.must,
    rerankCriteria: plan.rerankCriteria,
    searchIntentSummary: plan.searchIntentSummary,
    should: plan.should,
  });
  debugLog("search plan full", {
    blockedCompanies,
    ftsKeywords: plan.ftsKeywords,
    must: plan.must,
    previouslyRecommendedRoleCount: previouslyRecommendedRoleIds.size,
    should: plan.should,
  });

  let search = applySearchRowUserFilters({
    blockedCompanies,
    label: "strict",
    previouslyRecommendedRoleIds,
    search: await executeRoleSql({
      admin: args.admin,
      blockedCompanies,
      plan,
      userId: args.userId,
    }),
  });
  let relaxed = false;
  infoJson("sql search", {
    candidateCount: search.rows.length,
    candidates: search.rows.slice(0, 5).map(rolePreview),
    relaxed,
    rawCount: search.rawRows.length,
    rpcContainerCount: search.rpcContainerCount,
  });
  debugLog("sql search full", {
    candidateCount: search.rows.length,
    rawCount: search.rawRows.length,
    rawRowsSample: search.rawRows.slice(0, 5),
    rowsSample: search.rows.slice(0, 5),
    sql: search.sql,
  });
  const conditions = plan.must.concat(plan.should);
  const shouldRunBroadenedSearch =
    conditions.length > 0 &&
    search.rows.length <= BROADENED_SEARCH_CANDIDATE_THRESHOLD;

  if (shouldRunBroadenedSearch) {
    const broadenedPlan = await buildBroadenedSearchPlan({
      originalPlan: plan,
      request,
      strictCandidateCount: search.rows.length,
      strictCandidates: search.rows,
      userBrief,
    });
    infoJson("broadened search plan", {
      ftsKeywords: broadenedPlan.ftsKeywords,
      must: broadenedPlan.must,
      rerankCriteria: broadenedPlan.rerankCriteria,
      searchIntentSummary: broadenedPlan.searchIntentSummary,
      should: broadenedPlan.should,
      strictCandidateCount: search.rows.length,
    });

    const broadenedSearch = applySearchRowUserFilters({
      blockedCompanies,
      label: "broadened",
      previouslyRecommendedRoleIds,
      search: await executeRoleSql({
        admin: args.admin,
        blockedCompanies,
        plan: broadenedPlan,
        userId: args.userId,
      }),
    });
    const mergedRows = mergeRoleRows(search.rows, broadenedSearch.rows).slice(
      0,
      MAX_SEARCH_RESULTS
    );
    const filteredMergedRows = filterSearchRowsForUserConstraints({
      blockedCompanies,
      previouslyRecommendedRoleIds,
      rows: mergedRows,
    }).rows;
    const strictCandidateCount = search.rows.length;
    if (
      !sameRoleRowOrder(
        search.rows.slice(0, MAX_SEARCH_RESULTS),
        filteredMergedRows
      )
    ) {
      search = {
        ...search,
        rawRows: search.rawRows.concat(broadenedSearch.rawRows),
        rows: filteredMergedRows,
        rpcContainerCount: null,
        sql: `${search.sql}\n\n-- broadened candidate backfill\n${broadenedSearch.sql}`,
      };
      relaxed = true;
      plan = broadenedPlan;
      infoJson("broadened sql search", {
        addedCandidateCount: Math.max(
          0,
          filteredMergedRows.length - strictCandidateCount
        ),
        candidateCount: filteredMergedRows.length,
        candidates: search.rows.slice(0, 5).map(rolePreview),
        relaxed,
        rawCount: search.rawRows.length,
        rpcContainerCount: search.rpcContainerCount,
        strictCandidateCount,
      });
      debugLog("broadened sql search full", {
        candidateCount: search.rows.length,
        rawCount: search.rawRows.length,
        rawRowsSample: search.rawRows.slice(0, 5),
        rowsSample: search.rows.slice(0, 5),
        sql: search.sql,
      });
    }
  }

  const candidates = search.rows.slice(0, MAX_SEARCH_RESULTS);
  const shortlistCandidates =
    candidates.length > 0
      ? await shortlistRoles({ candidates, plan, userBrief })
      : [];
  const ranked =
    shortlistCandidates.length > 0
      ? await rerankRoles({ candidates: shortlistCandidates, plan, userBrief })
      : [];
  const detailedRecommendations = await enrichRecommendationDetails({
    plan,
    recommendations: ranked,
    userBrief,
  });
  const recommendations = await persistRecommendations({
    admin: args.admin,
    recommendations: detailedRecommendations,
    userId: args.userId,
  });
  infoJson("completed", {
    candidateCount: candidates.length,
    durationMs: Date.now() - startedAt,
    recommendationCount: recommendations.length,
    shortlistCandidateCount: shortlistCandidates.length,
    topScores: recommendations.slice(0, 5).map((item) => ({
      ...rolePreview(item.role),
      recommendationId: item.recommendationId,
      score: item.score,
    })),
  });

  return {
    answerDraft: formatAnswerDraft({
      candidateCount: candidates.length,
      plan,
      recommendations,
      requestedCount,
    }),
    candidateCount: candidates.length,
    relaxed,
    recommendations: recommendations.map((item, index) => ({
      id: item.recommendationId,
      rank: index + 1,
      roleId: item.roleId,
      score: item.score,
      companyName:
        cleanText(item.role.company_name, 160) ||
        cleanText(item.role.company_db_name, 160),
      roleName: cleanText(item.role.role_name, 180),
      location: cleanText(item.role.location_text, 160) || null,
      workMode: cleanText(item.role.work_mode, 100) || null,
      employmentTypes: Array.isArray(item.role.type) ? item.role.type : [],
      url: roleUrl(item.role),
      recommendationText:
        item.detail.fitReasons.join(" ") ||
        item.recommendationText ||
        fallbackRecommendationText(item),
      goodPoints: item.detail.fitReasons,
      concerns: item.detail.tradeoffs,
      preferenceFit: item.detail.preferenceFit,
      roleOverviewText: item.detail.roleOverviewText,
    })),
    requestedCount,
    saveCount: recommendations.filter((item) => item.recommendationId).length,
    shortlistCandidateCount: shortlistCandidates.length,
    searchPlan: {
      ftsKeywords: plan.ftsKeywords,
      must: plan.must,
      rerankCriteria: plan.rerankCriteria,
      searchIntentSummary: plan.searchIntentSummary,
      should: plan.should,
    },
  };
}
