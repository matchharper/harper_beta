import { getFreshRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  createComposioClient,
  readComposioEnv,
} from "@/lib/integrations/composio";
import { createGoogleCalendarService } from "@/lib/integrations/googleCalendar";
import { createGoogleCalendarHandlers } from "@/lib/integrations/googleCalendarHandlers";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import type {
  GoogleCalendarStore,
  CalendarIntegrationRow,
} from "@/lib/integrations/googleCalendarStore";
import {
  databaseError,
  record,
  resourceDb,
  type ResourceContext,
} from "../resources/types";

export function careerCalendarService(admin: ResourceContext["admin"]) {
  const db = resourceDb(admin),
    table = () => db.from("talent_integrations");
  const row = (value: unknown): CalendarIntegrationRow | null =>
    value
      ? ({
          ...record(value),
          company_user_id: record(value).talent_id,
        } as CalendarIntegrationRow)
      : null;
  const store: GoogleCalendarStore = {
    async find(userId) {
      const result = await table()
        .select("*")
        .eq("talent_id", userId)
        .eq("provider", "google_calendar")
        .maybeSingle();
      databaseError(result.error);
      return row(result.data);
    },
    async insert(userId, accountId) {
      const result = await table()
        .insert({
          talent_id: userId,
          provider: "google_calendar",
          composio_connected_account_id: accountId,
          status: "active",
        })
        .select("*")
        .single();
      if (result.error?.code === "23505") return null;
      databaseError(result.error);
      return row(result.data);
    },
    async setStatus(previous, status) {
      const result = await table()
        .update({
          status,
          updated_at: new Date(
            Math.max(Date.now(), Date.parse(previous.updated_at) + 1)
          ).toISOString(),
        })
        .eq("talent_id", previous.company_user_id)
        .eq("provider", "google_calendar")
        .eq("status", previous.status)
        .eq("updated_at", previous.updated_at)
        .eq(
          "composio_connected_account_id",
          previous.composio_connected_account_id
        )
        .select("*")
        .maybeSingle();
      databaseError(result.error);
      return row(result.data);
    },
    async remove(previous) {
      const result = await table()
        .delete()
        .eq("talent_id", previous.company_user_id)
        .eq("provider", "google_calendar")
        .eq(
          "composio_connected_account_id",
          previous.composio_connected_account_id
        )
        .eq("status", previous.status)
        .eq("updated_at", previous.updated_at)
        .select("talent_id");
      databaseError(result.error);
      return Boolean(result.data?.length);
    },
  };
  return createGoogleCalendarService({
    store,
    vendor: createComposioClient(),
    getAuthConfigId: () =>
      readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
  });
}
export const careerCalendarHandlers = createGoogleCalendarHandlers({
  cookieName: "harper_career_calendar_oauth",
  cookiePath: "/api/talent/integrations/google-calendar",
  getStateSecret: () => readComposioEnv("COMPOSIO_API_KEY"),
  buildCallbackUrl(origin, _scope, nonce) {
    const url = new URL("/career/profile", origin);
    url.searchParams.set("profileSection", "links");
    url.searchParams.set("googleCalendar", "callback");
    url.searchParams.set("calendarState", nonce);
    return url.toString();
  },
  async getContext(request, scope) {
    const user = await getFreshRequestUser(request);
    if (!user)
      throw new GoogleCalendarError(
        401,
        "UNAUTHORIZED",
        "다시 로그인해 주세요."
      );
    if (scope !== "career")
      throw new GoogleCalendarError(
        400,
        "INVALID_SCOPE",
        "Career 연결 요청을 확인해 주세요."
      );
    const admin = getTalentSupabaseAdmin(),
      owner = await admin
        .from("talent_users")
        .select("user_id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();
    if (owner.error || !owner.data)
      throw new GoogleCalendarError(
        403,
        "OWNER_UNAVAILABLE",
        "Career 계정을 확인해 주세요."
      );
    return { userId: user.id, service: careerCalendarService(admin) };
  },
});
