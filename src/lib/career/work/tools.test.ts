import assert from "node:assert/strict";
import test from "node:test";
import { CAREER_WORK_TOOLS } from "./tools";
import { resolveCareerChatTools } from "../llmTools";

const workId = "00000000-0000-4000-8000-000000000001";
const otherWorkId = "00000000-0000-4000-8000-000000000002";

test("work outcome calls use only their observed execution revision and preserve explicit revisions", async () => {
  for (const [action, target, explicit, expected] of [
    ["wait", workId, undefined, 3],
    ["finish", workId, undefined, 3],
    ["wait", workId, 5, 5],
    ["wait", otherWorkId, undefined, undefined],
    ["update", workId, undefined, undefined],
    ["cancel", workId, undefined, undefined],
  ] as const) {
    let input: any;
    const admin: any = {
      from: () => { throw new Error("Do not fetch the latest revision to bypass a conflict"); },
      rpc: async (name: string, args: any) => {
        assert.equal(name, "manage_career_work");
        input = args.p_input;
        // The database remains authoritative and can reject a concurrent update.
        return { data: null, error: { message: "Work revision conflict; read current work" } };
      },
    };
    await assert.rejects(CAREER_WORK_TOOLS.manage_work.execute!({
      action, work_id: target, ...(explicit === undefined ? {} : { expected_revision: explicit }),
    }, { admin, userId: "user", conversationId: "conversation", workId, workRevision: 3, userMessageIds: [42] }), /revision conflict/);
    assert.equal(input.expected_revision, expected);
    assert.deepEqual(input.source_refs, [42]);
  }
});

test("the model-facing tool schema explains the revision default and required caller values", () => {
  const tool = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true }).tools
    .find(tool => tool.function.name === "manage_work")!;
  const schema = tool.function.parameters as any;
  assert.equal(schema.properties.expected_revision.minimum, 1);
  assert.match(schema.properties.expected_revision.description, /Required when updating or cancelling a work/);
  assert.match(schema.properties.expected_revision.description, /execution-start revision/);
  assert.match(schema.properties.expected_revision.description, /concurrent changes still conflict/);
});
