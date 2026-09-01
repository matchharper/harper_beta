import "server-only";

import {
  ComposioApiError,
  createComposioClient,
  readComposioEnv,
} from "@/lib/integrations/composio";
import { createGoogleCalendarService } from "@/lib/integrations/googleCalendar";
import { createGoogleCalendarStore } from "@/lib/integrations/googleCalendarStore";
import {
  GOOGLE_CALENDAR_LIST_ALL_EVENTS_TOOL,
  GOOGLE_CALENDAR_TOOL_VERSION,
  hasGoogleCalendarListErrors,
  isValidCalendarTimezone,
  parseGoogleCalendarBusyBlocks,
} from "@/lib/integrations/googleCalendarTools";
import {
  GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS,
  GOOGLE_CALENDAR_SYNC_WINDOW_DAYS,
  type GoogleCalendarSyncResponse,
  isFreshGoogleCalendarSync,
} from "@/lib/meetings/calendarSync";
import { OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type GoogleCalendarAutomaticSyncResult =
  | { lastSyncedAt: null; status: "inactive" }
  | { lastSyncedAt: string; status: "fresh" | "synced" };

const inFlightAutomaticSyncs = new Map<
  string,
  Promise<GoogleCalendarSyncResponse>
>();

async function readCalendarSyncState(args: {
  admin: AdminClient;
  companyUserId: string;
}) {
  return createGoogleCalendarStore(args.admin).find(args.companyUserId);
}

export async function syncGoogleCalendarBusyBlocksIfStaleForCompanyUser(args: {
  admin?: AdminClient;
  companyUserId: string;
  minimumIntervalMs?: number;
  skipIfNotActive?: boolean;
  timezone: string;
  workspaceId: string;
}): Promise<GoogleCalendarAutomaticSyncResult> {
  const admin = args.admin ?? getSupabaseAdmin();
  const companyUserId = clean(args.companyUserId);
  const minimumIntervalMs = Math.max(
    0,
    args.minimumIntervalMs ?? GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS
  );
  const state = await readCalendarSyncState({ admin, companyUserId });
  if (!state || state.status !== "active") {
    if (args.skipIfNotActive) {
      return { lastSyncedAt: null, status: "inactive" };
    }
    const result = await syncGoogleCalendarBusyBlocksForCompanyUser({
      admin,
      companyUserId,
      timezone: args.timezone,
      workspaceId: args.workspaceId,
    });
    return { lastSyncedAt: result.lastSyncedAt, status: "synced" };
  }
  if (
    isFreshGoogleCalendarSync(
      state.last_synced_at,
      Date.now(),
      minimumIntervalMs
    )
  ) {
    return { lastSyncedAt: state.last_synced_at!, status: "fresh" };
  }

  const running = inFlightAutomaticSyncs.get(companyUserId);
  if (running) {
    const result = await running;
    return { lastSyncedAt: result.lastSyncedAt, status: "synced" };
  }

  const sync = syncGoogleCalendarBusyBlocksForCompanyUser({
    admin,
    companyUserId,
    timezone: args.timezone,
    workspaceId: args.workspaceId,
  });
  inFlightAutomaticSyncs.set(companyUserId, sync);
  try {
    const result = await sync;
    return { lastSyncedAt: result.lastSyncedAt, status: "synced" };
  } catch (error) {
    // Separate serverless instances may race after observing the same stale
    // timestamp. If another request completed while this one failed, callers
    // can safely use that newly refreshed mirror.
    const latest = await readCalendarSyncState({ admin, companyUserId });
    if (
      latest?.status === "active" &&
      isFreshGoogleCalendarSync(
        latest.last_synced_at,
        Date.now(),
        minimumIntervalMs
      )
    ) {
      return { lastSyncedAt: latest.last_synced_at!, status: "fresh" };
    }
    throw error;
  } finally {
    if (inFlightAutomaticSyncs.get(companyUserId) === sync) {
      inFlightAutomaticSyncs.delete(companyUserId);
    }
  }
}

export async function syncGoogleCalendarBusyBlocksForCompanyUser(args: {
  admin?: AdminClient;
  companyUserId: string;
  timezone: string;
  workspaceId: string;
}): Promise<GoogleCalendarSyncResponse> {
  const admin = args.admin ?? getSupabaseAdmin();
  const companyUserId = clean(args.companyUserId);
  const workspaceId = clean(args.workspaceId);
  const timezone = clean(args.timezone);
  if (!companyUserId || !workspaceId) {
    throw new OrgHttpError(400, "Calendar를 동기화할 사용자를 확인해 주세요.");
  }
  if (!isValidCalendarTimezone(timezone)) {
    throw new OrgHttpError(400, "시간대를 확인해 주세요.");
  }
  const { data: membership, error: membershipError } = await admin
    .from("company_user_workspace")
    .select("id")
    .eq("company_workspace_id", workspaceId)
    .eq("company_user_id", companyUserId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    throw new OrgHttpError(404, "Calendar 일정 담당자를 찾지 못했어요.");
  }

  const vendor = createComposioClient();
  const service = createGoogleCalendarService({
    store: createGoogleCalendarStore(admin),
    vendor,
    getAuthConfigId: () =>
      readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
  });
  const accountId = await service.requireActiveAccountId(companyUserId);
  const windowStart = new Date();
  const windowEnd = new Date(
    windowStart.getTime() + GOOGLE_CALENDAR_SYNC_WINDOW_DAYS * 86_400_000
  );
  const payload = await vendor.executeTool<unknown>({
    accountId,
    arguments: {
      max_results_per_calendar: 2_500,
      response_detail: "full",
      show_deleted: false,
      single_events: true,
      time_max: windowEnd.toISOString(),
      time_min: windowStart.toISOString(),
    },
    slug: GOOGLE_CALENDAR_LIST_ALL_EVENTS_TOOL,
    userId: companyUserId,
    version: GOOGLE_CALENDAR_TOOL_VERSION,
  });
  if (hasGoogleCalendarListErrors(payload)) {
    throw new ComposioApiError(
      "One or more Google calendars failed to sync",
      502,
      { code: "PARTIAL_CALENDAR_SYNC" }
    );
  }
  const blocks = parseGoogleCalendarBusyBlocks({
    fallbackTimezone: timezone,
    payload,
    windowEnd,
    windowStart,
  });
  const { data, error } = await admin.rpc(
    "upsert_google_calendar_busy_blocks_v1",
    {
      p_blocks: blocks as unknown as Json,
      p_company_user_id: companyUserId,
      p_connected_account_id: accountId,
      p_window_end: windowEnd.toISOString(),
      p_window_start: windowStart.toISOString(),
    }
  );
  if (error?.code === "40001") {
    throw new OrgHttpError(
      409,
      "동기화하는 동안 더 최신 Sync가 완료됐거나 Calendar 연결이 바뀌었어요. 최신 일정을 다시 확인해 주세요."
    );
  }
  if (error?.code === "55000") {
    throw new OrgHttpError(409, "Google Calendar를 다시 연결해 주세요.");
  }
  if (error) throw error;
  const result = data as Record<string, unknown> | null;
  return {
    addedCount: nonNegativeInteger(result?.addedCount),
    lastSyncedAt: clean(result?.lastSyncedAt) || new Date().toISOString(),
    ok: true,
    removedCount: nonNegativeInteger(result?.removedCount),
    totalBusyCount: nonNegativeInteger(result?.totalBusyCount),
    updatedCount: nonNegativeInteger(result?.updatedCount),
    windowEnd: clean(result?.windowEnd) || windowEnd.toISOString(),
  };
}
