import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import type {
  AdminCareerFunnelStep,
  AdminCareerFunnelStepKey,
  AdminCareerUtmPerson,
  AdminCareerUtmResponse,
  AdminCareerUtmSourceDetail,
  AdminCareerUtmSourceRow,
} from "@/lib/adminCareerAnalytics/types";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import {
  extractEmailFromLandingLoginType,
  getLandingLogBaseType,
  getLandingLogSource,
  isLandingLogEntryType,
  isStartLandingLogType,
} from "@/lib/landingLogTypes";
import {
  CAREER_UTM_DESCRIPTION_MAX_LENGTH,
  normalizeCareerUtmDescription,
  normalizeCareerUtmSource,
} from "@/lib/career/utm";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;

type CareerUtmSourceTableRow =
  Database["public"]["Tables"]["career_utm_sources"]["Row"];
type CareerUtmSourceInsert =
  Database["public"]["Tables"]["career_utm_sources"]["Insert"];
type CareerUtmSourceUpdate =
  Database["public"]["Tables"]["career_utm_sources"]["Update"];
type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "local_id" | "type" | "created_at"
>;
type LogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "user_id" | "type" | "created_at"
>;
type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "user_id" | "name" | "email" | "created_at" | "last_logined_at"
>;
type TalentSettingRow = Pick<
  Database["public"]["Tables"]["talent_setting"]["Row"],
  "user_id" | "is_onboarding_done" | "updated_at"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "user_id" | "role" | "created_at" | "message_type"
>;
type TalentActivityEventRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "talent_id" | "event_type" | "created_at"
>;
type RecommendationRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  | "talent_id"
  | "created_at"
  | "viewed_at"
  | "clicked_at"
  | "feedback"
  | "feedback_at"
  | "saved_stage"
  | "updated_at"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type MutableSourceStats = {
  clickStartLocalIds: Set<string>;
  emailsByLocalId: Map<string, Set<string>>;
  entryLocalIds: Set<string>;
  eventTypes: Set<string>;
  firstEnteredAtByLocalId: Map<string, string>;
  lastEnteredAt: string | null;
  lastEnteredAtByLocalId: Map<string, string>;
  lastLoginAtByLocalId: Map<string, string>;
  loginEmails: Set<string>;
  loginLocalIds: Set<string>;
};

const FUNNEL_META: Array<{
  key: AdminCareerFunnelStepKey;
  label: string;
  detail: string;
}> = [
  {
    key: "landing_entry",
    label: "Landing entry",
    detail: "source URL로 들어온 local_id",
  },
  {
    key: "login_click",
    label: "Login CTA click",
    detail: "해당 source에서 로그인 CTA를 클릭한 local_id",
  },
  {
    key: "login",
    label: "Login email",
    detail: "해당 source에서 로그인까지 이어진 이메일/local_id",
  },
  {
    key: "signup",
    label: "Signup",
    detail: "login email이 talent_user로 식별된 유저",
  },
  {
    key: "onboarding_basic",
    label: "기본 정보 통과",
    detail: "career_click_onboarding_next_step_1",
  },
  {
    key: "onboarding_role",
    label: "찾는 역할 통과",
    detail: "career_click_onboarding_next_step_2",
  },
  {
    key: "onboarding_profile",
    label: "프로필 자료 통과",
    detail: "career_click_onboarding_next_step_3",
  },
  {
    key: "onboarding_visibility",
    label: "공개 범위 제출",
    detail: "career_click_onboarding_submit*",
  },
  {
    key: "onboarding_completed",
    label: "Onboarding complete",
    detail: "onboarding_completed event + 설정 보정",
  },
  {
    key: "returned_after_first_recommendation",
    label: "Returned after first rec",
    detail: "첫 추천 이후 재접속/의미 있는 액션",
  },
];

const STEP_ORDER = new Map(
  FUNNEL_META.map((step, index) => [step.key, index] as const)
);

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getAdminPassword(req: NextRequest) {
  return (
    req.headers.get("x-admin-password") ??
    req.headers.get("X-Admin-Password") ??
    ""
  );
}

async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

function addToSetMap<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return existing;
  }

  const next = new Set<V>([value]);
  map.set(key, next);
  return next;
}

function getOrCreateSourceStats(
  map: Map<string, MutableSourceStats>,
  source: string
) {
  const existing = map.get(source);
  if (existing) return existing;

  const next: MutableSourceStats = {
    clickStartLocalIds: new Set(),
    emailsByLocalId: new Map(),
    entryLocalIds: new Set(),
    eventTypes: new Set(),
    firstEnteredAtByLocalId: new Map(),
    lastEnteredAt: null,
    lastEnteredAtByLocalId: new Map(),
    lastLoginAtByLocalId: new Map(),
    loginEmails: new Set(),
    loginLocalIds: new Set(),
  };
  map.set(source, next);
  return next;
}

function isLaterIso(value: string | null | undefined, than: string | null) {
  if (!value) return false;
  if (!than) return true;
  return new Date(value).getTime() > new Date(than).getTime();
}

function isEarlierIso(value: string | null | undefined, than: string | null) {
  if (!value) return false;
  if (!than) return true;
  return new Date(value).getTime() < new Date(than).getTime();
}

function setMinIso(map: Map<string, string>, key: string, value: string) {
  const current = map.get(key) ?? null;
  if (isEarlierIso(value, current)) map.set(key, value);
}

function setMaxIso(map: Map<string, string>, key: string, value: string) {
  const current = map.get(key) ?? null;
  if (isLaterIso(value, current)) map.set(key, value);
}

function happenedAfter(value: string | null | undefined, boundary: string) {
  if (!value) return false;
  return new Date(value).getTime() > new Date(boundary).getTime();
}

function parseLandingLoginEmail(type: string | null | undefined) {
  return normalizeEmail(extractEmailFromLandingLoginType(type));
}

function readExcludedEmails(req: NextRequest) {
  return normalizeExcludedEmails(
    req.nextUrl.searchParams.getAll("excludedEmail")
  );
}

function buildFunnelSteps(counts: Record<AdminCareerFunnelStepKey, number>) {
  let previousCount: number | null = null;
  const entryCount = counts.landing_entry;

  return FUNNEL_META.map((step): AdminCareerFunnelStep => {
    const count = counts[step.key] ?? 0;
    const result: AdminCareerFunnelStep = {
      ...step,
      count,
      rateFromEntry: entryCount > 0 ? count / entryCount : null,
      rateFromPrevious:
        previousCount !== null && previousCount > 0
          ? count / previousCount
          : null,
    };
    previousCount = count;
    return result;
  });
}

function pickFurthestStep(steps: Set<AdminCareerFunnelStepKey>) {
  let result: AdminCareerFunnelStepKey = "landing_entry";
  for (const step of steps) {
    if ((STEP_ORDER.get(step) ?? 0) > (STEP_ORDER.get(result) ?? 0)) {
      result = step;
    }
  }
  return result;
}

function getStepLabel(key: AdminCareerFunnelStepKey) {
  return FUNNEL_META.find((step) => step.key === key)?.label ?? key;
}

function buildLandingStats(args: {
  excludedEmails: string[];
  landingLogs: LandingLogRow[];
}) {
  const excludedEmailSet = new Set(args.excludedEmails);
  const excludedLocalIds = new Set<string>();

  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;

    const email = parseLandingLoginEmail(log.type);
    if (email && isEmailExcluded(email, excludedEmailSet)) {
      excludedLocalIds.add(localId);
    }
  }

  const statsBySource = new Map<string, MutableSourceStats>();
  const latestEntrySourceByLocalId = new Map<string, string>();
  const latestEntryAtByLocalId = new Map<string, string>();

  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || excludedLocalIds.has(localId)) continue;
    if (!isLandingLogEntryType(log.type)) continue;

    const source = getLandingLogSource(log.type);
    const stats = getOrCreateSourceStats(statsBySource, source);
    const baseType = getLandingLogBaseType(log.type);
    if (baseType) stats.eventTypes.add(baseType);

    stats.entryLocalIds.add(localId);
    setMinIso(stats.firstEnteredAtByLocalId, localId, log.created_at);
    setMaxIso(stats.lastEnteredAtByLocalId, localId, log.created_at);
    if (isLaterIso(log.created_at, stats.lastEnteredAt)) {
      stats.lastEnteredAt = log.created_at;
    }
    if (
      isLaterIso(log.created_at, latestEntryAtByLocalId.get(localId) ?? null)
    ) {
      latestEntryAtByLocalId.set(localId, log.created_at);
      latestEntrySourceByLocalId.set(localId, source);
    }
  }

  for (const log of args.landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (localId && excludedLocalIds.has(localId)) continue;

    if (isStartLandingLogType(log.type)) {
      const sourceFromType = getLandingLogSource(log.type);
      const source =
        sourceFromType !== "unknown"
          ? sourceFromType
          : localId
            ? (latestEntrySourceByLocalId.get(localId) ?? "unknown")
            : "unknown";
      const stats = getOrCreateSourceStats(statsBySource, source);
      const baseType = getLandingLogBaseType(log.type);
      if (baseType) stats.eventTypes.add(baseType);
      if (localId) stats.clickStartLocalIds.add(localId);
      continue;
    }

    const email = parseLandingLoginEmail(log.type);
    if (!email || isEmailExcluded(email, excludedEmailSet)) continue;

    const sourceFromType = getLandingLogSource(log.type);
    const source =
      sourceFromType !== "unknown"
        ? sourceFromType
        : localId
          ? (latestEntrySourceByLocalId.get(localId) ?? "unknown")
          : "unknown";
    const stats = getOrCreateSourceStats(statsBySource, source);
    stats.eventTypes.add("login_email");
    stats.loginEmails.add(email);
    if (localId) {
      stats.loginLocalIds.add(localId);
      addToSetMap(stats.emailsByLocalId, localId, email);
      setMaxIso(stats.lastLoginAtByLocalId, localId, log.created_at);
    }
  }

  return statsBySource;
}

function buildSourceRows(args: {
  sourceRows: CareerUtmSourceTableRow[];
  statsBySource: Map<string, MutableSourceStats>;
  talentByEmail: Map<string, TalentUserRow>;
}) {
  return args.sourceRows.map((row): AdminCareerUtmSourceRow => {
    const stats = args.statsBySource.get(row.source);
    const identifiedUserIds = new Set<string>();

    for (const email of stats?.loginEmails ?? []) {
      const talent = args.talentByEmail.get(email);
      if (talent?.user_id) identifiedUserIds.add(talent.user_id);
    }

    return {
      id: row.id,
      source: row.source,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastEnteredAt: stats?.lastEnteredAt ?? null,
      entryCount: stats?.entryLocalIds.size ?? 0,
      loginCount: Math.max(
        stats?.loginLocalIds.size ?? 0,
        stats?.loginEmails.size ?? 0
      ),
      identifiedUserCount: identifiedUserIds.size,
    };
  });
}

function buildSelectedSourceDetail(args: {
  careerLogs: LogRow[];
  loginCompletedLogs: LogRow[];
  recommendations: RecommendationRow[];
  source: string;
  sourceStats: MutableSourceStats | undefined;
  talentActivityEvents: TalentActivityEventRow[];
  talentByEmail: Map<string, TalentUserRow>;
  talentMessages: TalentMessageRow[];
  talentSettings: TalentSettingRow[];
  talentUsers: TalentUserRow[];
}) {
  const stats =
    args.sourceStats ?? getOrCreateSourceStats(new Map(), args.source);
  const talentByUserId = new Map(
    args.talentUsers.map((user) => [user.user_id, user] as const)
  );
  const sourceUserIds = new Set<string>();

  for (const email of stats.loginEmails) {
    const talent = args.talentByEmail.get(email);
    if (talent?.user_id) sourceUserIds.add(talent.user_id);
  }

  const onboardingUsersByStep = new Map<AdminCareerFunnelStepKey, Set<string>>([
    ["onboarding_basic", new Set()],
    ["onboarding_role", new Set()],
    ["onboarding_profile", new Set()],
    ["onboarding_visibility", new Set()],
  ]);
  const completedUserIds = new Set<string>();

  for (const log of args.careerLogs) {
    const userId = String(log.user_id ?? "").trim();
    if (!sourceUserIds.has(userId)) continue;

    if (log.type === "career_click_onboarding_next_step_1") {
      onboardingUsersByStep.get("onboarding_basic")?.add(userId);
    } else if (log.type === "career_click_onboarding_next_step_2") {
      onboardingUsersByStep.get("onboarding_role")?.add(userId);
    } else if (log.type === "career_click_onboarding_next_step_3") {
      onboardingUsersByStep.get("onboarding_profile")?.add(userId);
    } else if (
      log.type === "career_click_onboarding_submit_button" ||
      log.type === "career_click_onboarding_submit"
    ) {
      onboardingUsersByStep.get("onboarding_visibility")?.add(userId);
    }
  }

  for (const setting of args.talentSettings) {
    if (sourceUserIds.has(setting.user_id) && setting.is_onboarding_done) {
      completedUserIds.add(setting.user_id);
    }
  }

  for (const event of args.talentActivityEvents) {
    if (
      sourceUserIds.has(event.talent_id) &&
      event.event_type === "onboarding_completed"
    ) {
      completedUserIds.add(event.talent_id);
    }
  }

  for (const userId of completedUserIds) {
    onboardingUsersByStep.get("onboarding_basic")?.add(userId);
    onboardingUsersByStep.get("onboarding_role")?.add(userId);
    onboardingUsersByStep.get("onboarding_profile")?.add(userId);
    onboardingUsersByStep.get("onboarding_visibility")?.add(userId);
  }

  const firstRecommendationAtByUserId = new Map<string, string>();
  for (const recommendation of args.recommendations) {
    const userId = String(recommendation.talent_id ?? "").trim();
    if (!sourceUserIds.has(userId)) continue;
    const occurredAt = recommendation.created_at;
    if (occurredAt)
      setMinIso(firstRecommendationAtByUserId, userId, occurredAt);
  }

  const returnedUserIds = new Set<string>();
  const markReturned = (
    userId: string,
    occurredAt: string | null | undefined
  ) => {
    if (returnedUserIds.has(userId)) return;
    const firstRecommendationAt = firstRecommendationAtByUserId.get(userId);
    if (!firstRecommendationAt) return;
    if (happenedAfter(occurredAt, firstRecommendationAt)) {
      returnedUserIds.add(userId);
    }
  };

  for (const log of args.loginCompletedLogs) {
    const userId = String(log.user_id ?? "").trim();
    if (sourceUserIds.has(userId)) markReturned(userId, log.created_at);
  }

  for (const log of args.careerLogs) {
    const userId = String(log.user_id ?? "").trim();
    if (sourceUserIds.has(userId)) markReturned(userId, log.created_at);
  }

  for (const message of args.talentMessages) {
    const userId = String(message.user_id ?? "").trim();
    if (sourceUserIds.has(userId) && message.role === "user") {
      markReturned(userId, message.created_at);
    }
  }

  for (const recommendation of args.recommendations) {
    const userId = String(recommendation.talent_id ?? "").trim();
    if (!sourceUserIds.has(userId)) continue;
    markReturned(userId, recommendation.viewed_at);
    markReturned(userId, recommendation.clicked_at);
    markReturned(userId, recommendation.feedback_at);
    if (recommendation.saved_stage || recommendation.feedback) {
      markReturned(userId, recommendation.updated_at);
    }
  }

  for (const userId of sourceUserIds) {
    markReturned(userId, talentByUserId.get(userId)?.last_logined_at);
  }

  const counts: Record<AdminCareerFunnelStepKey, number> = {
    landing_entry: stats.entryLocalIds.size,
    login_click: stats.clickStartLocalIds.size,
    login: Math.max(stats.loginLocalIds.size, stats.loginEmails.size),
    signup: sourceUserIds.size,
    onboarding_basic: onboardingUsersByStep.get("onboarding_basic")?.size ?? 0,
    onboarding_role: onboardingUsersByStep.get("onboarding_role")?.size ?? 0,
    onboarding_profile:
      onboardingUsersByStep.get("onboarding_profile")?.size ?? 0,
    onboarding_visibility:
      onboardingUsersByStep.get("onboarding_visibility")?.size ?? 0,
    onboarding_completed: completedUserIds.size,
    returned_after_first_recommendation: returnedUserIds.size,
  };

  const people: AdminCareerUtmPerson[] = [];
  const localIds = new Set([
    ...Array.from(stats.entryLocalIds),
    ...Array.from(stats.clickStartLocalIds),
    ...Array.from(stats.loginLocalIds),
  ]);

  for (const localId of localIds) {
    const emails = Array.from(stats.emailsByLocalId.get(localId) ?? []);
    const talent =
      emails.map((email) => args.talentByEmail.get(email)).find(Boolean) ??
      null;
    const userId = talent?.user_id ?? null;
    const reachedSteps = new Set<AdminCareerFunnelStepKey>(["landing_entry"]);
    if (stats.clickStartLocalIds.has(localId)) reachedSteps.add("login_click");
    if (emails.length > 0) reachedSteps.add("login");
    if (userId) {
      reachedSteps.add("signup");
      for (const [step, users] of onboardingUsersByStep.entries()) {
        if (users.has(userId)) reachedSteps.add(step);
      }
      if (completedUserIds.has(userId))
        reachedSteps.add("onboarding_completed");
      if (returnedUserIds.has(userId)) {
        reachedSteps.add("returned_after_first_recommendation");
      }
    }
    const currentStepKey = pickFurthestStep(reachedSteps);

    people.push({
      localId,
      userId,
      name: talent?.name ?? null,
      email: talent?.email ?? emails[0] ?? null,
      firstEnteredAt: stats.firstEnteredAtByLocalId.get(localId) ?? null,
      lastEnteredAt: stats.lastEnteredAtByLocalId.get(localId) ?? null,
      lastLoginAt: stats.lastLoginAtByLocalId.get(localId) ?? null,
      currentStepKey,
      currentStepLabel: getStepLabel(currentStepKey),
    });
  }

  people.sort((a, b) => {
    const aTime = new Date(
      a.lastLoginAt ?? a.lastEnteredAt ?? a.firstEnteredAt ?? 0
    ).getTime();
    const bTime = new Date(
      b.lastLoginAt ?? b.lastEnteredAt ?? b.firstEnteredAt ?? 0
    ).getTime();
    return bTime - aTime;
  });

  return {
    source: args.source,
    steps: buildFunnelSteps(counts),
    people,
  } satisfies AdminCareerUtmSourceDetail;
}

async function buildUtmResponse(req: NextRequest) {
  const excludedEmails = readExcludedEmails(req);
  const selectedSource = normalizeCareerUtmSource(
    req.nextUrl.searchParams.get("source")
  );

  const sourceRows = await fetchAllRows<CareerUtmSourceTableRow>((from, to) =>
    supabaseServer
      .from("career_utm_sources")
      .select("id,source,description,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(from, to)
  );

  if (sourceRows.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      selectedSource: null,
      sources: [],
    } satisfies AdminCareerUtmResponse;
  }

  const [
    landingLogs,
    careerLogs,
    loginCompletedLogs,
    talentUsers,
    talentSettings,
    talentMessages,
    talentActivityEvents,
    recommendations,
  ] = await Promise.all([
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("local_id,type,created_at")
        .or(
          "type.eq.new_visit,type.like.new_visit:%,type.eq.new_session,type.like.new_session:%,type.like.login_email:%"
        )
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .like("type", "career_%")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id,type,created_at")
        .eq("type", "login_completed")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentUserRow>((from, to) =>
      supabaseServer
        .from("talent_users")
        .select("user_id,name,email,created_at,last_logined_at")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<TalentSettingRow>((from, to) =>
      supabaseServer
        .from("talent_setting")
        .select("user_id,is_onboarding_done,updated_at")
        .order("updated_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows<TalentMessageRow>((from, to) =>
      supabaseServer
        .from("talent_messages")
        .select("user_id,role,created_at,message_type")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentActivityEventRow>((from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("talent_id,event_type,created_at")
        .eq("event_type", "onboarding_completed")
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<RecommendationRow>((from, to) =>
      supabaseServer
        .from("talent_opportunity_recommendation")
        .select(
          "talent_id,created_at,viewed_at,clicked_at,feedback,feedback_at,saved_stage,updated_at"
        )
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
  ]);

  const talentByEmail = new Map<string, TalentUserRow>();
  for (const user of talentUsers) {
    const email = normalizeEmail(user.email);
    if (email && !talentByEmail.has(email)) {
      talentByEmail.set(email, user);
    }
  }

  const statsBySource = buildLandingStats({ excludedEmails, landingLogs });
  const sources = buildSourceRows({ sourceRows, statsBySource, talentByEmail });
  const resolvedSelectedSource =
    selectedSource && sourceRows.some((row) => row.source === selectedSource)
      ? selectedSource
      : sources[0]?.source;
  const selectedSourceDetail = resolvedSelectedSource
    ? buildSelectedSourceDetail({
        careerLogs,
        loginCompletedLogs,
        recommendations,
        source: resolvedSelectedSource,
        sourceStats: statsBySource.get(resolvedSelectedSource),
        talentActivityEvents,
        talentByEmail,
        talentMessages,
        talentSettings,
        talentUsers,
      })
    : null;

  return {
    generatedAt: new Date().toISOString(),
    selectedSource: selectedSourceDetail,
    sources,
  } satisfies AdminCareerUtmResponse;
}

function readSourceMutationPayload(payload: unknown) {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const id = String(record.id ?? "").trim();
  const source = normalizeCareerUtmSource(record.source);
  const description = normalizeCareerUtmDescription(record.description);

  return {
    id,
    source,
    description: description || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    return NextResponse.json(await buildUtmResponse(req));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load career UTM sources",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    const payload = readSourceMutationPayload(
      await req.json().catch(() => null)
    );
    if (!payload.source) {
      return NextResponse.json(
        {
          error:
            "source는 영문 소문자/숫자/하이픈/언더스코어 1-80자로 입력해 주세요.",
        },
        { status: 400 }
      );
    }

    const insertPayload: CareerUtmSourceInsert = {
      description: payload.description,
      source: payload.source,
    };
    const { data, error } = await supabaseServer
      .from("career_utm_sources")
      .insert(insertPayload)
      .select("id,source,description,created_at,updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create source" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, source: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create source",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    const payload = readSourceMutationPayload(
      await req.json().catch(() => null)
    );
    if (!payload.id) {
      return NextResponse.json({ error: "Missing source id" }, { status: 400 });
    }
    if (!payload.source) {
      return NextResponse.json(
        {
          error:
            "source는 영문 소문자/숫자/하이픈/언더스코어 1-80자로 입력해 주세요.",
        },
        { status: 400 }
      );
    }
    if (
      payload.description &&
      payload.description.length > CAREER_UTM_DESCRIPTION_MAX_LENGTH
    ) {
      return NextResponse.json(
        { error: "description은 500자 이내로 입력해 주세요." },
        { status: 400 }
      );
    }

    const updatePayload: CareerUtmSourceUpdate = {
      description: payload.description,
      source: payload.source,
    };
    const { data, error } = await supabaseServer
      .from("career_utm_sources")
      .update(updatePayload)
      .eq("id", payload.id)
      .select("id,source,description,created_at,updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to update source" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, source: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update source",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    const payload = (await req.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    const id = String(payload?.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing source id" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("career_utm_sources")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete source",
      },
      { status: 500 }
    );
  }
}
