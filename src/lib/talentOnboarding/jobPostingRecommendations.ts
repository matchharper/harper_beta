import { fetchRecentTalentActivitySummaries } from "@/lib/talentOnboarding/activityEvents";
import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  fetchTalentInsights,
  fetchTalentStructuredProfile,
  getTalentSupabaseAdmin,
  normalizeTalentBlockedCompanies,
} from "@/lib/talentOnboarding/server";
import { OpportunityType } from "@/lib/opportunityType";
import { logger } from "@/utils/logger";

if (typeof window !== "undefined") {
  throw new Error("jobPostingRecommendations must not run in the browser");
}

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

type JsonRecord = Record<string, unknown>;

type FtsKeyword = {
  terms: string[];
  weight: number;
};

type RoleSearchMode = "strict";

type EntryPreference = -1 | 0 | 1;

type ExternalSearchPlan = {
  ftsKeywords: FtsKeyword[];
  includeContract: boolean;
  includeIntern: boolean;
  includeParttime: boolean;
  includeRemote: boolean;
  isPreferEntry: EntryPreference;
  locations: string[];
  remoteOnly: boolean;
  roleTitles: string[];
  searchIntentSummary: string;
};

type RawRoleRow = {
  company_db_description?: string | null;
  company_db_employee_count_range?: unknown;
  company_db_founded_year?: number | string | null;
  company_db_location?: string | null;
  company_db_name?: string | null;
  company_db_short_description?: string | null;
  company_description?: string | null;
  company_name?: string | null;
  company_test_score?: number | null;
  company_workspace_id?: string | null;
  description?: string | null;
  external_jd_url?: string | null;
  location_text?: string | null;
  posted_at?: string | null;
  role_id?: string | null;
  role_name?: string | null;
  search_rank?: number | null;
  seniority_level?: string | null;
  type?: string[] | null;
  work_mode?: string | null;
};

type RoleCard = {
  company: {
    description?: string | null;
    employeeCountRange?: unknown;
    foundedYear?: number | string | null;
    location?: string | null;
    shortDescription?: string | null;
  };
  companyName: string | null;
  companyWorkspaceId: string;
  employmentType: string | null;
  location: string | null;
  postedAt: string | null;
  roleDescription: string;
  roleId: string;
  roleName: string;
  score: number | null;
  searchRank: number;
  seniorityLevel: string | null;
  workMode: string | null;
  externalFitCache?: ExternalFitCache;
  row: RawRoleRow;
  _shortlistCandidateId?: number;
};

type ExternalFitCache = {
  createdAt: string | null;
  fitSummary: string;
  reason: string;
  score100: number;
  tradeoff: string;
};

type PreferenceFitStatus = "Satisfied" | "Neutral" | "Dissatisfied";

type RecommendationPreferenceFit = Record<
  string,
  {
    note: string;
    status: PreferenceFitStatus;
  }
>;

type SelectedRecommendation = {
  fitReasons: string[];
  fitSummary: string | null;
  isSupplemental: boolean;
  preferenceFit: RecommendationPreferenceFit;
  rank: number;
  roleId: string;
  score: number;
  tradeoffs: string[];
};

type FinalSelectionResult = {
  directFitCount: number;
  scoredCount: number;
  selected: SelectedRecommendation[];
  supplementalCount: number;
};

type EnrichedRankedRole = {
  concerns: string[];
  detail: {
    fitReasons: string[];
    preferenceFit: RecommendationPreferenceFit;
    roleOverviewText: string | null;
    tradeoffs: string[];
  };
  goodPoints: string[];
  isSupplemental: boolean;
  recommendationId: string | null;
  recommendationText: string | null;
  role: RawRoleRow;
  roleId: string;
  score: number;
};

type JobPostingTalentUserProfile = {
  bio?: string | null;
  created_at?: string | null;
  email?: string | null;
  headline?: string | null;
  last_logined_at?: string | null;
  location?: string | null;
  name?: string | null;
  profile_picture?: string | null;
  resume_file_name?: string | null;
  resume_links?: unknown;
  updated_at?: string | null;
  user_id?: string | null;
};

type JobPostingTalentSetting = {
  blocked_companies?: unknown;
  engagement_types?: unknown;
  user_id?: string | null;
};

const MAX_SEARCH_RESULTS = 200;
const PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE = 1000;
const RECENT_TALENT_ACTIVITY_SUMMARY_LIMIT = 10;
const RECENT_CONVERSATION_SUMMARY_LIMIT = 3;
const RECENT_RECOMMENDATIONS_FOR_CONTEXT = 10;
const RECENT_DELIVERY_TEXTS_LIMIT = 6;
const RECENT_DELIVERY_META_LIMIT = 6;
const SEARCH_COMPANY_WORKSPACE_ROLE_CAP = 5;
const SHORTLIST_COMPANY_ROLE_CAP = 4;
const SHORTLIST_LIMIT_MIN = 4;
const SHORTLIST_LIMIT_MAX = 20;
const SHORTLIST_LIMIT_MULTIPLIER = 2;
const TALENT_EXPERIENCE_DESCRIPTION_MAX_LENGTH = 5000;
const TALENT_TIMELINE_DESCRIPTION_MAX_LENGTH = 900;
const FINAL_RECOMMENDATION_COUNT = 5;
const CONTINUATION_RECOMMENDATION_BATCH_LIMIT = 10;
const EXTERNAL_FIT_CACHE_TTL_DAYS = 10;
const EXTERNAL_FIT_CACHE_SHORTLIST_SKIP_MIN_SCORE100 = 70;
const EXTERNAL_FIT_CACHE_SHORTLIST_SKIP_MIN_COUNT = 20;
const RECOMMEND_JOB_POSTINGS_MODEL_VERSION =
  "career_chat_recommend_job_postings_external_v5";
const PREFERENCE_FIT_KEYS = [
  "next_scope",
  "location",
  "compensation",
  "deal_breakers",
  "must_haves",
] as const;

const FTS_RANK_WEIGHTS = "ARRAY[0.04,0.57,0.64,1.0]::real[]";
const MAX_FTS_KEYWORDS = 8;
const MAX_FTS_TERMS_PER_KEYWORD = 8;
const MAX_ROLE_TITLES = 12;
const COMPANY_TEST_SCORE_MAX = 20;
const COMPANY_TEST_SCORE_SEARCH_RANK_DIVISOR = 5;
const RECOMMEND_JOB_POSTINGS_PLAN_MODEL =
  CAREER_LLM_CONFIG.recommendJobPostings.planModel;
const RECOMMEND_JOB_POSTINGS_FINAL_SELECTION_MODEL =
  CAREER_LLM_CONFIG.recommendJobPostings.finalSelectionModel;
const RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL =
  CAREER_LLM_CONFIG.recommendJobPostings.shortlistModel;
const RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL =
  CAREER_LLM_CONFIG.recommendJobPostings.fallbackModel;
const RECOMMEND_JOB_POSTINGS_ANTHROPIC_OVERLOAD_FALLBACK_MODEL =
  CAREER_LLM_CONFIG.recommendJobPostings.anthropicOverloadFallbackModel;

const DEBUG_RECOMMEND_JOB_POSTINGS =
  process.env.DEBUG_RECOMMEND_JOB_POSTINGS === "1";

const PLAN_SYSTEM_PROMPT = `You are Harper's external job-posting search planner.
Return JSON only.

Your task is to find the most relevant job postings for the user's request and profile.

This tool recommends external public job postings only. Do not output internal opportunity fields, follow-up decisions, todo actions, send decisions, or recommendation strategy metadata.

The user's latest request is the primary retrieval target. Use the compact user profile only to disambiguate skills, avoid known blockers, and personalize matching. Do not over-optimize for a long-term recommendation strategy when it conflicts with the current request.

Output schema:
{
  "searchIntentSummary": "one sentence in the requested user-facing output language focused on the current request",
  "ftsKeywords": [{"terms": ["synonym", "group"], "weight": 1.0}],
  "role_titles": ["role title fragment"],
  "include_contract": false,
  "include_parttime": false,
  "include_intern": false,
  "is_prefer_entry": 0,
  "locations": [],
  "includeRemote": true,
  "remoteOnly": false
}

Rules:
- role_titles are the first DB retrieval gate over company_roles.name. ftsKeywords are applied only after title/type/location filtering narrows the candidate pool.
- Use ftsKeywords for role titles, role description, companies, domain, skills, methods, and problem area. Use only important keywords, not broad terms.
- 만약 한국의 공고도 검색한다면, terms에 영어 뿐만 아니라 한글 동의어도 포함해라. ex) "Research Engineer", "Machine leaning", "리서치 엔지니어", "머신러닝", "개발자", "Developer"
- Avoid standalone broad terms such as "AI", "data", "software".
- Do not put pure preferences in ftsKeywords: company stage, company size, funding, investors, location, remote/hybrid/onsite, salary, culture, brand prestige, "startup", "Series A", "YC", "a16z", "global", or "Seoul" unless that word is literally part of the work domain.
- locations: Geographic location filters or preferences only. Never put "remote" here. Keep empty if location preference is unknown.
  - Examples: "Seoul", "Korea", ", CA", "United States",  "Japan"
  - 유저가 명시적으로 한국만을 원한다고 하지 않은 경우에는 기본적으로 한국과 미국 둘다 열어둬라. 
- includeRemote: true means remote rows are allowed if they otherwise match the query. It must not broaden location SQL with "remote OR location". false means SQL must exclude rows where work_mode is remote.
- remoteOnly: true only when remote is a hard requirement, e.g. "remote only", "완전 원격만", "원격 아니면 제외".
  - If remoteOnly=true and locations has geo values, SQL will require both remote work mode and one of those geographies, e.g. "US remote only".
  - If remoteOnly=true, includeRemote is effectively true because remote is required.
  - If the user only mildly prefers remote, set includeRemote=true and remoteOnly=false, then let shortlist/final selection handle it as a preference.
## role_titles rules
- role_titles are a hard role-title gate over company_roles.name using ILIKE. Always output 1-15 title fragments.
  - They must be role/title fragments likely to appear in cr.name, not company names, domains, skills, locations, company stage, or preferences.
  - English title fragments are preferred for English-market roles; include Korean aliases when Korean postings are relevant.
  - Recall matters more than precision. Use broad-enough fragments so good roles are not excluded by an overly specific title.
  - Good: "Engineer", "Developer", "Research Engineer", "Software Engineer", "Backend", "Product Manager", "Designer", "개발자", "엔지니어", "기획자", "공무원".
  - Bad: "국가직 공기업 공무원" when "공무원" would keep the right roles; "Series B", "remote", "OpenAI", "LLM", "fintech".
  - Because SQL uses ILIKE substring matching, do not include a narrower value already covered by another output value. Example: if you output "Engineer", do not also output "ML Engineer".

  - include_contract/include_parttime/include_intern are hard employment-type switches over company_roles.type.
  - Set each to true only when the user explicitly accepts or asks for that engagement type.
  - Default to false for normal job recommendations. False means SQL excludes type values containing "contract", "part_time", or "internship" respectively.
- is_prefer_entry: 1 when the user prefers entry-level/new grad/junior roles, -1 when they prefer non-entry/mid+ roles or reject junior roles, 0 when unknown/neutral.
  - This is not the same as internship. Do not set include_intern=true just because is_prefer_entry=1.
- Weight ftsKeywords intentionally: 4.0-5.0 for must-have role/domain concepts, 2.0-3.5 for strong direction, 1.0-1.5 for weak supporting context.
- Use English for English-market role/domain terms and Korean for Korean aliases when helpful.
- If the request is broad, still produce high-recall ftsKeywords based on user's profile rather than generic "good jobs".
`;

const SHORTLIST_SYSTEM_PROMPT = `너는 Harper의 external job-posting shortlist 담당자다.
반드시 JSON만 반환한다.

Harper는 한 명의 유저 정보와 요청을 바탕으로 커리어 기회를 골라 메일/제안한다.
현재 유저 요청을 가장 중요하게 보고, 다음으로 유저 프로필/대화/맥락을 참고한다.

Output schema:
{
  "selectedCandidateIds": [0, 32, 184, 92, 155],
  "rationale": "짧은 내부 판단 이유"
}

규칙:
- externalCandidates 안에 있는 numeric id만 고른다.
- selectionLimit은 선택할 넘길 후보 수다. hard reject 이후 남는 후보가 충분하면 가능한 한 selectionLimit개를 채운다.
- 절대 같은 회사의 후보를 2개 이상 고르지 않는다. 같은 회사에서는 현재 요청에 가장 직접적으로 맞는 role 1개만 고른다.
- company_score는 회사 점수이다. role fit 점수가 아니다.
- 같은 역할이라면 company_score가 높은 회사를 더 우선시해라.
- retrievalFtsScore는 title 후보군 안에서 계산한 FTS/domain relevance에 company score bonus를 더한 내부 retrieval rank다. 참고값일 뿐 사용자에게 말하지 않는다. retrievalFtsScore를 선택에 반영하지 않는다.
`;
// - 현재 요청과 명확히 어긋나는 후보는 company_score 혹은 retrievalFtsScore가 높아도 제외한다.
// - 이미 한번이라도 추천된 회사는 정말 좋은 role이 아니면 안고르는게 좋아.

const FINAL_SELECTION_SYSTEM_PROMPT = `너는 Harper의 external job-posting selector다.
반드시 JSON만 반환한다.

이 도구는 external public job posting만 추천한다. Harper가 소개/연결할 수 있는 internal opportunity처럼 쓰지 않는다.
현재 유저 요청을 가장 중요하게 반영하고, compact user_profile은 fitReasons와 preferenceFit을 개인화하는 데 사용한다.

Output schema:
{
  "selectedRecommendations": [
    {
      "rank": 1,
      "roleId": "...",
      "score": 0.9,
      "fitSummary": "회사와 역할에 대한 요약",
      "fitReasons": ["유저 프로필 / request를 기반으로 이 역할을 추천하는 이우"],
      "preferenceFit": {
        "next_scope": {"status": "Satisfied|Neutral|Dissatisfied", "note": "short note in the requested user-facing output language"},
        "location": {"status": "Satisfied|Neutral|Dissatisfied", "note": "short note in the requested user-facing output language"},
        "compensation": {"status": "Satisfied|Neutral|Dissatisfied", "note": "short note in the requested user-facing output language"},
        "deal_breakers": {"status": "Satisfied|Neutral|Dissatisfied", "note": "short note in the requested user-facing output language"},
        "must_haves": {"status": "Satisfied|Neutral|Dissatisfied", "note": "short note in the requested user-facing output language"}
      }
    },
    {
      "roleId": "...",
      "score": 0.52
    }
  ]
}

## selectedRecommendations 필드 작성법:
- detailedExternalCandidates의 모든 후보를 selectedRecommendations에 정확히 한 번씩 넣고 score를 매긴다. 이 배열은 최종 추천 목록이 아니라 scoring 결과다.
- rank: 현재 요청과 잘 맞아 바로 추천할 수 있는 후보에만 쓴다. 1부터 시작한다.
- roleId: 반드시 detailedExternalCandidates 안에 있는 roleId만 사용한다.
- score: 0~1 사이의 "추천 confidence"다. retrieval 점수나 회사 점수를 복사하지 않는다.
- fitSummary: 제품의 추천 상세 카드에 들어갈 중립 요약이다. 회사가 무엇을 하고, 이 role이 무엇을 하는지, 그리고 이 회사와 role이 왜 좋은지 등 1~3문장으로 쓴다.
  - 여기에 "왜 이 유저에게 맞는지"를 쓰지 않는다. 데이터가 있다면 활용해서 쓰면 좋다.
  - 예: "Elevenlabs는 음성 합성·음성 복제·오디오 생성 AI를 개발하는 글로벌 연구 중심 회사입니다. 2023년에 설립되어 현재까지 1조원 이상을 투자 받아 현재 수백만명이 사용하고 있습니다. 이 역할은 Research Engineer이지만 특정 역할에 얽매이지않고 어떤 작업이든 할 수 있으며, 완전 원격도 가능합니다."
- fitReasons: 유저에게 이 role을 제안하는 개인화된 이유다. 최대 3개, 각각 짧고 구체적으로 쓴다.
  - 유저의 경력/대화/최근 저장·좋아요·싫어요/선호와 role evidence를 연결한다.
  - 예: "STT-LLM-TTS 파이프라인으로 실제 대화 AI를 구현한 경험이 Voice AI 에이전트 배포 업무와 직접적으로 일치합니다."
  - 예: "현재 역할은 ex-founder를 선호한다고 되어있어 창업 배경을 가진 호진님에게 적합합니다."
- preferenceFit: 유저 insight에 명시된 선호 축만 평가한다. 없는 선호 축은 생략한다.
  - 허용 key: next_scope, location, compensation, deal_breakers, must_haves.
  - status는 Satisfied, Neutral, Dissatisfied 중 하나다.
  - note는 role card와 user insight에 근거한 짧은 문장이며, 요청된 user-facing output language로 쓴다.
  - 예:
    {
      "next_scope": {"status": "Satisfied", "note": "말씀하신 applied AI research 방향과 role scope가 맞습니다."},
      "location": {"status": "Neutral", "note": "SF 기반이라 선호 지역과는 맞지만 onsite 빈도는 확인이 필요합니다."},
      "deal_breakers": {"status": "Dissatisfied", "note": "relocation-only 조건이면 원격 선호와 충돌할 수 있습니다."}
    }

규칙:
- roleId는 detailedExternalCandidates 안에 있는 roleId만 사용한다.
- score는 0~1 사이의 추천 confidence다. retrieval 점수, searchRank, company_score, test_score를 복사하지 않는다.
- detailedExternalCandidates item에 cachedExternalFit이 있으면 jd는 제공되지 않는다. 이 경우 cachedExternalFit.fitSummary를 fitSummary로 재사용하고, cachedExternalFit.reason/score/tradeoff는 prior evidence로만 사용한다. 그래도 최종 선택과 score는 현재 request/searchPlan 기준으로 판단한다.
- 현재 요청과 충분히 fit한 후보에는 fitSummary, fitReasons, preferenceFit을 작성한다.
- 현재 요청과 완전히 일치하지 않거나 바로 추천할 정도의 fit은 아닌 후보는 roleId와 score만 반환한다. fitSummary, fitReasons, preferenceFit을 쓰지 않는다.
- 코드가 fitSummary/fitReasons/preferenceFit이 있는 후보를 우선 추천하고, targetRecommendationCount보다 부족하면 roleId+score만 있는 후보 중 score가 높은 순서로 나머지를 채운다.
- fitReasons는 현재 요청과 user_profile의 근거를 role/company/JD evidence와 연결한다.
- preferenceFit은 user_profile.insights에 명시된 축만 평가한다.
- 한 회사에서 여러 role을 동시에 선택하지 않는다.
- 제공된 후보/프로필에 없는 회사 문화, 투자, 팀 퀄리티, 보상, 성장성, 연락 가능성을 지어내지 않는다.
- 역할의 설명과 관계없이 유저가 사용하는 언어로 모든 내용을 작성해라.(영어인 키워드는 제외)
`;

function cleanText(value: unknown, maxLength = 4000) {
  const text =
    typeof value === "string" || typeof value === "number"
      ? String(value).replace(/\s+/g, " ").trim()
      : "";
  return text ? text.slice(0, maxLength) : "";
}

function normalizeMultiline(value: unknown, maxLength = 4000) {
  const text = typeof value === "string" ? value.replace(/\r/g, "").trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function clampBlock(value: unknown, maxLength = 4000) {
  return normalizeMultiline(value, maxLength);
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

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function parseJsonObject(raw: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return asRecord(JSON.parse(match[0]));
    } catch {
      return null;
    }
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

async function fetchJobPostingTalentUserProfile(args: {
  admin: AdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_users")
    .select(
      [
        "user_id",
        "email",
        "name",
        "profile_picture",
        "headline",
        "bio",
        "location",
        "last_logined_at",
        "resume_file_name",
        "resume_links",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_users profile");
  }

  return (data ?? null) as JobPostingTalentUserProfile | null;
}

async function fetchJobPostingTalentSetting(args: {
  admin: AdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_setting")
    .select("user_id, blocked_companies, engagement_types")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_setting");
  }

  return (data ?? null) as JobPostingTalentSetting | null;
}

function coerceList(value: unknown, limit: number): unknown[] {
  const parsed = parseMaybeJsonValue(value);
  if (Array.isArray(parsed)) return parsed.slice(0, limit);
  if (parsed === null || parsed === undefined || parsed === "") return [];
  return [parsed].slice(0, limit);
}

function asStringArray(value: unknown, maxItems = 8, maxLength = 80) {
  const unique = new Map<string, string>();
  for (const item of coerceList(value, maxItems)) {
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

function normalizeInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function isEmptyForLlm(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as JsonRecord).length === 0)
  );
}

function cleanEmptyValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanEmptyValues).filter((item) => !isEmptyForLlm(item));
  }
  const record = asRecord(value);
  if (record) {
    const compact: JsonRecord = {};
    for (const [key, child] of Object.entries(record)) {
      const compactValue = cleanEmptyValues(child);
      if (!isEmptyForLlm(compactValue)) compact[key] = compactValue;
    }
    return compact;
  }
  return value;
}

function compactDatetimeForLlm(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    return formatKstHour(value);
  }
  const text = cleanText(value, 120);
  if (!text) return "";
  if (text.endsWith("KST") && text.includes("시")) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}/.test(text) && !text.includes("T")) {
    return text.slice(0, 10);
  }
  const normalized =
    text.includes("T") && !/(Z|[+-]\d{2}:?\d{2})$/.test(text)
      ? `${text}Z`
      : text.replace(/Z$/, "+00:00");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
  }
  return formatKstHour(date);
}

function formatKstHour(date: Date) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 13)}시 KST`;
}

function compactPeriodDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cleanText(value, 120);
  if (
    !text ||
    ["none", "null", "n/a", "na", "-"].includes(text.toLowerCase())
  ) {
    return "";
  }
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function isDateFieldKey(key: string) {
  return (
    key.endsWith("At") ||
    key.endsWith("_at") ||
    key.endsWith("Date") ||
    key.endsWith("_date") ||
    [
      "createdAt",
      "updatedAt",
      "occurredAt",
      "occuredAt",
      "recommendedAt",
      "viewedAt",
      "clickedAt",
      "lastMentionedAt",
      "postedAt",
      "startDate",
      "endDate",
      "created_at",
      "updated_at",
      "occurred_at",
      "occured_at",
      "recommended_at",
      "viewed_at",
      "clicked_at",
      "last_mentioned_at",
      "posted_at",
      "start_date",
      "end_date",
    ].includes(key)
  );
}

function compactDates(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactDates(item, key))
      .filter((item) => !isEmptyForLlm(item));
  }
  const record = asRecord(value);
  if (record) {
    const compact: JsonRecord = {};
    for (const [childKey, childValue] of Object.entries(record)) {
      const compactValue = compactDates(childValue, childKey);
      if (!isEmptyForLlm(compactValue)) compact[childKey] = compactValue;
    }
    return compact;
  }
  if (isDateFieldKey(key)) return compactDatetimeForLlm(value);
  return parseMaybeJsonValue(value);
}

function compactStringList(value: unknown, limit: number, maxLength: number) {
  return asStringArray(value, limit, maxLength);
}

function firstPresent(record: JsonRecord | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (!isEmptyForLlm(value)) return value;
  }
  return null;
}

function compactInsightsForLlm(value: unknown): JsonRecord {
  const record = asRecord(value);
  if (!record) return {};
  const compact: JsonRecord = {};
  for (const [key, raw] of Object.entries(record)) {
    const name = cleanText(key, 80);
    if (!name) continue;
    if (typeof raw === "string") {
      compact[name] = normalizeMultiline(raw, 800);
    } else if (Array.isArray(raw)) {
      compact[name] = compactStringList(raw, 12, 180);
    } else {
      compact[name] = parseMaybeJsonValue(raw);
    }
  }
  return cleanEmptyValues(compact) as JsonRecord;
}

function compactProfileLinks(links: unknown, limit = 6) {
  return asStringArray(links, limit, 240).map((url) => ({
    type: url.toLowerCase().includes("linkedin.com")
      ? "linkedin"
      : url.toLowerCase().includes("github.com")
        ? "github"
        : "profile_link",
    url,
  }));
}

function containsLinkedIn(value: unknown): boolean {
  if (typeof value === "string")
    return value.toLowerCase().includes("linkedin.com");
  if (Array.isArray(value)) return value.some(containsLinkedIn);
  const record = asRecord(value);
  return record ? Object.values(record).some(containsLinkedIn) : false;
}

function compactTimelineRows(
  value: unknown,
  limit: number,
  options: { descriptionMaxLength?: number } = {}
) {
  const descriptionMaxLength =
    options.descriptionMaxLength ?? TALENT_TIMELINE_DESCRIPTION_MAX_LENGTH;
  const rows: JsonRecord[] = [];
  for (const item of coerceList(value, limit)) {
    const record = asRecord(item);
    if (!record) continue;
    const compact: JsonRecord = {};
    for (const [key, itemValue] of Object.entries(record)) {
      if (["startDate", "endDate", "start_date", "end_date"].includes(key)) {
        continue;
      }
      if (key === "description" || key === "roleDescription") {
        const text = normalizeMultiline(itemValue, descriptionMaxLength);
        if (text) compact[key] = text;
        continue;
      }
      if (key === "memo") {
        const text = normalizeMultiline(itemValue, 600);
        if (text) compact[key] = text;
        continue;
      }
      const compactValue = compactDates(itemValue, key);
      if (!isEmptyForLlm(compactValue)) compact[key] = compactValue;
    }
    const start = compactPeriodDate(record.startDate ?? record.start_date);
    const end =
      compactPeriodDate(record.endDate ?? record.end_date) ||
      careerT(
        "ko",
        "career.profile.career_talent_profile_panel.0p5h1wt",
        "현재"
      );
    if (start) compact.period = `${start} - ${end}`;
    const cleaned = cleanEmptyValues(compact);
    if (asRecord(cleaned)) rows.push(cleaned as JsonRecord);
  }
  return rows;
}

function compactActivityEvent(item: {
  created_at?: string | null;
  summary?: string | null;
}) {
  const summary = normalizeMultiline(item.summary, 360);
  if (!summary) return "";
  const occurredAt = compactDatetimeForLlm(item.created_at);
  return occurredAt ? `${occurredAt} | ${summary}` : summary;
}

type RecentRecommendationRow = {
  clickedAt?: string | null;
  companyName?: string | null;
  feedback?: string | null;
  feedbackReason?: string | null;
  fitReasons?: unknown;
  fitSummary?: string | null;
  id?: string | null;
  location?: string | null;
  opportunityType?: string | null;
  processedStage?: string | null;
  recommendedAt?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  savedStage?: string | null;
  score?: number | null;
  sourceType?: string | null;
  status?: string | null;
  tradeoffs?: unknown;
  viewedAt?: string | null;
  workMode?: string | null;
};

function actionWords(item: RecentRecommendationRow) {
  const actions: string[] = [];
  const feedback = cleanText(item.feedback, 80).toLowerCase();
  const savedStage = cleanText(item.savedStage, 80);
  const status = cleanText(item.status, 80);
  if (feedback) {
    if (["like", "liked", "positive"].includes(feedback)) actions.push("liked");
    else if (["dislike", "disliked", "negative"].includes(feedback)) {
      actions.push("disliked");
    } else actions.push(`fb:${feedback}`);
  }
  if (savedStage) actions.push(savedStage);
  else if (status) actions.push(status);
  if (item.viewedAt) actions.push("viewed");
  if (item.clickedAt) actions.push("clicked");
  return Array.from(new Set(actions));
}

function redactPreviousExternalMentions(
  value: unknown,
  terms: string[],
  maxLength = 1600
) {
  let text = normalizeMultiline(value, maxLength);
  text = text.replace(
    /\[[^\]]+\]\([0-9a-fA-F-]{36}\)/g,
    "[previous external role]"
  );
  text = text.replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,36}\b/g, "[roleId]");
  for (const term of terms) {
    if (!term) continue;
    text = text.replace(
      new RegExp(escapeRegExp(term), "gi"),
      "[previous external role]"
    );
  }
  return text;
}

function compactRecentRecommendation(
  item: RecentRecommendationRow,
  terms: string[],
  includeReuseNote = true
) {
  let title =
    [cleanText(item.companyName, 160), cleanText(item.roleName, 180)]
      .filter(Boolean)
      .join(" - ") || "unknown role";
  title =
    redactPreviousExternalMentions(title, terms, 260) ||
    "[previous external role]";
  const parts = [`external: ${title}`];
  const recommendedAt = compactDatetimeForLlm(item.recommendedAt);
  if (recommendedAt) parts.push(recommendedAt);
  const actions = actionWords(item);
  if (actions.length > 0) parts.push(actions.join(", "));
  const place = [cleanText(item.location, 120), cleanText(item.workMode, 80)]
    .filter(Boolean)
    .join(" / ");
  if (place) parts.push(place);
  const feedbackReason = redactPreviousExternalMentions(
    item.feedbackReason,
    terms,
    220
  );
  if (feedbackReason) parts.push(`reason: ${feedbackReason}`);

  return parts.join(" | ");
}

function compactFeedbackSignals(
  history: RecentRecommendationRow[],
  terms: string[]
) {
  const buckets = {
    applied: [] as string[],
    negativeOrDisliked: [] as string[],
    positiveOrLiked: [] as string[],
    saved: [] as string[],
  };
  for (const item of history) {
    const compact = compactRecentRecommendation(item, terms, false);
    const feedback = cleanText(item.feedback, 80).toLowerCase();
    const savedStage = cleanText(item.savedStage, 80).toLowerCase();
    if (["like", "positive"].includes(feedback))
      buckets.positiveOrLiked.push(compact);
    if (["dislike", "negative"].includes(feedback)) {
      buckets.negativeOrDisliked.push(compact);
    }
    if (["saved", "interested", "shortlisted"].includes(savedStage)) {
      buckets.saved.push(compact);
    }
    if (["applied", "interviewing"].includes(savedStage)) {
      buckets.applied.push(compact);
    }
  }
  return cleanEmptyValues({
    applied: buckets.applied.slice(0, 8),
    instruction:
      "Use these signals to interpret the current request. Mention what liked/saved roles imply and what disliked roles suggest avoiding only when relevant.",
    negativeOrDisliked: buckets.negativeOrDisliked.slice(0, 8),
    positiveOrLiked: buckets.positiveOrLiked.slice(0, 8),
    saved: buckets.saved.slice(0, 8),
  }) as JsonRecord;
}

function previousExternalRedactionTerms(
  existing: PreviousExternalRecommendation[]
) {
  const terms: string[] = [];
  for (const item of existing) {
    for (const value of [item.roleName, item.companyName]) {
      const text = cleanText(value, 180);
      if (text.length >= 3 && !terms.includes(text)) terms.push(text);
    }
  }
  return terms.sort((left, right) => right.length - left.length);
}

function compactDeliveryMetaForLlm(meta: JsonRecord) {
  const parts: string[] = [];
  const intent = normalizeMultiline(meta.intent, 240);
  if (intent) parts.push(intent);
  for (const [label, key] of [
    ["act", "communicationAct"],
    ["shape", "shape"],
    ["ask", "askType"],
    ["roles", "roleCount"],
    ["cta", "ctaType"],
    ["opening", "openingStyle"],
  ] as const) {
    const text = cleanText(meta[key], 80);
    if (text) parts.push(`${label}:${text}`);
  }
  return parts.join(" | ");
}

async function fetchRecentConversationSummaries(args: {
  admin: AdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .select("created_at, segment_summary, to_message_id")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .neq("segment_summary", "")
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(RECENT_CONVERSATION_SUMMARY_LIMIT) as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load talent_conversation_summaries"
    );
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const text = normalizeMultiline(row?.segment_summary, 900);
      if (!text) return "";
      const createdAt = compactDatetimeForLlm(row?.created_at);
      return createdAt ? `${createdAt} | ${text}` : text;
    })
    .filter(Boolean)
    .reverse();
}

async function fetchRecentRecommendations(args: {
  admin: AdminClient;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      `id,
       role_id,
       opportunity_type,
       feedback,
       feedback_reason,
       recommended_at,
       viewed_at,
       clicked_at,
       saved_stage,
       processed_stage,
       fit_summary,
       fit_reasons,
       tradeoffs,
       score,
       company_roles!inner(
         name,
         source_type,
         location_text,
         work_mode,
         company_workspace:company_workspace_id(company_name)
       )`
    )
    .eq("talent_id", args.userId)
    .eq("opportunity_type", OpportunityType.ExternalJd)
    .order("recommended_at", { ascending: false })
    .limit(RECENT_RECOMMENDATIONS_FOR_CONTEXT) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load recommendation history");
  }

  return (Array.isArray(data) ? data : []).map(
    (row): RecentRecommendationRow => {
      const role = asRecord(row?.company_roles);
      const workspace = asRecord(role?.company_workspace);
      return {
        clickedAt: cleanText(row?.clicked_at, 80) || null,
        companyName: cleanText(workspace?.company_name, 160) || null,
        feedback: cleanText(row?.feedback, 80) || null,
        feedbackReason: normalizeMultiline(row?.feedback_reason, 500) || null,
        fitReasons: row?.fit_reasons,
        fitSummary: normalizeMultiline(row?.fit_summary, 700) || null,
        id: cleanText(row?.id, 120) || null,
        location: cleanText(role?.location_text, 160) || null,
        opportunityType: cleanText(row?.opportunity_type, 120) || null,
        processedStage: cleanText(row?.processed_stage, 80) || null,
        recommendedAt: cleanText(row?.recommended_at, 120) || null,
        roleId: cleanText(row?.role_id, 120) || null,
        roleName: cleanText(role?.name, 180) || null,
        savedStage: cleanText(row?.saved_stage, 80) || null,
        score:
          typeof row?.score === "number" && Number.isFinite(row.score)
            ? row.score
            : null,
        sourceType: "external",
        status:
          cleanText(row?.processed_stage, 80) ||
          cleanText(row?.saved_stage, 80),
        tradeoffs: row?.tradeoffs,
        viewedAt: cleanText(row?.viewed_at, 80) || null,
        workMode: cleanText(role?.work_mode, 80) || null,
      };
    }
  );
}

type PreviousExternalRecommendation = {
  companyName: string;
  roleId: string;
  roleName: string;
};

async function fetchExistingExternalRecommendations(args: {
  admin: AdminClient;
  userId: string;
}) {
  const result: PreviousExternalRecommendation[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await ((
      args.admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select(
        `role_id,
         company_roles!inner(
           name,
           source_type,
           company_workspace:company_workspace_id(company_name)
         )`
      )
      .eq("talent_id", args.userId)
      .eq("opportunity_type", OpportunityType.ExternalJd)
      .range(
        offset,
        offset + PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE - 1
      ) as any);

    if (error) {
      throw new Error(
        error.message ?? "Failed to load previous external recommendations"
      );
    }

    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      const role = asRecord(row?.company_roles);
      const sourceType = cleanText(role?.source_type, 80).toLowerCase();
      if (sourceType === "internal") continue;
      const workspace = asRecord(role?.company_workspace);
      const roleId = cleanText(row?.role_id, 120);
      if (!roleId) continue;
      result.push({
        companyName: cleanText(workspace?.company_name, 180),
        roleId,
        roleName: cleanText(role?.name, 180),
      });
    }

    if (rows.length < PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE) break;
    offset += PREVIOUSLY_RECOMMENDED_ROLE_ID_PAGE_SIZE;
  }
  return result;
}

async function fetchRecentDeliveryContext(args: {
  admin: AdminClient;
  redactionTerms: string[];
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("query_plan")
    .eq("talent_id", args.userId)
    .in("status", ["completed", "partial"])
    .order("created_at", { ascending: false })
    .limit(
      Math.max(RECENT_DELIVERY_TEXTS_LIMIT, RECENT_DELIVERY_META_LIMIT)
    ) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load recent delivery context");
  }

  const previousDeliveryTexts: string[] = [];
  const recentDeliveryMeta: string[] = [];
  for (const row of Array.isArray(data) ? data : []) {
    const plan = asRecord(parseMaybeJsonValue(row?.query_plan));
    const delivery = asRecord(plan?.delivery);
    for (const key of ["emailBody", "chatMessage"]) {
      const text = redactPreviousExternalMentions(
        delivery?.[key],
        args.redactionTerms,
        1600
      );
      if (text && previousDeliveryTexts.length < RECENT_DELIVERY_TEXTS_LIMIT) {
        previousDeliveryTexts.push(text);
      }
    }
    const meta = asRecord(plan?.deliveryMeta);
    const compactMeta = meta ? compactDeliveryMetaForLlm(meta) : "";
    if (compactMeta && recentDeliveryMeta.length < RECENT_DELIVERY_META_LIMIT) {
      recentDeliveryMeta.push(compactMeta);
    }
  }

  return { previousDeliveryTexts, recentDeliveryMeta };
}

function compactEmployeeRange(value: unknown) {
  const parsed = parseMaybeJsonValue(value);
  const record = asRecord(parsed);
  if (record) {
    const start = record.start ?? record.min ?? record.from ?? record.lower;
    const end = record.end ?? record.max ?? record.to ?? record.upper;
    if (start && end) return `${start}-${end} employees`;
    if (start) return `${start}+ employees`;
    if (end) return `up to ${end} employees`;
  }
  if (Array.isArray(parsed)) {
    return parsed
      .slice(0, 2)
      .map((item) => cleanText(item, 80))
      .filter(Boolean)
      .join("-");
  }
  return cleanText(parsed, 120);
}

function compactJsonish(value: unknown, maxLength = 360) {
  const parsed = parseMaybeJsonValue(value);
  if (isEmptyForLlm(parsed)) return "";
  if (typeof parsed === "string") return normalizeMultiline(parsed, maxLength);
  const record = asRecord(parsed);
  if (record) {
    const parts: string[] = [];
    for (const [key, item] of Object.entries(record)) {
      const text = cleanText(item, 120);
      if (text) parts.push(`${key}:${text}`);
      if (parts.join(" | ").length >= maxLength) break;
    }
    if (parts.length > 0) return parts.join(" | ").slice(0, maxLength).trim();
  }
  if (Array.isArray(parsed)) {
    const parts = parsed
      .slice(0, 8)
      .map((item) => cleanText(item, 120))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(", ").slice(0, maxLength).trim();
  }
  return JSON.stringify(parsed).slice(0, maxLength).trim();
}

async function buildLlmUserProfile(args: {
  activitySummaries: Awaited<
    ReturnType<typeof fetchRecentTalentActivitySummaries>
  >;
  admin: AdminClient;
  conversationId: string;
  existingExternalRecommendations: PreviousExternalRecommendation[];
  insights: unknown;
  profile: JobPostingTalentUserProfile | null;
  recentRecommendations: RecentRecommendationRow[];
  setting: JobPostingTalentSetting | null;
  structuredProfile: Awaited<ReturnType<typeof fetchTalentStructuredProfile>>;
  userId: string;
}) {
  const settingRecord = asRecord(args.setting);
  const profileRecord = asRecord(args.profile);
  const redactionTerms = previousExternalRedactionTerms(
    args.existingExternalRecommendations
  );
  const resumeLinks = coerceList(profileRecord?.resume_links, 20);
  const extras = args.structuredProfile.talentExtras ?? [];
  const hasResume = Boolean(
    cleanText(profileRecord?.resume_file_name, 1) || resumeLinks.length > 0
  );
  const hasLinkedIn = containsLinkedIn(resumeLinks) || containsLinkedIn(extras);
  const conversation = await fetchRecentConversationSummaries({
    admin: args.admin,
    conversationId: args.conversationId,
    userId: args.userId,
  });

  const llmUserProfile = {
    activityEvents: args.activitySummaries
      .slice(0, 10)
      .map(compactActivityEvent)
      .filter(Boolean),
    conversation,
    educations: compactTimelineRows(
      args.structuredProfile.talentEducations.map((row) => ({
        degree: row.degree,
        description: row.description,
        end_date: row.end_date,
        field: row.field,
        memo: row.memo,
        school: row.school,
        start_date: row.start_date,
      })),
      8
    ),
    experiences: compactTimelineRows(
      args.structuredProfile.talentExperiences.map((row) => ({
        companyName: row.company_name,
        description: row.description,
        end_date: row.end_date,
        memo: row.memo,
        role: row.role,
        start_date: row.start_date,
      })),
      12,
      { descriptionMaxLength: TALENT_EXPERIENCE_DESCRIPTION_MAX_LENGTH }
    ),
    extra: {
      talentExtras: extras.slice(0, 12).map((item) =>
        cleanEmptyValues({
          date: compactDates(cleanText(item.date, 80), "date"),
          description: normalizeMultiline(item.description, 500),
          memo: normalizeMultiline(item.memo, 300),
          title: cleanText(item.title, 160),
        })
      ),
    },
    feedbackSignals: compactFeedbackSignals(
      args.recentRecommendations,
      redactionTerms
    ),
    insights: compactInsightsForLlm(args.insights),
    profile: cleanEmptyValues({
      bio: normalizeMultiline(profileRecord?.bio, 800),
      headline: cleanText(profileRecord?.headline, 240),
      location: cleanText(profileRecord?.location, 160),
      name: cleanText(profileRecord?.name, 160),
    }),
    recentRecommendations: args.recentRecommendations
      .map((item) => compactRecentRecommendation(item, redactionTerms))
      .filter(Boolean),
    resume: cleanEmptyValues({
      fileName: cleanText(profileRecord?.resume_file_name, 180),
      hasLinkedIn,
      hasResume,
      profileLinks: compactProfileLinks(resumeLinks),
    }),
    settings: cleanEmptyValues({
      blockedCompanies: normalizeTalentBlockedCompanies(
        settingRecord?.blocked_companies ?? []
      ).slice(0, 20),
      engagementTypes: compactStringList(
        settingRecord?.engagement_types,
        8,
        120
      ),
      workModes: compactStringList(
        firstPresent(settingRecord, [
          "work_mode",
          "preferred_work_mode",
          "work_modes",
        ]),
        8,
        120
      ),
    }),
  };

  return cleanEmptyValues(llmUserProfile) as JsonRecord;
}

function inferKeywordWeight(term: string) {
  const lowered = term.toLowerCase();
  if (
    [
      "voice",
      "audio",
      "tts",
      "speech",
      "llm",
      "agent",
      "rag",
      "multimodal",
      "generative",
    ].some((token) => lowered.includes(token))
  ) {
    return 3.5;
  }
  if (
    ["research", "machine learning", "ml", "ai"].some((token) =>
      lowered.includes(token)
    )
  ) {
    return 2.2;
  }
  if (
    ["engineer", "developer", "software"].some((token) =>
      lowered.includes(token)
    )
  ) {
    return 1.1;
  }
  return 1.5;
}

function normalizeFtsKeywords(raw: unknown, fallbackText: string) {
  const result: FtsKeyword[] = [];
  const seen = new Set<string>();
  for (const item of coerceList(raw, MAX_FTS_KEYWORDS)) {
    const record = asRecord(item);
    if (!record) continue;
    const terms: string[] = [];
    for (const term of coerceList(record.terms, MAX_FTS_TERMS_PER_KEYWORD)) {
      const text = cleanText(term, 80);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      terms.push(text);
    }
    if (terms.length > 0) {
      result.push({
        terms,
        weight: clampNumber(record.weight, 0.5, 5, 1),
      });
    }
  }
  if (result.length === 0) {
    for (const term of fallbackText.match(
      /[A-Za-z0-9가-힣][A-Za-z0-9가-힣.+#-]{1,}/g
    ) ?? []) {
      if (result.length >= MAX_FTS_KEYWORDS) break;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ terms: [term], weight: inferKeywordWeight(term) });
    }
  }
  return result.length > 0 ? result : [{ terms: ["engineer"], weight: 1 }];
}

function cleanRoleTitle(value: unknown) {
  return cleanText(value, 80).replace(/[%_]+/g, " ").replace(/\s+/g, " ");
}

function isLikelyRoleTitle(value: string) {
  const lowered = value.toLocaleLowerCase("ko-KR");
  return /engineer|developer|scientist|research|researcher|manager|designer|analyst|architect|founder|founding|lead|owner|consultant|sales|recruiter|marketer|writer|editor|intern|backend|frontend|front-end|fullstack|full-stack|product|pm|po|개발|엔지니어|연구|리서치|매니저|매니지|기획|디자이너|분석|세일즈|영업|마케팅|인턴|백엔드|프론트엔드|풀스택|공무원/.test(
    lowered
  );
}

function normalizeRoleTitles(
  raw: unknown,
  ftsKeywords: FtsKeyword[],
  fallbackText: string
) {
  const candidates = asStringArray(raw, MAX_ROLE_TITLES * 2, 80)
    .map(cleanRoleTitle)
    .filter((title) => title && isLikelyRoleTitle(title));
  if (candidates.length === 0) {
    for (const keyword of ftsKeywords) {
      for (const term of keyword.terms) {
        const title = cleanRoleTitle(term);
        if (title && isLikelyRoleTitle(title)) candidates.push(title);
        if (candidates.length >= MAX_ROLE_TITLES * 2) break;
      }
      if (candidates.length >= MAX_ROLE_TITLES * 2) break;
    }
  }
  if (candidates.length === 0) {
    for (const match of fallbackText.matchAll(
      /[A-Za-z가-힣][A-Za-z가-힣0-9.+#/-]*(?:\s+[A-Za-z가-힣][A-Za-z가-힣0-9.+#/-]*){0,3}/g
    )) {
      const title = cleanRoleTitle(match[0]);
      if (title && isLikelyRoleTitle(title)) candidates.push(title);
      if (candidates.length >= MAX_ROLE_TITLES * 2) break;
    }
  }

  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const title = cleanRoleTitle(candidate);
    if (!title) continue;
    const key = title.toLocaleLowerCase("ko-KR");
    if (!unique.has(key)) unique.set(key, title);
  }

  const result: string[] = [];
  for (const title of Array.from(unique.values()).sort(
    (a, b) => a.length - b.length
  )) {
    const key = title.toLocaleLowerCase("ko-KR");
    if (
      result.some((existing) =>
        key.includes(existing.toLocaleLowerCase("ko-KR"))
      )
    ) {
      continue;
    }
    result.push(title);
    if (result.length >= MAX_ROLE_TITLES) break;
  }

  return result.length > 0 ? result : ["Engineer"];
}

function entryPreferenceField(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    const number = Number(value);
    if (number === -1 || number === 0 || number === 1) {
      return number as EntryPreference;
    }
    const text = cleanText(value, 80).toLocaleLowerCase("ko-KR");
    if (
      ["non-entry", "mid", "senior", "staff", "principal", "시니어"].some(
        (token) => text.includes(token)
      )
    ) {
      return -1;
    }
    if (
      ["entry", "entry-level", "junior", "new grad", "신입", "주니어"].some(
        (token) => text.includes(token)
      )
    ) {
      return 1;
    }
    if (["neutral", "unknown", "none", "상관없음"].includes(text)) return 0;
  }
  return 0;
}

function normalizeExternalSearchPlan(
  raw: JsonRecord | null,
  request: string,
  outputLanguage = "Korean"
): ExternalSearchPlan {
  const locale = outputLanguage === "English" ? "en" : "ko";
  const source = asRecord(raw?.external) ?? raw ?? {};
  const fallbackText = cleanText(request, 500) || "engineer";
  const ftsKeywords = normalizeFtsKeywords(source.ftsKeywords, fallbackText);
  const rawLocations = asStringArray(source.locations, 8, 120);
  const geoLocations = rawLocations.filter(
    (location) => !isRemoteLocationTerm(location)
  );
  const hasRemoteLocation = rawLocations.length > geoLocations.length;
  const explicitRemoteOnly = booleanField(
    source,
    "remoteOnly",
    "remote_only",
    "isRemoteOnly",
    "is_remote_only"
  );
  const remoteOnly =
    explicitRemoteOnly ?? (hasRemoteLocation && geoLocations.length === 0);
  const explicitIncludeRemote = booleanField(
    source,
    "includeRemote",
    "include_remote"
  );
  const includeRemote =
    remoteOnly === true ? true : (explicitIncludeRemote ?? true);
  return {
    ftsKeywords,
    includeContract:
      booleanField(source, "include_contract", "includeContract") ?? false,
    includeIntern:
      booleanField(source, "include_intern", "includeIntern") ?? false,
    includeParttime:
      booleanField(source, "include_parttime", "includeParttime") ?? false,
    includeRemote,
    isPreferEntry: entryPreferenceField(
      source,
      "is_prefer_entry",
      "isPreferEntry",
      "preferEntry",
      "entryPreference"
    ),
    locations: expandLocationSearchTerms(geoLocations),
    remoteOnly,
    roleTitles: normalizeRoleTitles(
      source.role_titles ?? source.roleTitles,
      ftsKeywords,
      fallbackText
    ),
    searchIntentSummary:
      cleanText(source.searchIntentSummary ?? raw?.searchIntentSummary, 260) ||
      careerT(
        locale,
        "career.job_posting_recommendations.search_plan.intent_fallback",
        "현재 유저 요청에 맞는 external job posting을 찾는다."
      ),
  };
}

async function buildSearchPlan(args: {
  llmUserProfile: JsonRecord;
  outputLanguage: string;
  previousDeliveryTexts: string[];
  recentDeliveryMeta: string[];
  request: string;
}) {
  const raw = await runTalentAssistantCompletion({
    anthropicOverloadFallbackModel:
      RECOMMEND_JOB_POSTINGS_ANTHROPIC_OVERLOAD_FALLBACK_MODEL,
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
      {
        role: "system",
        content: `User-facing output language: ${args.outputLanguage}. Write searchIntentSummary in ${args.outputLanguage}. Retrieval keywords may still mix Korean and English when useful for search recall.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          config: {
            externalSearchLimit: MAX_SEARCH_RESULTS,
            sourceType: "external_only",
          },
          previousDeliveryTexts: args.previousDeliveryTexts,
          recentDeliveryMeta: args.recentDeliveryMeta,
          request: args.request,
          user_profile: args.llmUserProfile,
        }),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_PLAN_MODEL,
    temperature: CAREER_LLM_CONFIG.recommendJobPostings.planTemperature,
    usageLabel: "career_tool:recommend_job_postings:plan",
  });

  return normalizeExternalSearchPlan(
    parseJsonObject(raw),
    args.request,
    args.outputLanguage
  );
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function sqlNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "1";
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
  if (groups.length === 0) return "websearch_to_tsquery('simple', 'engineer')";
  return groups.length === 1 ? groups[0] : `(${groups.join(" || ")})`;
}

function ftsRankSql(keywords: FtsKeyword[], vectorSql: string) {
  const parts = keywords
    .map((keyword) => {
      const query = ftsKeywordQuerySql(keyword);
      if (!query) return null;
      return `${sqlNumber(keyword.weight)} * ts_rank_cd(${FTS_RANK_WEIGHTS}, ${vectorSql}, ${query})`;
    })
    .filter((sql): sql is string => Boolean(sql));
  return parts.length > 0 ? `(${parts.join(" + ")})` : "0";
}

function buildBlockedCompanySql(blockedCompanies: string[]) {
  return blockedCompanies
    .map((company) => cleanText(company, 100))
    .filter(Boolean)
    .slice(0, 20)
    .map(
      (company) =>
        `(COALESCE(cw.company_name, '') NOT ILIKE ${sqlLiteral(
          `%${company}%`
        )} AND COALESCE(cd.name, '') NOT ILIKE ${sqlLiteral(`%${company}%`)})`
    );
}

function buildRoleTitleSql(roleTitles: string[]) {
  const parts = roleTitles
    .map(cleanRoleTitle)
    .filter(Boolean)
    .slice(0, MAX_ROLE_TITLES)
    .map((title) => `COALESCE(cr.name, '') ILIKE ${sqlLiteral(`%${title}%`)}`);
  return parts.length > 0 ? [`(${parts.join(" OR ")})`] : [];
}

function buildExcludedEmploymentTypeSql(types: string[]) {
  const literals = types.map((type) => sqlLiteral(type)).join(", ");
  return `NOT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(cr.type, ARRAY[]::text[])) AS role_type(type_value)
    WHERE LOWER(BTRIM(role_type.type_value)) IN (${literals})
  )`;
}

function buildEmploymentTypeSql(plan: ExternalSearchPlan) {
  const clauses: string[] = [];
  if (!plan.includeContract) {
    clauses.push(
      buildExcludedEmploymentTypeSql([
        "contract",
        "contractor",
        "계약",
        careerT("ko", "career.common.career_history_panel.1rvnrzl", "계약직"),
      ])
    );
  }
  if (!plan.includeIntern) {
    clauses.push(
      buildExcludedEmploymentTypeSql([
        "internship",
        "intern",
        careerT("ko", "career.common.career_history_panel.0sbhtqh", "인턴"),
      ])
    );
  }
  if (!plan.includeParttime) {
    clauses.push(
      buildExcludedEmploymentTypeSql([
        "part_time",
        "part-time",
        "part time",
        careerT("ko", "career.common.career_history_panel.090irfh", "파트타임"),
      ])
    );
  }
  return clauses;
}

function entryPreferenceRankSql(
  preference: EntryPreference,
  roleNameSql = "cr.name",
  seniorityLevelSql = "cr.seniority_level"
) {
  if (preference === 1) {
    return `(CASE
      WHEN LOWER(COALESCE(${seniorityLevelSql}, '')) ~ '(entry|junior|new[ _-]?grad|신입|주니어)'
        OR COALESCE(${roleNameSql}, '') ILIKE '%entry%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%junior%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%new grad%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%신입%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%주니어%'
      THEN 0.8
      WHEN LOWER(COALESCE(${seniorityLevelSql}, '')) ~ '(senior|staff|principal|lead|head|manager|시니어|리드)'
        OR COALESCE(${roleNameSql}, '') ILIKE '%senior%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%staff%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%principal%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%lead%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%head%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%manager%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%시니어%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%리드%'
      THEN -0.4
      ELSE 0
    END)`;
  }
  if (preference === -1) {
    return `(CASE
      WHEN LOWER(COALESCE(${seniorityLevelSql}, '')) ~ '(senior|staff|principal|lead|head|manager|시니어|리드)'
        OR COALESCE(${roleNameSql}, '') ILIKE '%senior%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%staff%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%principal%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%lead%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%head%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%manager%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%시니어%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%리드%'
      THEN 0.4
      WHEN LOWER(COALESCE(${seniorityLevelSql}, '')) ~ '(entry|junior|new[ _-]?grad|신입|주니어)'
        OR COALESCE(${roleNameSql}, '') ILIKE '%entry%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%junior%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%new grad%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%신입%'
        OR COALESCE(${roleNameSql}, '') ILIKE '%주니어%'
      THEN -0.4
      ELSE 0
    END)`;
  }
  return "0";
}

function expandLocationSearchTerms(locations: string[]) {
  const terms: string[] = [];
  const seen = new Set<string>();
  let shouldAddSeoul = false;
  for (const location of locations) {
    const text = cleanText(location, 100);
    if (!text) continue;
    const key = text.toLocaleLowerCase("ko-KR");
    if (key === "seoul" || key === "korea") shouldAddSeoul = true;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(text);
  }
  if (shouldAddSeoul && !seen.has("서울")) terms.push("서울");
  return terms;
}

function isRemoteLocationTerm(location: string) {
  return location.toLocaleLowerCase("ko-KR") === "remote";
}

function buildLocationSql(plan: ExternalSearchPlan) {
  const locationParts = expandLocationSearchTerms(plan.locations)
    .map((location) => cleanText(location, 100))
    .filter(Boolean)
    .slice(0, 12)
    .map((location) => {
      const pattern = sqlLiteral(`%${location}%`);
      return `COALESCE(cr.location_text, '') ILIKE ${pattern}`;
    });
  const remotePart = "LOWER(COALESCE(cr.work_mode, '')) = 'remote'";
  const excludeRemotePart = "LOWER(COALESCE(cr.work_mode, '')) <> 'remote'";
  if (plan.remoteOnly) {
    return [
      remotePart,
      ...(locationParts.length > 0 ? [`(${locationParts.join(" OR ")})`] : []),
    ];
  }
  return [
    ...(locationParts.length > 0 ? [`(${locationParts.join(" OR ")})`] : []),
    ...(plan.includeRemote ? [] : [excludeRemotePart]),
  ];
}

function previouslyRecommendedRoleExclusionSql(userId: string) {
  const normalizedUserId = cleanText(userId, 120);
  if (!normalizedUserId || !isUuid(normalizedUserId)) return null;
  return `NOT EXISTS (
    SELECT 1
    FROM public.talent_opportunity_recommendation tor
    WHERE tor.talent_id = ${sqlLiteral(normalizedUserId)}::uuid
      AND tor.opportunity_type = ${sqlLiteral(OpportunityType.ExternalJd)}
      AND tor.role_id = cr.role_id
  )`;
}

function buildRoleSearchSql(args: {
  blockedCompanies: string[];
  plan: ExternalSearchPlan;
  searchMode: RoleSearchMode;
  userId: string;
}) {
  const ftsQuerySql = ftsAnyQuerySql(args.plan.ftsKeywords);
  const companyTestScoreRankSql = `COALESCE(tc.company_test_score, 0) / ${COMPANY_TEST_SCORE_SEARCH_RANK_DIVISOR}.0`;
  const searchRankSql = `(${ftsRankSql(args.plan.ftsKeywords, "tc.opportunity_search_tsv")} + ${companyTestScoreRankSql} + ${entryPreferenceRankSql(args.plan.isPreferEntry, "tc.role_name", "tc.seniority_level")})`;
  const where = [
    "COALESCE(cr.is_expired, false) = false",
    "(cr.expires_at IS NULL OR cr.expires_at > now())",
    "cr.status NOT IN ('expired', 'closed', 'inactive', 'archived')",
    "cr.source_type = 'external'",
    previouslyRecommendedRoleExclusionSql(args.userId),
    ...buildBlockedCompanySql(args.blockedCompanies),
    ...buildEmploymentTypeSql(args.plan),
    ...buildRoleTitleSql(args.plan.roleTitles),
    ...buildLocationSql(args.plan),
  ].filter((sql): sql is string => Boolean(sql));

  return `
WITH fts AS (
  SELECT ${ftsQuerySql} AS query
),
title_candidates AS MATERIALIZED (
  SELECT
    cr.role_id::text AS role_id,
    cr.company_workspace_id::text AS company_workspace_id,
    cr.name AS role_name,
    cr.description,
    cr.opportunity_search_tsv,
    cr.external_jd_url,
    cr.location_text,
    cr.work_mode,
    cr.type,
    cr.posted_at,
    cr.seniority_level,
    cr.updated_at AS role_updated_at,
    cw.company_name,
    cw.company_description,
    cw.test_score AS company_test_score,
    cd.name AS company_db_name,
    cd.description AS company_db_description,
    cd.short_description AS company_db_short_description,
    cd.location AS company_db_location,
    cd.founded_year AS company_db_founded_year,
    cd.employee_count_range AS company_db_employee_count_range
  FROM public.company_roles cr
  JOIN public.company_workspace cw
    ON cw.company_workspace_id = cr.company_workspace_id
  LEFT JOIN public.company_db cd
    ON cd.id = cw.company_db_id
  WHERE ${where.join("\n    AND ")}
),
candidates AS (
  SELECT
    tc.role_id,
    tc.company_workspace_id,
    tc.role_name,
    tc.description,
    tc.external_jd_url,
    tc.location_text,
    tc.work_mode,
    tc.type,
    tc.posted_at,
    tc.seniority_level,
    tc.role_updated_at,
    tc.company_name,
    tc.company_description,
    tc.company_test_score,
    tc.company_db_name,
    tc.company_db_description,
    tc.company_db_short_description,
    tc.company_db_location,
    tc.company_db_founded_year,
    tc.company_db_employee_count_range,
    ${searchRankSql} AS search_rank
  FROM title_candidates tc
  JOIN fts
    ON tc.opportunity_search_tsv @@ fts.query
),
ranked_candidates AS (
  SELECT
    candidates.*,
    ROW_NUMBER() OVER (
      PARTITION BY company_workspace_id
      ORDER BY
        search_rank DESC,
        company_test_score DESC NULLS LAST,
        posted_at DESC NULLS LAST,
        role_updated_at DESC NULLS LAST
    ) AS company_workspace_role_rank
  FROM candidates
)
SELECT
  role_id,
  company_workspace_id,
  role_name,
  description,
  external_jd_url,
  location_text,
  work_mode,
  type,
  posted_at,
  seniority_level,
  company_name,
  company_description,
  company_test_score,
  company_db_name,
  company_db_description,
  company_db_short_description,
  company_db_location,
  company_db_founded_year,
  company_db_employee_count_range,
  search_rank
FROM ranked_candidates
WHERE company_workspace_role_rank <= ${SEARCH_COMPANY_WORKSPACE_ROLE_CAP}
ORDER BY
  search_rank DESC,
  company_test_score DESC NULLS LAST,
  posted_at DESC NULLS LAST,
  role_updated_at DESC NULLS LAST
`.trim();
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
  const record = asRecord(parsed);
  if (!record) return null;
  for (const key of RPC_WRAPPER_KEYS) {
    const nested = unwrapRpcArray(record[key]);
    if (nested) return nested;
  }
  const entries = Object.entries(record);
  if (entries.length === 1) return unwrapRpcArray(entries[0][1]);
  return null;
}

function flattenRpcRows(value: unknown): unknown[] {
  const parsed = parseMaybeJsonValue(value);
  const topLevel = Array.isArray(parsed) ? parsed : [parsed];
  const rows: unknown[] = [];
  for (const item of topLevel) {
    const unwrappedArray = unwrapRpcArray(item);
    if (unwrappedArray) rows.push(...unwrappedArray);
    else if (item !== null && item !== undefined)
      rows.push(parseMaybeJsonValue(item));
  }
  return rows;
}

function stringField(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function numberField(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function stringArrayField(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = parseMaybeJsonValue(record[key]);
    if (Array.isArray(value)) {
      return value.map((item) => cleanText(item, 120)).filter(Boolean);
    }
    if (typeof value === "string" && value) return [value];
  }
  return null;
}

function booleanField(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (typeof value === "boolean") return value;
    const text = cleanText(value, 20).toLocaleLowerCase("ko-KR");
    if (["true", "1", "yes", "y"].includes(text)) return true;
    if (["false", "0", "no", "n"].includes(text)) return false;
  }
  return null;
}

function normalizeCompanyTestScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(COMPANY_TEST_SCORE_MAX, number));
}

function normalizeRoleRow(value: unknown): RawRoleRow | null {
  const record = asRecord(parseMaybeJsonValue(value));
  if (!record) return null;
  return {
    company_db_description: stringField(
      record,
      "company_db_description",
      "companyDbDescription"
    ),
    company_db_employee_count_range:
      record.company_db_employee_count_range ??
      record.companyDbEmployeeCountRange,
    company_db_founded_year: stringField(
      record,
      "company_db_founded_year",
      "companyDbFoundedYear"
    ),
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
    location_text: stringField(record, "location_text", "locationText"),
    posted_at: stringField(record, "posted_at", "postedAt"),
    role_id: stringField(record, "role_id", "roleId"),
    role_name: stringField(record, "role_name", "roleName", "name"),
    search_rank: numberField(record, "search_rank", "searchRank"),
    seniority_level: stringField(record, "seniority_level", "seniorityLevel"),
    type: stringArrayField(record, "type"),
    work_mode: stringField(record, "work_mode", "workMode"),
  };
}

function hasRoleData(row: RawRoleRow | null): row is RawRoleRow {
  return Boolean(
    row &&
    (cleanText(row.role_id, 120) ||
      cleanText(row.role_name, 120) ||
      cleanText(row.company_name, 120) ||
      cleanText(row.company_db_name, 120) ||
      cleanText(row.description, 120))
  );
}

async function executeRoleSql(args: {
  admin: AdminClient;
  blockedCompanies: string[];
  plan: ExternalSearchPlan;
  searchMode: RoleSearchMode;
  userId: string;
}) {
  const startedAt = Date.now();
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
    debugLog("role sql error", {
      durationMs: Date.now() - startedAt,
      message: error.message,
      searchMode: args.searchMode,
      sql,
    });
    throw new Error(
      `[${args.searchMode} role sql] ${
        error.message ?? "Failed to search company roles"
      }`
    );
  }
  const rawRows = flattenRpcRows(data);
  const rows = rawRows.map(normalizeRoleRow).filter(hasRoleData);
  infoJson("role sql completed", {
    durationMs: Date.now() - startedAt,
    rawCount: rawRows.length,
    rowCount: rows.length,
    searchMode: args.searchMode,
  });
  return {
    rawRows,
    rows,
    rpcContainerCount: Array.isArray(data) ? data.length : null,
    sql,
  };
}

function companyKey(value: unknown) {
  return cleanText(value, 180)
    .toLocaleLowerCase("ko-KR")
    .replace(/[^a-z0-9가-힣]+/g, "");
}

function roleTitleKey(value: unknown) {
  return cleanText(value, 180)
    .toLocaleLowerCase("ko-KR")
    .replace(/[^a-z0-9가-힣+#/ ]+/g, "")
    .trim();
}

function roleFingerprint(companyName: unknown, roleName: unknown) {
  const company = companyKey(companyName);
  const role = roleTitleKey(roleName);
  return company && role ? `${company}::${role}` : "";
}

function filterPreviouslyRecommendedExternalRows(
  rows: RawRoleRow[],
  existing: PreviousExternalRecommendation[]
) {
  const existingIds = new Set(
    existing.map((item) => item.roleId).filter(Boolean)
  );
  const existingFingerprints = new Set(
    existing
      .map((item) => roleFingerprint(item.companyName, item.roleName))
      .filter(Boolean)
  );
  return rows.filter((row) => {
    const roleId = cleanText(row.role_id, 120);
    const fingerprint = roleFingerprint(
      row.company_name ?? row.company_db_name,
      row.role_name
    );
    return (
      (!roleId || !existingIds.has(roleId)) &&
      (!fingerprint || !existingFingerprints.has(fingerprint))
    );
  });
}

function roleRowsToCards(rows: RawRoleRow[]) {
  return rows.map(roleCard);
}

function roleCard(row: RawRoleRow): RoleCard {
  const companyScore = normalizeCompanyTestScore(row.company_test_score);
  return {
    company: {
      description:
        normalizeMultiline(row.company_description, 900) ||
        normalizeMultiline(row.company_db_description, 900) ||
        null,
      employeeCountRange: row.company_db_employee_count_range,
      foundedYear: row.company_db_founded_year ?? null,
      location: row.company_db_location ?? null,
      shortDescription: row.company_db_short_description ?? null,
    },
    companyName: row.company_name ?? row.company_db_name ?? null,
    companyWorkspaceId: cleanText(row.company_workspace_id, 120),
    employmentType: Array.isArray(row.type) ? row.type.join(", ") : null,
    location: row.location_text ?? null,
    postedAt: row.posted_at ?? null,
    roleDescription: normalizeMultiline(row.description, 4000),
    roleId: cleanText(row.role_id, 120),
    roleName: cleanText(row.role_name, 180),
    row,
    score: companyScore,
    searchRank: Number(row.search_rank ?? 0) || 0,
    seniorityLevel: cleanText(row.seniority_level, 120) || null,
    workMode: cleanText(row.work_mode, 100) || null,
  };
}

function normalizeExternalFitCacheScore100(meta: JsonRecord) {
  const raw =
    meta.score ?? meta.score100 ?? meta.fitScore ?? meta.fit_score ?? null;
  const number = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(number)) return 0;
  const score100 = number >= 0 && number <= 1 ? number * 100 : number;
  return Math.round(clampNumber(score100, 0, 100, 0));
}

function normalizeExternalFitCacheReason(meta: JsonRecord) {
  const direct =
    normalizeMultiline(meta.reason ?? meta.fitReason ?? meta.fit_reason, 900) ||
    "";
  if (direct) return direct;
  return coerceList(meta.fitReasons ?? meta.fit_reasons, 3)
    .map((item) => normalizeMultiline(item, 300))
    .filter(Boolean)
    .join(" ");
}

function normalizeExternalFitCacheTradeoff(meta: JsonRecord) {
  const direct = normalizeMultiline(
    meta.tradeoff ?? meta.tradeoffs ?? meta.concerns ?? meta.tradeOffs,
    320
  );
  if (direct) return direct;
  return (
    coerceList(meta.tradeoff ?? meta.tradeoffs ?? meta.concerns, 1)
      .map((item) => normalizeMultiline(item, 320))
      .find(Boolean) ?? ""
  );
}

function normalizeExternalFitCache(
  metaValue: unknown,
  createdAtValue: unknown
): ExternalFitCache | null {
  const meta = asRecord(parseMaybeJsonValue(metaValue));
  if (!meta) return null;
  const fitSummary = normalizeMultiline(
    meta.fitSummary ?? meta.fit_summary,
    1000
  );
  const reason = normalizeExternalFitCacheReason(meta);
  const tradeoff = normalizeExternalFitCacheTradeoff(meta);
  if (!fitSummary && !reason && !tradeoff) return null;
  return {
    createdAt: cleanText(createdAtValue, 120) || null,
    fitSummary,
    reason,
    score100: normalizeExternalFitCacheScore100(meta),
    tradeoff,
  };
}

async function fetchRecentExternalFitCache(args: {
  admin: AdminClient;
  roleIds: string[];
  userId: string;
}) {
  const roleIds = Array.from(
    new Set(args.roleIds.map((roleId) => cleanText(roleId, 120)))
  ).filter(isUuid);
  if (roleIds.length === 0) return new Map<string, ExternalFitCache>();

  const cutoff = new Date(
    Date.now() - EXTERNAL_FIT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const { data, error } = await ((
      args.admin.from("talent_external_fit" as any) as any
    )
      .select("role_id, meta, created_at")
      .eq("talent_id", args.userId)
      .gte("created_at", cutoff)
      .in("role_id", roleIds) as unknown as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>);

    if (error) {
      infoJson("external fit cache fetch failed", {
        message: error.message,
        requestedRoleCount: roleIds.length,
      });
      return new Map<string, ExternalFitCache>();
    }

    const result = new Map<string, ExternalFitCache>();
    for (const row of Array.isArray(data) ? data : []) {
      const record = asRecord(row);
      const roleId = cleanText(record?.role_id, 120);
      const cache = normalizeExternalFitCache(record?.meta, record?.created_at);
      if (roleId && cache) result.set(roleId, cache);
    }
    return result;
  } catch (error) {
    infoJson("external fit cache fetch failed", {
      message: error instanceof Error ? error.message : String(error),
      requestedRoleCount: roleIds.length,
    });
    return new Map<string, ExternalFitCache>();
  }
}

function attachExternalFitCache(
  cards: RoleCard[],
  cacheByRoleId: Map<string, ExternalFitCache>
) {
  return cards.map((card) => {
    const cache = cacheByRoleId.get(card.roleId);
    return cache ? { ...card, externalFitCache: cache } : card;
  });
}

function selectCachedHighScoreShortlist(
  cards: RoleCard[],
  selectionLimit: number
) {
  const highScoreCachedCards = cards.filter(
    (card) =>
      (card.externalFitCache?.score100 ?? -1) >=
      EXTERNAL_FIT_CACHE_SHORTLIST_SKIP_MIN_SCORE100
  );
  if (
    highScoreCachedCards.length < EXTERNAL_FIT_CACHE_SHORTLIST_SKIP_MIN_COUNT
  ) {
    return null;
  }
  return [...highScoreCachedCards]
    .sort((left, right) => {
      const scoreDiff =
        (right.externalFitCache?.score100 ?? 0) -
        (left.externalFitCache?.score100 ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      if (right.searchRank !== left.searchRank) {
        return right.searchRank - left.searchRank;
      }
      return (right.score ?? 0) - (left.score ?? 0);
    })
    .slice(0, selectionLimit);
}

function compactDateForRoleCard(value: unknown) {
  const text = cleanText(value, 120);
  if (!text) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function compactFloat(value: unknown, digits = 3) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function nonemptyJoin(parts: string[], sep = " | ") {
  return parts.filter((part) => cleanText(part, 200)).join(sep);
}

function workModeLineForLlm(value: unknown) {
  const workMode = cleanText(value, 120) || "unknown(usually onsite)";
  return `work mode: ${workMode}`;
}

function seniorityLevelLineForLlm(value: unknown) {
  const seniorityLevel = cleanText(value, 120) || "unknown";
  return `seniority level: ${seniorityLevel}`;
}

function roleLineForLlm(card: RoleCard, includePostedAt = true) {
  const role = cleanText(card.roleName, 180) || "Unknown role";
  const company = cleanText(card.companyName, 180) || "Unknown company";
  const details: string[] = [];
  if (card.location) details.push(`work at ${card.location}`);
  details.push(workModeLineForLlm(card.workMode));
  const employmentType = cleanText(card.employmentType, 120);
  if (employmentType) details.push(employmentType);
  details.push(seniorityLevelLineForLlm(card.seniorityLevel));
  const postedAt = includePostedAt ? compactDateForRoleCard(card.postedAt) : "";
  if (postedAt) details.push(`posted ${postedAt}`);
  const suffix = details.length > 0 ? ` | ${nonemptyJoin(details)}` : "";
  return `external : ${role} at ${company}${suffix}`;
}

function companyLineForLlm(card: RoleCard, includeScore: boolean) {
  const companyName = cleanText(card.companyName, 180) || "Unknown company";
  const parts: string[] = [];
  const shortDescription = normalizeMultiline(
    card.company.shortDescription,
    420
  );
  const employeeRange = compactEmployeeRange(card.company.employeeCountRange);
  const location = cleanText(card.company.location, 120);
  const foundedYear = cleanText(card.company.foundedYear, 40);
  if (shortDescription) parts.push(shortDescription);
  if (employeeRange) parts.push(employeeRange);
  if (location) parts.push(`HQ ${location}`);
  if (foundedYear) parts.push(`founded ${foundedYear}`);
  if (includeScore && card.score !== null) {
    parts.push(`company_score ${compactFloat(card.score, 2)}`);
  }
  const body = nonemptyJoin(parts);
  return body ? `${companyName} : ${body}` : companyName;
}

function roleSearchResultCard(card: RoleCard) {
  return {
    id: card._shortlistCandidateId,
    company: companyLineForLlm(card, true),
    retrievalFtsScore: compactFloat(card.searchRank, 3),
    role: roleLineForLlm(card),
  };
}

function roleDetailCardForLlm(card: RoleCard) {
  return cleanEmptyValues({
    company: companyLineForLlm(card, false),
    jd: normalizeMultiline(card.roleDescription, 4000),
    role: roleLineForLlm(card),
    roleId: card.roleId,
  }) as JsonRecord;
}

function roleFinalSelectionCardForLlm(card: RoleCard) {
  const cached = card.externalFitCache;
  if (!cached) return roleDetailCardForLlm(card);
  return cleanEmptyValues({
    cachedExternalFit: {
      fitSummary: cached.fitSummary,
      reason: cached.reason,
      score: cached.score100,
      tradeoff: cached.tradeoff,
    },
    company: companyLineForLlm(card, false),
    role: roleLineForLlm(card),
    roleId: card.roleId,
  }) as JsonRecord;
}

function capRolesPerCompany(cards: RoleCard[], perCompanyLimit: number) {
  const counts = new Map<string, number>();
  const visible: RoleCard[] = [];
  for (const card of cards) {
    const key =
      companyKey(card.companyName) || card.companyWorkspaceId || card.roleId;
    if (key && (counts.get(key) ?? 0) >= perCompanyLimit) continue;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    visible.push({ ...card, _shortlistCandidateId: visible.length });
  }
  return visible;
}

function shortlistLimit(targetRecommendationCount: number) {
  return Math.max(
    SHORTLIST_LIMIT_MIN,
    Math.min(
      SHORTLIST_LIMIT_MAX,
      targetRecommendationCount * SHORTLIST_LIMIT_MULTIPLIER
    )
  );
}

function desiredRecommendationCount() {
  return FINAL_RECOMMENDATION_COUNT;
}

function sanitizeShortlist(
  raw: JsonRecord | null,
  cards: RoleCard[],
  limit: number
) {
  const roleIdByCandidateId = new Map<string, string>();
  const cardByRoleId = new Map<string, RoleCard>();
  for (const card of cards) {
    const candidateId =
      card._shortlistCandidateId === undefined
        ? ""
        : String(card._shortlistCandidateId);
    if (candidateId && card.roleId)
      roleIdByCandidateId.set(candidateId, card.roleId);
    if (card.roleId) cardByRoleId.set(card.roleId, card);
  }
  const selected: string[] = [];
  const selectedCompanies = new Set<string>();
  const addRole = (roleId: string) => {
    const card = cardByRoleId.get(roleId);
    if (!card || selected.includes(roleId)) return;
    const company =
      companyKey(card.companyName) || card.companyWorkspaceId || roleId;
    if (company && selectedCompanies.has(company)) return;
    selected.push(roleId);
    if (company) selectedCompanies.add(company);
  };
  const rawIds = [
    ...coerceList(raw?.selectedCandidateIds, limit),
    ...coerceList(raw?.selectedIds, limit),
    ...coerceList(raw?.selectedRoleIds, limit),
  ];
  for (const rawId of rawIds) {
    const id = cleanText(rawId, 120);
    const roleId = roleIdByCandidateId.get(id) ?? id;
    addRole(roleId);
    if (selected.length >= limit) break;
  }
  if (selected.length === 0) {
    for (const card of cards) {
      if (selected.length >= limit) break;
      addRole(card.roleId);
    }
  }
  return selected.slice(0, limit);
}

async function shortlistRoles(args: {
  cards: RoleCard[];
  llmUserProfile: JsonRecord;
  plan: ExternalSearchPlan;
  request: string;
  targetRecommendationCount: number;
}) {
  const visible = capRolesPerCompany(args.cards, SHORTLIST_COMPANY_ROLE_CAP);
  const selectionLimit = shortlistLimit(args.targetRecommendationCount);
  if (visible.length <= selectionLimit) {
    infoJson("shortlist skipped", {
      selectionLimit,
      visibleExternal: visible.length,
      reason: "visible_count_within_selection_limit",
    });
    return visible;
  }
  const raw = await runTalentAssistantCompletion({
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: SHORTLIST_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          externalCandidates: visible.map(roleSearchResultCard),
          request: args.request,
          searchPlan: args.plan,
          selectionLimit,
          user_profile: args.llmUserProfile,
        }),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_PRIMARY_MODEL,
    temperature: CAREER_LLM_CONFIG.recommendJobPostings.shortlistTemperature,
    usageLabel: "career_tool:recommend_job_postings:shortlist",
  });
  // logger.log(
  //   "\n\n\n",
  //   JSON.stringify({
  //     externalCandidates: visible.map(roleSearchResultCard),
  //     request: args.request,
  //     searchPlan: args.plan,
  //     selectionLimit,
  //     user_profile: args.llmUserProfile,
  //   }),
  //   "\n\n\n"
  // );
  const selectedRoleIds = sanitizeShortlist(
    parseJsonObject(raw),
    visible,
    selectionLimit
  );
  const byRoleId = new Map(visible.map((card) => [card.roleId, card]));
  const selected = selectedRoleIds
    .map((roleId) => byRoleId.get(roleId))
    .filter((card): card is RoleCard => Boolean(card));

  infoJson("shortlist completed", {
    selectedExternal: selected.length,
    selectionLimit,
    visibleExternal: visible.length,
    raw: parseJsonObject(raw),
  });
  debugLog("shortlist raw", { raw: raw.slice(0, 4000), selectedRoleIds });
  return selected;
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

function fallbackFitSummary(card: RoleCard) {
  const company = cleanText(card.companyName, 160) || "해당 회사";
  const title = cleanText(card.roleName, 180) || "해당 포지션";
  const companyDescription =
    normalizeMultiline(card.company.description, 260) ||
    normalizeMultiline(card.company.shortDescription, 260);
  if (companyDescription) {
    return `${company}는 ${companyDescription.replace(/[.。]$/, "")}. 이 역할은 ${title} 포지션입니다.`;
  }
  return `${company}의 ${title} 포지션입니다.`;
}

function normalizeSelectedRecommendation(
  raw: unknown,
  index: number,
  card: RoleCard
): SelectedRecommendation {
  const record = asRecord(raw) ?? {};
  const score = clampNumber(record.score, 0, 1, 0);
  const fitReasons = asStringArray(record.fitReasons, 3, 180);
  const fitSummary = cleanText(record.fitSummary, 700);
  const cachedFitSummary = cleanText(card.externalFitCache?.fitSummary, 700);
  const preferenceFit = normalizeRecommendationPreferenceFit(
    record.preferenceFit
  );
  const isSupplemental =
    fitReasons.length === 0 &&
    !fitSummary &&
    Object.keys(preferenceFit).length === 0;
  return {
    fitReasons,
    fitSummary:
      fitSummary ||
      (isSupplemental ? null : cachedFitSummary || fallbackFitSummary(card)),
    isSupplemental,
    preferenceFit,
    rank: normalizeInt(record.rank, index + 1, 1, FINAL_RECOMMENDATION_COUNT),
    roleId: card.roleId,
    score,
    tradeoffs: [],
  };
}

async function selectFinalRecommendations(args: {
  cards: RoleCard[];
  llmUserProfile: JsonRecord;
  outputLanguage: string;
  plan: ExternalSearchPlan;
  previousDeliveryTexts: string[];
  recentDeliveryMeta: string[];
  request: string;
  targetRecommendationCount: number;
}): Promise<FinalSelectionResult> {
  if (args.cards.length === 0) {
    return {
      directFitCount: 0,
      scoredCount: 0,
      selected: [],
      supplementalCount: 0,
    };
  }
  const detailedExternalCandidates = args.cards.map(
    roleFinalSelectionCardForLlm
  );
  const raw = await runTalentAssistantCompletion({
    anthropicOverloadFallbackModel:
      RECOMMEND_JOB_POSTINGS_ANTHROPIC_OVERLOAD_FALLBACK_MODEL,
    fallbackModel: RECOMMEND_JOB_POSTINGS_FALLBACK_MODEL,
    jsonMode: true,
    messages: [
      { role: "system", content: FINAL_SELECTION_SYSTEM_PROMPT },
      {
        role: "system",
        content: `User-facing output language: ${args.outputLanguage}. Write fitSummary, fitReasons, preferenceFit.note, and any other user-facing recommendation text in ${args.outputLanguage}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          detailedExternalCandidates,
          previousDeliveryTexts: args.previousDeliveryTexts,
          recentDeliveryMeta: args.recentDeliveryMeta,
          request: args.request,
          searchPlan: args.plan,
          targetRecommendationCount: args.targetRecommendationCount,
          user_profile: args.llmUserProfile,
        }),
      },
    ],
    primaryModel: RECOMMEND_JOB_POSTINGS_FINAL_SELECTION_MODEL,
    temperature:
      CAREER_LLM_CONFIG.recommendJobPostings.finalSelectionTemperature,
    usageLabel: "career_tool:recommend_job_postings:final_selection",
  });
  const parsed = parseJsonObject(raw);
  const selectedRaw = Array.isArray(parsed?.selectedRecommendations)
    ? parsed.selectedRecommendations
    : [];
  const byRoleId = new Map(args.cards.map((card) => [card.roleId, card]));
  const cardIndexByRoleId = new Map(
    args.cards.map((card, index) => [card.roleId, index])
  );
  const scored: SelectedRecommendation[] = [];
  const scoredRoleIds = new Set<string>();
  for (const item of selectedRaw) {
    const record = asRecord(item);
    const roleId = cleanText(record?.roleId, 120);
    const card = byRoleId.get(roleId);
    if (!card || scoredRoleIds.has(roleId)) continue;
    scored.push(normalizeSelectedRecommendation(record, scored.length, card));
    scoredRoleIds.add(roleId);
  }
  const orderedDirectFits = scored
    .filter((item) => !item.isSupplemental)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      if (right.score !== left.score) return right.score - left.score;
      return (
        (cardIndexByRoleId.get(left.roleId) ?? Number.MAX_SAFE_INTEGER) -
        (cardIndexByRoleId.get(right.roleId) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  const orderedSupplements = scored
    .filter((item) => item.isSupplemental)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (
        (cardIndexByRoleId.get(left.roleId) ?? Number.MAX_SAFE_INTEGER) -
        (cardIndexByRoleId.get(right.roleId) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  const selected: SelectedRecommendation[] = [];
  const seenCompanies = new Set<string>();
  const seenRoles = new Set<string>();
  const addSelection = (item: SelectedRecommendation) => {
    const card = byRoleId.get(item.roleId);
    if (!card || seenRoles.has(item.roleId)) return;
    const company =
      companyKey(card.companyName) || card.companyWorkspaceId || item.roleId;
    if (company && seenCompanies.has(company)) return;
    selected.push(item);
    seenRoles.add(item.roleId);
    if (company) seenCompanies.add(company);
  };
  for (const item of orderedDirectFits) {
    if (selected.length >= args.targetRecommendationCount) break;
    addSelection(item);
  }
  for (const item of orderedSupplements) {
    if (selected.length >= args.targetRecommendationCount) break;
    addSelection(item);
  }
  const rankedSelected = selected.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
  const supplementalCount = rankedSelected.filter(
    (item) => item.isSupplemental
  ).length;
  debugLog("final selection raw", {
    raw: raw.slice(0, 4000),
    directFitCount: rankedSelected.length - supplementalCount,
    scoredCount: scored.length,
    selectedCount: rankedSelected.length,
    supplementalCount,
  });
  return {
    directFitCount: rankedSelected.length - supplementalCount,
    scoredCount: scored.length,
    selected: rankedSelected,
    supplementalCount,
  };
}

function roleUrl(role: RawRoleRow) {
  return cleanText(role.external_jd_url, 500) || null;
}

function rankedFromSelected(
  selected: SelectedRecommendation[],
  cards: RoleCard[]
): EnrichedRankedRole[] {
  const byRoleId = new Map(cards.map((card) => [card.roleId, card]));
  return selected
    .map((item): EnrichedRankedRole | null => {
      const card = byRoleId.get(item.roleId);
      if (!card) return null;
      return {
        concerns: item.tradeoffs,
        detail: {
          fitReasons: item.fitReasons,
          preferenceFit: item.preferenceFit,
          roleOverviewText: item.fitSummary,
          tradeoffs: item.tradeoffs,
        },
        goodPoints: item.fitReasons,
        isSupplemental: item.isSupplemental,
        recommendationId: null,
        recommendationText: item.fitReasons.join(" ") || item.fitSummary,
        role: card.row,
        roleId: item.roleId,
        score: item.score * 10,
      };
    })
    .filter((item): item is EnrichedRankedRole => Boolean(item));
}

function recommendationScoreForDb(score: unknown) {
  const number = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number / 10));
}

function buildRecommendationEvidence(item: EnrichedRankedRole) {
  const role = item.role;
  return [
    {
      label: "role",
      text: normalizeMultiline(role.description, 700),
    },
    {
      label: "company",
      text:
        normalizeMultiline(role.company_description, 700) ||
        normalizeMultiline(role.company_db_description, 700) ||
        normalizeMultiline(role.company_db_short_description, 700),
    },
    {
      label: "search_intent",
      text: normalizeMultiline(item.recommendationText, 700),
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
      return {
        evidence: buildRecommendationEvidence(item),
        fit_reasons: item.detail.fitReasons.filter(Boolean),
        fit_summary: item.detail.roleOverviewText,
        kind: "recommendation",
        model_version: RECOMMEND_JOB_POSTINGS_MODEL_VERSION,
        opportunity_type: OpportunityType.ExternalJd,
        preference_fit: item.detail.preferenceFit,
        rank: index + 1,
        recommended_at: now,
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

function throwIfRecommendationSearchAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("recommend_job_postings aborted");
  error.name = "AbortError";
  throw error;
}

function formatAnswerDraft(args: {
  candidateCount: number;
  outputLanguage: string;
  plan: ExternalSearchPlan;
  recommendations: EnrichedRankedRole[];
  requestedCount: number | null;
  supplementalRecommendationCount: number;
}) {
  const locale = args.outputLanguage === "English" ? "en" : "ko";

  if (args.recommendations.length === 0) {
    return careerT(
      locale,
      "career.job_posting_recommendations.answer.empty",
      [
        "지금 조건으로 바로 추천할 만한 external 채용공고를 찾지 못했습니다.",
        "직무명, 지역, 근무 형태 중 하나를 조금 넓히면 다시 찾아볼 수 있습니다.",
      ].join("\n")
    );
  }

  const lines = [
    careerT(
      locale,
      "career.job_posting_recommendations.answer.saved_headline",
      "요청 조건을 기준으로 현재 우선순위가 높은 {count}개를 포지션 탭에 저장했습니다.",
      { values: { count: args.recommendations.length } }
    ),
    careerT(
      locale,
      "career.job_posting_recommendations.answer.search_intent",
      "검색 의도"
    ) + `: ${args.plan.searchIntentSummary}`,
    "",
  ];

  if (args.supplementalRecommendationCount > 0) {
    const directCount =
      args.recommendations.length - args.supplementalRecommendationCount;
    lines.push(
      careerT(
        locale,
        "career.job_posting_recommendations.answer.supplemental_included",
        "요청에 바로 맞는 공고가 {directCount}개라서, 완전히 일치하지는 않지만 좋은 공고 {supplementalCount}개를 함께 포함했습니다.",
        {
          values: {
            directCount,
            supplementalCount: args.supplementalRecommendationCount,
          },
        }
      ),
      ""
    );
  }

  if (
    typeof args.requestedCount === "number" &&
    args.requestedCount > FINAL_RECOMMENDATION_COUNT
  ) {
    lines.push(
      careerT(
        locale,
        "career.job_posting_recommendations.answer.requested_count_trimmed",
        "요청하신 {requestedCount}개를 한 번에 모두 보여드리기보다는, 지금은 바로 볼 만한 최대 {finalCount}개만 먼저 골랐습니다. 이후 주기 추천에서는 한 번에 최대 {batchLimit}개씩 더 넓게 찾아보되, 기준에 못 미치는 공고는 넣지 않겠습니다.",
        {
          values: {
            batchLimit: CONTINUATION_RECOMMENDATION_BATCH_LIMIT,
            finalCount: FINAL_RECOMMENDATION_COUNT,
            requestedCount: args.requestedCount,
          },
        }
      ),
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
    const meta = [location, workMode].filter(Boolean).join(" / ");
    const why =
      item.detail.fitReasons.length > 0 ? item.detail.fitReasons.join(" ") : "";

    const recommendationText = item.isSupplemental
      ? careerT(
          locale,
          "career.job_posting_recommendations.answer.supplemental_reason",
          "현재 요청과 완전히 일치하지는 않지만, 후보군 중 점수가 높아 참고용으로 포함했습니다."
        )
      : item.recommendationText ||
        careerT(
          locale,
          "career.job_posting_recommendations.answer.default_fit_reason",
          "현재 요청과 맞는 업무 범위가 있습니다."
        );
    const concern = item.detail.tradeoffs[0];
    const roleId = cleanText(item.roleId, 120);

    lines.push(
      `${index + 1}. ${company} - ${title} (${item.score.toFixed(1)}/10)`
    );
    if (meta) {
      lines.push(
        `   ${careerT(locale, "career.job_posting_recommendations.answer.details_label", "조건")}: ${meta}`
      );
    }
    lines.push(
      `   ${
        item.isSupplemental
          ? careerT(
              locale,
              "career.job_posting_recommendations.answer.why_included_label",
              "포함 이유"
            )
          : careerT(
              locale,
              "career.job_posting_recommendations.answer.why_it_fits_label",
              "추천 이유"
            )
      }: ${recommendationText}${why ? `\n ${why}` : ""}`
    );
    if (concern)
      lines.push(
        `   ${careerT(locale, "career.job_posting_recommendations.answer.watch_for_label", "확인할 점")}: ${concern}`
      );
    if (roleId) lines.push(`   [posting](${roleId})`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runCareerJobPostingRecommendations(args: {
  admin: AdminClient;
  abortSignal?: AbortSignal;
  conversationId: string;
  preferredLocale?: string | null;
  request: string;
  userId: string;
}) {
  const request = cleanText(args.request, 1400);
  if (!request) throw new Error("recommend_job_postings requires a request.");
  throwIfRecommendationSearchAborted(args.abortSignal);

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
    existingExternalRecommendations,
    activitySummaries,
    recentRecommendations,
  ] = await Promise.all([
    fetchJobPostingTalentUserProfile({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchTalentInsights({ admin: args.admin, userId: args.userId }),
    fetchJobPostingTalentSetting({ admin: args.admin, userId: args.userId }),
    fetchExistingExternalRecommendations({
      admin: args.admin,
      userId: args.userId,
    }),
    fetchRecentTalentActivitySummaries({
      admin: args.admin,
      limit: RECENT_TALENT_ACTIVITY_SUMMARY_LIMIT,
      userId: args.userId,
    }),
    fetchRecentRecommendations({ admin: args.admin, userId: args.userId }),
  ]);
  throwIfRecommendationSearchAborted(args.abortSignal);
  const outputLanguage = getCareerPromptLanguageName(
    args.preferredLocale ?? asRecord(setting)?.preferred_locale
  );
  const structuredProfile = await fetchTalentStructuredProfile({
    admin: args.admin,
    userId: args.userId,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  const redactionTerms = previousExternalRedactionTerms(
    existingExternalRecommendations
  );
  const deliveryContext = await fetchRecentDeliveryContext({
    admin: args.admin,
    redactionTerms,
    userId: args.userId,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  const llmUserProfile = await buildLlmUserProfile({
    activitySummaries,
    admin: args.admin,
    conversationId: args.conversationId,
    existingExternalRecommendations,
    insights: insights?.content ?? null,
    profile,
    recentRecommendations,
    setting,
    structuredProfile,
    userId: args.userId,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  const targetRecommendationCount = desiredRecommendationCount();
  const blockedCompanies = normalizeTalentBlockedCompanies(
    (asRecord(setting)?.blocked_companies as unknown) ?? []
  );
  const plan = await buildSearchPlan({
    llmUserProfile,
    outputLanguage,
    previousDeliveryTexts: deliveryContext.previousDeliveryTexts,
    recentDeliveryMeta: deliveryContext.recentDeliveryMeta,
    request,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  infoJson("external search plan", {
    ftsKeywords: plan.ftsKeywords,
    include_contract: plan.includeContract,
    include_intern: plan.includeIntern,
    include_parttime: plan.includeParttime,
    includeRemote: plan.includeRemote,
    is_prefer_entry: plan.isPreferEntry,
    locations: plan.locations,
    remoteOnly: plan.remoteOnly,
    role_titles: plan.roleTitles,
    searchIntentSummary: plan.searchIntentSummary,
    targetRecommendationCount,
  });

  const strictSearch = await executeRoleSql({
    admin: args.admin,
    blockedCompanies,
    plan,
    searchMode: "strict",
    userId: args.userId,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  let rows = strictSearch.rows;
  rows = filterPreviouslyRecommendedExternalRows(
    rows,
    existingExternalRecommendations
  ).slice(0, MAX_SEARCH_RESULTS);

  infoJson("sql search", {
    candidateCount: rows.length,
    candidates: rows
      .slice(0, 100)
      .map(
        (item) =>
          `${item.role_name} - ${item.company_name} - ${item.company_test_score}`
      ),
    existingExternalRecommendationCount: existingExternalRecommendations.length,
    strictCandidateCount: strictSearch.rows.length,
  });
  debugLog("sql search full", {
    rawCount: strictSearch.rawRows.length,
    rowsSample: rows.slice(0, 5),
    sql: strictSearch.sql,
  });

  const candidateCardsWithoutCache = roleRowsToCards(rows);
  const externalFitCacheByRoleId = await fetchRecentExternalFitCache({
    admin: args.admin,
    roleIds: candidateCardsWithoutCache.map((card) => card.roleId),
    userId: args.userId,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  const candidateCards = attachExternalFitCache(
    candidateCardsWithoutCache,
    externalFitCacheByRoleId
  );
  const cacheHitCount = candidateCards.filter((card) =>
    Boolean(card.externalFitCache)
  ).length;
  const highScoreCacheHitCount = candidateCards.filter(
    (card) =>
      (card.externalFitCache?.score100 ?? -1) >=
      EXTERNAL_FIT_CACHE_SHORTLIST_SKIP_MIN_SCORE100
  ).length;
  const selectionLimit = shortlistLimit(targetRecommendationCount);
  const cachedShortlistCards =
    candidateCards.length > 0
      ? selectCachedHighScoreShortlist(candidateCards, selectionLimit)
      : null;
  let shortlistSkippedByCache = false;
  const shortlistedCards =
    candidateCards.length > 0
      ? cachedShortlistCards
        ? (() => {
            shortlistSkippedByCache = true;
            infoJson("shortlist skipped", {
              cacheHitCount,
              highScoreCacheHitCount,
              reason: "external_fit_cache_high_score_threshold",
              selectedExternal: cachedShortlistCards.length,
              selectionLimit,
              ttlDays: EXTERNAL_FIT_CACHE_TTL_DAYS,
            });
            return cachedShortlistCards;
          })()
        : await shortlistRoles({
            cards: candidateCards,
            llmUserProfile,
            plan,
            request,
            targetRecommendationCount,
          })
      : [];
  throwIfRecommendationSearchAborted(args.abortSignal);
  const shortlistedCacheHitCount = shortlistedCards.filter((card) =>
    Boolean(card.externalFitCache)
  ).length;
  const finalSelection = await selectFinalRecommendations({
    cards: shortlistedCards,
    llmUserProfile,
    outputLanguage,
    plan,
    previousDeliveryTexts: deliveryContext.previousDeliveryTexts,
    recentDeliveryMeta: deliveryContext.recentDeliveryMeta,
    request,
    targetRecommendationCount,
  });
  throwIfRecommendationSearchAborted(args.abortSignal);
  const detailedRecommendations = rankedFromSelected(
    finalSelection.selected,
    shortlistedCards
  );
  throwIfRecommendationSearchAborted(args.abortSignal);
  const recommendations = await persistRecommendations({
    admin: args.admin,
    recommendations: detailedRecommendations,
    userId: args.userId,
  });

  infoJson("completed", {
    candidateCount: candidateCards.length,
    externalFitCacheHitCount: cacheHitCount,
    externalFitCacheHighScoreHitCount: highScoreCacheHitCount,
    durationMs: Date.now() - startedAt,
    recommendationCount: recommendations.length,
    scoredFinalCandidateCount: finalSelection.scoredCount,
    shortlistSkippedByCache,
    shortlistedCacheHitCount,
    shortlistCandidateCount: shortlistedCards.length,
    supplementalRecommendationCount: finalSelection.supplementalCount,
    topScores: recommendations.slice(0, 5).map((item) => ({
      desc: `${item.role.role_name} - ${item.role.company_name} - ${item.role.company_test_score}`,
      score: item.score,
    })),
  });

  return {
    answerDraft: formatAnswerDraft({
      candidateCount: candidateCards.length,
      outputLanguage,
      plan,
      recommendations,
      requestedCount,
      supplementalRecommendationCount: finalSelection.supplementalCount,
    }),
    candidateCount: candidateCards.length,
    recommendationCount: recommendations.length,
    searchPlan: {
      ftsKeywords: plan.ftsKeywords,
      include_contract: plan.includeContract,
      include_intern: plan.includeIntern,
      include_parttime: plan.includeParttime,
      includeRemote: plan.includeRemote,
      is_prefer_entry: plan.isPreferEntry,
      locations: plan.locations,
      remoteOnly: plan.remoteOnly,
      role_titles: plan.roleTitles,
      searchIntentSummary: plan.searchIntentSummary,
      sourceType: "external",
    },
  };
}
