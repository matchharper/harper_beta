import "server-only";

import { isInternalEmail } from "@/lib/internalAccess";
import {
  extractEmailFromLandingLoginType,
  isFirstScrollLandingLogType,
  isLandingLogEntryType,
  isStartLandingLogType,
} from "@/lib/landingLogTypes";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
  type OpsAbTestsResponse,
} from "@/lib/ops/abTests";
import {
  CAREER_LIVE_MODEL,
  CAREER_REALTIME_MODEL,
  CAREER_VOICE_MODEL_EXPERIMENT,
  type CareerVoiceModel,
} from "@/lib/career/voiceModel";
import {
  CAREER_VOICE_MODEL_CALL_COMPLETED_EVENT,
  CAREER_VOICE_MODEL_EXPOSURE_EVENT,
  CAREER_VOICE_MODEL_SESSION_ATTEMPT_EVENT,
  CAREER_VOICE_MODEL_SESSION_FAILED_EVENT,
} from "@/lib/career/voiceExperiment.server";
import {
  getSearchLandingVariantDescription,
  SEARCH_LANDING_ABTEST_TYPE_A,
  SEARCH_LANDING_ABTEST_TYPE_B,
} from "@/lib/search/landingLogs";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type { Database, Json } from "@/types/database.types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const BATCH_SIZE = 1_000;
const USER_ID_CHUNK_SIZE = 300;
const CACHE_TTL_MS = 2 * 60 * 1_000;
const responseCache = new Map<
  string,
  { expiresAt: number; value: OpsAbTestsResponse }
>();

type VoiceLogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "created_at" | "id" | "meta_data" | "type" | "user_id"
>;

type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "abtest_type" | "created_at" | "id" | "local_id" | "type"
>;

type VoiceSession = {
  attempted: boolean;
  completed: boolean;
  createdAt: string;
  durationSeconds: number | null;
  exposed: boolean;
  failed: boolean;
  model: CareerVoiceModel;
  userId: string;
  userTurns: number;
};

function isRecord(
  value: Json | null | undefined
): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: Json | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function readFiniteNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCareerVoiceModel(value: string): value is CareerVoiceModel {
  return value === CAREER_REALTIME_MODEL || value === CAREER_LIVE_MODEL;
}

function parseDays(value: unknown) {
  if (value === null || value === undefined || value === "") return 30;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(180, Math.max(1, parsed));
}

function normalizeExclusionTerms(values: readonly string[]) {
  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .slice(0, 50)
    )
  ).sort();
}

function shouldExcludeEmail(email: string | null | undefined, terms: string[]) {
  const normalizedEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  return (
    isInternalEmail(normalizedEmail) ||
    terms.some((term) => normalizedEmail.includes(term))
  );
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function minIso(values: Array<string | null | undefined>) {
  return (
    values.filter((value): value is string => Boolean(value)).sort()[0] ?? null
  );
}

function maxIso(values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

async function fetchVoiceRows(startIso: string) {
  const admin = getTalentSupabaseAdmin();
  const rows: VoiceLogRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("logs")
      .select("id,user_id,type,created_at,meta_data")
      .in("type", [
        CAREER_VOICE_MODEL_SESSION_ATTEMPT_EVENT,
        CAREER_VOICE_MODEL_SESSION_FAILED_EVENT,
        CAREER_VOICE_MODEL_EXPOSURE_EVENT,
        CAREER_VOICE_MODEL_CALL_COMPLETED_EVENT,
      ])
      .gte("created_at", startIso)
      .order("id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message || "Voice 실험 로그 조회 실패");
    const page = (data ?? []) as VoiceLogRow[];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function fetchSearchRows(startIso: string) {
  const admin = getTalentSupabaseAdmin();
  const rows: LandingLogRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("landing_logs")
      .select("id,local_id,type,created_at,abtest_type")
      .in("abtest_type", [
        SEARCH_LANDING_ABTEST_TYPE_A,
        SEARCH_LANDING_ABTEST_TYPE_B,
      ])
      .gte("created_at", startIso)
      .order("id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message || "Search 실험 로그 조회 실패");
    const page = (data ?? []) as LandingLogRow[];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function fetchExcludedVoiceUserIds(
  userIds: string[],
  exclusionTerms: string[]
) {
  const excluded = new Set<string>();
  if (userIds.length === 0) return excluded;

  const admin = getTalentSupabaseAdmin();
  for (let index = 0; index < userIds.length; index += USER_ID_CHUNK_SIZE) {
    const chunk = userIds.slice(index, index + USER_ID_CHUNK_SIZE);
    const { data, error } = await admin
      .from("talent_users")
      .select("user_id,email")
      .in("user_id", chunk);
    if (error) throw new Error(error.message || "Voice 유저 조회 실패");

    for (const row of data ?? []) {
      if (shouldExcludeEmail(row.email, exclusionTerms)) {
        excluded.add(row.user_id);
      }
    }
  }

  return excluded;
}

function buildVoiceSessionKey(
  row: VoiceLogRow,
  metadata: Record<string, Json>
) {
  return readString(metadata.callSessionId) || `voice-log:${row.id}`;
}

async function buildVoiceExperiment(
  rows: VoiceLogRow[],
  exclusionTerms: string[]
): Promise<OpsAbTestSummary> {
  const userIds = Array.from(
    new Set(rows.map((row) => String(row.user_id ?? "").trim()).filter(Boolean))
  );
  const excludedUserIds = await fetchExcludedVoiceUserIds(
    userIds,
    exclusionTerms
  );
  const sessions = new Map<string, VoiceSession>();
  const completions = new Map<
    string,
    { completed: boolean; durationSeconds: number | null; userTurns: number }
  >();

  for (const row of rows) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId || excludedUserIds.has(userId) || !isRecord(row.meta_data)) {
      continue;
    }
    if (
      readString(row.meta_data.experiment) !== CAREER_VOICE_MODEL_EXPERIMENT
    ) {
      continue;
    }

    if (row.type === CAREER_VOICE_MODEL_CALL_COMPLETED_EVENT) {
      const callSessionId = readString(row.meta_data.callSessionId);
      if (!callSessionId) continue;
      const previous = completions.get(callSessionId);
      completions.set(callSessionId, {
        completed: true,
        durationSeconds:
          readFiniteNumber(row.meta_data.durationSeconds) ??
          previous?.durationSeconds ??
          null,
        userTurns: Math.max(
          previous?.userTurns ?? 0,
          readFiniteNumber(row.meta_data.userTurns) ?? 0
        ),
      });
      continue;
    }

    const rawModel = readString(row.meta_data.model);
    if (!isCareerVoiceModel(rawModel)) continue;
    const sessionKey = buildVoiceSessionKey(row, row.meta_data);
    const current = sessions.get(sessionKey) ?? {
      attempted: false,
      completed: false,
      createdAt: row.created_at,
      durationSeconds: null,
      exposed: false,
      failed: false,
      model: rawModel,
      userId,
      userTurns: 0,
    };

    current.attempted =
      current.attempted ||
      row.type === CAREER_VOICE_MODEL_SESSION_ATTEMPT_EVENT ||
      row.type === CAREER_VOICE_MODEL_SESSION_FAILED_EVENT ||
      row.type === CAREER_VOICE_MODEL_EXPOSURE_EVENT;
    current.exposed =
      current.exposed || row.type === CAREER_VOICE_MODEL_EXPOSURE_EVENT;
    current.failed =
      current.failed || row.type === CAREER_VOICE_MODEL_SESSION_FAILED_EVENT;
    current.createdAt =
      current.createdAt < row.created_at ? current.createdAt : row.created_at;
    sessions.set(sessionKey, current);
  }

  for (const [sessionKey, completion] of completions) {
    const session = sessions.get(sessionKey);
    if (!session) continue;
    session.completed = completion.completed;
    session.durationSeconds = completion.durationSeconds;
    session.userTurns = completion.userTurns;
  }

  const makeVariant = (
    id: CareerVoiceModel,
    label: string,
    description: string
  ): OpsAbTestVariant => {
    const variantSessions = Array.from(sessions.values()).filter(
      (session) => session.model === id && session.attempted
    );
    const participantIds = new Set(
      variantSessions.map((session) => session.userId)
    );
    const validSessions = variantSessions.filter(
      (session) => session.completed && session.userTurns > 0
    );
    const validParticipantIds = new Set(
      validSessions.map((session) => session.userId)
    );
    const exposedSessions = variantSessions.filter(
      (session) => session.exposed
    );
    const failedSessions = variantSessions.filter((session) => session.failed);

    return {
      description,
      id,
      label,
      metrics: [
        {
          format: "count",
          label: "시도 세션",
          value: variantSessions.length,
        },
        {
          format: "rate",
          label: "세션 생성 성공률",
          value:
            variantSessions.length > 0
              ? exposedSessions.length / variantSessions.length
              : null,
        },
        {
          format: "rate",
          label: "세션 생성 오류율",
          value:
            variantSessions.length > 0
              ? failedSessions.length / variantSessions.length
              : null,
        },
        {
          format: "duration_seconds",
          label: "통화 시간 중앙값",
          value: median(
            validSessions.flatMap((session) =>
              session.durationSeconds === null ? [] : [session.durationSeconds]
            )
          ),
        },
        {
          format: "number",
          label: "평균 유저 발화",
          value: average(validSessions.map((session) => session.userTurns)),
        },
      ],
      primary: makeOpsAbTestRate(validParticipantIds.size, participantIds.size),
      sampleCount: participantIds.size,
    };
  };

  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant(CAREER_REALTIME_MODEL, "A · Realtime", CAREER_REALTIME_MODEL),
    makeVariant(CAREER_LIVE_MODEL, "B · Live", CAREER_LIVE_MODEL),
  ];

  return {
    allocation: "유저별 고정 50:50",
    caveat:
      "유효 통화율은 만족도의 직접 측정값이 아니라, 유저 발화가 1회 이상 기록된 통화 비율입니다.",
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
    firstObservedAt: minIso(
      Array.from(sessions.values()).map((session) => session.createdAt)
    ),
    id: CAREER_VOICE_MODEL_EXPERIMENT,
    lastObservedAt: maxIso(
      Array.from(sessions.values()).map((session) => session.createdAt)
    ),
    primaryMetricLabel: "유효 통화율",
    status: "running",
    title: "Career Voice 모델",
    unitLabel: "유저",
    variants,
  };
}

function buildSearchExperiment(
  rows: LandingLogRow[],
  exclusionTerms: string[]
): OpsAbTestSummary {
  const rowsByLocalId = new Map<string, LandingLogRow[]>();
  for (const row of rows) {
    const localId = String(row.local_id ?? "").trim();
    if (!localId || !row.type) continue;
    const items = rowsByLocalId.get(localId) ?? [];
    items.push(row);
    rowsByLocalId.set(localId, items);
  }

  const groups = Array.from(rowsByLocalId.entries()).flatMap(
    ([localId, unsortedRows]) => {
      const logs = [...unsortedRows].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      const entry = logs.find((row) => isLandingLogEntryType(row.type));
      const variant = String(entry?.abtest_type ?? "").trim();
      if (
        !entry ||
        (variant !== SEARCH_LANDING_ABTEST_TYPE_A &&
          variant !== SEARCH_LANDING_ABTEST_TYPE_B)
      ) {
        return [];
      }

      const postEntryLogs = logs.filter(
        (row) => row.created_at >= entry.created_at
      );
      const loginEmails = postEntryLogs.flatMap((row) => {
        const email = extractEmailFromLandingLoginType(row.type);
        return email ? [email] : [];
      });
      if (
        loginEmails.some((email) => shouldExcludeEmail(email, exclusionTerms))
      ) {
        return [];
      }

      return [
        {
          entryAt: entry.created_at,
          localId,
          loggedIn: loginEmails.length > 0,
          scrolled: postEntryLogs.some((row) =>
            isFirstScrollLandingLogType(row.type)
          ),
          started: postEntryLogs.some((row) => isStartLandingLogType(row.type)),
          variant,
        },
      ];
    }
  );

  const makeVariant = (
    id:
      | typeof SEARCH_LANDING_ABTEST_TYPE_A
      | typeof SEARCH_LANDING_ABTEST_TYPE_B,
    label: string
  ): OpsAbTestVariant => {
    const variantGroups = groups.filter((group) => group.variant === id);
    const total = variantGroups.length;
    const loggedIn = variantGroups.filter((group) => group.loggedIn).length;
    const scrolled = variantGroups.filter((group) => group.scrolled).length;
    const started = variantGroups.filter((group) => group.started).length;

    return {
      description: getSearchLandingVariantDescription(id),
      id,
      label,
      metrics: [
        {
          format: "rate",
          label: "스크롤률",
          value: total > 0 ? scrolled / total : null,
        },
        {
          format: "rate",
          label: "시작 클릭률",
          value: total > 0 ? started / total : null,
        },
      ],
      primary: makeOpsAbTestRate(loggedIn, total),
      sampleCount: total,
    };
  };

  const variants: [OpsAbTestVariant, OpsAbTestVariant] = [
    makeVariant(SEARCH_LANDING_ABTEST_TYPE_A, "A · Current"),
    makeVariant(SEARCH_LANDING_ABTEST_TYPE_B, "B · New copy"),
  ];

  return {
    allocation: "브라우저별 고정 50:50",
    caveat:
      "로그인 전환율은 같은 local_id에서 실험 노출 뒤 로그인 로그가 확인된 비율입니다.",
    conclusion: compareOpsAbTestRates({
      first: variants[0].primary,
      firstVariantId: variants[0].id,
      second: variants[1].primary,
      secondVariantId: variants[1].id,
    }),
    firstObservedAt: minIso(groups.map((group) => group.entryAt)),
    id: "search_landing_copy_v1",
    lastObservedAt: maxIso(groups.map((group) => group.entryAt)),
    primaryMetricLabel: "로그인 전환율",
    status: "running",
    title: "Search 랜딩 카피",
    unitLabel: "브라우저",
    variants,
  };
}

export async function fetchOpsAbTests(args: {
  days?: unknown;
  excludedEmails?: readonly string[];
}) {
  const days = parseDays(args.days);
  const exclusionTerms = normalizeExclusionTerms(args.excludedEmails ?? []);
  const cacheKey = JSON.stringify({ days, exclusionTerms });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const startIso = new Date(Date.now() - days * DAY_MS).toISOString();
  const [voiceRows, searchRows] = await Promise.all([
    fetchVoiceRows(startIso),
    fetchSearchRows(startIso),
  ]);
  const experiments = await Promise.all([
    buildVoiceExperiment(voiceRows, exclusionTerms),
    Promise.resolve(buildSearchExperiment(searchRows, exclusionTerms)),
  ]);
  const value: OpsAbTestsResponse = {
    days,
    experiments,
    generatedAt: new Date().toISOString(),
  };

  if (responseCache.size >= 24) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
  return value;
}
