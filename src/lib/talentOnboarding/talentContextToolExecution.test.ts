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

test("update_talent_profile exposes exact profile name writes", async () => {
  const { getOpenAIChatTools, TALENT_TOOL_NAMES } = await talentToolsPromise;
  const tool = getOpenAIChatTools("chat").find(
    (entry) => entry.function.name === TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE
  );
  const parameters = tool?.function.parameters as {
    properties?: {
      talentUser?: {
        properties?: Record<string, { description?: string; type?: string }>;
      };
    };
  };
  const name = parameters.properties?.talentUser?.properties?.name;

  assert.equal(name?.type, "string");
  assert.match(name?.description ?? "", /exactly as they stated it/);
  assert.match(name?.description ?? "", /Never translate, transliterate/);
});

class FakeQuery<T> {
  constructor(private readonly result: T) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.result);
  }
}

class FakeTalentContextAdmin {
  rpcCalls: Array<{ args: Record<string, unknown>; name: string }> = [];

  from(table: string) {
    if (table === "logs") {
      return {
        async insert() {
          return { error: null };
        },
      };
    }
    if (table === "talent_setting") {
      return new FakeQuery({
        data: { is_onboarding_done: true },
        error: null,
      });
    }
    throw new Error(`Unexpected table: ${table}`);
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ args, name });
    return { data: { applied: [] }, error: null };
  }
}

const coachingActivityRow = {
  content: "",
  conversation_id: "conversation-1",
  created_at: "2026-09-22T00:00:00.000Z",
  id: 42,
  message_type: "career_coaching_activity",
  payload: {
    activityId: "11111111-1111-4111-8111-111111111111",
    agenda: ["전환 이유 확인"],
    channel: "chat",
    createdAt: "2026-09-22T00:00:00.000Z",
    endedAt: null,
    kind: "career_coaching_activity",
    plannedMinutes: 20,
    revision: 3,
    startedAt: "2026-09-22T00:00:00.000Z",
    status: "active",
    suggestedMinutes: 20,
    topic: "PM 전환 판단",
    updatedAt: "2026-09-22T00:00:00.000Z",
  },
  role: "assistant",
  user_id: "11111111-1111-4111-8111-111111111111",
};

class FakeCoachingQuery {
  select() {
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return Promise.resolve({ data: [coachingActivityRow], error: null });
  }
}

class FakeCoachingAdmin {
  rpcCalls: Array<{ args: Record<string, unknown>; name: string }> = [];

  constructor(private readonly rpcError: string | null = null) {}

  from(table: string) {
    if (table === "logs") {
      return {
        async insert() {
          return { error: null };
        },
      };
    }
    if (table === "talent_messages") return new FakeCoachingQuery();
    throw new Error(`Unexpected table: ${table}`);
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ args, name });
    if (this.rpcError) {
      return { data: null, error: { message: this.rpcError } };
    }
    return {
      data: {
        ...coachingActivityRow,
        payload: {
          ...coachingActivityRow.payload,
          endedAt: "2026-09-22T00:05:00.000Z",
          revision: 4,
          status: "ended",
          updatedAt: "2026-09-22T00:05:00.000Z",
        },
      },
      error: null,
    };
  }
}

test("write_talent_context accepts missing Memory importance and Brief label", async () => {
  const admin = new FakeTalentContextAdmin();
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;

  const result = (await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId: "conversation-1",
      scheduleAfter: () => {},
      userId: "11111111-1111-4111-8111-111111111111",
      userMessageId: 123,
    },
    input: {
      changes: [
        {
          collection: "memory",
          content: "Prefers concise follow-ups.",
          op: "add",
        },
        {
          collection: "brief",
          content: "Open to remote platform roles.",
          op: "add",
        },
      ],
    },
    logging: false,
    name: TALENT_TOOL_NAMES.WRITE_TALENT_CONTEXT,
  })) as Record<string, unknown>;

  assert.equal(result.ok, true);
  const mutation = admin.rpcCalls.find(
    (call) => call.name === "mutate_talent_contexts"
  );
  const changes = mutation?.args.p_changes as Array<Record<string, unknown>>;
  assert.equal(changes[0]?.importance, 1);
  assert.equal(changes[1]?.label, "Career criteria");
});

test("coaching lifecycle fills omitted machine references from the current activity", async () => {
  const admin = new FakeCoachingAdmin();
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;

  const result = (await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId: "conversation-1",
      userId: "11111111-1111-4111-8111-111111111111",
      userMessageId: 123,
    },
    input: { action: "end" },
    logging: false,
    name: TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY,
  })) as Record<string, unknown>;

  assert.equal(result.ok, true);
  const mutation = admin.rpcCalls.find(
    (call) => call.name === "mutate_talent_career_coaching_activity"
  );
  assert.equal(mutation?.args.p_activity_message_id, 42);
  assert.equal(mutation?.args.p_expected_revision, 3);
});

test("coaching lifecycle returns a user-safe unavailable result on infrastructure failure", async () => {
  const admin = new FakeCoachingAdmin("schema cache mismatch");
  const { executeTalentTool, TALENT_TOOL_NAMES } = await talentToolsPromise;

  const result = (await executeTalentTool({
    context: {
      admin: admin as never,
      conversationId: "conversation-1",
      userId: "11111111-1111-4111-8111-111111111111",
      userMessageId: 124,
    },
    input: { action: "end" },
    logging: false,
    name: TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY,
  })) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(result.error, "activity_unavailable");
  assert.doesNotMatch(
    String(result.assistantInstruction),
    /schema|rpc|database/i
  );
});
