import { companyEmailTopicEnabled } from "./companyPreferencesContract";
import type { User } from "@supabase/supabase-js";
import { assertOrgWorkspacePermission } from "@/lib/org/server";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";

export async function updateCompanyEmailPreferences(args: {
  admin: OrgAgentAdminClient; user: User; workspaceId: string; input: Record<string, unknown>;
}) {
  const { scope, enabled } = args.input;
  if ((scope !== "slack_connection" && scope !== "all_proactive") || typeof enabled !== "boolean")
    throw Error("Expected a supported email scope and boolean enabled");
  await assertOrgWorkspacePermission({ admin: args.admin, user: args.user, workspaceId: args.workspaceId, permission: "view" });
  const { data, error } = await (args.admin.rpc as any)("set_company_email_preference_v1", {
    p_user_id: args.user.id, p_topic: scope, p_enabled: enabled,
  });
  if (error) throw error;
  return { status: "saved", scope: scope === "all_proactive" ? "본인의 모든 선제 안내 이메일" : "본인의 Slack 연결 안내 이메일",
    enabled, slackConnectionNoticesEnabled: companyEmailTopicEnabled(data, "slack_connection"),
    appliesAcrossWorkspaces: true };
}
