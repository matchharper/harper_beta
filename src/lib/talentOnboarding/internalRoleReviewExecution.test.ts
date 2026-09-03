import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

process.env.OPENAI_API_KEY ??= "test-key";

const nodeModule = Module as typeof Module & {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = nodeModule._load;
nodeModule._load = function loadWithServerOnlyStub(
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "server-only") return {};
  return originalModuleLoad.call(this, request, parent, isMain);
};
const talentToolsPromise = import("./tools").finally(() => {
  nodeModule._load = originalModuleLoad;
});

const TALENT_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ROLE_ID = "22222222-2222-4222-8222-222222222222";
const FIT_REASONS = [
  "후보자의 고객 현장 문제 해결 경험이 이 역할의 실행 범위와 맞습니다.",
];

class FakeReviewAdmin {
  calls: Array<{ args: Record<string, unknown>; name: string }> = [];

  constructor(private readonly reconsiderationScheduled = false) {}

  from(table: string) {
    if (table === "logs") {
      return {
        async insert() {
          return { error: null };
        },
      };
    }
    if (table === "company_roles") {
      return new FakeQuery({
        data: {
          expires_at: null,
          information: {},
          is_expired: false,
          role_id: TARGET_ROLE_ID,
          source_type: "internal",
          status: "active",
        },
        error: null,
      });
    }
    if (table === "talent_opportunity_fit") {
      return new FakeQuery({
        data: {
          candidate_fit: "middle",
          company_fit: "fit",
          human_label: null,
          id: "fit-1",
          label: "fit",
          reevaluation_checked_at: this.reconsiderationScheduled
            ? null
            : "2026-09-03T00:00:00.000Z",
          reevaluation_criteria: this.reconsiderationScheduled
            ? { new_information: "The user changed a role-specific preference." }
            : null,
          role_fit: "fit",
        },
        error: null,
      });
    }
    throw new Error(`Unexpected table: ${table}`);
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ args, name });
    return {
      data: {
        company: "Example Company",
        companyShared: false,
        recommendedAt: "2026-09-02T00:00:00.000Z",
        status: "recommended",
        targetAccepted: false,
        targetRoleId: TARGET_ROLE_ID,
        targetRoleName: "Founding Engineer",
      },
      error: null,
    };
  }
}

class FakeQuery<T> {
  constructor(private readonly result: T) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  order() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

class FakeUnrecommendedLikeAdmin {
  rpcCalls: string[] = [];

  from(table: string) {
    if (table === "logs") {
      return {
        async insert() {
          return { error: null };
        },
      };
    }
    if (table === "talent_opportunity_recommendation") {
      return new FakeQuery({ data: [], error: null });
    }
    if (table === "company_roles") {
      return new FakeQuery({
        data: {
          expires_at: null,
          information: {},
          is_expired: false,
          role_id: TARGET_ROLE_ID,
          source_type: "internal",
          status: "active",
        },
        error: null,
      });
    }
    if (table === "talent_opportunity_fit") {
      return new FakeQuery({
        data: { human_label: null, id: "fit-1", label: "fit" },
        error: null,
      });
    }
    throw new Error(`Unexpected table: ${table}`);
  }

  async rpc(name: string) {
    this.rpcCalls.push(name);
    return { data: null, error: null };
  }
}

async function presentForReview() {
  const admin = new FakeReviewAdmin();
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;
  const result = await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId: "conversation-1",
      responseLocale: "ko",
      userId: TALENT_ID,
      userMessageId: 123,
    },
    input: {
      feedback: "review",
      fitReasons: FIT_REASONS,
      roleId: TARGET_ROLE_ID,
    },
    logging: false,
    name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  });
  return { admin, result: result as Record<string, unknown> };
}

test("presents an independent matched role without a source recommendation", async () => {
  const { admin, result } = await presentForReview();

  assert.equal(result.ok, true);
  assert.equal(result.targetRoleId, TARGET_ROLE_ID);
  assert.deepEqual(result.postingRoleIds, [TARGET_ROLE_ID]);
  assert.match(String(result.assistantInstruction), /get_role_context/);
  assert.match(String(result.assistantInstruction), /include_jd=true/);
  assert.match(String(result.assistantInstruction), /substantive explanation/);
  assert.equal("sourceRoleId" in result, false);
  assert.equal(admin.calls.length, 1);
  assert.equal(
    admin.calls[0]?.name,
    "present_talent_internal_role_recommendation_for_review_v1"
  );
  assert.equal(admin.calls[0]?.args.p_source_role_id, null);
  assert.equal(admin.calls[0]?.args.p_target_role_id, TARGET_ROLE_ID);
  assert.deepEqual(admin.calls[0]?.args.p_context, {
    conversationId: "conversation-1",
    fitReasons: FIT_REASONS,
    responseLocale: "ko",
    userMessageId: 123,
  });
});

test("requires candidate-visible fit reasons before creating a review recommendation", async () => {
  const admin = new FakeReviewAdmin();
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;

  await assert.rejects(
    executeTalentTool({
      context: {
        admin: admin as never,
        conversationId: "conversation-1",
        responseLocale: "ko",
        userId: TALENT_ID,
        userMessageId: 123,
      },
      input: {
        feedback: "review",
        roleId: TARGET_ROLE_ID,
      },
      logging: false,
      name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
    }),
    /candidate-safe fitReasons/
  );
  assert.equal(admin.calls.length, 0);
});

test("does not formalize a role while its new information is awaiting reconsideration", async () => {
  const admin = new FakeReviewAdmin(true);
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;

  const result = (await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId: "conversation-1",
      responseLocale: "ko",
      userId: TALENT_ID,
      userMessageId: 123,
    },
    input: {
      feedback: "review",
      fitReasons: FIT_REASONS,
      roleId: TARGET_ROLE_ID,
    },
    logging: false,
    name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  })) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(result.reason, "internal_role_reconsideration_pending");
  assert.match(String(result.assistantInstruction), /review finishes/);
  assert.equal(admin.calls.length, 0);
});

test("blocks first-step acceptance of a matched role that has not been formally recommended", async () => {
  const admin = new FakeUnrecommendedLikeAdmin();
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;

  const result = (await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId: "conversation-1",
      responseLocale: "ko",
      userId: TALENT_ID,
      userMessageId: 123,
    },
    input: {
      feedback: "like",
      roleId: TARGET_ROLE_ID,
    },
    logging: false,
    name: TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  })) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "internal_role_review_required");
  assert.equal(admin.rpcCalls.length, 0);
});
