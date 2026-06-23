import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;

const COMPANY_ENTRY_TYPES = ["company_new_visit", "company_new_session"];
const COMPANY_SEARCH_CLICK_TYPE = "company_click_search";
const COMPANY_MAIN_CLICK_TYPE = "company_click_main";
const COMPANY_LOG_TYPES = [
  ...COMPANY_ENTRY_TYPES,
  COMPANY_SEARCH_CLICK_TYPE,
  COMPANY_MAIN_CLICK_TYPE,
];

type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "local_id" | "type" | "created_at" | "is_mobile" | "country_lang"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type CompanyAnalyticsDateRange = {
  endDate: string | null;
  endExclusiveIso: string | null;
  isActive: boolean;
  startDate: string | null;
  startIso: string | null;
};

type CompanyFunnelStep = {
  count: number;
  detail: string;
  key: "entry" | "search_click" | "main_click" | "any_action";
  label: string;
  rateFromEntry: number | null;
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

function readDateRange(payload: unknown): CompanyAnalyticsDateRange {
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

function rateOrNull(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function buildStep(args: {
  count: number;
  detail: string;
  entryCount: number;
  key: CompanyFunnelStep["key"];
  label: string;
}): CompanyFunnelStep {
  return {
    key: args.key,
    label: args.label,
    count: args.count,
    detail: args.detail,
    rateFromEntry: rateOrNull(args.count, args.entryCount),
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
    const dateRange = readDateRange(payload);

    const logs = await fetchAllRows<LandingLogRow>((from, to) => {
      let query = supabaseServer
        .from("landing_logs")
        .select("local_id,type,created_at,is_mobile,country_lang")
        .in("type", COMPANY_LOG_TYPES)
        .order("id", { ascending: true })
        .range(from, to);

      if (dateRange.startIso) query = query.gte("created_at", dateRange.startIso);
      if (dateRange.endExclusiveIso) {
        query = query.lt("created_at", dateRange.endExclusiveIso);
      }

      return query;
    });

    const entryLocalIds = new Set<string>();
    const searchClickLocalIds = new Set<string>();
    const mainClickLocalIds = new Set<string>();
    const mobileEntryLocalIds = new Set<string>();
    const desktopEntryLocalIds = new Set<string>();

    for (const log of logs) {
      const localId = String(log.local_id ?? "").trim();
      if (!localId) continue;

      if (COMPANY_ENTRY_TYPES.includes(String(log.type ?? ""))) {
        entryLocalIds.add(localId);
        if (log.is_mobile === true) mobileEntryLocalIds.add(localId);
        if (log.is_mobile === false) desktopEntryLocalIds.add(localId);
      } else if (log.type === COMPANY_SEARCH_CLICK_TYPE) {
        searchClickLocalIds.add(localId);
      } else if (log.type === COMPANY_MAIN_CLICK_TYPE) {
        mainClickLocalIds.add(localId);
      }
    }

    const actionLocalIds = new Set<string>([
      ...Array.from(searchClickLocalIds),
      ...Array.from(mainClickLocalIds),
    ]);
    const entryCount = entryLocalIds.size;
    const steps = [
      buildStep({
        key: "entry",
        label: "Company landing entry",
        count: entryCount,
        detail: "landing_logs type company_new_visit / company_new_session",
        entryCount,
      }),
      buildStep({
        key: "search_click",
        label: "Search 이동",
        count: searchClickLocalIds.size,
        detail: "landing_logs type company_click_search",
        entryCount,
      }),
      buildStep({
        key: "main_click",
        label: "메인 버튼 클릭",
        count: mainClickLocalIds.size,
        detail: "landing_logs type company_click_main",
        entryCount,
      }),
      buildStep({
        key: "any_action",
        label: "Search 또는 메인 버튼",
        count: actionLocalIds.size,
        detail: "company_click_search 또는 company_click_main unique local_id",
        entryCount,
      }),
    ];

    return NextResponse.json({
      dateRange: {
        endDate: dateRange.endDate,
        isActive: dateRange.isActive,
        startDate: dateRange.startDate,
      },
      generatedAt: new Date().toISOString(),
      device: {
        desktopEntryCount: desktopEntryLocalIds.size,
        mobileEntryCount: mobileEntryLocalIds.size,
        unknownEntryCount:
          entryCount - desktopEntryLocalIds.size - mobileEntryLocalIds.size,
      },
      steps,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load company landing analytics",
      },
      { status: 500 }
    );
  }
}
