import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  buildTalentProfileContext,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
} from "@/lib/talentOnboarding/server";

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

type SearchPlan = {
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
  company_workspace_id?: string | null;
  description?: string | null;
  description_summary?: string | null;
  external_jd_url?: string | null;
  homepage_url?: string | null;
  information_text?: string | null;
  location_text?: string | null;
  posted_at?: string | null;
  role_id?: string | null;
  role_name?: string | null;
  salary_range?: string | null;
  seniority_level?: string | null;
  source_provider?: string | null;
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

const MAX_SEARCH_RESULTS = 100;
const FINAL_RECOMMENDATION_COUNT = 10;

const COLUMN_SQL: Record<string, string> = {
  "company_db.description": "cd.description",
  "company_db.investors": "cd.investors",
  "company_db.location": "cd.location",
  "company_db.name": "cd.name",
  "company_db.short_description": "cd.short_description",
  "company_db.specialities": "cd.specialities",
  "company_roles.description": "cr.description",
  "company_roles.description_summary": "cr.description_summary",
  "company_roles.information": "cr.information::text",
  "company_roles.location_text": "cr.location_text",
  "company_roles.name": "cr.name",
  "company_roles.salary_range": "cr.salary_range",
  "company_roles.seniority_level": "cr.seniority_level",
  "company_roles.source_provider": "cr.source_provider",
  "company_roles.source_type": "cr.source_type",
  "company_roles.type": "cr.type",
  "company_roles.work_mode": "cr.work_mode",
  "company_workspace.company_description": "cw.company_description",
  "company_workspace.company_name": "cw.company_name",
};

const ARRAY_COLUMNS = new Set(["cr.type"]);

const PLAN_SYSTEM_PROMPT = `You are a job-search query planner for Harper.
Return JSON only. Do not write SQL.

You receive a user/candidate brief and a Supabase schema. Decide which columns and values should be used to retrieve up to 100 candidate job postings, then write reranking criteria.

Allowed output shape:
{
  "searchIntentSummary": "one Korean sentence",
  "must": [
    { "column": "company_roles.name", "mode": "any", "values": ["ML Engineer"], "polarity": "include" }
  ],
  "should": [
    { "column": "company_roles.description", "mode": "any", "values": ["LLM", "학습"], "polarity": "include" }
  ],
  "rerankCriteria": ["Korean sentence 1", "Korean sentence 2", "Korean sentence 3"]
}

Rules:
- Use only these columns:
  company_roles.name, company_roles.description, company_roles.information,
  company_roles.location_text, company_roles.work_mode, company_roles.type,
  company_roles.salary_range, company_roles.source_type, company_roles.source_provider,
  company_workspace.company_name, company_workspace.company_description,
  company_db.name, company_db.description, company_db.short_description, company_db.specialities, company_db.location, company_db.investors.
- The SQL builder will convert values into ILIKE patterns. Example: column=company_roles.description, mode=all, values=["LLM","학습"] becomes description ILIKE %LLM% AND description ILIKE %학습%.
- Use "mode":"any" when synonyms or alternatives are acceptable. Use "mode":"all" only for truly required co-occurring concepts.
- Put hard requirements in must. Put useful signals in should. If unsure, prefer should.
- Use polarity=exclude for explicit negative requirements only.
- Keep values short search tokens, not whole sentences. Maximum 8 total conditions and 8 values per condition.
- rerankCriteria must be 3-4 Korean sentences and should explain how to score fit, concerns, and prioritization.`;

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
- Return at least the top 20 roleIds when enough candidates exist.
- Use the user's profile, conversation, insights, preferences, and the reranking criteria.
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

const DEBUG_RECOMMEND_JOB_POSTINGS =
  process.env.DEBUG_RECOMMEND_JOB_POSTINGS === "1";

function cleanText(value: unknown, maxLength = 4000) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, maxLength) : "";
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
    company_workspace_id: stringField(
      record,
      "company_workspace_id",
      "companyWorkspaceId"
    ),
    description: stringField(record, "description"),
    description_summary: stringField(
      record,
      "description_summary",
      "descriptionSummary"
    ),
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
    seniority_level: stringField(record, "seniority_level", "seniorityLevel"),
    source_provider: stringField(record, "source_provider", "sourceProvider"),
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

  const values = asStringArray(record.values);
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

function normalizePlan(raw: Record<string, unknown> | null): SearchPlan {
  const must = normalizeConditions(raw?.must, 4);
  const should = normalizeConditions(raw?.should, 6);
  const rerankCriteria = asStringArray(raw?.rerankCriteria, 4, 280);
  const searchIntentSummary =
    cleanText(raw?.searchIntentSummary, 220) ||
    "사용자의 프로필과 선호를 바탕으로 맞는 채용공고를 찾는다.";

  return {
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

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
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

function buildRoleSearchSql(args: {
  blockedCompanies: string[];
  plan: SearchPlan;
  relaxed?: boolean;
}) {
  const baseWhere = [
    "COALESCE(cr.is_expired, false) = false",
    "LOWER(COALESCE(cr.status, '')) NOT IN ('expired', 'closed', 'inactive', 'archived')",
    ...buildBlockedCompanySql(args.blockedCompanies),
  ];
  const excludeWhere = args.plan.must
    .concat(args.plan.should)
    .filter((condition) => condition.polarity === "exclude")
    .map(conditionSql)
    .filter((sql): sql is string => Boolean(sql));

  if (args.relaxed) {
    const positiveWhere = args.plan.must
      .concat(args.plan.should)
      .map(positiveConditionSql)
      .filter((sql): sql is string => Boolean(sql));
    if (positiveWhere.length > 0) {
      baseWhere.push(`(${positiveWhere.join(" OR ")})`);
    }
    baseWhere.push(...excludeWhere);
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
  cr.description_summary,
  cr.information::text AS information_text,
  cr.external_jd_url,
  cr.location_text,
  cr.work_mode,
  cr.type,
  cr.status,
  cr.source_type,
  cr.source_provider,
  cr.posted_at,
  cr.updated_at,
  cr.salary_range,
  cr.seniority_level,
  cw.company_name,
  cw.company_description,
  cw.homepage_url,
  cw.career_url,
  cw.linkedin_url,
  cd.id AS company_db_id,
  cd.name AS company_db_name,
  cd.description AS company_db_description,
  cd.short_description AS company_db_short_description,
  cd.specialities AS company_db_specialities,
  cd.location AS company_db_location
FROM public.company_roles cr
JOIN public.company_workspace cw
  ON cw.company_workspace_id = cr.company_workspace_id
LEFT JOIN public.company_db cd
  ON cd.id = cw.company_db_id
WHERE ${baseWhere.join("\n  AND ")}
ORDER BY
  COALESCE(cr.priority, 0) DESC,
  cr.posted_at DESC NULLS LAST,
  cr.updated_at DESC NULLS LAST
`.trim();
}

async function executeRoleSql(args: {
  admin: AdminClient;
  blockedCompanies: string[];
  plan: SearchPlan;
  relaxed?: boolean;
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
  messages: Awaited<ReturnType<typeof fetchRecentMessages>>
) {
  const lines = messages
    .slice(-16)
    .map((message) => {
      const role = message.role === "user" ? "User" : "Harper";
      return `${role}: ${clampBlock(message.content, 700)}`;
    })
    .filter((line) => line.length > 8);
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

function buildUserBrief(args: {
  currentRequest: string;
  insights: unknown;
  profileText: string;
  recentMessages: Awaited<ReturnType<typeof fetchRecentMessages>>;
}) {
  return [
    "[Current Request]",
    clampBlock(args.currentRequest, 1200) || "(none)",
    "",
    "[Profile, Resume, Preferences]",
    clampBlock(args.profileText, 8000) || "(none)",
    "",
    "[Insights]",
    formatInsightContent(args.insights),
    "",
    "[Recent Conversation]",
    formatRecentConversation(args.recentMessages),
  ].join("\n");
}

async function buildSearchPlan(args: { request: string; userBrief: string }) {
  const raw = await runTalentAssistantCompletion({
    jsonMode: true,
    messages: [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          "Supabase schema:",
          "- company_roles(role_id, company_workspace_id, name, description, information, type, status, is_expired, location_text, work_mode, salary_range, source_type, source_provider, posted_at, expires_at, external_jd_url, priority, updated_at)",
          "- company_workspace(company_workspace_id, company_name, company_description, homepage_url, career_url, linkedin_url, company_db_id)",
          "- company_db(id, name, description, short_description, specialities, location, website_url, linkedin_url, founded_year, investors, funding, employee_count_range)",
          "",
          args.userBrief,
        ].join("\n"),
      },
    ],
    temperature: 0.2,
  });

  return normalizePlan(parseJsonObject(raw));
}

function formatRoleForPrompt(role: RawRoleRow, index: number) {
  return [
    `#${index + 1} roleId=${getRoleKey(role, index)}`,
    `Role: ${cleanText(role.role_name, 160) || "(unknown)"}`,
    `Company: ${cleanText(role.company_name, 160) || cleanText(role.company_db_name, 160) || "(unknown)"}`,
    `Location: ${cleanText(role.location_text, 160) || cleanText(role.company_db_location, 160) || "(unknown)"}`,
    `Work mode: ${cleanText(role.work_mode, 80) || "(unknown)"}`,
    `Employment type: ${Array.isArray(role.type) ? role.type.join(", ") : "(unknown)"}`,
    `Seniority: ${cleanText(role.seniority_level, 120) || "(unknown)"}`,
    `Salary: ${cleanText(role.salary_range, 160) || "(unknown)"}`,
    `Source: ${cleanText(role.source_provider, 120) || cleanText(role.source_type, 120) || "(unknown)"}`,
    `Posted: ${cleanText(role.posted_at, 60) || "(unknown)"}`,
    `Company description: ${cleanText(role.company_description, 420) || cleanText(role.company_db_description, 420) || cleanText(role.company_db_short_description, 420) || "(none)"}`,
    `Company specialities: ${cleanText(role.company_db_specialities, 320) || "(none)"}`,
    `Role summary: ${cleanText(role.description_summary, 420) || "(none)"}`,
    `Role information: ${cleanText(role.information_text, 700) || "(none)"}`,
    `Role description: ${cleanText(role.description, 900) || "(none)"}`,
  ].join("\n");
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

function roleById(rows: RawRoleRow[]) {
  return new Map(
    rows.map((row, index) => [getRoleKey(row, index), row] as const)
  );
}

function getRoleKey(role: RawRoleRow, index: number) {
  return cleanText(role.role_id, 120) || `candidate_${index}`;
}

async function rerankRoles(args: {
  candidates: RawRoleRow[];
  plan: SearchPlan;
  userBrief: string;
}) {
  const raw = await runTalentAssistantCompletion({
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
          "[Candidate roles]",
          args.candidates.map(formatRoleForPrompt).join("\n\n"),
        ].join("\n"),
      },
    ],
    temperature: 0.15,
  });

  const parsed = parseJsonObject(raw);
  debugLog("rerank raw", {
    raw: raw.slice(0, 4000),
    parsedKeys: parsed ? Object.keys(parsed) : [],
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
      score: normalizeScore(record.score),
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
      score: 0,
    });
  }

  return ranked
    .sort((left, right) => right.score - left.score)
    .slice(0, FINAL_RECOMMENDATION_COUNT);
}

async function fillMissingExplanations(args: {
  plan: SearchPlan;
  recommendations: RankedRole[];
  userBrief: string;
}) {
  const missing = args.recommendations.filter(
    (item) => !cleanText(item.recommendationText, 80)
  );
  if (missing.length === 0) return args.recommendations;

  const raw = await runTalentAssistantCompletion({
    jsonMode: true,
    messages: [
      { role: "system", content: EXPLANATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          args.userBrief,
          "",
          "[Reranking criteria]",
          args.plan.rerankCriteria
            .map((item, index) => `${index + 1}. ${item}`)
            .join("\n"),
          "",
          "[Roles needing explanations]",
          missing
            .map((item, index) =>
              [
                formatRoleForPrompt(item.role, index),
                `Score: ${item.score}`,
                `Good points already found: ${item.goodPoints.join(", ") || "(none)"}`,
                `Concerns already found: ${item.concerns.join(", ") || "(none)"}`,
              ].join("\n")
            )
            .join("\n\n"),
        ].join("\n"),
      },
    ],
    temperature: 0.25,
  });

  const parsed = parseJsonObject(raw);
  const explanations = Array.isArray(parsed?.explanations)
    ? parsed?.explanations
    : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of explanations) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const roleId = cleanText(record.roleId, 120);
    if (roleId) byId.set(roleId, record);
  }

  return args.recommendations.map((item) => {
    const explanation = byId.get(item.roleId);
    if (!explanation) return item;
    return {
      ...item,
      concerns:
        item.concerns.length > 0
          ? item.concerns
          : asStringArray(explanation.concerns, 4, 180),
      goodPoints:
        item.goodPoints.length > 0
          ? item.goodPoints
          : asStringArray(explanation.goodPoints, 4, 180),
      recommendationText:
        item.recommendationText ||
        cleanText(explanation.recommendationText, 700) ||
        null,
    };
  });
}

function fallbackRecommendationText(item: RankedRole) {
  const role = item.role;
  const company = cleanText(role.company_name, 160) || "해당 회사";
  const title = cleanText(role.role_name, 160) || "해당 포지션";
  const good =
    item.goodPoints[0] ||
    cleanText(role.description_summary, 160) ||
    cleanText(role.description, 160) ||
    "프로필과 연결될 수 있는 업무 내용이 있습니다";
  const concern =
    item.concerns[0] ||
    "공고 설명만으로는 팀의 실제 범위와 기대 수준을 추가 확인할 필요가 있습니다";
  return `${company}의 ${title}은 ${good}는 점에서 검토할 만합니다. 다만 ${concern}.`;
}

function formatAnswerDraft(args: {
  candidateCount: number;
  plan: SearchPlan;
  recommendations: RankedRole[];
}) {
  if (args.recommendations.length === 0) {
    return [
      "지금 조건으로 바로 추천할 만한 채용공고를 찾지 못했습니다.",
      "조건을 조금 넓혀서 직무명, 지역, 근무 형태 중 하나만 완화하면 다시 찾아볼 수 있습니다.",
    ].join("\n");
  }

  const lines = [
    `요청 조건과 프로필을 같이 보고 현재 채용공고 ${args.candidateCount}개를 검토한 뒤, 우선순위가 높은 10개를 골랐습니다.`,
    `검색 의도: ${args.plan.searchIntentSummary}`,
    "",
  ];

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
    const why = item.recommendationText || fallbackRecommendationText(item);

    lines.push(
      `${index + 1}. ${company} - ${title} (${item.score.toFixed(1)}/10)`
    );
    if (meta) lines.push(`   조건: ${meta}`);
    lines.push(`   추천 이유: ${why}`);
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

  const startedAt = Date.now();
  console.info("[recommend_job_postings] start", {
    conversationId: args.conversationId,
    request,
    userId: args.userId,
  });

  const [profile, insights, setting, recentMessages] = await Promise.all([
    fetchTalentUserProfile({ admin: args.admin, userId: args.userId }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
    fetchTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchRecentMessages({
      admin: args.admin,
      conversationId: args.conversationId,
      limit: 24,
    }),
  ]);
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    userId: args.userId,
    talentUser: profile,
  });
  const profileText = buildTalentProfileContext({
    profile,
    structuredProfile,
    setting,
    maxResumeChars: 4000,
  });
  const userBrief = buildUserBrief({
    currentRequest: request,
    insights: insights?.content ?? null,
    profileText,
    recentMessages,
  });
  const plan = await buildSearchPlan({ request, userBrief });
  const blockedCompanies = normalizeTalentBlockedCompanies(
    setting?.blocked_companies ?? []
  );
  infoJson("search plan", {
    must: plan.must,
    rerankCriteria: plan.rerankCriteria,
    searchIntentSummary: plan.searchIntentSummary,
    should: plan.should,
  });
  debugLog("search plan full", {
    blockedCompanies,
    must: plan.must,
    should: plan.should,
  });

  let search = await executeRoleSql({
    admin: args.admin,
    blockedCompanies,
    plan,
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
  if (search.rows.length < 10 && plan.must.concat(plan.should).length > 0) {
    const relaxedSearch = await executeRoleSql({
      admin: args.admin,
      blockedCompanies,
      plan,
      relaxed: true,
    });
    if (relaxedSearch.rows.length > search.rows.length) {
      search = relaxedSearch;
      relaxed = true;
      infoJson("relaxed sql search", {
        candidateCount: search.rows.length,
        candidates: search.rows.slice(0, 5).map(rolePreview),
        relaxed,
        rawCount: search.rawRows.length,
        rpcContainerCount: search.rpcContainerCount,
      });
      debugLog("relaxed sql search full", {
        candidateCount: search.rows.length,
        rawCount: search.rawRows.length,
        rawRowsSample: search.rawRows.slice(0, 5),
        rowsSample: search.rows.slice(0, 5),
        sql: search.sql,
      });
    }
  }

  const candidates = search.rows.slice(0, MAX_SEARCH_RESULTS);
  const ranked =
    candidates.length > 0
      ? await rerankRoles({ candidates, plan, userBrief })
      : [];
  const recommendations = await fillMissingExplanations({
    plan,
    recommendations: ranked,
    userBrief,
  });
  infoJson("completed", {
    candidateCount: candidates.length,
    durationMs: Date.now() - startedAt,
    recommendationCount: recommendations.length,
    topScores: recommendations.slice(0, 5).map((item) => ({
      ...rolePreview(item.role),
      score: item.score,
    })),
  });

  return {
    answerDraft: formatAnswerDraft({
      candidateCount: candidates.length,
      plan,
      recommendations,
    }),
    candidateCount: candidates.length,
    relaxed,
    recommendations: recommendations.map((item, index) => ({
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
        item.recommendationText || fallbackRecommendationText(item),
      goodPoints: item.goodPoints,
      concerns: item.concerns,
    })),
    searchPlan: {
      must: plan.must,
      rerankCriteria: plan.rerankCriteria,
      searchIntentSummary: plan.searchIntentSummary,
      should: plan.should,
    },
  };
}
