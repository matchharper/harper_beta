import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ID = "720254d7-aeb7-4709-a56f-7b822f89eac5";
const CHANNEL_ROW_ID = "6989ff51-494c-41be-9602-6a2579d8960a";
const SLACK_CHANNEL_ID = "C0BLRJ96GSJ";
const COMPANY_USER_ID = "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd";
const TALENT_ID = COMPANY_USER_ID;
const ROLE_ID = "e2e90100-0000-4000-8000-000000000101";
const RECOMMENDATION_ID = "e2e90100-0000-4000-8000-000000000111";
const STAGE_ID = "e2e90100-0000-4000-8000-0000000001f1";
const ROLE_NAME = "[테스트 전용] Enterprise Solutions Lead";
const TEST_FIXTURE = "company-slack-candidate-request-output-2026-09-01";
const TEST_WORKER_TARGET = "codex-candidate-output-20260901";

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

async function fixtureRole() {
  return checked(
    admin
      .from("company_roles")
      .select("role_id,name,company_workspace_id,information")
      .eq("role_id", ROLE_ID)
  );
}

function assertFixtureIdentity(rows: any[]) {
  if (
    rows.length > 0 &&
    (rows.length !== 1 ||
      rows[0].name !== ROLE_NAME ||
      rows[0].company_workspace_id !== WORKSPACE_ID ||
      rows[0].information?.testOnly !== true ||
      rows[0].information?.testFixture !== TEST_FIXTURE ||
      !Array.isArray(rows[0].information?.testTalentIds) ||
      !rows[0].information.testTalentIds.includes(TALENT_ID))
  ) {
    throw new Error(`Refusing fixture operation: ${JSON.stringify(rows)}`);
  }
}

async function setup() {
  const [workspaceRows, channelRows, companyUserRows, talentRows, roleRows] =
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
          .eq("id", CHANNEL_ROW_ID)
      ),
      checked(
        admin
          .from("company_users")
          .select("user_id,email")
          .eq("user_id", COMPANY_USER_ID)
      ),
      checked(
        admin
          .from("talent_users")
          .select("user_id,email,name")
          .eq("user_id", TALENT_ID)
      ),
      fixtureRole(),
    ]);

  const workspace = workspaceRows[0];
  const channel = channelRows[0];
  const companyUser = companyUserRows[0];
  const talent = talentRows[0];
  if (
    workspace?.company_name !== "Harper" ||
    workspace?.is_internal !== true ||
    channel?.company_workspace_id !== WORKSPACE_ID ||
    channel?.slack_channel_id !== SLACK_CHANNEL_ID ||
    channel?.reply_to_harper_threads !== true ||
    !["vercel_queue", TEST_WORKER_TARGET].includes(channel?.worker_target) ||
    companyUser?.email !== "khj605123@gmail.com" ||
    talent?.email !== "khj605123@gmail.com"
  ) {
    throw new Error(
      `Refusing setup because the authorized scope changed: ${JSON.stringify({
        channel,
        companyUser,
        talent,
        workspace,
      })}`
    );
  }
  if (roleRows.length) {
    throw new Error(`Refusing setup because fixture role exists: ${JSON.stringify(roleRows)}`);
  }

  const memberships = await checked(
    admin
      .from("company_user_workspace")
      .select("authority")
      .eq("company_workspace_id", WORKSPACE_ID)
      .eq("company_user_id", COMPANY_USER_ID)
  );
  if (!memberships.some((row: any) => row.authority === "owner")) {
    throw new Error("The authorized Slack test user is no longer a workspace owner");
  }

  const originalWorkerTarget = channel.worker_target;
  const now = new Date().toISOString();
  await checked(
    admin.from("company_roles").insert({
      company_workspace_id: WORKSPACE_ID,
      description:
        "대기업 고객의 기술 과제를 정의하고 솔루션 설계, 시스템 통합, 기술 검증을 리드하는 역할입니다.",
      information: {
        originalWorkerTarget,
        testFixture: TEST_FIXTURE,
        testOnly: true,
        testTalentIds: [TALENT_ID],
      },
      is_expired: false,
      location_text: "Seoul",
      name: ROLE_NAME,
      role_id: ROLE_ID,
      source_type: "internal",
      status: "paused",
      summary: {},
      type: ["full_time"],
      updated_at: now,
      work_mode: "hybrid",
    })
  );
  await checked(
    admin.from("company_internal_roles").upsert(
      {
        considerations: [],
        criteria: [],
        is_auto: false,
        request:
          "격리된 Slack 후보자 요청 출력 검증 전용입니다. testTalentIds 이외 후보자에게 노출하지 않습니다.",
        role_id: ROLE_ID,
        updated_at: now,
      },
      { onConflict: "role_id" }
    )
  );
  await checked(
    admin.from("company_role_assignees").insert({
      company_user_id: COMPANY_USER_ID,
      role_id: ROLE_ID,
    })
  );
  await checked(
    admin.from("company_role_notification_channels").insert({
      channel_id: CHANNEL_ROW_ID,
      role_id: ROLE_ID,
    })
  );
  await checked(
    admin.from("ops_matching_role_stages").insert({
      id: STAGE_ID,
      label: "1차 미팅",
      meeting_candidate_message:
        "역할과 관련 경험을 편하게 나누고 서로 궁금한 점을 확인하는 자리입니다.",
      meeting_duration_minutes: 30,
      meeting_purpose: "역할 기대와 관련 경험을 서로 확인하는 1차 대화",
      role_id: ROLE_ID,
      sort_order: 0,
    })
  );
  await checked(
    admin.from("talent_opportunity_recommendation").insert({
      evidence: [],
      feedback: "like",
      feedback_at: now,
      fit_reasons: ["명시적으로 allowlist한 본인 테스트 계정"],
      fit_summary: "company-side Slack 출력 검증용",
      id: RECOMMENDATION_ID,
      opportunity_type: "internal_recommendation",
      preference_fit: {},
      processed_stage: "pending_connection",
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

  const [fits, contextRuns] = await Promise.all([
    checked(
      admin
        .from("talent_opportunity_fit")
        .select("id")
        .eq("opportunity_id", ROLE_ID)
    ),
    checked(
      admin.from("company_context_runs").select("id").eq("role_id", ROLE_ID)
    ),
  ]);
  if (fits.length || contextRuns.length) {
    throw new Error(`Test-only isolation failed: ${JSON.stringify({ contextRuns, fits })}`);
  }

  await checked(
    admin.rpc("set_slack_agent_worker_target_v1", {
      p_company_workspace_id: WORKSPACE_ID,
      p_slack_channel_id: SLACK_CHANNEL_ID,
      p_worker_target: TEST_WORKER_TARGET,
    })
  );

  console.log(
    JSON.stringify(
      {
        candidate: { id: talent.user_id, name: talent.name },
        originalWorkerTarget,
        roleId: ROLE_ID,
        roleName: ROLE_NAME,
        stageId: `custom:${STAGE_ID}`,
        workerTarget: TEST_WORKER_TARGET,
      },
      null,
      2
    )
  );
}

async function clearContactDrafts() {
  const roleRows = await fixtureRole();
  assertFixtureIdentity(roleRows);
  const requests = await checked(
    admin
      .from("company_talent_requests")
      .select("id,workflow_status")
      .eq("role_id", ROLE_ID)
      .eq("talent_id", TALENT_ID)
  );
  if (requests.some((request: any) => request.workflow_status !== "draft")) {
    throw new Error(`Refusing to delete a non-draft request: ${JSON.stringify(requests)}`);
  }
  if (requests.length) {
    await checked(
      admin
        .from("company_talent_requests")
        .delete()
        .in(
          "id",
          requests.map((request: any) => request.id)
        )
    );
  }
  console.log(JSON.stringify({ deletedDrafts: requests.length }));
}

async function status() {
  const [roles, recommendations, requests, queues, schedules, fits, runs, channel] =
    await Promise.all([
      fixtureRole(),
      checked(
        admin
          .from("talent_opportunity_recommendation")
          .select("id,talent_id,processed_stage,saved_stage")
          .eq("role_id", ROLE_ID)
      ),
      checked(
        admin
          .from("company_talent_requests")
          .select(
            "id,expects_document,request_context,workflow_status,delivery_subject,delivery_body,draft_revision"
          )
          .eq("role_id", ROLE_ID)
          .order("created_at", { ascending: true })
      ),
      checked(
        admin
          .from("contact_queue")
          .select("id,type,status,scheduled_at,sent_at,cancelled_at")
          .eq("role_id", ROLE_ID)
      ),
      checked(
        admin
          .from("meeting_schedules")
          .select("id,status,title,duration_minutes")
          .eq("role_id", ROLE_ID)
      ),
      checked(
        admin.from("talent_opportunity_fit").select("id").eq("opportunity_id", ROLE_ID)
      ),
      checked(admin.from("company_context_runs").select("id,status").eq("role_id", ROLE_ID)),
      checked(
        admin.from("company_slack_channels").select("worker_target").eq("id", CHANNEL_ROW_ID)
      ),
    ]);
  console.log(
    JSON.stringify(
      { channel, fits, queues, recommendations, requests, roles, runs, schedules },
      null,
      2
    )
  );
}

async function cleanup() {
  const roleRows = await fixtureRole();
  assertFixtureIdentity(roleRows);
  const originalWorkerTarget = String(
    roleRows[0]?.information?.originalWorkerTarget || "vercel_queue"
  );
  await checked(
    admin.rpc("set_slack_agent_worker_target_v1", {
      p_company_workspace_id: WORKSPACE_ID,
      p_slack_channel_id: SLACK_CHANNEL_ID,
      p_worker_target: originalWorkerTarget,
    })
  );

  const queueRows = await checked(
    admin.from("contact_queue").select("id,status").eq("role_id", ROLE_ID)
  );
  const queueIds = queueRows.map((row: any) => row.id);
  if (queueIds.length) {
    await checked(
      admin
        .from("contact_queue")
        .update({ cancelled_at: new Date().toISOString(), status: "cancelled" })
        .in("id", queueIds)
        .in("status", ["queued", "failed"])
    );
  }
  const scheduleRows = await checked(
    admin.from("meeting_schedules").select("id").eq("role_id", ROLE_ID)
  );
  const scheduleIds = scheduleRows.map((row: any) => row.id);
  if (scheduleIds.length) {
    await checked(
      admin.from("meeting_schedule_rounds").delete().in("schedule_id", scheduleIds)
    );
    await checked(admin.from("meeting_schedules").delete().in("id", scheduleIds));
  }
  if (queueIds.length) {
    await checked(admin.from("contact_queue").delete().in("id", queueIds));
  }

  await checked(admin.from("company_talent_requests").delete().eq("role_id", ROLE_ID));
  await checked(admin.from("talent_progress").delete().eq("role_id", ROLE_ID));
  await checked(admin.from("company_context_runs").delete().eq("role_id", ROLE_ID));
  await checked(admin.from("talent_opportunity_fit").delete().eq("opportunity_id", ROLE_ID));

  const slackThreads = await checked(
    admin
      .from("company_slack_threads")
      .select("id")
      .eq("channel_id", CHANNEL_ROW_ID)
      .eq("role_id", ROLE_ID)
  );
  const slackThreadIds = slackThreads.map((row: any) => row.id);
  if (slackThreadIds.length) {
    await checked(
      admin
        .from("company_agent_update_proposals")
        .delete()
        .in("slack_thread_id", slackThreadIds)
    );
  }
  await checked(
    admin.from("company_conversation_summaries").update({ role_id: null }).eq("role_id", ROLE_ID)
  );
  await checked(admin.from("company_messages").update({ role_id: null }).eq("role_id", ROLE_ID));
  await checked(
    admin.from("company_conversations").update({ role_id: null }).eq("role_id", ROLE_ID)
  );
  await checked(
    admin.from("company_slack_threads").update({ role_id: null }).eq("role_id", ROLE_ID)
  );

  await checked(admin.from("talent_opportunity_tag").delete().eq("opportunity_id", ROLE_ID));
  await checked(
    admin.from("talent_opportunity_recommendation").delete().eq("id", RECOMMENDATION_ID)
  );
  await checked(
    admin.from("company_role_notification_channels").delete().eq("role_id", ROLE_ID)
  );
  await checked(admin.from("ops_matching_role_stages").delete().eq("role_id", ROLE_ID));
  await checked(admin.from("company_role_assignees").delete().eq("role_id", ROLE_ID));
  await checked(admin.from("company_internal_roles").delete().eq("role_id", ROLE_ID));
  await checked(
    admin.from("company_roles").delete().eq("role_id", ROLE_ID).eq("name", ROLE_NAME)
  );

  const [roles, recommendations, requests, queues, schedules, fits, runs, channel, talent] =
    await Promise.all([
      fixtureRole(),
      checked(
        admin.from("talent_opportunity_recommendation").select("id").eq("id", RECOMMENDATION_ID)
      ),
      checked(admin.from("company_talent_requests").select("id").eq("role_id", ROLE_ID)),
      checked(admin.from("contact_queue").select("id").eq("role_id", ROLE_ID)),
      checked(admin.from("meeting_schedules").select("id").eq("role_id", ROLE_ID)),
      checked(
        admin.from("talent_opportunity_fit").select("id").eq("opportunity_id", ROLE_ID)
      ),
      checked(admin.from("company_context_runs").select("id").eq("role_id", ROLE_ID)),
      checked(
        admin.from("company_slack_channels").select("worker_target").eq("id", CHANNEL_ROW_ID)
      ),
      checked(
        admin.from("talent_users").select("user_id,email").eq("user_id", TALENT_ID)
      ),
    ]);
  console.log(
    JSON.stringify({
      channel,
      preservedTalent: talent,
      residue: {
        fits: fits.length,
        queues: queues.length,
        recommendations: recommendations.length,
        requests: requests.length,
        roles: roles.length,
        runs: runs.length,
        schedules: schedules.length,
      },
    })
  );
}

async function main() {
  const command = String(process.argv[2] || "").trim();
  if (command === "setup") await setup();
  else if (command === "clear-contact-drafts") await clearContactDrafts();
  else if (command === "status") await status();
  else if (command === "cleanup") await cleanup();
  else throw new Error("Use setup, clear-contact-drafts, status, or cleanup");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
