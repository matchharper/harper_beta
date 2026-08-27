import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ID = "f8f3e4af-0cc5-4709-965a-df49f434753c";
const SOURCE_ROLE_ID = "5168d8b5-4cbd-461f-9a31-84ed80a078b7";
const SOURCE_ROLE_NAME = "[E2E 2026-08-21] Portfolio Operations Lead";
const TALENT_ID = "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd";
const COMPANY_USER_ID = TALENT_ID;
const SLACK_CHANNEL_ID = "C0BNG2HAU8H";
const LOCAL_WORKER_TARGET = "codex-e2e-20260827";
const TEST_FIXTURE_KEY = "company-slack-gmail-e2e";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMarkedTestOnly(value: unknown) {
  return objectValue(value).testOnly === true;
}

const FIXTURES = [
  {
    candidateReply: "네, 주 2회 서울 오피스 출근 가능합니다.",
    companyPrompt:
      "포트폴리오 운영 리드 역할 김호진 님한테 주 2회 서울 출근 괜찮은지 물어봐줘.",
    key: "office",
    name: "Portfolio Operations Lead",
    recommendationId: "e2e82700-0000-4000-8000-000000000011",
    roleId: "e2e82700-0000-4000-8000-000000000001",
  },
  {
    candidateReply: "9월 15일부터 시작할 수 있습니다.",
    companyPrompt:
      "그 프로덕트 운영 매니저 역할에 김호진 님 있지? 9월 중순부터 시작할 수 있는지 물어봐줘.",
    key: "start-date",
    name: "Product Operations Manager",
    recommendationId: "e2e82700-0000-4000-8000-000000000012",
    roleId: "e2e82700-0000-4000-8000-000000000002",
  },
  {
    candidateReply:
      "네. B2B SaaS 포트폴리오사 CEO와 주간 운영지표 체계를 만들고 고객 이탈 원인을 줄였습니다.",
    companyPrompt:
      "전략 운영 리드 쪽 김호진 님한테 포트폴리오사 CEO랑 직접 일해본 경험 있는지, 어떤 문제 풀었는지 물어봐줘.",
    key: "experience",
    name: "Strategy & Operations Lead",
    recommendationId: "e2e82700-0000-4000-8000-000000000013",
    roleId: "e2e82700-0000-4000-8000-000000000003",
  },
  {
    candidateReply:
      "네, 영어로 임원 미팅을 진행할 수 있고 해외 파트너와 정기 미팅을 맡아왔습니다.",
    companyPrompt:
      "Chief of Staff 역할 김호진 님한테 영어로 임원 미팅 진행 가능한지 물어봐줘.",
    key: "english",
    name: "Chief of Staff",
    recommendationId: "e2e82700-0000-4000-8000-000000000014",
    roleId: "e2e82700-0000-4000-8000-000000000004",
  },
  {
    candidateReply: "네, 월 1~2회 해외출장 가능합니다.",
    companyPrompt:
      "Business Operations 역할 김호진 님한테 한 달에 한두 번 해외출장 가능한지 확인해줘.",
    key: "travel",
    name: "Business Operations Manager",
    recommendationId: "e2e82700-0000-4000-8000-000000000015",
    roleId: "e2e82700-0000-4000-8000-000000000005",
  },
  {
    candidateReply:
      "총보상 기준 1억 2천만 원에서 1억 4천만 원 범위라면 검토 가능하다고 회사에 전달해 주세요.",
    companyPrompt:
      "Investment Operations 역할 김호진 님한테 지금 기대하는 보상 범위를 회사에 공유 가능한 표현으로 물어봐줘.",
    key: "compensation",
    name: "Investment Operations Lead",
    recommendationId: "e2e82700-0000-4000-8000-000000000016",
    roleId: "e2e82700-0000-4000-8000-000000000006",
  },
  {
    candidateReply:
      "서울 이전은 가능하지만 입사 후 한 달 정도 준비 기간이 필요합니다.",
    companyPrompt:
      "Platform Operations 역할 김호진 님한테 서울 이전 가능한지, 어렵다면 어느 지역까지 가능한지 물어봐줘.",
    key: "relocation",
    name: "Platform Operations Lead",
    recommendationId: "e2e82700-0000-4000-8000-000000000017",
    roleId: "e2e82700-0000-4000-8000-000000000007",
  },
  {
    candidateReply:
      "현재 공유할 최신 이력서가 없어서 이번에는 전달하기 어렵습니다.",
    companyPrompt:
      "Founder Success 역할 김호진 님 최신 이력서 받아봐줘.",
    key: "resume",
    name: "Founder Success Lead",
    recommendationId: "e2e82700-0000-4000-8000-000000000018",
    roleId: "e2e82700-0000-4000-8000-000000000008",
  },
  {
    candidateReply: "네, 월 1회 정도 주말 행사 대응 가능합니다.",
    companyPrompt:
      "Portfolio Support 역할 김호진 님한테 주말 행사 대응이 월 1회 정도 가능한지 물어봐줘.",
    key: "weekend",
    name: "Portfolio Support Manager",
    recommendationId: "e2e82700-0000-4000-8000-000000000019",
    roleId: "e2e82700-0000-4000-8000-000000000009",
  },
  {
    candidateReply:
      "고객지원 티켓 분류와 주간 리포트를 자동화해 처리 시간을 약 40% 줄였습니다.",
    companyPrompt:
      "GTM Operations 역할 김호진 님한테 최근 운영 자동화 프로젝트 하나만 간단히 설명해달라고 물어봐줘.",
    key: "automation",
    name: "GTM Operations Lead",
    recommendationId: "e2e82700-0000-4000-8000-000000000020",
    roleId: "e2e82700-0000-4000-8000-000000000010",
  },
] as const;

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) throw new Error("Supabase admin environment is unavailable");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checked<T>(
  query: PromiseLike<{ data: T; error: unknown }>
): Promise<T> {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

async function setup() {
  const fixtureRoleIds = FIXTURES.map((fixture) => fixture.roleId);
  const existing =
    (await checked(
      admin
        .from("company_roles")
        .select("role_id, name, company_workspace_id, information")
        .in("role_id", fixtureRoleIds)
    )) ?? [];
  for (const role of existing) {
    const fixture = FIXTURES.find((item) => item.roleId === role.role_id);
    if (
      !fixture ||
      role.name !== fixture.name ||
      role.company_workspace_id !== WORKSPACE_ID ||
      !isMarkedTestOnly(role.information)
    ) {
      throw new Error(`Refusing setup: ${JSON.stringify(role)}`);
    }
  }

  const sourceRole = await checked(
    admin
      .from("company_roles")
      .select(
        "description, information, type, priority, source_type, location_text, work_mode, salary_range, seniority_level, description_summary, salary_min, salary_max, salary_currency, salary_period, summary"
      )
      .eq("role_id", SOURCE_ROLE_ID)
      .eq("company_workspace_id", WORKSPACE_ID)
      .single()
  );
  const sourceInternalRole = await checked(
    admin
      .from("company_internal_roles")
      .select(
        "request, considerations, is_auto, questions, is_require_linkedin, is_require_resume, memory, criteria, max_pending_talents"
      )
      .eq("role_id", SOURCE_ROLE_ID)
      .single()
  );
  if (!sourceRole || !sourceInternalRole) {
    throw new Error("Refusing setup: source E2E role is missing");
  }

  const now = new Date().toISOString();
  const existingIds = new Set(existing.map((role) => role.role_id));
  const missingFixtures = FIXTURES.filter(
    (fixture) => !existingIds.has(fixture.roleId)
  );
  if (missingFixtures.length > 0) {
    await checked(
      admin.from("company_roles").insert(
        missingFixtures.map((fixture) => ({
          ...sourceRole,
          company_workspace_id: WORKSPACE_ID,
          created_at: now,
          information: {
            ...objectValue(sourceRole.information),
            testFixture: TEST_FIXTURE_KEY,
            testOnly: true,
            testTalentIds: [TALENT_ID],
          },
          is_expired: false,
          name: fixture.name,
          role_id: fixture.roleId,
          source_type: "internal",
          status: "active",
          updated_at: now,
        }))
      )
    );
  }
  const existingInternalRoles =
    (await checked(
      admin
        .from("company_internal_roles")
        .select("role_id")
        .in("role_id", fixtureRoleIds)
    )) ?? [];
  const internalRoleIds = new Set(
    existingInternalRoles.map((role) => role.role_id)
  );
  const missingInternalRoles = FIXTURES.filter(
    (fixture) => !internalRoleIds.has(fixture.roleId)
  );
  if (missingInternalRoles.length > 0) {
    await checked(
      admin.from("company_internal_roles").insert(
        missingInternalRoles.map((fixture) => ({
          ...sourceInternalRole,
          created_at: now,
          role_id: fixture.roleId,
          role_status_changed_at: now,
          updated_at: now,
        }))
      )
    );
  }

  const existingAssignees =
    (await checked(
      admin
        .from("company_role_assignees")
        .select("role_id")
        .eq("company_user_id", COMPANY_USER_ID)
        .in("role_id", fixtureRoleIds)
    )) ?? [];
  const assignedRoleIds = new Set(existingAssignees.map((row) => row.role_id));
  const missingAssignees = FIXTURES.filter(
    (fixture) => !assignedRoleIds.has(fixture.roleId)
  );
  if (missingAssignees.length > 0) {
    await checked(
      admin.from("company_role_assignees").insert(
        missingAssignees.map((fixture) => ({
          company_user_id: COMPANY_USER_ID,
          role_id: fixture.roleId,
        }))
      )
    );
  }

  const existingRecommendations =
    (await checked(
      admin
        .from("talent_opportunity_recommendation")
        .select("id")
        .in(
          "id",
          FIXTURES.map((fixture) => fixture.recommendationId)
        )
    )) ?? [];
  const recommendationIds = new Set(
    existingRecommendations.map((row) => row.id)
  );
  const missingRecommendations = FIXTURES.filter(
    (fixture) => !recommendationIds.has(fixture.recommendationId)
  );
  if (missingRecommendations.length > 0) {
    await checked(
      admin.from("talent_opportunity_recommendation").insert(
        missingRecommendations.map((fixture) => ({
          evidence: [],
          feedback: "like",
          feedback_at: now,
          fit_reasons: [
            "본인 계정만 사용하는 격리된 Slack·Gmail E2E 검증 후보자",
            "B2B SaaS 운영과 창업자 협업 경험을 확인하기 위한 테스트 데이터",
          ],
          fit_summary:
            "회사 질문, 연결 수락, 거절 안내를 실제 사용자처럼 검증하기 위한 후보자예요.",
          id: fixture.recommendationId,
          opportunity_type: "internal_recommendation",
          preference_fit: {},
          recommended_at: now,
          role_id: fixture.roleId,
          saved_stage: "accepted",
          score: 1,
          talent_id: TALENT_ID,
          tradeoffs: ["실제 채용 판단용 데이터가 아닌 E2E 검증 전용입니다."],
          updated_at: now,
        }))
      )
    );
  }

  const existingTags =
    (await checked(
      admin
        .from("talent_opportunity_tag")
        .select("opportunity_id")
        .eq("talent_id", TALENT_ID)
        .in("tag", ["내부:연결대기", "내부:연결됨", "내부:프로세스중단"])
        .in("opportunity_id", fixtureRoleIds)
    )) ?? [];
  const taggedRoleIds = new Set(existingTags.map((row) => row.opportunity_id));
  const missingTags = FIXTURES.filter(
    (fixture) => !taggedRoleIds.has(fixture.roleId)
  );
  if (missingTags.length > 0) {
    await checked(
      admin.from("talent_opportunity_tag").insert(
        missingTags.map((fixture) => ({
          opportunity_id: fixture.roleId,
          tag: "내부:연결대기",
          talent_id: TALENT_ID,
        }))
      )
    );
  }

  console.log(JSON.stringify({ fixtures: FIXTURES, status: "ready" }, null, 2));
}

async function status() {
  const roleIds = FIXTURES.map((fixture) => fixture.roleId);
  const recommendationIds = FIXTURES.map((fixture) => fixture.recommendationId);
  const [roles, recommendations, tags, progress, requests] = await Promise.all([
    checked(
      admin
        .from("company_roles")
        .select("role_id, name, status, updated_at")
        .in("role_id", roleIds)
        .order("role_id")
    ),
    checked(
      admin
        .from("talent_opportunity_recommendation")
        .select("id, role_id, feedback, saved_stage, updated_at")
        .in("id", recommendationIds)
        .order("role_id")
    ),
    checked(
      admin
        .from("talent_opportunity_tag")
        .select("opportunity_id, tag, updated_at")
        .eq("talent_id", TALENT_ID)
        .in("opportunity_id", roleIds)
        .order("opportunity_id")
    ),
    checked(
      admin
        .from("talent_progress")
        .select("created_at, kind, role_id, text, metadata")
        .eq("talent_id", TALENT_ID)
        .in("role_id", roleIds)
        .order("created_at")
    ),
    checked(
      admin
        .from("company_talent_requests")
        .select(
          "id, role_id, recommendation_id, workflow_status, request_context, delivery_subject, delivery_body, draft_revision, talent_source_message_id, approved_at, updated_at"
        )
        .eq("talent_id", TALENT_ID)
        .in("role_id", roleIds)
        .order("created_at")
    ),
  ]);
  const requestIds = (requests ?? []).map((request) => request.id);
  let queueQuery = admin
    .from("contact_queue")
    .select(
      "id, company_talent_request_id, recommendation_id, type, status, last_error, scheduled_at, sent_at, updated_at"
    )
    .order("created_at");
  queueQuery =
    requestIds.length > 0
      ? queueQuery.or(
          `recommendation_id.in.(${recommendationIds.join(",")}),company_talent_request_id.in.(${requestIds.join(",")})`
        )
      : queueQuery.in("recommendation_id", recommendationIds);
  const queue = await checked(queueQuery);
  const slackJobs = await checked(
    admin
      .from("slack_reply_jobs")
      .select(
        "id, thread_id, prompt, status, response_text, slack_response_ts, last_error, attempt_count, updated_at"
      )
      .eq("worker_target", LOCAL_WORKER_TARGET)
      .order("created_at")
  );
  console.log(
    JSON.stringify(
      { progress, queue, recommendations, requests, roles, slackJobs, tags },
      null,
      2
    )
  );
}

async function cleanup() {
  const roleIds = FIXTURES.map((fixture) => fixture.roleId);
  const recommendationIds = FIXTURES.map((fixture) => fixture.recommendationId);
  const roles =
    (await checked(
      admin
        .from("company_roles")
        .select("role_id, name, company_workspace_id")
        .in("role_id", roleIds)
    )) ?? [];
  for (const role of roles) {
    const fixture = FIXTURES.find((item) => item.roleId === role.role_id);
    if (
      !fixture ||
      role.name !== fixture.name ||
      role.company_workspace_id !== WORKSPACE_ID
    ) {
      throw new Error(`Refusing cleanup: ${JSON.stringify(role)}`);
    }
  }

  // Slack turns live in the workspace-wide conversation, while the web relay
  // lives in a role-scoped conversation. Resolve the exact E2E messages and
  // their Slack thread rows before deleting the fixture roles so no test
  // message is orphaned and no role conversation is coerced into the single
  // workspace-wide conversation by ON DELETE SET NULL.
  const roleMessages = await checked(
      admin
        .from("company_messages")
        .select("id, conversation_id, slack_thread_id")
        .in("role_id", roleIds)
    );
  const identifyingMessages = [...(roleMessages ?? [])];
  const slackThreadIds = Array.from(
    new Set(
      identifyingMessages
        .map((message) => message.slack_thread_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const threadMessages =
    slackThreadIds.length > 0
      ? await checked(
          admin
            .from("company_messages")
            .select("id, conversation_id, slack_thread_id")
            .in("slack_thread_id", slackThreadIds)
        )
      : [];
  const testMessages = Array.from(
    new Map(
      [...identifyingMessages, ...(threadMessages ?? [])].map((message) => [
        message.id,
        message,
      ])
    ).values()
  );
  const testMessageIds = testMessages.map((message) => message.id);
  const affectedConversationIds = Array.from(
    new Set(testMessages.map((message) => message.conversation_id))
  );

  // Requests retain the originating company message for auditability. Remove
  // their delivery queue and request rows before deleting those E2E messages.
  const requests =
    (await checked(
      admin
        .from("company_talent_requests")
        .select("id")
        .eq("talent_id", TALENT_ID)
        .in("role_id", roleIds)
    )) ?? [];
  const requestIds = requests.map((request) => request.id);
  await checked(
    admin
      .from("contact_queue")
      .delete()
      .in("recommendation_id", recommendationIds)
  );
  if (requestIds.length > 0) {
    await checked(
      admin
        .from("contact_queue")
        .delete()
        .in("company_talent_request_id", requestIds)
    );
  }
  await checked(
    admin
      .from("company_talent_requests")
      .delete()
      .eq("talent_id", TALENT_ID)
      .in("role_id", roleIds)
  );

  if (affectedConversationIds.length > 0) {
    await checked(
      admin
        .from("company_conversations")
        .update({ last_message_id: null })
        .in("id", affectedConversationIds)
    );
  }
  if (slackThreadIds.length > 0) {
    await checked(
      admin.from("company_slack_threads").delete().in("id", slackThreadIds)
    );
  }
  if (testMessageIds.length > 0) {
    await checked(
      admin.from("company_messages").delete().in("id", testMessageIds)
    );
  }
  await checked(
    admin.from("company_conversations").delete().in("role_id", roleIds)
  );
  for (const conversationId of affectedConversationIds) {
    const latestMessage = await checked(
      admin
        .from("company_messages")
        .select("id, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    await checked(
      admin
        .from("company_conversations")
        .update({
          last_message_at: latestMessage?.created_at ?? null,
          last_message_id: latestMessage?.id ?? null,
        })
        .eq("id", conversationId)
    );
  }
  await checked(
    admin
      .from("talent_progress")
      .delete()
      .eq("talent_id", TALENT_ID)
      .in("role_id", roleIds)
  );
  await checked(
    admin
      .from("talent_opportunity_tag")
      .delete()
      .eq("talent_id", TALENT_ID)
      .in("opportunity_id", roleIds)
  );
  await checked(
    admin
      .from("talent_opportunity_recommendation")
      .delete()
      .in("id", recommendationIds)
  );
  await checked(
    admin.from("company_role_assignees").delete().in("role_id", roleIds)
  );
  await checked(
    admin.from("company_internal_roles").delete().in("role_id", roleIds)
  );
  await checked(admin.from("company_roles").delete().in("role_id", roleIds));

  const sourceRole = await checked(
    admin
      .from("company_roles")
      .select("role_id, name, company_workspace_id")
      .eq("role_id", SOURCE_ROLE_ID)
      .maybeSingle()
  );
  if (
    sourceRole &&
    (sourceRole.name !== SOURCE_ROLE_NAME ||
      sourceRole.company_workspace_id !== WORKSPACE_ID)
  ) {
    throw new Error(
      `Refusing source Role cleanup: ${JSON.stringify(sourceRole)}`
    );
  }
  if (sourceRole) {
    const now = new Date().toISOString();
    await checked(
      admin
        .from("company_roles")
        .update({ status: "deleted", updated_at: now })
        .eq("role_id", SOURCE_ROLE_ID)
        .eq("company_workspace_id", WORKSPACE_ID)
    );
    await checked(
      admin
        .from("company_internal_roles")
        .update({ role_status_changed_at: now, updated_at: now })
        .eq("role_id", SOURCE_ROLE_ID)
    );
  }
  console.log(
    JSON.stringify(
      {
        sourceRoleStatus: sourceRole ? "deleted" : "missing",
        status: "cleaned",
        roleIds,
      },
      null,
      2
    )
  );
}

async function route(workerTarget: string) {
  const [workspace, channel, talent, companyUser] = await Promise.all([
    checked(
      admin
        .from("company_workspace")
        .select("company_name, is_internal")
        .eq("company_workspace_id", WORKSPACE_ID)
        .single()
    ),
    checked(
      admin
        .from("company_slack_channels")
        .select(
          "company_workspace_id, slack_channel_id, worker_target, reply_to_harper_threads"
        )
        .eq("company_workspace_id", WORKSPACE_ID)
        .eq("slack_channel_id", SLACK_CHANNEL_ID)
        .single()
    ),
    checked(
      admin
        .from("talent_users")
        .select("email")
        .eq("user_id", TALENT_ID)
        .single()
    ),
    checked(
      admin
        .from("company_users")
        .select("email")
        .eq("user_id", COMPANY_USER_ID)
        .single()
    ),
  ]);
  if (
    !workspace ||
    !channel ||
    !talent ||
    !companyUser ||
    workspace.company_name !== "SBVA" ||
    workspace.is_internal !== true ||
    channel.company_workspace_id !== WORKSPACE_ID ||
    channel.slack_channel_id !== SLACK_CHANNEL_ID ||
    channel.reply_to_harper_threads !== true ||
    talent.email !== "khj605123@gmail.com" ||
    companyUser.email !== "khj605123@gmail.com"
  ) {
    throw new Error(
      `Refusing Slack route because the authorized scope changed: ${JSON.stringify({
        channel,
        companyUser,
        talent,
        workspace,
      })}`
    );
  }
  const routed = await checked(
    admin.rpc("set_slack_agent_worker_target_v1", {
      p_company_workspace_id: WORKSPACE_ID,
      p_slack_channel_id: SLACK_CHANNEL_ID,
      p_worker_target: workerTarget,
    })
  );
  console.log(JSON.stringify({ routed, workerTarget }, null, 2));
}

async function retryLocalSlackJobs() {
  const failedJobs = await checked(
    admin
      .from("slack_reply_jobs")
      .select("id, status, attempt_count, response_text")
      .eq("worker_target", LOCAL_WORKER_TARGET)
      .in("status", ["failed", "retry", "processing"])
      .is("response_text", null)
  );
  const retryableJobs = failedJobs ?? [];
  if (retryableJobs.length !== FIXTURES.length) {
    throw new Error(
      `Refusing retry because exactly ${FIXTURES.length} unsent local jobs were expected: ${JSON.stringify(
        retryableJobs
      )}`
    );
  }
  const now = new Date().toISOString();
  const retried = await checked(
    admin
      .from("slack_reply_jobs")
      .update({
        attempt_count: 0,
        last_error: null,
        locked_at: null,
        locked_by: null,
        next_attempt_at: now,
        status: "queued",
        updated_at: now,
      })
      .in(
        "id",
        retryableJobs.map((job) => job.id)
      )
      .select("id, status, attempt_count")
  );
  console.log(JSON.stringify({ retried }, null, 2));
}

async function main() {
  const command = process.argv[2] || "status";
  if (command === "setup") await setup();
  else if (command === "status") await status();
  else if (command === "cleanup") await cleanup();
  else if (command === "route-local") await route(LOCAL_WORKER_TARGET);
  else if (command === "route-production") await route("production");
  else if (command === "retry-slack") await retryLocalSlackJobs();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
