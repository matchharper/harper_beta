import "server-only";

import type { User } from "@supabase/supabase-js";
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
  GOOGLE_CALENDAR_SYNC_WINDOW_DAYS,
  type GoogleCalendarSyncResponse,
} from "@/lib/meetings/calendarSync";
import { assertOrgWorkspaceAccess, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export async function syncGoogleCalendarBusyBlocks(args: {
  timezone: string;
  user: User;
  workspaceId: string;
}): Promise<GoogleCalendarSyncResponse> {
  const workspaceId = clean(args.workspaceId);
  const timezone = clean(args.timezone);
  if (!workspaceId) throw new OrgHttpError(400, "Workspace를 확인해 주세요.");
  if (!isValidCalendarTimezone(timezone)) {
    throw new OrgHttpError(400, "시간대를 확인해 주세요.");
  }
  const admin = getSupabaseAdmin();
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const vendor = createComposioClient();
  const service = createGoogleCalendarService({
    store: createGoogleCalendarStore(admin),
    vendor,
    getAuthConfigId: () =>
      readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
  });
  const accountId = await service.requireActiveAccountId(args.user.id);
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
    userId: args.user.id,
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
  const { data, error } = await (admin.rpc as any)(
    "upsert_google_calendar_busy_blocks_v1",
    {
      p_blocks: blocks as unknown as Json,
      p_company_user_id: args.user.id,
      p_connected_account_id: accountId,
      p_window_end: windowEnd.toISOString(),
      p_window_start: windowStart.toISOString(),
    }
  );
  if (error?.code === "40001") {
    throw new OrgHttpError(
      409,
      "동기화하는 동안 Calendar 연결이 바뀌었어요. 연결 상태를 확인한 뒤 다시 시도해 주세요."
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
    totalBusyCount: nonNegativeInteger(result?.totalBusyCount),
    updatedCount: nonNegativeInteger(result?.updatedCount),
    windowEnd: clean(result?.windowEnd) || windowEnd.toISOString(),
  };
}
