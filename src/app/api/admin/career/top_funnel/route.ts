import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import {
  extractEmailFromLandingLoginType,
  isLandingLogEntryType,
  isStartLandingLogType,
} from "@/lib/landingLogTypes";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;

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
  "user_id" | "email" | "created_at"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "user_id" | "message_type" | "created_at"
>;
type TalentActivityEventRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "talent_id" | "event_type" | "occurred_at"
>;
type TalentSettingRow = Pick<
  Database["public"]["Tables"]["talent_setting"]["Row"],
  "user_id" | "is_onboarding_done" | "updated_at"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type TopFunnelDateRange = {
  endDate: string;
  endExclusiveIso: string;
  startDate: string;
  startIso: string;
};

type TopFunnelStep = {
  count: number;
  detail: string;
  key: string;
  label: string;
  rateFromEntry: number | null;
  rateFromPrevious: number | null;
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

function todayKstDateOnly() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  });
  return formatter.format(new Date());
}

function readDateRange(payload: unknown): TopFunnelDateRange {
  const value =
    payload && typeof payload === "object"
      ? (payload as { dateRange?: unknown }).dateRange
      : null;
  const rawStart =
    value && typeof value === "object"
      ? (value as { startDate?: unknown }).startDate
      : null;
  const rawEnd =
    value && typeof value === "object"
      ? (value as { endDate?: unknown }).endDate
      : null;

  let startDate = normalizeDateOnly(rawStart);
  let endDate = normalizeDateOnly(rawEnd);
  const fallbackDate = todayKstDateOnly();
  if (!startDate && !endDate) {
    startDate = fallbackDate;
    endDate = fallbackDate;
  } else if (!startDate && endDate) {
    startDate = endDate;
  } else if (startDate && !endDate) {
    endDate = startDate;
  }

  if (!startDate || !endDate) {
    startDate = fallbackDate;
    endDate = fallbackDate;
  }

  if (endDate < startDate) {
    const nextStartDate = endDate;
    endDate = startDate;
    startDate = nextStartDate;
  }

  return {
    endDate,
    endExclusiveIso: toKstNextDayStartIso(endDate),
    startDate,
    startIso: toKstDayStartIso(startDate),
  };
}

function isInRange(
  value: string | null | undefined,
  range: TopFunnelDateRange
) {
  if (!value) return false;
  return value >= range.startIso && value < range.endExclusiveIso;
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

function parseLandingLoginEmail(type: string | null) {
  return normalizeEmail(extractEmailFromLandingLoginType(type)) || null;
}

function addStep(args: {
  count: number;
  detail: string;
  entryCount: number;
  key: string;
  label: string;
  previousCount: number | null;
}): TopFunnelStep {
  return {
    count: args.count,
    detail: args.detail,
    key: args.key,
    label: args.label,
    rateFromEntry: args.entryCount > 0 ? args.count / args.entryCount : null,
    rateFromPrevious:
      args.previousCount && args.previousCount > 0
        ? args.count / args.previousCount
        : null,
  };
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

    const [
      landingLogs,
      careerLogs,
      talentUsers,
      talentMessages,
      talentActivityEvents,
      talentSettings,
    ] = await Promise.all([
      fetchAllRows<LandingLogRow>((from, to) =>
        supabaseServer
          .from("landing_logs")
          .select("local_id,type,created_at")
          .or(
            "type.eq.new_visit,type.like.new_visit:%,type.eq.new_session,type.like.new_session:%,type.eq.click_start,type.like.click_start:%,type.like.login_email:%"
          )
          .gte("created_at", dateRange.startIso)
          .lt("created_at", dateRange.endExclusiveIso)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<LogRow>((from, to) =>
        supabaseServer
          .from("logs")
          .select("user_id,type,created_at")
          .in("type", [
            "career_signup_completed",
            "career_onboarding_submitted",
          ])
          .gte("created_at", dateRange.startIso)
          .lt("created_at", dateRange.endExclusiveIso)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<TalentUserRow>((from, to) =>
        supabaseServer
          .from("talent_users")
          .select("user_id,email,created_at")
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<TalentMessageRow>((from, to) =>
        supabaseServer
          .from("talent_messages")
          .select("user_id,message_type,created_at")
          .eq("message_type", "profile_submit")
          .gte("created_at", dateRange.startIso)
          .lt("created_at", dateRange.endExclusiveIso)
          .order("id", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<TalentActivityEventRow>((from, to) =>
        supabaseServer
          .from("talent_activity_events")
          .select("talent_id,event_type,occurred_at")
          .eq("event_type", "onboarding_completed")
          .gte("occurred_at", dateRange.startIso)
          .lt("occurred_at", dateRange.endExclusiveIso)
          .order("occurred_at", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<TalentSettingRow>((from, to) =>
        supabaseServer
          .from("talent_setting")
          .select("user_id,is_onboarding_done,updated_at")
          .eq("is_onboarding_done", true)
          .gte("updated_at", dateRange.startIso)
          .lt("updated_at", dateRange.endExclusiveIso)
          .order("updated_at", { ascending: true })
          .range(from, to)
      ),
    ]);

    const includedTalentUsers = talentUsers.filter(
      (user) => !isEmailExcluded(user.email, excludedEmailSet)
    );
    const includedUserIds = new Set(
      includedTalentUsers.map((user) => user.user_id).filter(Boolean)
    );

    const excludedLocalIds = new Set<string>();
    for (const log of landingLogs) {
      const localId = String(log.local_id ?? "").trim();
      const email = parseLandingLoginEmail(log.type);
      if (localId && email && isEmailExcluded(email, excludedEmailSet)) {
        excludedLocalIds.add(localId);
      }
    }

    const entryLocalIds = new Set<string>();
    const clickLocalIds = new Set<string>();
    const loginLocalIds = new Set<string>();
    for (const log of landingLogs) {
      const localId = String(log.local_id ?? "").trim();
      if (!localId || excludedLocalIds.has(localId)) continue;

      if (isLandingLogEntryType(log.type)) {
        entryLocalIds.add(localId);
      } else if (isStartLandingLogType(log.type)) {
        clickLocalIds.add(localId);
      } else {
        const email = parseLandingLoginEmail(log.type);
        if (email && !isEmailExcluded(email, excludedEmailSet)) {
          loginLocalIds.add(localId);
        }
      }
    }

    const signupUserIds = new Set<string>();
    for (const user of includedTalentUsers) {
      if (isInRange(user.created_at, dateRange))
        signupUserIds.add(user.user_id);
    }
    for (const log of careerLogs) {
      const userId = String(log.user_id ?? "").trim();
      if (
        userId &&
        log.type === "career_signup_completed" &&
        includedUserIds.has(userId)
      ) {
        signupUserIds.add(userId);
      }
    }

    const submittedUserIds = new Set<string>();
    for (const log of careerLogs) {
      const userId = String(log.user_id ?? "").trim();
      if (
        userId &&
        log.type === "career_onboarding_submitted" &&
        includedUserIds.has(userId)
      ) {
        submittedUserIds.add(userId);
      }
    }
    for (const message of talentMessages) {
      if (includedUserIds.has(message.user_id)) {
        submittedUserIds.add(message.user_id);
      }
    }

    const completedUserIds = new Set<string>();
    for (const event of talentActivityEvents) {
      if (includedUserIds.has(event.talent_id)) {
        completedUserIds.add(event.talent_id);
      }
    }
    for (const setting of talentSettings) {
      if (includedUserIds.has(setting.user_id)) {
        completedUserIds.add(setting.user_id);
      }
    }

    const rawSteps = [
      {
        count: entryLocalIds.size,
        detail: "landing_logs new_visit/new_session unique local_id",
        key: "career_entry",
        label: "career 페이지 진입",
      },
      {
        count: clickLocalIds.size,
        detail: "landing_logs click_start unique local_id",
        key: "login_click",
        label: "로그인 버튼 클릭",
      },
      {
        count: signupUserIds.size,
        detail: "career_signup_completed + talent_users.created_at 보정",
        key: "signup",
        label: "회원 가입",
      },
      {
        count: submittedUserIds.size,
        detail: "career_onboarding_submitted + profile_submit",
        key: "submitted",
        label: "제출 완료",
      },
      {
        count: completedUserIds.size,
        detail: "onboarding_completed + talent_setting 보정",
        key: "onboarding_completed",
        label: "온보딩 완료",
      },
    ];
    const entryCount = rawSteps[0]?.count ?? 0;
    const steps = rawSteps.map((step, index) =>
      addStep({
        ...step,
        entryCount,
        previousCount:
          index === 0 ? null : (rawSteps[index - 1]?.count ?? null),
      })
    );

    return NextResponse.json({
      dateRange: {
        endDate: dateRange.endDate,
        startDate: dateRange.startDate,
      },
      excludedEmailCount: excludedEmails.length,
      generatedAt: new Date().toISOString(),
      steps,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load career top funnel",
      },
      { status: 500 }
    );
  }
}
