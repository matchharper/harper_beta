import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { assertOrgWorkspaceAccess, OrgHttpError } from "@/lib/org/server";
import { createComposioClient, readComposioEnv } from "./composio";
import { createGoogleCalendarService } from "./googleCalendar";
import { GoogleCalendarError } from "./googleCalendarError";
import { createGoogleCalendarHandlers } from "./googleCalendarHandlers";
import { createGoogleCalendarStore } from "./googleCalendarStore";

export const googleCalendarHandlers = createGoogleCalendarHandlers({
  getStateSecret: () => readComposioEnv("COMPOSIO_API_KEY"),
  async getContext(req, workspaceId) {
    // Personal credentials must never use the development-only, decoded-JWT
    // fallback of getRequestUser. Verify the bearer token with Supabase Auth.
    const user = await getFreshRequestUser(req);
    if (!user)
      throw new GoogleCalendarError(
        401,
        "UNAUTHORIZED",
        "다시 로그인한 뒤 시도해 주세요."
      );
    const admin = getSupabaseAdmin();
    try {
      // A viewer can manage their own personal connection. The permission for
      // shared company integrations (e.g. Slack) is deliberately not used here.
      await assertOrgWorkspaceAccess({ admin, user, workspaceId });
    } catch (error) {
      if (error instanceof OrgHttpError) {
        throw new GoogleCalendarError(
          error.status,
          "WORKSPACE_ACCESS_DENIED",
          "이 Workspace에 접근할 수 없어요."
        );
      }
      throw error;
    }
    return {
      userId: user.id,
      service: createGoogleCalendarService({
        store: createGoogleCalendarStore(admin),
        vendor: createComposioClient(),
        getAuthConfigId: () =>
          readComposioEnv("COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID"),
      }),
    };
  },
});
