import { v5 as uuidv5 } from "uuid";
import { buildOrgRoleUrl, escapeSlackText, formatSlackLink } from "./slackMessages";

type IntroOpsNotificationArgs = {
  admin: { from: (table: string) => any };
  introCandidateId: string;
  workspaceId: string;
  status: string;
  post: (text: string, clientMessageId: string) => Promise<void>;
};

// Internal operations notification only; do not send it to a company's workspace.
export async function notifyIntroRequestForOps(args: IntroOpsNotificationArgs) {
  // The transaction returns already_requested for retries and double clicks.
  if (args.status !== "requested") return;
  return notifyIntroForOps(args, "requested");
}

export async function notifyIntroAcceptanceForOps(args: Omit<IntroOpsNotificationArgs, "status"> & {
  decisionChanged: boolean;
}) {
  // Only the transaction that records acceptance emits this event, not connection retries.
  if (!args.decisionChanged) return;
  return notifyIntroForOps(args, "accepted");
}

async function notifyIntroForOps(
  args: Omit<IntroOpsNotificationArgs, "status">,
  event: "requested" | "accepted"
) {
  try {
    const { data: intro, error } = await args.admin
      .from("company_intro_candidates")
      .select("role_id, talent_id, requested_at, talent_decision_at, status")
      .eq("id", args.introCandidateId)
      .eq("company_workspace_id", args.workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!intro?.requested_at) return;
    if (event === "accepted" && (!intro.talent_decision_at || !["connecting", "connected"].includes(intro.status))) return;
    const [workspace, role, talent] = await Promise.all([
      args.admin.from("company_workspace").select("company_name")
        .eq("company_workspace_id", args.workspaceId).maybeSingle(),
      args.admin.from("company_roles").select("name")
        .eq("role_id", intro.role_id).eq("company_workspace_id", args.workspaceId).maybeSingle(),
      args.admin.from("talent_users").select("name")
        .eq("user_id", intro.talent_id).maybeSingle(),
    ]);
    for (const result of [workspace, role, talent]) {
      if (result.error) throw result.error;
    }
    if (!workspace.data || !role.data || !talent.data) {
      throw new Error("Intro request notification facts are unavailable");
    }
    const label = `${workspace.data.company_name} : ${role.data.name}`;
    await args.post(
      `${event === "accepted" ? "후보자 Intro 수락" : "Intro 요청"} · ${formatSlackLink(buildOrgRoleUrl(args.workspaceId, intro.role_id), label)} → ${escapeSlackText(talent.data.name) || "이름 미등록 후보자"}`,
      uuidv5(`org-intro-${event}:${args.introCandidateId}`, uuidv5.URL)
    );
  } catch (error) {
    // An internal Slack outage must not turn an already-committed Intro into an error.
    console.error("[org/intro-ops-notification]", {
      event,
      introCandidateId: args.introCandidateId,
      error,
    });
  }
}
