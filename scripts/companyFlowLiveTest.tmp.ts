import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ID = "f2e80aee-fee3-40f5-807f-5f8694c37eee";
const CHANNEL_ROW_ID = "b902cc5e-ea4a-4e00-a32c-81e4cdf8491b";
const SLACK_CHANNEL_ID = "C0BMP1P0U1Z";
const SLACK_USER_ID = "U09B4FF7TV0";
const COMPANY_USER_ID = "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd";
const TALENT_ID = COMPANY_USER_ID;
const ROLE_ID = "c0de0000-0000-4000-8000-000000000814";
const RECOMMENDATION_ID = "c0de0000-0000-4000-8000-000000000815";
const THREAD_ID = "c0de0000-0000-4000-8000-000000000816";
const ROLE_NAME = "[Codex Live Test] Company 재연결 검증";
const TEST_WORKER_TARGET = "codex-company-flow-local";

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) throw new Error("Supabase admin environment is unavailable");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function one(query: PromiseLike<any>) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

async function rows(query: PromiseLike<any>) {
  return (await one(query)) ?? [];
}

async function assertFixtureVacant() {
  const existing = await rows(
    admin
      .from("company_roles")
      .select("role_id, name, company_workspace_id")
      .eq("role_id", ROLE_ID)
  );
  if (existing.length > 0) {
    throw new Error(
      `Refusing setup because fixture role already exists: ${JSON.stringify(existing)}`
    );
  }
}

async function setup() {
  const threadTs = arg("thread-ts");
  if (!threadTs) throw new Error("--thread-ts is required");
  await assertFixtureVacant();

  const channel = await one(
    admin
      .from("company_slack_channels")
      .select(
        "id, company_workspace_id, slack_channel_id, reply_to_harper_threads, worker_target"
      )
      .eq("id", CHANNEL_ROW_ID)
      .single()
  );
  if (
    channel.company_workspace_id !== WORKSPACE_ID ||
    channel.slack_channel_id !== SLACK_CHANNEL_ID ||
    channel.reply_to_harper_threads !== true ||
    channel.worker_target !== "production"
  ) {
    throw new Error(`Unexpected channel state: ${JSON.stringify(channel)}`);
  }

  const now = new Date();
  const stoppedAt = new Date(now.getTime() - 120_000).toISOString();
  const notifiedAt = new Date(now.getTime() - 60_000).toISOString();
  const nowIso = now.toISOString();

  await one(
    admin.from("company_roles").insert({
      company_workspace_id: WORKSPACE_ID,
      created_at: nowIso,
      description:
        "Company-side candidate reactivation and immediate stop live verification fixture.",
      is_expired: false,
      name: ROLE_NAME,
      role_id: ROLE_ID,
      source_type: "internal",
      status: "active",
      summary: {},
      type: ["full_time"],
      updated_at: nowIso,
    })
  );
  await one(
    admin.from("company_internal_roles").upsert(
      {
        considerations: [],
        criteria: [],
        is_auto: false,
        request:
          "Codex live verification only. This role must never be shown to another talent.",
        role_id: ROLE_ID,
        updated_at: nowIso,
      },
      { onConflict: "role_id" }
    )
  );
  await one(
    admin.from("talent_opportunity_recommendation").insert({
      evidence: [],
      feedback: "like",
      feedback_at: stoppedAt,
      fit_reasons: ["본인 계정만 사용하는 격리된 라이브 검증"],
      fit_summary: "Company 재연결 상태 전이 검증용 후보자",
      opportunity_type: "internal_recommendation",
      preference_fit: {},
      recommended_at: stoppedAt,
      role_id: ROLE_ID,
      saved_stage: "closed",
      score: 1,
      talent_id: TALENT_ID,
      tradeoffs: [],
      updated_at: nowIso,
      id: RECOMMENDATION_ID,
    })
  );
  await one(
    admin.from("talent_opportunity_tag").insert({
      opportunity_id: ROLE_ID,
      tag: "내부:프로세스중단",
      talent_id: TALENT_ID,
    })
  );
  await one(
    admin.from("talent_progress").insert([
      {
        company_user_id: COMPANY_USER_ID,
        created_at: stoppedAt,
        kind: "org_stage_change",
        metadata: {
          org: true,
          previousStage: "connected",
          stage: "process_stopped",
          tag: "내부:프로세스중단",
          workspaceId: WORKSPACE_ID,
        },
        recommendation_id: RECOMMENDATION_ID,
        role_id: ROLE_ID,
        talent_id: TALENT_ID,
        text: "프로세스 중단으로 옮겼습니다.",
        user_id: "khj605123@gmail.com",
      },
      {
        created_at: notifiedAt,
        kind: "internal_process_stopped_notified",
        metadata: {
          sentChannel: "chat",
          stage: "process_stopped",
          workspaceId: WORKSPACE_ID,
        },
        recommendation_id: RECOMMENDATION_ID,
        role_id: ROLE_ID,
        talent_id: TALENT_ID,
        text: "라이브 검증용 종료 안내 발송 기록",
      },
    ])
  );
  await one(
    admin.from("company_slack_threads").insert({
      channel_id: CHANNEL_ROW_ID,
      created_by_harper: false,
      id: THREAD_ID,
      role_id: ROLE_ID,
      slack_thread_ts: threadTs,
    })
  );
  await one(
    admin
      .from("company_slack_channels")
      .update({
        reply_to_harper_threads: false,
        worker_target: TEST_WORKER_TARGET,
      })
      .eq("id", CHANNEL_ROW_ID)
      .eq("reply_to_harper_threads", true)
      .eq("worker_target", "production")
  );

  console.log(
    JSON.stringify(
      {
        channelId: SLACK_CHANNEL_ID,
        recommendationId: RECOMMENDATION_ID,
        roleId: ROLE_ID,
        roleName: ROLE_NAME,
        state: "process_stopped",
        closureNotice: "sent",
        threadId: THREAD_ID,
        threadTs,
        workerTarget: TEST_WORKER_TARGET,
      },
      null,
      2
    )
  );
}

async function enqueue() {
  const messageTs = arg("message-ts");
  const prompt = arg("prompt");
  if (!messageTs || !prompt) {
    throw new Error("--message-ts and --prompt are required");
  }
  const eventId = `codex-company-flow/${messageTs}`;
  const data = await one(
    admin
      .from("slack_reply_jobs")
      .insert({
        attempt_count: 1,
        locked_at: new Date().toISOString(),
        locked_by: "codex-local-live-test",
        prompt,
        slack_event_id: eventId,
        slack_message_ts: messageTs,
        slack_user_id: SLACK_USER_ID,
        status: "processing",
        thread_id: THREAD_ID,
        trigger_kind: "mention",
      })
      .select("id, status, worker_target")
      .single()
  );
  if (data.worker_target !== TEST_WORKER_TARGET) {
    throw new Error(`Unexpected job target: ${JSON.stringify(data)}`);
  }
  console.log(JSON.stringify(data));
}

async function status() {
  const [role, recommendation, tags, progress, jobs, messages, channel] =
    await Promise.all([
      rows(
        admin
          .from("company_roles")
          .select("role_id, name, status")
          .eq("role_id", ROLE_ID)
      ),
      rows(
        admin
          .from("talent_opportunity_recommendation")
          .select("id, feedback, saved_stage, updated_at")
          .eq("id", RECOMMENDATION_ID)
      ),
      rows(
        admin
          .from("talent_opportunity_tag")
          .select("tag, updated_at")
          .eq("talent_id", TALENT_ID)
          .eq("opportunity_id", ROLE_ID)
      ),
      rows(
        admin
          .from("talent_progress")
          .select("created_at, kind, text, metadata")
          .eq("talent_id", TALENT_ID)
          .eq("role_id", ROLE_ID)
          .order("created_at", { ascending: true })
      ),
      rows(
        admin
          .from("slack_reply_jobs")
          .select(
            "id, prompt, status, response_text, slack_message_ts, slack_response_ts, last_error"
          )
          .eq("thread_id", THREAD_ID)
          .order("created_at", { ascending: true })
      ),
      rows(
        admin
          .from("company_messages")
          .select("id, role, content, slack_message_ts, metadata")
          .eq("slack_thread_id", THREAD_ID)
          .order("id", { ascending: true })
      ),
      rows(
        admin
          .from("company_slack_channels")
          .select("reply_to_harper_threads, worker_target")
          .eq("id", CHANNEL_ROW_ID)
      ),
    ]);
  console.log(
    JSON.stringify(
      { channel, jobs, messages, progress, recommendation, role, tags },
      null,
      2
    )
  );
}

async function cleanup() {
  const fixture = await rows(
    admin
      .from("company_roles")
      .select("role_id, name, company_workspace_id")
      .eq("role_id", ROLE_ID)
  );
  if (
    fixture.length > 0 &&
    (fixture.length !== 1 ||
      fixture[0].name !== ROLE_NAME ||
      fixture[0].company_workspace_id !== WORKSPACE_ID)
  ) {
    throw new Error(`Refusing cleanup: ${JSON.stringify(fixture)}`);
  }

  await one(
    admin
      .from("company_slack_channels")
      .update({ reply_to_harper_threads: true, worker_target: "production" })
      .eq("id", CHANNEL_ROW_ID)
      .eq("worker_target", TEST_WORKER_TARGET)
  );
  await one(admin.from("slack_reply_jobs").delete().eq("thread_id", THREAD_ID));
  await one(
    admin
      .from("company_agent_update_proposals")
      .delete()
      .eq("slack_thread_id", THREAD_ID)
  );
  await one(
    admin.from("company_messages").delete().eq("slack_thread_id", THREAD_ID)
  );
  await one(
    admin.from("company_slack_threads").delete().eq("id", THREAD_ID)
  );
  await one(
    admin
      .from("company_conversations")
      .delete()
      .eq("company_workspace_id", WORKSPACE_ID)
      .eq("role_id", ROLE_ID)
  );
  await one(
    admin
      .from("talent_progress")
      .delete()
      .eq("talent_id", TALENT_ID)
      .eq("role_id", ROLE_ID)
  );
  await one(
    admin
      .from("talent_opportunity_tag")
      .delete()
      .eq("talent_id", TALENT_ID)
      .eq("opportunity_id", ROLE_ID)
  );
  await one(
    admin
      .from("talent_opportunity_recommendation")
      .delete()
      .eq("id", RECOMMENDATION_ID)
      .eq("talent_id", TALENT_ID)
      .eq("role_id", ROLE_ID)
  );
  await one(
    admin.from("company_roles").delete().eq("role_id", ROLE_ID).eq("name", ROLE_NAME)
  );

  const [remainingRole, remainingRec, remainingThread, restoredChannel] =
    await Promise.all([
      rows(admin.from("company_roles").select("role_id").eq("role_id", ROLE_ID)),
      rows(
        admin
          .from("talent_opportunity_recommendation")
          .select("id")
          .eq("id", RECOMMENDATION_ID)
      ),
      rows(
        admin
          .from("company_slack_threads")
          .select("id")
          .eq("id", THREAD_ID)
      ),
      rows(
        admin
          .from("company_slack_channels")
          .select("reply_to_harper_threads, worker_target")
          .eq("id", CHANNEL_ROW_ID)
      ),
    ]);
  console.log(
    JSON.stringify({
      remainingRec,
      remainingRole,
      remainingThread,
      restoredChannel,
    })
  );
}

async function main() {
  const command = String(process.argv[2] || "").trim();
  if (command === "setup") await setup();
  else if (command === "enqueue") await enqueue();
  else if (command === "status") await status();
  else if (command === "cleanup") await cleanup();
  else throw new Error("Use setup, enqueue, status, or cleanup");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
