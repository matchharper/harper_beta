import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyDataChanges } from "@/lib/org/agent/companyDataMutation";
import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import { parseReadTalentIds } from "@/lib/org/agent/readTalentInput";
import {
  createOrgAgentToolExecutionState,
  enforceOrgAgentTerminalMutationOutcome,
  isOrgAgentLongTextComplete,
  markOrgAgentLongTextComplete,
  promoteOrgAgentToolReadVisibility,
} from "@/lib/org/agent/toolState";

function minimalContext(
  defaultLongTextObservations: NonNullable<
    OrgAgentPromptContext["defaultLongTextObservations"]
  > = []
) {
  return {
    companyText: "-",
    completeRoleRequestIds: [],
    contextNotesText: "-",
    conversationText: "-",
    defaultLongTextObservations,
    recentRecommendationsText: "-",
    roles: [],
    rolesText: "-",
    summariesText: "-",
    workspace: {
      companyDescription: null,
      companyName: "Test",
      logoUrl: null,
      pitch: null,
      request: null,
      updatedAt: "2026-07-30T10:23:45.123Z",
      workspaceId: "workspace-1",
    },
  } satisfies OrgAgentPromptContext;
}

test("role request reads become writable only after the tool batch", () => {
  const context = {
    companyText: "-",
    completeRoleRequestIds: ["role-visible"],
    contextNotesText: "-",
    conversationText: "-",
    recentRecommendationsText: "-",
    roles: [
      {
        criteria: [],
        createdAt: "2026-07-30T10:23:45.123Z",
        description: null,
        employmentTypes: [],
        externalJdUrl: null,
        locationText: null,
        name: "Visible",
        request: "full request",
        roleId: "role-visible",
        status: "active",
        updatedAt: "2026-07-30T10:23:45.123Z",
        workMode: null,
        workspaceId: "workspace-1",
      },
      {
        criteria: [],
        createdAt: "2026-07-30T10:23:45.123Z",
        description: null,
        employmentTypes: [],
        externalJdUrl: null,
        locationText: null,
        name: "Compacted",
        request: "long request",
        roleId: "role-compacted",
        status: "active",
        updatedAt: "2026-07-30T10:23:45.123Z",
        workMode: null,
        workspaceId: "workspace-1",
      },
    ],
    rolesText: "-",
    summariesText: "-",
    workspace: {
      companyDescription: null,
      companyName: "Test",
      logoUrl: null,
      pitch: null,
      request: null,
      updatedAt: "2026-07-30T10:23:45.123Z",
      workspaceId: "workspace-1",
    },
  } satisfies OrgAgentPromptContext;
  const state = createOrgAgentToolExecutionState(context);

  assert.equal(state.fullRoleRequestIds.has("role-visible"), true);
  assert.equal(state.fullRoleRequestIds.has("role-compacted"), false);

  // read_role has executed, but a parallel update in the same tool batch must
  // not be allowed to act as though the model already saw that result.
  state.pendingFullRoleRequestIds.add("role-compacted");
  assert.equal(state.fullRoleRequestIds.has("role-compacted"), false);

  promoteOrgAgentToolReadVisibility(state);
  assert.equal(state.fullRoleRequestIds.has("role-compacted"), true);
  assert.equal(state.pendingFullRoleRequestIds.size, 0);
});

test("long-text rewrite visibility is bound to the exact observed value", () => {
  const state = createOrgAgentToolExecutionState(
    minimalContext([{ key: "workspace_memory", roleId: null, value: null }])
  );

  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: null,
      key: "workspace_memory",
      roleId: null,
      state,
    }),
    true
  );
  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: "다른 사용자가 방금 쓴 메모",
      key: "workspace_memory",
      roleId: null,
      state,
    }),
    false
  );

  markOrgAgentLongTextComplete({
    key: "role_request",
    observedValue: "A",
    roleId: "role-1",
    state,
  });
  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: "A",
      key: "role_request",
      roleId: "role-1",
      state,
    }),
    true
  );
  assert.equal(
    isOrgAgentLongTextComplete({
      currentValue: "B",
      key: "role_request",
      roleId: "role-1",
      state,
    }),
    false
  );
});

test("an authoritative empty long-text target enables the large rewrite completion budget", async () => {
  const { getOrgAgentToolCompletionMaxTokens } =
    await import("@/lib/org/agent/toolCompletionBudget");
  const state = createOrgAgentToolExecutionState(
    minimalContext([{ key: "workspace_memory", roleId: null, value: null }])
  );
  const eightThousandCharacters = "가".repeat(8_000);
  const parsed = parseCompanyDataChanges({
    changes: [
      {
        key: "workspace_memory",
        kind: "rewrite",
        value: eightThousandCharacters,
      },
    ],
    summary: "회사 메모 작성",
  });

  assert.equal(parsed.changes[0].value, eightThousandCharacters);
  assert.equal(state.completeLongTextTargets.size, 1);
  assert.equal(getOrgAgentToolCompletionMaxTokens(state), 32_000);
  assert.equal(
    getOrgAgentToolCompletionMaxTokens(
      createOrgAgentToolExecutionState(minimalContext())
    ),
    4_000
  );
});

test("pending proposal lookup ignores expired rows at the query boundary", async () => {
  const { hasPendingOrgAgentUpdateProposal } =
    await import("@/lib/org/agent/proposals");
  const filters: Array<[string, unknown]> = [];
  const query = {
    eq(field: string, value: unknown) {
      filters.push([`eq:${field}`, value]);
      return this;
    },
    gt(field: string, value: unknown) {
      filters.push([`gt:${field}`, value]);
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    },
    select() {
      return this;
    },
  };
  const before = Date.now();
  const pending = await hasPendingOrgAgentUpdateProposal({
    admin: { from: () => query } as any,
    scopeKey: "chat:conversation-1",
    workspaceId: "workspace-1",
  });
  const after = Date.now();
  const expiryFilter = filters.find(([name]) => name === "gt:expires_at");

  assert.equal(pending, false);
  assert.ok(expiryFilter);
  const expiry = new Date(String(expiryFilter[1])).getTime();
  assert.ok(expiry >= before && expiry <= after);
});

test("candidate decision execution is an enabled terminal tool", async () => {
  const { assertOrgAgentToolAvailable } =
    await import("@/lib/org/agent/toolAvailability");
  const { isOrgAgentTerminalToolName } = await import("@/lib/org/agent/tools");

  assert.doesNotThrow(() =>
    assertOrgAgentToolAvailable("prepare_candidate_connection")
  );
  assert.doesNotThrow(() =>
    assertOrgAgentToolAvailable("decide_candidate_connection")
  );
  assert.equal(
    isOrgAgentTerminalToolName("prepare_candidate_connection"),
    false
  );
  assert.equal(isOrgAgentTerminalToolName("change_role_status"), true);
  assert.equal(isOrgAgentTerminalToolName("manage_role_pipeline_stages"), true);
  assert.equal(isOrgAgentTerminalToolName("move_candidate_stage"), true);
  assert.equal(isOrgAgentTerminalToolName("decide_candidate_connection"), true);
  assert.equal(isOrgAgentTerminalToolName("contact_talent"), true);
  assert.equal(isOrgAgentTerminalToolName("change_talent_contact"), false);
});

test("read_talent input accepts ten unique IDs and rejects invalid batches", () => {
  const tenTalentIds = Array.from(
    { length: 10 },
    (_, index) => `talent-${index}`
  );
  assert.deepEqual(
    parseReadTalentIds({ talentIds: tenTalentIds }),
    tenTalentIds
  );
  assert.deepEqual(parseReadTalentIds({ talentId: "talent-1" }), ["talent-1"]);
  assert.throws(
    () =>
      parseReadTalentIds({
        talentIds: [...tenTalentIds, "talent-10"],
      }),
    /talentIds must contain at most 10 items/
  );
  assert.throws(
    () =>
      parseReadTalentIds({
        talentId: "talent-1",
        talentIds: ["talent-1"],
      }),
    /Provide talentIds or talentId, not both/
  );
  assert.throws(
    () => parseReadTalentIds({ talentIds: ["talent-1", "talent-1"] }),
    /talentIds must not contain duplicates/
  );
});

test("a failed Role status change cannot be presented as completed", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "role-status-1",
    name: "change_role_status",
    status: "error",
    summary: "상태 변경 실패",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "역할의 채용을 종료했습니다."
    ),
    "역할 상태를 변경하지 못했습니다. 역할과 현재 상태를 다시 확인한 뒤 시도해 주세요. 후보 추천이나 진행 중인 연결에는 변화가 없습니다."
  );
});

test("a failed candidate contact lifecycle action cannot be presented as completed", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "cancel-contact-1",
    name: "contact_talent",
    status: "error",
    summary: "발송 시작으로 취소 실패",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(state, "문의를 취소했습니다."),
    "후보자에게 요청을 보내지 못했어요. 대상 후보자와 역할, 요청 내용을 다시 확인해 주세요. 이메일이나 Harper 채팅으로 전달된 내용은 없어요."
  );
});

test("a successful candidate contact action keeps the model reply", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.terminalReply =
    "김후보님께 드릴 문의를 즉시 발송하도록 변경했습니다. 아직 전달 완료 단계는 아닙니다.";
  state.toolResults.push({
    callId: "immediate-contact-1",
    name: "contact_talent",
    status: "success",
    summary: "후보자 문의 즉시 발송 변경",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "안녕하세요. 후보자께 보낼 이메일 본문입니다."
    ),
    "안녕하세요. 후보자께 보낼 이메일 본문입니다."
  );
});

test("a started role creation keeps model-authored prose and requires the exact Slack link", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.requiredSlackContinuationLink =
    "<https://slack.example/thread|새로운 채용 등록 이어가기>";
  state.terminalReply =
    "Staff Engineer 역할 등록을 함께 시작할게요.\n\n<https://slack.example/thread|새로운 채용 등록 이어가기>";
  state.toolResults.push({
    callId: "call-start-role",
    name: "start_role_creation",
    status: "success",
    summary: "Staff Engineer 역할 작성 스레드 시작",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "네, Staff Engineer 역할 등록을 함께 시작할게요.\n\n보내주신 JD도 새 역할 대화에서 이어서 살펴볼게요."
    ),
    "네, Staff Engineer 역할 등록을 함께 시작할게요.\n\n보내주신 JD도 새 역할 대화에서 이어서 살펴볼게요.\n\n<https://slack.example/thread|새로운 채용 등록 이어가기>"
  );
});

test("a started role creation corrects the label without replacing model-authored prose", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.requiredSlackContinuationLink =
    "<https://slack.example/thread|새로운 채용 등록 이어가기>";
  state.terminalReply = "역할 등록을 시작할게요.";
  state.toolResults.push({
    callId: "call-start-role",
    name: "start_role_creation",
    status: "success",
    summary: "Product Designer 역할 작성 스레드 시작",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "Product Designer 역할 등록을 함께 준비할게요.\n\n<https://slack.example/thread|역할 작성 스레드로 이동>"
    ),
    "Product Designer 역할 등록을 함께 준비할게요.\n\n<https://slack.example/thread|새로운 채용 등록 이어가기>"
  );
});

test("a started role creation keeps the required link exactly once", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  const requiredLink =
    "<https://slack.example/thread|새로운 채용 등록 이어가기>";
  state.requiredSlackContinuationLink = requiredLink;
  state.terminalReply = "역할 등록을 시작할게요.";
  state.toolResults.push({
    callId: "call-start-role",
    name: "start_role_creation",
    status: "success",
    summary: "Data Engineer 역할 작성 스레드 시작",
  });

  const reply = enforceOrgAgentTerminalMutationOutcome(
    state,
    `Data Engineer 역할 등록을 시작할게요.\n\n${requiredLink}\n\n새 역할 대화에서 이어갈게요.\n\n${requiredLink}`
  );

  assert.equal(reply.split(requiredLink).length - 1, 1);
  assert.match(reply, /새 역할 대화에서 이어갈게요\./);
});

test("a started role creation removes a duplicate standalone continuation heading", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  const requiredLink =
    "<https://slack.example/thread|새로운 채용 등록 이어가기>";
  state.requiredSlackContinuationLink = requiredLink;
  state.terminalReply = "역할 등록을 시작할게요.";
  state.toolResults.push({
    callId: "call-start-role-heading",
    name: "start_role_creation",
    status: "success",
    summary: "Data Engineer 역할 작성 스레드 시작",
  });

  const reply = enforceOrgAgentTerminalMutationOutcome(
    state,
    `역할 등록을 시작할게요.\n\n**새로운 채용 등록 이어가기**\n\n${requiredLink}`
  );

  assert.equal(reply.split("새로운 채용 등록 이어가기").length - 1, 1);
  assert.doesNotMatch(reply, /\*\*새로운 채용 등록 이어가기\*\*/);
});

test("a failed terminal mutation cannot be presented as a success", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "update-1",
    name: "update_data",
    status: "error",
    summary: "변경 적용 실패",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "요청하신 내용을 반영했습니다."
    ),
    "요청하신 변경은 적용되지 않았습니다. 내용을 다시 확인한 뒤 시도해 주세요."
  );
});

test("a failed role criteria edit cannot be presented as a success", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "criteria-edit-1",
    name: "update_role_criteria",
    status: "error",
    summary: "대상 기준 없음",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "요청하신 평가 기준을 삭제했습니다."
    ),
    "요청하신 변경은 적용되지 않았습니다. 내용을 다시 확인한 뒤 시도해 주세요."
  );
});

test("a successful retry supersedes an earlier update_data input error", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push(
    {
      callId: "update-invalid-1",
      name: "update_data",
      status: "error",
      summary: "proposalId and proposalAction must be provided together",
    },
    {
      callId: "update-retry-1",
      name: "update_data",
      status: "success",
      summary: "확인한 변경 반영",
    }
  );

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "요청하신 내용을 반영했습니다."
    ),
    "요청하신 내용을 반영했습니다."
  );
});

test("an update_data input error stays authoritative before mutation starts", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalReply =
    "변경 요청을 안전하게 해석하지 못해 적용하지 않았습니다. 기존 내용은 바뀌지 않았어요.";
  state.toolResults.push({
    callId: "update-invalid-before-mutation",
    name: "update_data",
    status: "error",
    summary: "proposalId and proposalAction must be provided together",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "요청하신 내용을 반영했습니다."
    ),
    state.terminalReply
  );
});

test("a failed candidate contact is not mislabeled as a data change", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "contact-1",
    name: "contact_talent",
    status: "error",
    summary: "도구 실행 실패",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "후보자분께 확인 요청을 보냈습니다."
    ),
    "후보자에게 요청을 보내지 못했어요. 대상 후보자와 역할, 요청 내용을 다시 확인해 주세요. 이메일이나 Harper 채팅으로 전달된 내용은 없어요."
  );
});

test("an existing candidate request keeps the model's replacement question", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.terminalReply = "기존 요청을 취소하고 이번 요청으로 새로 접수할까요?";
  state.toolResults.push({
    callId: "contact-existing",
    name: "contact_talent",
    status: "unchanged",
    summary: "기존 후보자 요청 확인·교체 여부 확인 필요",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "이미 대기 중인 요청이 있습니다. 기존 요청을 취소하고 새 질문으로 바꿀까요?"
    ),
    "이미 대기 중인 요청이 있습니다. 기존 요청을 취소하고 새 질문으로 바꿀까요?"
  );
});

test("a successful candidate contact keeps the model-authored explanation", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.terminalReply =
    "후보자분께 확인 요청을 접수했습니다. 이메일과 Harper 채팅으로 한 번 전달할 예정이며, 답이 오면 이 대화로 알려드리겠습니다.";
  state.toolResults.push({
    callId: "contact-2",
    name: "contact_talent",
    status: "success",
    summary: "후보자 확인 요청 대기열 생성",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "요청을 접수했고 다음 전달 단계도 설명했습니다."
    ),
    "요청을 접수했고 다음 전달 단계도 설명했습니다."
  );
});

test("a candidate draft keeps the server status beside the exact presentation", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.terminalReply =
    "후보자에게 보낼 전체 문구를 작성해 초안으로 저장했습니다. 아직 발송하지 않았습니다.";
  state.requiredPresentationText = "제목과 본문 전체";
  state.toolResults.push({
    callId: "contact-draft",
    name: "contact_talent",
    status: "success",
    summary: "후보자 연락 초안 작성",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "이번 결과에는 본문이 표시되지 않았습니다."
    ),
    state.terminalReply
  );
});

test("a failed candidate decision cannot be presented as completed", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "decision-1",
    name: "decide_candidate_connection",
    status: "error",
    summary: "직전 확인 없음",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(state, "후보자를 거절했습니다."),
    "후보자 연결 결정의 최종 결과를 확인하지 못했어요. 소개 이메일이나 후보자 안내가 전달됐을 수 있으니 바로 다시 시도하지 말고, 후보자의 현재 상태와 메일을 먼저 확인해 주세요."
  );
});

test("an unconfirmed candidate decision keeps the server confirmation copy", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.terminalReply =
    "Harper가 후보자와 회사를 CC한 소개 메일로 연결합니다. 이대로 연결할까요?";
  state.toolResults.push({
    callId: "decision-confirmation",
    name: "decide_candidate_connection",
    status: "unchanged",
    summary: "후보자 연결 수락 재확인 필요",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(state, "후보자를 연결했습니다."),
    state.terminalReply
  );
});

test("a successful candidate decision keeps the model-authored explanation", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.terminalMutationUsed = true;
  state.toolResults.push({
    callId: "decision-2",
    name: "decide_candidate_connection",
    status: "success",
    summary: "연결 대기 후보자의 프로세스를 중단했습니다.",
  });

  assert.equal(
    enforceOrgAgentTerminalMutationOutcome(
      state,
      "프로세스를 중단했고 이유가 어떻게 저장됐는지도 설명했습니다."
    ),
    "프로세스를 중단했고 이유가 어떻게 저장됐는지도 설명했습니다."
  );
});
