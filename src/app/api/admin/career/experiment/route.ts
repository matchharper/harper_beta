import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import {
  CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
} from "@/lib/careerEmailOnboarding/constants";
import {
  extractEmailFromLandingLoginType,
  isLandingLogEntryType,
} from "@/lib/landingLogTypes";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;
const IN_FILTER_CHUNK_SIZE = 300;
const EXPERIMENT_ABTEST_TYPES = [
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
  CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
] as const;

type ExperimentVariantKey = "email_first" | "login_first";

type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "abtest_type" | "created_at" | "local_id" | "type"
>;
type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "created_at" | "email" | "user_id"
>;
type LogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "created_at" | "type" | "user_id"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "created_at" | "message_type" | "user_id"
>;
type TalentActivityEventRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "created_at" | "event_type" | "talent_id"
>;
type TalentSettingRow = Pick<
  Database["public"]["Tables"]["talent_setting"]["Row"],
  "is_onboarding_done" | "updated_at" | "user_id"
>;
type EmailOnboardingLeadRow = Pick<
  Database["public"]["Tables"]["career_email_onboarding_leads"]["Row"],
  | "abtest_type"
  | "converted_user_id"
  | "created_at"
  | "email"
  | "local_id"
  | "normalized_email"
  | "profile_ingested_at"
  | "profile_received_at"
  | "talent_id"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type ExperimentDateRange = {
  endDate: string | null;
  endExclusiveIso: string | null;
  isActive: boolean;
  startDate: string | null;
  startIso: string | null;
};

type MutableVariantCohort = {
  entryAtByLocalId: Map<string, string>;
};

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

function readExcludedEmails(payload: unknown) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("excludedEmails" in payload)
  ) {
    return [];
  }

  const value = (payload as { excludedEmails?: unknown }).excludedEmails;
  if (typeof value === "string") return normalizeExcludedEmails(value);
  if (Array.isArray(value)) {
    return normalizeExcludedEmails(
      value.filter((item): item is string => typeof item === "string")
    );
  }
  return [];
}

function normalizeDateOnly(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}

function toKstDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)).toISOString();
}

function toKstNextDayStartIso(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0)
  ).toISOString();
}

function readDateRange(payload: unknown): ExperimentDateRange {
  if (!payload || typeof payload !== "object" || !("dateRange" in payload)) {
    return {
      endDate: null,
      endExclusiveIso: null,
      isActive: false,
      startDate: null,
      startIso: null,
    };
  }

  const value = (payload as { dateRange?: unknown }).dateRange;
  if (!value || typeof value !== "object") {
    return {
      endDate: null,
      endExclusiveIso: null,
      isActive: false,
      startDate: null,
      startIso: null,
    };
  }

  let startDate = normalizeDateOnly(
    (value as { startDate?: unknown }).startDate
  );
  let endDate = normalizeDateOnly((value as { endDate?: unknown }).endDate);

  if (!startDate && endDate) startDate = endDate;
  if (startDate && !endDate) endDate = startDate;
  if (startDate && endDate && endDate < startDate) {
    const nextStartDate = endDate;
    endDate = startDate;
    startDate = nextStartDate;
  }

  return {
    endDate,
    endExclusiveIso: endDate ? toKstNextDayStartIso(endDate) : null,
    isActive: Boolean(startDate || endDate),
    startDate,
    startIso: startDate ? toKstDayStartIso(startDate) : null,
  };
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await loadPage(from, to);
    if (error) throw new Error(error.message || "Failed to load rows");

    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function fetchRowsForValues<T>(
  values: Iterable<string>,
  loadPage: (
    values: string[],
    from: number,
    to: number
  ) => PromiseLike<FetchPageResult<T>>
) {
  const normalizedValues = Array.from(
    new Set(
      Array.from(values)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
  const rows: T[] = [];

  for (
    let index = 0;
    index < normalizedValues.length;
    index += IN_FILTER_CHUNK_SIZE
  ) {
    const chunk = normalizedValues.slice(index, index + IN_FILTER_CHUNK_SIZE);
    rows.push(
      ...(await fetchAllRows<T>((from, to) => loadPage(chunk, from, to)))
    );
  }

  return rows;
}

function getVariantKey(abtestType: string | null): ExperimentVariantKey | null {
  const value = String(abtestType ?? "").trim();
  if (value === CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE) {
    return "email_first";
  }
  if (value === CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE) {
    return "login_first";
  }
  return null;
}

function createVariantCohorts() {
  return new Map<ExperimentVariantKey, MutableVariantCohort>([
    ["email_first", { entryAtByLocalId: new Map<string, string>() }],
    ["login_first", { entryAtByLocalId: new Map<string, string>() }],
  ]);
}

function minIso(
  current: string | null | undefined,
  candidate: string | null | undefined
) {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function addFirstOccurredAt(
  map: Map<string, string>,
  userId: string | null | undefined,
  occurredAt: string | null | undefined
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || !occurredAt) return;
  const nextValue = minIso(map.get(normalizedUserId), occurredAt);
  if (nextValue) map.set(normalizedUserId, nextValue);
}

function addSetValue(
  map: Map<string, Set<string>>,
  key: string | null | undefined,
  value: string | null | undefined
) {
  const normalizedKey = String(key ?? "").trim();
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedKey || !normalizedValue) return;

  const set = map.get(normalizedKey) ?? new Set<string>();
  set.add(normalizedValue);
  map.set(normalizedKey, set);
}

function parseLandingLoginEmail(type: string | null) {
  return normalizeEmail(extractEmailFromLandingLoginType(type)) || null;
}

function rateOrNull(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function didConvertAfterEntry(args: {
  entryAt: string;
  eventAtByUserId: Map<string, string>;
  userIds: Set<string> | undefined;
}) {
  if (!args.userIds?.size) return false;
  for (const userId of args.userIds) {
    const eventAt = args.eventAtByUserId.get(userId);
    if (eventAt && eventAt >= args.entryAt) return true;
  }
  return false;
}

function addTalentUser(
  usersByUserId: Map<string, TalentUserRow>,
  user: TalentUserRow
) {
  const userId = String(user.user_id ?? "").trim();
  if (!userId || usersByUserId.has(userId)) return;
  usersByUserId.set(userId, user);
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

    const payload = (await req.json().catch(() => null)) as unknown;
    const excludedEmails = readExcludedEmails(payload);
    const excludedEmailSet = new Set(excludedEmails);
    const dateRange = readDateRange(payload);

    const entryLogs = await fetchAllRows<LandingLogRow>((from, to) => {
      let query = supabaseServer
        .from("landing_logs")
        .select("local_id,type,created_at,abtest_type")
        .in("abtest_type", [...EXPERIMENT_ABTEST_TYPES])
        .or("type.eq.new_visit,type.like.new_visit:%")
        .order("id", { ascending: true })
        .range(from, to);
      if (dateRange.startIso)
        query = query.gte("created_at", dateRange.startIso);
      if (dateRange.endExclusiveIso) {
        query = query.lt("created_at", dateRange.endExclusiveIso);
      }
      return query;
    });

    const cohorts = createVariantCohorts();
    const cohortLocalIds = new Set<string>();
    for (const log of entryLogs) {
      if (!isLandingLogEntryType(log.type)) continue;
      const variant = getVariantKey(log.abtest_type);
      const localId = String(log.local_id ?? "").trim();
      if (!variant || !localId) continue;

      const cohort = cohorts.get(variant);
      if (!cohort) continue;
      const firstEntryAt = minIso(
        cohort.entryAtByLocalId.get(localId),
        log.created_at
      );
      if (firstEntryAt) {
        cohort.entryAtByLocalId.set(localId, firstEntryAt);
        cohortLocalIds.add(localId);
      }
    }

    const [loginLogs, leads] = await Promise.all([
      fetchRowsForValues<LandingLogRow>(cohortLocalIds, (localIds, from, to) =>
        supabaseServer
          .from("landing_logs")
          .select("local_id,type,created_at,abtest_type")
          .in("local_id", localIds)
          .in("abtest_type", [...EXPERIMENT_ABTEST_TYPES])
          .like("type", "login_email:%")
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchRowsForValues<EmailOnboardingLeadRow>(
        cohortLocalIds,
        (localIds, from, to) =>
          supabaseServer
            .from("career_email_onboarding_leads")
            .select(
              "abtest_type,converted_user_id,created_at,email,local_id,normalized_email,profile_ingested_at,profile_received_at,talent_id"
            )
            .in("local_id", localIds)
            .in("abtest_type", [...EXPERIMENT_ABTEST_TYPES])
            .order("created_at", { ascending: true })
            .range(from, to)
      ),
    ]);

    const excludedLocalIds = new Set<string>();
    const lookupEmails = new Set<string>();
    const lookupUserIds = new Set<string>();

    for (const log of loginLogs) {
      const localId = String(log.local_id ?? "").trim();
      if (!localId || !cohortLocalIds.has(localId)) continue;

      const rawEmail = String(
        extractEmailFromLandingLoginType(log.type) ?? ""
      ).trim();
      const email = normalizeEmail(rawEmail);
      if (!email) continue;
      if (isEmailExcluded(email, excludedEmailSet)) {
        excludedLocalIds.add(localId);
        continue;
      }
      if (rawEmail) lookupEmails.add(rawEmail);
      lookupEmails.add(email);
    }

    for (const lead of leads) {
      const localId = String(lead.local_id ?? "").trim();
      if (!localId || !cohortLocalIds.has(localId)) continue;

      const email = normalizeEmail(lead.normalized_email || lead.email);
      if (email && isEmailExcluded(email, excludedEmailSet)) {
        excludedLocalIds.add(localId);
        continue;
      }

      for (const userId of [
        String(lead.talent_id ?? "").trim(),
        String(lead.converted_user_id ?? "").trim(),
      ].filter(Boolean)) {
        lookupUserIds.add(userId);
      }
      for (const emailCandidate of [lead.email, lead.normalized_email, email]) {
        const value = String(emailCandidate ?? "").trim();
        if (value) lookupEmails.add(value);
      }
    }

    const [talentUsersByIdRows, talentUsersByEmailRows] = await Promise.all([
      fetchRowsForValues<TalentUserRow>(lookupUserIds, (userIds, from, to) =>
        supabaseServer
          .from("talent_users")
          .select("user_id,email,created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      fetchRowsForValues<TalentUserRow>(lookupEmails, (emails, from, to) =>
        supabaseServer
          .from("talent_users")
          .select("user_id,email,created_at")
          .in("email", emails)
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
    ]);

    const talentUsersByUserId = new Map<string, TalentUserRow>();
    for (const user of talentUsersByIdRows)
      addTalentUser(talentUsersByUserId, user);
    for (const user of talentUsersByEmailRows) {
      addTalentUser(talentUsersByUserId, user);
    }

    const emailToUserIds = new Map<string, Set<string>>();
    const signupAtByUserId = new Map<string, string>();
    for (const user of talentUsersByUserId.values()) {
      if (isEmailExcluded(user.email, excludedEmailSet)) continue;
      const email = normalizeEmail(user.email);
      if (email) addSetValue(emailToUserIds, email, user.user_id);
      addFirstOccurredAt(signupAtByUserId, user.user_id, user.created_at);
    }

    const userIdsByLocalId = new Map<string, Set<string>>();
    for (const log of loginLogs) {
      const localId = String(log.local_id ?? "").trim();
      if (!localId || excludedLocalIds.has(localId)) continue;

      const email = parseLandingLoginEmail(log.type);
      if (!email) continue;
      for (const userId of emailToUserIds.get(email) ?? []) {
        addSetValue(userIdsByLocalId, localId, userId);
      }
    }

    const submittedAtByUserId = new Map<string, string>();
    for (const lead of leads) {
      const localId = String(lead.local_id ?? "").trim();
      if (!localId || excludedLocalIds.has(localId)) continue;

      const email = normalizeEmail(lead.normalized_email || lead.email);
      const leadUserIds = [
        String(lead.talent_id ?? "").trim(),
        String(lead.converted_user_id ?? "").trim(),
      ].filter(Boolean);
      for (const userId of leadUserIds) {
        addSetValue(userIdsByLocalId, localId, userId);
      }
      if (email) {
        for (const userId of emailToUserIds.get(email) ?? []) {
          addSetValue(userIdsByLocalId, localId, userId);
        }
      }

      addFirstOccurredAt(signupAtByUserId, lead.talent_id, lead.created_at);
      const profileSubmittedAt = minIso(
        lead.profile_received_at,
        lead.profile_ingested_at
      );
      addFirstOccurredAt(
        submittedAtByUserId,
        lead.talent_id,
        profileSubmittedAt
      );
    }

    const cohortUserIds = new Set<string>();
    for (const userIds of userIdsByLocalId.values()) {
      for (const userId of userIds) cohortUserIds.add(userId);
    }

    const [careerLogs, talentMessages, talentActivityEvents, talentSettings] =
      await Promise.all([
        fetchRowsForValues<LogRow>(cohortUserIds, (userIds, from, to) =>
          supabaseServer
            .from("logs")
            .select("user_id,type,created_at")
            .in("user_id", userIds)
            .in("type", [
              "career_signup_completed",
              "career_onboarding_submitted",
            ])
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchRowsForValues<TalentMessageRow>(
          cohortUserIds,
          (userIds, from, to) =>
            supabaseServer
              .from("talent_messages")
              .select("user_id,message_type,created_at")
              .in("user_id", userIds)
              .eq("message_type", "profile_submit")
              .order("id", { ascending: true })
              .range(from, to)
        ),
        fetchRowsForValues<TalentActivityEventRow>(
          cohortUserIds,
          (userIds, from, to) =>
            supabaseServer
              .from("talent_activity_events")
              .select("talent_id,event_type,created_at")
              .in("talent_id", userIds)
              .eq("event_type", "onboarding_completed")
              .order("created_at", { ascending: true })
              .range(from, to)
        ),
        fetchRowsForValues<TalentSettingRow>(
          cohortUserIds,
          (userIds, from, to) =>
            supabaseServer
              .from("talent_setting")
              .select("user_id,is_onboarding_done,updated_at")
              .in("user_id", userIds)
              .eq("is_onboarding_done", true)
              .order("updated_at", { ascending: true })
              .range(from, to)
        ),
      ]);

    for (const log of careerLogs) {
      const userId = String(log.user_id ?? "").trim();
      if (!userId) continue;

      if (log.type === "career_signup_completed") {
        addFirstOccurredAt(signupAtByUserId, userId, log.created_at);
      }
      if (log.type === "career_onboarding_submitted") {
        addFirstOccurredAt(submittedAtByUserId, userId, log.created_at);
      }
    }

    for (const message of talentMessages) {
      addFirstOccurredAt(
        submittedAtByUserId,
        message.user_id,
        message.created_at
      );
    }

    const completedAtByUserId = new Map<string, string>();
    for (const event of talentActivityEvents) {
      addFirstOccurredAt(
        completedAtByUserId,
        event.talent_id,
        event.created_at
      );
    }
    for (const setting of talentSettings) {
      if (!setting.is_onboarding_done) continue;
      addFirstOccurredAt(
        completedAtByUserId,
        setting.user_id,
        setting.updated_at
      );
    }

    const variants = [
      {
        abtestType: CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
        key: "email_first" as const,
        label: "Email first",
      },
      {
        abtestType: CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
        key: "login_first" as const,
        label: "Login first",
      },
    ].map((variant) => {
      const cohort = cohorts.get(variant.key);
      const entries = Array.from(
        cohort?.entryAtByLocalId.entries() ?? []
      ).filter(([localId]) => !excludedLocalIds.has(localId));
      const entryCount = entries.length;
      let signupCount = 0;
      let submissionCount = 0;
      let onboardingCompletedCount = 0;

      for (const [localId, entryAt] of entries) {
        const userIds = userIdsByLocalId.get(localId);
        if (
          didConvertAfterEntry({
            entryAt,
            eventAtByUserId: signupAtByUserId,
            userIds,
          })
        ) {
          signupCount += 1;
        }
        if (
          didConvertAfterEntry({
            entryAt,
            eventAtByUserId: submittedAtByUserId,
            userIds,
          })
        ) {
          submissionCount += 1;
        }
        if (
          didConvertAfterEntry({
            entryAt,
            eventAtByUserId: completedAtByUserId,
            userIds,
          })
        ) {
          onboardingCompletedCount += 1;
        }
      }

      return {
        ...variant,
        entryCount,
        onboardingCompletedCount,
        onboardingCompletedRateFromEntry: rateOrNull(
          onboardingCompletedCount,
          entryCount
        ),
        signupCount,
        signupRateFromEntry: rateOrNull(signupCount, entryCount),
        submissionCount,
        submissionRateFromEntry: rateOrNull(submissionCount, entryCount),
      };
    });

    return NextResponse.json({
      dateRange: {
        endDate: dateRange.endDate,
        isActive: dateRange.isActive,
        startDate: dateRange.startDate,
      },
      excludedEmailCount: excludedEmails.length,
      generatedAt: new Date().toISOString(),
      variants,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load career experiment analytics",
      },
      { status: 500 }
    );
  }
}
