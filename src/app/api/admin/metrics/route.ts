import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  createEmptyMetricBucket,
  enumerateDateKeys,
  normalizeEmail,
  normalizeExcludedEmails,
  toKstDateKey,
} from "@/lib/adminMetrics/utils";
import {
  ADMIN_METRIC_DEFAULT_START_DATE,
} from "@/lib/adminMetrics/constants";
import type { AdminMetricsResponse } from "@/lib/adminMetrics/types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;
const COMPANY_USER_CHUNK_SIZE = 200;

type CompanyUserRow = {
  user_id: string | null;
  email: string | null;
  created_at: string;
};

type RunRow = {
  id: string | null;
  user_id: string | null;
  created_at: string;
};

type UnlockProfileRow = {
  company_user_id: string | null;
  created_at: string;
};

type LogRow = {
  user_id: string | null;
  type: string | null;
  created_at: string;
};

type MessageRow = {
  user_id: string | null;
  created_at: string;
};

type CandidateMarkRow = {
  user_id: string | null;
  candid_id: string | null;
  created_at: string;
  updated_at: string;
};

type MetricsRequestBody = {
  startDate?: string;
  endDate?: string;
  excludedEmails?: string[] | string;
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

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return { year, month, day };
}

function getKstTodayDate() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function resolveStartDate(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  return parseDateInput(trimmed) ? trimmed : ADMIN_METRIC_DEFAULT_START_DATE;
}

function resolveEndDate(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  return parseDateInput(trimmed) ? trimmed : getKstTodayDate();
}

function toKstStartUtcIso(value: string) {
  const parsed = parseDateInput(value);
  if (!parsed) return null;

  const utcMs =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0) -
    9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function toKstEndExclusiveUtcIso(value: string) {
  const parsed = parseDateInput(value);
  if (!parsed) return null;

  const utcMs =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1, 0, 0, 0, 0) -
    9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function parseProfileViewCandidateId(type: unknown) {
  const value = String(type ?? "").trim();
  const candidateCardPrefix = "candidate_card_click:";
  if (value.startsWith(candidateCardPrefix)) {
    const candidId = value.slice(candidateCardPrefix.length).trim();
    return candidId || null;
  }

  const profileViewPrefix = "profile_view:";
  if (value.startsWith(profileViewPrefix)) {
    const candidId = value.slice(profileViewPrefix.length).trim();
    return candidId || null;
  }

  return null;
}

function parseLinkClickCandidateId(type: unknown) {
  const value = String(type ?? "").trim();
  const prefix = "profile_link_click:";
  if (!value.startsWith(prefix)) return null;

  const rest = value.slice(prefix.length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex === -1) return null;

  const candidId = rest.slice(0, separatorIndex).trim();
  return candidId || null;
}

async function fetchAllRows<T>(
  loadPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: any }>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await loadPage(from, to);
    if (error) {
      throw new Error(error.message ?? "Failed to load rows");
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < BATCH_SIZE) {
      break;
    }

    from += BATCH_SIZE;
  }

  return rows;
}

async function fetchCompanyUsersInRange(startUtcIso: string, endUtcIso: string) {
  return fetchAllRows<CompanyUserRow>((from, to) =>
    supabaseServer
      .from("company_users")
      .select("user_id, email, created_at")
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso)
      .order("created_at", { ascending: true })
      .order("user_id", { ascending: true })
      .range(from, to)
  );
}

async function fetchRunsInRange(startUtcIso: string, endUtcIso: string) {
  return fetchAllRows<RunRow>((from, to) =>
    supabaseServer
      .from("runs")
      .select("id, user_id, created_at")
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}

async function fetchUnlockProfilesInRange(
  startUtcIso: string,
  endUtcIso: string
) {
  return fetchAllRows<UnlockProfileRow>((from, to) =>
    (supabaseServer.from("unlock_profile" as any) as any)
      .select("company_user_id, created_at")
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}

async function fetchLogsInRange(
  startUtcIso: string,
  endUtcIso: string,
  filter: (query: any) => any
) {
  return fetchAllRows<LogRow>((from, to) =>
    filter(
      supabaseServer
        .from("logs")
        .select("user_id, type, created_at")
        .gte("created_at", startUtcIso)
        .lt("created_at", endUtcIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    )
  );
}

async function fetchMessagesInRange(startUtcIso: string, endUtcIso: string) {
  return fetchAllRows<MessageRow>((from, to) =>
    supabaseServer
      .from("messages")
      .select("user_id, created_at")
      .eq("role", 0)
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}

async function fetchCandidateMarksByCreatedAt(
  startUtcIso: string,
  endUtcIso: string
) {
  return fetchAllRows<CandidateMarkRow>((from, to) =>
    supabaseServer
      .from("candidate_mark")
      .select("user_id, candid_id, created_at, updated_at")
      .gte("created_at", startUtcIso)
      .lt("created_at", endUtcIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}

async function fetchCandidateMarksByUpdatedAt(
  startUtcIso: string,
  endUtcIso: string
) {
  return fetchAllRows<CandidateMarkRow>((from, to) =>
    supabaseServer
      .from("candidate_mark")
      .select("user_id, candid_id, created_at, updated_at")
      .gte("updated_at", startUtcIso)
      .lt("updated_at", endUtcIso)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
}

async function loadCompanyUserEmailsByIds(userIds: string[]) {
  const emailByUserId = new Map<string, string>();
  const normalizedIds = Array.from(new Set(userIds.map((value) => String(value).trim()).filter(Boolean)));

  for (let index = 0; index < normalizedIds.length; index += COMPANY_USER_CHUNK_SIZE) {
    const chunk = normalizedIds.slice(index, index + COMPANY_USER_CHUNK_SIZE);
    const { data, error } = await supabaseServer
      .from("company_users")
      .select("user_id, email")
      .in("user_id", chunk);

    if (error) {
      throw new Error(error.message ?? "Failed to load company users");
    }

    for (const row of data ?? []) {
      const userId = String(row?.user_id ?? "").trim();
      if (!userId) continue;
      emailByUserId.set(userId, normalizeEmail(row?.email ?? ""));
    }
  }

  return emailByUserId;
}

function addToDateSet(map: Map<string, Set<string>>, date: string, value: string) {
  if (!date || !value) return;
  const set = map.get(date) ?? new Set<string>();
  set.add(value);
  map.set(date, set);
}

function canIncludeUser(
  userId: string | null | undefined,
  excludedEmailSet: Set<string>,
  emailByUserId: Map<string, string>
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return false;

  const email = normalizeEmail(emailByUserId.get(normalizedUserId) ?? "");
  return !email || !isEmailExcluded(email, excludedEmailSet);
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

    let body: MetricsRequestBody;
    try {
      body = (await req.json()) as MetricsRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const startDate = resolveStartDate(body?.startDate);
    const endDate = resolveEndDate(body?.endDate);
    if (startDate > endDate) {
      return NextResponse.json(
        { error: "startDate must be before or equal to endDate" },
        { status: 400 }
      );
    }

    const startUtcIso = toKstStartUtcIso(startDate);
    const endUtcIso = toKstEndExclusiveUtcIso(endDate);
    if (!startUtcIso || !endUtcIso) {
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 }
      );
    }

    const excludedEmails = normalizeExcludedEmails(body?.excludedEmails ?? []);
    const excludedEmailSet = new Set(excludedEmails);

    const [
      signupUsers,
      runs,
      unlockProfiles,
      candidateCardClicks,
      profileViews,
      profileLinkClicks,
      loginLogs,
      chatMessages,
      candidateMarksCreated,
      candidateMarksUpdated,
    ] = await Promise.all([
      fetchCompanyUsersInRange(startUtcIso, endUtcIso),
      fetchRunsInRange(startUtcIso, endUtcIso),
      fetchUnlockProfilesInRange(startUtcIso, endUtcIso),
      fetchLogsInRange(startUtcIso, endUtcIso, (query) =>
        query.like("type", "candidate_card_click:%")
      ),
      fetchLogsInRange(startUtcIso, endUtcIso, (query) =>
        query.like("type", "profile_view:%")
      ),
      fetchLogsInRange(startUtcIso, endUtcIso, (query) =>
        query.like("type", "profile_link_click:%")
      ),
      fetchLogsInRange(startUtcIso, endUtcIso, (query) =>
        query.eq("type", "login_completed")
      ),
      fetchMessagesInRange(startUtcIso, endUtcIso),
      fetchCandidateMarksByCreatedAt(startUtcIso, endUtcIso),
      fetchCandidateMarksByUpdatedAt(startUtcIso, endUtcIso),
    ]);

    const emailByUserId = new Map<string, string>();
    for (const row of signupUsers) {
      const userId = String(row?.user_id ?? "").trim();
      if (!userId) continue;
      emailByUserId.set(userId, normalizeEmail(row?.email ?? ""));
    }

    const userIdsToLoad = new Set<string>();
    for (const row of runs) {
      const userId = String(row?.user_id ?? "").trim();
      if (userId && !emailByUserId.has(userId)) userIdsToLoad.add(userId);
    }
    for (const row of unlockProfiles) {
      const userId = String(row?.company_user_id ?? "").trim();
      if (userId && !emailByUserId.has(userId)) userIdsToLoad.add(userId);
    }
    for (const row of [
      ...candidateCardClicks,
      ...profileViews,
      ...profileLinkClicks,
      ...loginLogs,
    ]) {
      const userId = String(row?.user_id ?? "").trim();
      if (userId && !emailByUserId.has(userId)) userIdsToLoad.add(userId);
    }
    for (const row of chatMessages) {
      const userId = String(row?.user_id ?? "").trim();
      if (userId && !emailByUserId.has(userId)) userIdsToLoad.add(userId);
    }
    for (const row of [...candidateMarksCreated, ...candidateMarksUpdated]) {
      const userId = String(row?.user_id ?? "").trim();
      if (userId && !emailByUserId.has(userId)) userIdsToLoad.add(userId);
    }

    const additionalEmailByUserId = await loadCompanyUserEmailsByIds(
      Array.from(userIdsToLoad)
    );
    for (const [userId, email] of Array.from(additionalEmailByUserId.entries())) {
      emailByUserId.set(userId, email);
    }

    const bucketMap = new Map<string, ReturnType<typeof createEmptyMetricBucket>>();
    for (const date of enumerateDateKeys(startDate, endDate)) {
      bucketMap.set(date, createEmptyMetricBucket(date));
    }

    const uniqueProfileViewsByDate = new Map<string, Set<string>>();
    const profileViewUsersByDate = new Map<string, Set<string>>();
    const markedCandidatesByDate = new Map<string, Set<string>>();
    const loginUsersByDate = new Map<string, Set<string>>();
    const runUsersByDate = new Map<string, Set<string>>();
    const linkClickedProfilesByDate = new Map<string, Set<string>>();

    for (const row of signupUsers) {
      const userId = String(row?.user_id ?? "").trim();
      if (!userId) continue;

      const email = normalizeEmail(row?.email ?? "");
      if (email && isEmailExcluded(email, excludedEmailSet)) continue;

      const date = toKstDateKey(row?.created_at);
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.signupCount += 1;
    }

    for (const row of runs) {
      const userId = String(row?.user_id ?? "").trim();
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.created_at);
      const bucket = bucketMap.get(date);
      if (!bucket) continue;

      bucket.runCount += 1;
      addToDateSet(runUsersByDate, date, userId);
    }

    for (const row of unlockProfiles) {
      const userId = String(row?.company_user_id ?? "").trim();
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.created_at);
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.revealCount += 1;
    }

    for (const row of [...candidateCardClicks, ...profileViews]) {
      const userId = String(row?.user_id ?? "").trim();
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const candidId = parseProfileViewCandidateId(row?.type);
      if (!candidId) continue;

      const date = toKstDateKey(row?.created_at);
      if (!bucketMap.has(date)) continue;

      addToDateSet(uniqueProfileViewsByDate, date, `${userId}:${candidId}`);
      addToDateSet(profileViewUsersByDate, date, userId);
    }

    for (const row of profileLinkClicks) {
      const userId = String(row?.user_id ?? "").trim();
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.created_at);
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.profileLinkClickCount += 1;

      const candidId = parseLinkClickCandidateId(row?.type);
      if (!candidId) continue;
      addToDateSet(linkClickedProfilesByDate, date, `${userId}:${candidId}`);
    }

    for (const row of chatMessages) {
      const userId = String(row?.user_id ?? "").trim();
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.created_at);
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.chatInputCount += 1;
    }

    for (const row of loginLogs) {
      const userId = String(row?.user_id ?? "").trim();
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.created_at);
      if (!bucketMap.has(date)) continue;

      addToDateSet(loginUsersByDate, date, userId);
    }

    for (const row of candidateMarksCreated) {
      const userId = String(row?.user_id ?? "").trim();
      const candidId = String(row?.candid_id ?? "").trim();
      if (!candidId) continue;
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.created_at);
      if (!bucketMap.has(date)) continue;

      addToDateSet(markedCandidatesByDate, date, `${userId}:${candidId}`);
    }

    for (const row of candidateMarksUpdated) {
      const userId = String(row?.user_id ?? "").trim();
      const candidId = String(row?.candid_id ?? "").trim();
      if (!candidId) continue;
      if (!canIncludeUser(userId, excludedEmailSet, emailByUserId)) continue;

      const date = toKstDateKey(row?.updated_at);
      if (!bucketMap.has(date)) continue;

      addToDateSet(markedCandidatesByDate, date, `${userId}:${candidId}`);
    }

    for (const [date, values] of Array.from(uniqueProfileViewsByDate.entries())) {
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.uniqueProfileViewCount = values.size;
      bucket.uniqueProfileViewKeys = Array.from(values);
    }

    for (const [date, values] of Array.from(profileViewUsersByDate.entries())) {
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.profileViewUserCount = values.size;
      bucket.profileViewUserIds = Array.from(values);
    }

    for (const [date, values] of Array.from(markedCandidatesByDate.entries())) {
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.markedCandidateCount = values.size;
      bucket.markedCandidateKeys = Array.from(values);
    }

    for (const [date, values] of Array.from(loginUsersByDate.entries())) {
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.loginUserCount = values.size;
      bucket.loginUserIds = Array.from(values);
    }

    for (const [date, values] of Array.from(runUsersByDate.entries())) {
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.runUserCount = values.size;
      bucket.runUserIds = Array.from(values);
    }

    for (const [date, values] of Array.from(linkClickedProfilesByDate.entries())) {
      const bucket = bucketMap.get(date);
      if (!bucket) continue;
      bucket.linkClickedProfileKeys = Array.from(values);
    }

    const response: AdminMetricsResponse = {
      bucketUnit: "day",
      startDate,
      endDate,
      excludedEmails,
      buckets: Array.from(bucketMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
