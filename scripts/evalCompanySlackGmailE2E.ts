import { createClient } from "@supabase/supabase-js";

const WORKSPACE_ID = "f8f3e4af-0cc5-4709-965a-df49f434753c";
const SOURCE_ROLE_ID = "5168d8b5-4cbd-461f-9a31-84ed80a078b7";
const SOURCE_ROLE_NAME = "[E2E 2026-08-21] Portfolio Operations Lead";
const TALENT_ID = "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd";
const COMPANY_USER_ID = TALENT_ID;

const FIXTURES = [
  {
    key: "question",
    name: "[E2E 2026-08-22 질문] Portfolio Operations Lead",
    recommendationId: "e2e62200-0000-4000-8000-000000000011",
    roleId: "e2e62200-0000-4000-8000-000000000001",
  },
  {
    key: "connect-a",
    name: "[E2E 2026-08-22 연결 A] Portfolio Operations Lead",
    recommendationId: "e2e62200-0000-4000-8000-000000000012",
    roleId: "e2e62200-0000-4000-8000-000000000002",
  },
  {
    key: "connect-b",
    name: "[E2E 2026-08-22 연결 B] Portfolio Operations Lead",
    recommendationId: "e2e62200-0000-4000-8000-000000000013",
    roleId: "e2e62200-0000-4000-8000-000000000003",
  },
  {
    key: "reject",
    name: "[E2E 2026-08-22 거절] Portfolio Operations Lead",
    recommendationId: "e2e62200-0000-4000-8000-000000000014",
    roleId: "e2e62200-0000-4000-8000-000000000004",
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
        .select("role_id, name, company_workspace_id")
        .in("role_id", fixtureRoleIds)
    )) ?? [];
  for (const role of existing) {
    const fixture = FIXTURES.find((item) => item.roleId === role.role_id);
    if (
      !fixture ||
      role.name !== fixture.name ||
      role.company_workspace_id !== WORKSPACE_ID
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
          "id, role_id, recommendation_id, workflow_status, request_context, delivery_subject, draft_revision, approved_at, updated_at"
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
  console.log(
    JSON.stringify(
      { progress, queue, recommendations, requests, roles, tags },
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
  const [contentMessages, roleMessages] = await Promise.all([
    checked(
      admin
        .from("company_messages")
        .select("id, conversation_id, slack_thread_id")
        .ilike("content", "%E2E 2026-08-22%")
    ),
    checked(
      admin
        .from("company_messages")
        .select("id, conversation_id, slack_thread_id")
        .in("role_id", roleIds)
    ),
  ]);
  const identifyingMessages = [
    ...(contentMessages ?? []),
    ...(roleMessages ?? []),
  ];
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

async function main() {
  const command = process.argv[2] || "status";
  if (command === "setup") await setup();
  else if (command === "status") await status();
  else if (command === "cleanup") await cleanup();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
