import { createClient } from "@supabase/supabase-js";

const email = "khj605123@gmail.com";
const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const testChannelId = String(
  process.env.HARPER_SLACK_LOCAL_TEST_CHANNEL_ID || ""
).trim();
if (!url || !key) throw new Error("Supabase admin environment is unavailable");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checked(query: PromiseLike<any>) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function main() {
  const talents = await checked(
    admin
      .from("talent_users")
      .select("user_id, email, name")
      .ilike("email", email)
      .limit(5)
  );
  const companyUsers = await checked(
    admin
      .from("company_users")
      .select("user_id, email, name")
      .ilike("email", email)
      .limit(5)
  );
  const companyUserIds = companyUsers.map((row: any) => row.user_id);
  const memberships = companyUserIds.length
    ? await checked(
        admin
          .from("company_user_workspace")
          .select("company_user_id, company_workspace_id, authority, role")
          .in("company_user_id", companyUserIds)
      )
    : [];
  const workspaceIds = Array.from(
    new Set(memberships.map((row: any) => row.company_workspace_id))
  );
  const workspaces = workspaceIds.length
    ? await checked(
        admin
          .from("company_workspace")
          .select("company_workspace_id, company_name, is_internal")
          .in("company_workspace_id", workspaceIds)
      )
    : [];
  const channels = testChannelId
    ? await checked(
        admin
          .from("company_slack_channels")
          .select(
            "id, company_workspace_id, slack_channel_id, slack_channel_name, slack_team_id, is_enabled, respond_to_mentions, reply_to_harper_threads"
          )
          .eq("slack_channel_id", testChannelId)
      )
    : [];
  const integrations = channels.length
    ? await checked(
        admin
          .from("company_slack_integrations")
          .select(
            "company_workspace_id, slack_team_id, slack_team_name, slack_bot_user_id, status"
          )
          .in(
            "company_workspace_id",
            channels.map((row: any) => row.company_workspace_id)
          )
      )
    : [];
  const wonderfulId = channels[0]?.company_workspace_id;
  const roles = wonderfulId
    ? await checked(
        admin
          .from("company_roles")
          .select("*")
          .eq("company_workspace_id", wonderfulId)
          .order("created_at", { ascending: false })
          .limit(5)
      )
    : [];
  const allWorkspaceChannels = wonderfulId
    ? await checked(
        admin
          .from("company_slack_channels")
          .select(
            "id, slack_channel_id, slack_channel_name, is_enabled, notify_candidate_accepted, notify_candidate_rejected"
          )
          .eq("company_workspace_id", wonderfulId)
      )
    : [];
  const ownRecommendations = talents[0]?.user_id
    ? await checked(
        admin
          .from("talent_opportunity_recommendation")
          .select("*")
          .eq("talent_id", talents[0].user_id)
          .order("created_at", { ascending: false })
          .limit(10)
      )
    : [];

  console.log(
    JSON.stringify(
      {
        talents,
        companyUsers,
        memberships,
        workspaces,
        testChannel: channels,
        integrations,
        roles: roles.map((role: any) => ({
          roleId: role.role_id,
          name: role.name,
          sourceType: role.source_type,
          status: role.status,
        })),
        allWorkspaceChannels,
        ownRecommendations: ownRecommendations.map((row: any) => ({
          id: row.id,
          roleId: row.role_id,
          feedback: row.feedback,
          savedStage: row.saved_stage,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
