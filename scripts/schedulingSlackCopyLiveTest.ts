import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ID = "720254d7-aeb7-4709-a56f-7b822f89eac5";
const CHANNEL_ID = "6989ff51-494c-41be-9602-6a2579d8960a";
const SLACK_CHANNEL_ID = "C0BLRJ96GSJ";
const COMPANY_USER_ID = "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd";
const TALENT_ID = COMPANY_USER_ID;
const ROLE_ID = "c0de0000-0000-4000-8000-000000000826";
const RECOMMENDATION_ID = "c0de0000-0000-4000-8000-000000000827";
const ROLE_NAME = "[Codex Schedule Copy Live 2026-08-26 B] Product Engineer";
const TEST_WORKER_TARGET = "local-codex-schedule-copy-0826";
const DEFAULT_SLACK_THREAD_TS = "1787680637.096129";

function getSlackThreadTs() {
  const argument = process.argv.find((value) => value.startsWith("--thread-ts="));
  return String(argument?.slice("--thread-ts=".length) || DEFAULT_SLACK_THREAD_TS).trim();
}

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) throw new Error("Supabase admin environment is unavailable");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checked(query: PromiseLike<any>) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function setup() {
  const [workspaceRows, channelRows, talentRows, companyUserRows, roleRows] =
    await Promise.all([
      checked(
        admin
          .from("company_workspace")
          .select("company_workspace_id,company_name,is_internal")
          .eq("company_workspace_id", WORKSPACE_ID)
      ),
      checked(
        admin
          .from("company_slack_channels")
          .select(
            "id,company_workspace_id,slack_channel_id,worker_target,reply_to_harper_threads"
          )
          .eq("id", CHANNEL_ID)
      ),
      checked(
        admin
          .from("talent_users")
          .select("user_id,email,name")
          .eq("user_id", TALENT_ID)
      ),
      checked(
        admin
          .from("company_users")
          .select("user_id,email,name")
          .eq("user_id", COMPANY_USER_ID)
      ),
      checked(admin.from("company_roles").select("role_id").eq("role_id", ROLE_ID)),
    ]);

  const workspace = workspaceRows[0];
  const channel = channelRows[0];
  const talent = talentRows[0];
  const companyUser = companyUserRows[0];
  if (
    workspace?.company_name !== "Harper" ||
    workspace?.is_internal !== true ||
    channel?.company_workspace_id !== WORKSPACE_ID ||
    channel?.slack_channel_id !== SLACK_CHANNEL_ID ||
    !["production", TEST_WORKER_TARGET].includes(channel?.worker_target) ||
    channel?.reply_to_harper_threads !== true ||
    talent?.email !== "khj605123@gmail.com" ||
    companyUser?.email !== "khj605123@gmail.com"
  ) {
    throw new Error(
      `Refusing setup because the authorized test scope changed: ${JSON.stringify({
        channel,
        companyUser,
        talent,
        workspace,
      })}`
    );
  }
  if (roleRows.length > 0) {
    throw new Error("Refusing setup because the fixture role already exists");
  }

  const existingAvailability = await checked(
    admin
      .from("meeting_availability")
      .select("company_workspace_id")
      .eq("company_workspace_id", WORKSPACE_ID)
      .eq("company_user_id", COMPANY_USER_ID)
  );
  if (existingAvailability.length > 0) {
    throw new Error(
      "Refusing setup because the company user already has availability"
    );
  }

  const now = new Date().toISOString();
  await checked(
    admin.from("company_roles").insert({
      company_workspace_id: WORKSPACE_ID,
      created_at: now,
      description:
        "Isolated live Slack scheduling copy verification for the authorized owner account.",
      is_expired: false,
      name: ROLE_NAME,
      role_id: ROLE_ID,
      source_type: "internal",
      status: "active",
      summary: {},
      type: ["full_time"],
      updated_at: now,
    })
  );
  await checked(
    admin.from("company_internal_roles").upsert(
      {
        considerations: [],
        criteria: [],
        is_auto: false,
        request:
          "Codex live scheduling copy verification. Never show this role to another talent.",
        role_id: ROLE_ID,
        updated_at: now,
      },
      { onConflict: "role_id" }
    )
  );
  await checked(
    admin.from("talent_opportunity_recommendation").insert({
      evidence: [],
      feedback: "like",
      feedback_at: now,
      fit_reasons: ["본인 계정만 사용하는 격리된 일정 조율 검증"],
      fit_summary: "실제 Slack 일정 조율 문구 검증용 후보자",
      id: RECOMMENDATION_ID,
      opportunity_type: "internal_recommendation",
      preference_fit: {},
      recommended_at: now,
      role_id: ROLE_ID,
      saved_stage: "accepted",
      score: 1,
      talent_id: TALENT_ID,
      tradeoffs: [],
      updated_at: now,
    })
  );
  await checked(
    admin.from("talent_opportunity_tag").insert({
      opportunity_id: ROLE_ID,
      tag: "내부:연결대기",
      talent_id: TALENT_ID,
    })
  );

  console.log(
    JSON.stringify(
      {
        candidate: { email: talent.email, name: talent.name },
        channel: SLACK_CHANNEL_ID,
        roleId: ROLE_ID,
        roleName: ROLE_NAME,
        state: "pending_connection",
        workspace: "Harper",
      },
      null,
      2
    )
  );
}

async function status() {
  const slackThreadTs = getSlackThreadTs();
  const schedules = await checked(
    admin
      .from("meeting_schedules")
      .select(
        "id,status,title,duration_minutes,company_attendees,active_round_id,updated_at"
      )
      .eq("role_id", ROLE_ID)
  );
  const scheduleIds = schedules.map((row: any) => row.id);
  const [roles, recommendations, tags, availability, rounds, progress, threads] =
    await Promise.all([
      checked(
        admin
          .from("company_roles")
          .select("role_id,name,status")
          .eq("role_id", ROLE_ID)
      ),
      checked(
        admin
          .from("talent_opportunity_recommendation")
          .select("id,feedback,saved_stage,updated_at")
          .eq("id", RECOMMENDATION_ID)
      ),
      checked(
        admin
          .from("talent_opportunity_tag")
          .select("tag,updated_at")
          .eq("talent_id", TALENT_ID)
          .eq("opportunity_id", ROLE_ID)
      ),
      checked(
        admin
          .from("meeting_availability")
          .select("timezone,weekly_rules,date_overrides,version,updated_at")
          .eq("company_workspace_id", WORKSPACE_ID)
          .eq("company_user_id", COMPANY_USER_ID)
      ),
      scheduleIds.length
        ? checked(
            admin
              .from("meeting_schedule_rounds")
              .select(
                "id,schedule_id,round_number,status,draft_blocker,additional_message,updated_at"
              )
              .in("schedule_id", scheduleIds)
          )
        : [],
      checked(
        admin
          .from("talent_progress")
          .select("kind,text,metadata,created_at")
          .eq("talent_id", TALENT_ID)
          .eq("role_id", ROLE_ID)
          .order("created_at", { ascending: true })
      ),
      checked(
        admin
          .from("company_slack_threads")
          .select("id,slack_thread_ts,role_id")
          .eq("channel_id", CHANNEL_ID)
          .eq("slack_thread_ts", slackThreadTs)
      ),
    ]);
  const threadIds = threads.map((row: any) => row.id);
  const [jobs, messages, channel] = await Promise.all([
    threadIds.length
      ? checked(
          admin
            .from("slack_reply_jobs")
            .select(
              "id,status,prompt,response_text,slack_message_ts,slack_response_ts,last_error,worker_target"
            )
            .in("thread_id", threadIds)
            .order("created_at", { ascending: true })
        )
      : [],
    threadIds.length
      ? checked(
          admin
            .from("company_messages")
            .select("id,role,content,slack_message_ts,metadata")
            .in("slack_thread_id", threadIds)
            .order("id", { ascending: true })
        )
      : [],
    checked(
      admin
        .from("company_slack_channels")
        .select("worker_target,reply_to_harper_threads")
        .eq("id", CHANNEL_ID)
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        availability,
        channel,
        jobs,
        messages,
        progress,
        recommendations,
        roles,
        rounds,
        schedules,
        tags,
        threads,
      },
      null,
      2
    )
  );
}

async function cleanup() {
  const slackThreadTs = getSlackThreadTs();
  const roleRows = await checked(
    admin
      .from("company_roles")
      .select("role_id,name,company_workspace_id")
      .eq("role_id", ROLE_ID)
  );
  if (
    roleRows.length > 0 &&
    (roleRows.length !== 1 ||
      roleRows[0].name !== ROLE_NAME ||
      roleRows[0].company_workspace_id !== WORKSPACE_ID)
  ) {
    throw new Error(`Refusing cleanup: ${JSON.stringify(roleRows)}`);
  }

  const schedules = await checked(
    admin.from("meeting_schedules").select("id").eq("role_id", ROLE_ID)
  );
  const scheduleIds = schedules.map((row: any) => row.id);
  if (scheduleIds.length) {
    await checked(
      admin.from("meeting_schedule_rounds").delete().in("schedule_id", scheduleIds)
    );
    await checked(admin.from("meeting_schedules").delete().in("id", scheduleIds));
  }

  const threads = await checked(
    admin
      .from("company_slack_threads")
      .select("id")
      .eq("channel_id", CHANNEL_ID)
      .eq("slack_thread_ts", slackThreadTs)
  );
  const threadIds = threads.map((row: any) => row.id);
  if (threadIds.length) {
    await checked(
      admin.from("slack_reply_jobs").delete().in("thread_id", threadIds)
    );
    await checked(
      admin
        .from("company_agent_update_proposals")
        .delete()
        .in("slack_thread_id", threadIds)
    );
    await checked(
      admin.from("company_messages").delete().in("slack_thread_id", threadIds)
    );
    await checked(
      admin.from("company_slack_threads").delete().in("id", threadIds)
    );
  }
  await checked(
    admin
      .from("company_conversations")
      .delete()
      .eq("company_workspace_id", WORKSPACE_ID)
      .eq("role_id", ROLE_ID)
  );
  await checked(
    admin
      .from("meeting_availability")
      .delete()
      .eq("company_workspace_id", WORKSPACE_ID)
      .eq("company_user_id", COMPANY_USER_ID)
  );
  await checked(
    admin
      .from("talent_progress")
      .delete()
      .eq("talent_id", TALENT_ID)
      .eq("role_id", ROLE_ID)
  );
  await checked(
    admin
      .from("talent_opportunity_tag")
      .delete()
      .eq("talent_id", TALENT_ID)
      .eq("opportunity_id", ROLE_ID)
  );
  await checked(
    admin
      .from("talent_opportunity_recommendation")
      .delete()
      .eq("id", RECOMMENDATION_ID)
      .eq("talent_id", TALENT_ID)
      .eq("role_id", ROLE_ID)
  );
  await checked(
    admin.from("company_roles").delete().eq("role_id", ROLE_ID).eq("name", ROLE_NAME)
  );

  console.log(
    JSON.stringify({
      availabilityRestoredTo: "absent",
      fixtureRemoved: true,
      roleId: ROLE_ID,
    })
  );
}

async function main() {
  const command = String(process.argv[2] || "").trim();
  if (command === "setup") await setup();
  else if (command === "status") await status();
  else if (command === "cleanup") await cleanup();
  else throw new Error("Use setup, status, or cleanup");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
