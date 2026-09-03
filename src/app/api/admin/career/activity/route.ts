import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import {
  DEFAULT_ADMIN_EXCLUDED_EMAILS,
  isEmailExcluded,
} from "@/lib/adminEmailExclusions";
import {
  ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE,
  aggregateCareerActivityEvents,
  daysBetweenDateOnly,
  getKstTodayDate,
  normalizeDateOnly,
  toKstEndExclusiveIso,
  toKstStartIso,
} from "@/lib/adminCareerActivity/utils";
import type {
  AdminCareerActivityEvent,
  AdminCareerActivityEventKind,
  AdminCareerActivityResponse,
} from "@/lib/adminCareerActivity/types";
import { normalizeExcludedEmails } from "@/lib/adminMetrics/utils";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const PAGE_CONCURRENCY = 6;
const MAX_RANGE_DAYS = 1095;
const CAREER_POSITION_VIEW_LOG_TYPES = [
  "career_click_history_open_detail",
  "career_click_history_open_jd",
  "career_click_mobile_history_open_detail",
  "career_click_mobile_history_open_jd",
] as const;
const CAREER_ACTIVITY_LOG_TYPES = [
  "career_app_opened",
  "login_completed",
  ...CAREER_POSITION_VIEW_LOG_TYPES,
] as const;

type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "created_at" | "email" | "last_logined_at" | "user_id"
>;
type LogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "created_at" | "type" | "user_id"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "created_at" | "message_type" | "role" | "user_id"
>;
type CareerEmailMessageRow = Pick<
  Database["public"]["Tables"]["career_email_messages"]["Row"],
  "id" | "occurred_at" | "talent_id"
>;
type RecommendationFeedbackRow = Pick<
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"],
  "feedback" | "feedback_at" | "id" | "talent_id" | "updated_at"
>;

type FetchPageResult<T> = {
  count: number | null;
  data: T[] | null;
  error: { message: string } | null;
};

type ActivityRequestBody = {
  endDate?: unknown;
  excludedEmails?: unknown;
  startDate?: unknown;
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

async function fetchAllRows<T>(
  loadPage: (
    from: number,
    to: number,
    includeCount: boolean
  ) => PromiseLike<FetchPageResult<T>>
) {
  const firstPage = await loadPage(0, PAGE_SIZE - 1, true);
  if (firstPage.error) {
    throw new Error(firstPage.error.message || "Failed to load rows");
  }

  const rows = [...(firstPage.data ?? [])];
  const totalCount = Math.max(firstPage.count ?? rows.length, rows.length);
  const ranges: Array<{ from: number; to: number }> = [];
  for (let from = PAGE_SIZE; from < totalCount; from += PAGE_SIZE) {
    ranges.push({
      from,
      to: Math.min(totalCount - 1, from + PAGE_SIZE - 1),
    });
  }

  let nextRangeIndex = 0;
  const workers = Array.from(
    { length: Math.min(PAGE_CONCURRENCY, ranges.length) },
    async () => {
      while (nextRangeIndex < ranges.length) {
        const range = ranges[nextRangeIndex];
        nextRangeIndex += 1;
        const page = await loadPage(range.from, range.to, false);
        if (page.error) {
          throw new Error(page.error.message || "Failed to load rows");
        }
        rows.push(...(page.data ?? []));
      }
    }
  );
  await Promise.all(workers);

  return rows;
}

function readExcludedEmails(body: ActivityRequestBody) {
  if (!("excludedEmails" in body)) return DEFAULT_ADMIN_EXCLUDED_EMAILS;
  if (typeof body.excludedEmails === "string") {
    return normalizeExcludedEmails(body.excludedEmails);
  }
  if (Array.isArray(body.excludedEmails)) {
    return normalizeExcludedEmails(
      body.excludedEmails.filter(
        (value): value is string => typeof value === "string"
      )
    );
  }
  return DEFAULT_ADMIN_EXCLUDED_EMAILS;
}

function normalizeFeedback(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "like" || normalized === "positive") return "positive";
  if (normalized === "dislike" || normalized === "negative") return "negative";
  return null;
}

function addEvent(
  events: AdminCareerActivityEvent[],
  includedUserIds: ReadonlySet<string>,
  kind: AdminCareerActivityEventKind,
  userId: string | null | undefined,
  occurredAt: string | null | undefined
) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedOccurredAt = String(occurredAt ?? "").trim();
  if (
    !normalizedUserId ||
    !normalizedOccurredAt ||
    !includedUserIds.has(normalizedUserId)
  ) {
    return;
  }
  events.push({
    kind,
    occurredAt: normalizedOccurredAt,
    userId: normalizedUserId,
  });
}

function logEventKind(type: string | null | undefined) {
  const normalized = String(type ?? "").trim();
  if (normalized === "career_app_opened") return "visit" as const;
  if (normalized === "login_completed") return "login" as const;
  if (
    CAREER_POSITION_VIEW_LOG_TYPES.includes(
      normalized as (typeof CAREER_POSITION_VIEW_LOG_TYPES)[number]
    )
  ) {
    return "positionView" as const;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }
    if (!isValidAdminPassword(getAdminPassword(req))) return unauthorized();

    const body = ((await req.json().catch(() => ({}))) ??
      {}) as ActivityRequestBody;
    const startDate =
      normalizeDateOnly(body.startDate) ??
      ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE;
    const endDate = normalizeDateOnly(body.endDate) ?? getKstTodayDate();
    if (startDate > endDate) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
        { status: 400 }
      );
    }
    if (daysBetweenDateOnly(startDate, endDate) > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: "Date range must be 3 years or less" },
        { status: 400 }
      );
    }

    const startIso = toKstStartIso(startDate);
    const endExclusiveIso = toKstEndExclusiveIso(endDate);
    if (!startIso || !endExclusiveIso) {
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 }
      );
    }

    const excludedEmails = readExcludedEmails(body);
    const excludedEmailSet = new Set(excludedEmails);
    const talentUsers = await fetchAllRows<TalentUserRow>(
      (from, to, includeCount) =>
        supabaseServer
          .from("talent_users")
          .select(
            "user_id,email,created_at,last_logined_at",
            includeCount ? { count: "exact" } : undefined
          )
          .lt("created_at", endExclusiveIso)
          .order("created_at", { ascending: true })
          .range(from, to)
    );
    const includedTalentUsers = talentUsers.filter(
      (user) => !isEmailExcluded(user.email, excludedEmailSet)
    );
    const includedUserIds = new Set(
      includedTalentUsers.map((user) => user.user_id).filter(Boolean)
    );

    const [logs, messages, emailMessages, feedbackAtRows, legacyFeedbackRows] =
      await Promise.all([
        fetchAllRows<LogRow>((from, to, includeCount) =>
          supabaseServer
            .from("logs")
            .select(
              "user_id,type,created_at",
              includeCount ? { count: "exact" } : undefined
            )
            .in("type", [...CAREER_ACTIVITY_LOG_TYPES])
            .gte("created_at", startIso)
            .lt("created_at", endExclusiveIso)
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<TalentMessageRow>((from, to, includeCount) =>
          supabaseServer
            .from("talent_messages")
            .select(
              "user_id,role,message_type,created_at",
              includeCount ? { count: "exact" } : undefined
            )
            .eq("role", "user")
            .in("message_type", ["chat", "call_transcript"])
            .gte("created_at", startIso)
            .lt("created_at", endExclusiveIso)
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<CareerEmailMessageRow>((from, to, includeCount) =>
          supabaseServer
            .from("career_email_messages")
            .select(
              "id,talent_id,occurred_at",
              includeCount ? { count: "exact" } : undefined
            )
            .eq("direction", "inbound")
            .not("status", "in", '("failed","skipped")')
            .gte("occurred_at", startIso)
            .lt("occurred_at", endExclusiveIso)
            .order("occurred_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<RecommendationFeedbackRow>((from, to, includeCount) =>
          supabaseServer
            .from("talent_opportunity_recommendation")
            .select(
              "id,talent_id,feedback,feedback_at,updated_at",
              includeCount ? { count: "exact" } : undefined
            )
            .not("feedback", "is", null)
            .gte("feedback_at", startIso)
            .lt("feedback_at", endExclusiveIso)
            .order("feedback_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<RecommendationFeedbackRow>((from, to, includeCount) =>
          supabaseServer
            .from("talent_opportunity_recommendation")
            .select(
              "id,talent_id,feedback,feedback_at,updated_at",
              includeCount ? { count: "exact" } : undefined
            )
            .not("feedback", "is", null)
            .is("feedback_at", null)
            .gte("updated_at", startIso)
            .lt("updated_at", endExclusiveIso)
            .order("updated_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
        ),
      ]);

    const events: AdminCareerActivityEvent[] = [];
    for (const user of includedTalentUsers) {
      addEvent(
        events,
        includedUserIds,
        "signup",
        user.user_id,
        user.created_at
      );
      if (
        user.last_logined_at &&
        user.last_logined_at >= startIso &&
        user.last_logined_at < endExclusiveIso
      ) {
        addEvent(
          events,
          includedUserIds,
          "login",
          user.user_id,
          user.last_logined_at
        );
      }
    }
    for (const log of logs) {
      const kind = logEventKind(log.type);
      if (kind) {
        addEvent(events, includedUserIds, kind, log.user_id, log.created_at);
      }
    }
    for (const message of messages) {
      const kind =
        message.message_type === "call_transcript" ? "voice" : "textChat";
      addEvent(
        events,
        includedUserIds,
        kind,
        message.user_id,
        message.created_at
      );
    }
    for (const message of emailMessages) {
      addEvent(
        events,
        includedUserIds,
        "email",
        message.talent_id,
        message.occurred_at
      );
    }

    const feedbackById = new Map<string, RecommendationFeedbackRow>();
    for (const feedback of [...feedbackAtRows, ...legacyFeedbackRows]) {
      if (normalizeFeedback(feedback.feedback)) {
        feedbackById.set(feedback.id, feedback);
      }
    }
    for (const feedback of feedbackById.values()) {
      addEvent(
        events,
        includedUserIds,
        "feedback",
        feedback.talent_id,
        feedback.feedback_at ?? feedback.updated_at
      );
    }

    const daily = aggregateCareerActivityEvents({
      endDate,
      events,
      interval: "day",
      startDate,
    });
    const weekly = aggregateCareerActivityEvents({
      endDate,
      events,
      interval: "week",
      startDate,
    });
    const monthly = aggregateCareerActivityEvents({
      endDate,
      events,
      interval: "month",
      startDate,
    });
    const response: AdminCareerActivityResponse = {
      endDate,
      excludedEmails,
      generatedAt: new Date().toISOString(),
      series: {
        day: daily.buckets,
        month: monthly.buckets,
        week: weekly.buckets,
      },
      startDate,
      timezone: "Asia/Seoul",
      totals: daily.totals,
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Career activity metrics",
      },
      { status: 500 }
    );
  }
}
