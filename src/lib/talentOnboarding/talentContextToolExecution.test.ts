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
