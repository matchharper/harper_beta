import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyDataChanges } from "@/lib/org/agent/companyDataMutation";
import type { OrgAgentPromptContext } from "@/lib/org/agent/context";
import { resolveCandidateContactLifecycleAction } from "@/lib/org/agent/candidateContactAction";
import { parseReadTalentIds } from "@/lib/org/agent/readTalentInput";
import { jsonValuesEqual } from "@/lib/jsonValue";
import {
  captureOrgAgentContactDraftState,
  createOrgAgentToolExecutionState,
  enforceOrgAgentReplyInvariants,
  getOrgAgentContactDraftReferences,
  getOrgAgentRequiredPresentationTexts,
  hasOrgAgentContactDraftReference,
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

test("a repeated immediate schedule request advances an existing queued contact", () => {
  assert.equal(
    resolveCandidateContactLifecycleAction({
      action: "schedule",
      deliveryMode: "immediate",
      workflowStatus: "queued",
    }),
    "immediate"
  );
  assert.equal(
    resolveCandidateContactLifecycleAction({
      action: "schedule",
      deliveryMode: "immediate",
      workflowStatus: "failed",
    }),
    "immediate"
  );
  assert.equal(
    resolveCandidateContactLifecycleAction({
      action: "schedule",
      deliveryMode: "immediate",
      workflowStatus: "draft",
    }),
    "schedule"
  );
  assert.equal(
    resolveCandidateContactLifecycleAction({
      action: "schedule",
      deliveryMode: "standard",
      workflowStatus: "queued",
    }),
    "schedule"
  );
});

test("role request reads become writable only after their result is available", () => {
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

  // read_role has executed, but the model must not act as though it saw the
  // result until the next reasoning step receives it.
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

test("meeting confirmation equality ignores JSON object key order", () => {
  const left = {
    additionalMessage: {
      sourceText: "가능하면 빠르게",
      visibility: "both" as const,
    },
    availabilityVersion: 2,
    config: {
      companyAttendees: [
        {
          companyUserId: "company-user-1",
          email: "owner@example.com",
          name: "Owner",
        },
      ],
      conferenceProvider: "google_meet" as const,
      durationMinutes: 60,
      offerWindowDays: 14,
      organizer: {
        companyUserId: "company-user-1",
        email: "owner@example.com",
        name: "Owner",
      },
      title: "Test <> Candidate Intro",
    },
    draftBlocker: null,
  };
  const reordered = {
    draftBlocker: null,
    config: {
      title: "Test <> Candidate Intro",
      organizer: {
        name: "Owner",
        email: "owner@example.com",
        companyUserId: "company-user-1",
      },
      offerWindowDays: 14,
      durationMinutes: 60,
      conferenceProvider: "google_meet",
      companyAttendees: [
        {
          name: "Owner",
          email: "owner@example.com",
          companyUserId: "company-user-1",
        },
      ],
    },
    availabilityVersion: 2,
    additionalMessage: {
      visibility: "both",
      sourceText: "가능하면 빠르게",
    },
  };

  assert.equal(jsonValuesEqual(left, reordered), true);
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

test("reply invariants preserve the model's contextual failure explanation", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.toolResults.push({
    callId: "contact-1",
    name: "contact_talent",
    status: "error",
    summary: "candidate contact failed",
  });
  const modelReply =
    "Laura님께는 아직 전달되지 않았어요. 현재 연락 상태를 다시 확인한 뒤 중복 없이 이어갈게요.";

  assert.equal(enforceOrgAgentReplyInvariants(state, modelReply), modelReply);
});

test("workspace-scoped Harper links keep model prose but use the verified org id", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  const reply = enforceOrgAgentReplyInvariants(
    state,
    "필요하면 <https://matchharper.com/org/settings?dialog=interview-availability&amp;orgId=hallucinated-workspace|가능 시간 설정>에서 조정할 수 있어요."
  );

  assert.equal(
    reply,
    `필요하면 <https://matchharper.com/org/settings?dialog=interview-availability&amp;orgId=${state.company.workspaceId}|가능 시간 설정>에서 조정할 수 있어요.`
  );
});

test("a started role creation keeps model prose and requires the exact Slack link once", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  const requiredLink =
    "<https://slack.example/thread|새로운 채용 등록 이어가기>";
  state.requiredSlackContinuationLink = requiredLink;
  state.fallbackReply = "역할 등록을 시작할게요.";
  state.toolResults.push({
    callId: "call-start-role",
    name: "start_role_creation",
    status: "success",
    summary: "Staff Engineer 역할 작성 스레드 시작",
  });

  const reply = enforceOrgAgentReplyInvariants(
    state,
    `Staff Engineer 역할 등록을 함께 준비할게요.\n\n**새로운 채용 등록 이어가기**\n\n${requiredLink}\n\n${requiredLink}`
  );

  assert.equal(reply.split(requiredLink).length - 1, 1);
  assert.doesNotMatch(reply, /\*\*새로운 채용 등록 이어가기\*\*/);
  assert.match(reply, /Staff Engineer 역할 등록을 함께 준비할게요/);
});

test("multiple candidate drafts keep each contact's latest exact presentation", () => {
  const state = createOrgAgentToolExecutionState(minimalContext());
  state.contactDraftRef = { contactId: "richard-contact", revision: 1 };
  state.requiredPresentationText = "Richard에게 보낼 본문 v1";
  captureOrgAgentContactDraftState({ input: {}, state });

  state.contactDraftRef = { contactId: "laura-contact", revision: 1 };
  state.requiredPresentationText = "Laura에게 보낼 본문";
  captureOrgAgentContactDraftState({ input: {}, state });

  state.contactDraftRef = { contactId: "richard-contact", revision: 2 };
  state.requiredPresentationText = "Richard에게 보낼 본문 v2";
  captureOrgAgentContactDraftState({ input: {}, state });

  assert.deepEqual(state.contactDraftRefs, [
    { contactId: "richard-contact", revision: 2 },
    { contactId: "laura-contact", revision: 1 },
  ]);
  assert.deepEqual(getOrgAgentRequiredPresentationTexts(state), [
    "Richard에게 보낼 본문 v2",
    "Laura에게 보낼 본문",
  ]);
});

test("each draft in a multi-candidate assistant message satisfies exact-copy adjacency", () => {
  const metadata = {
    contactDraftRef: { contactId: "laura-contact", revision: 1 },
    contactDraftRefs: [
      { contactId: "richard-contact", revision: 2 },
      { contactId: "laura-contact", revision: 1 },
      { contactId: "richard-contact", revision: 2 },
      { contactId: "invalid-contact", revision: 0 },
    ],
  };

  assert.deepEqual(getOrgAgentContactDraftReferences(metadata), [
    { contactId: "richard-contact", revision: 2 },
    { contactId: "laura-contact", revision: 1 },
  ]);
  assert.equal(
    hasOrgAgentContactDraftReference({
      contactId: "richard-contact",
      metadata,
      revision: 2,
    }),
    true
  );
  assert.equal(
    hasOrgAgentContactDraftReference({
      contactId: "richard-contact",
      metadata,
      revision: 1,
    }),
    false
  );
});

test("legacy singular draft metadata still satisfies exact-copy adjacency", () => {
  assert.equal(
    hasOrgAgentContactDraftReference({
      contactId: "legacy-contact",
      metadata: {
        contactDraftRef: { contactId: "legacy-contact", revision: 3 },
      },
      revision: 3,
    }),
    true
  );
});
