import test from "node:test";
import assert from "node:assert/strict";
import { executeOpportunityFeedbackBatch } from "./opportunityFeedbackBatch";
import { formatToolResultText } from "@/lib/llm/promptText";
import { serializeToolResultForModel } from "@/lib/llm/toolError";
import {
  executeTalentTool,
  getOpenAIChatTools,
} from "@/lib/talentOnboarding/tools";

test("feedback batch preserves order, partial outcomes and compact provider receipts", async () => {
  const calls: string[] = [];
  const result = await executeOpportunityFeedbackBatch(
    {
      items: [
        { opportunityId: "same", feedback: "like" },
        { opportunityId: "bad", feedback: "dislike" },
        { opportunityId: "same", feedback: "dislike" },
      ],
    },
    async (item) => {
      calls.push(`${item.opportunityId}:${item.feedback}`);
      if (item.opportunityId === "bad")
        throw new Error("Unavailable for this user");
      return {
        ok: true,
        modelOutput: `Recorded ${item.feedback}; no company sharing.`,
        privateTrace: "secret",
      };
    }
  );
  assert.deepEqual(calls, ["same:like", "bad:dislike", "same:dislike"]);
  assert.deepEqual(
    (result.results as any[]).map((r) => r.ok),
    [true, false, true]
  );
  const text = serializeToolResultForModel(result, formatToolResultText);
  assert.match(text, /Decision 2; opportunityId bad; feedback dislike/);
  assert.match(text, /Unavailable for this user/);
  assert.match(text, /Recorded like/);
  assert.match(text, /Recorded dislike/);
  assert.ok(!text.includes("secret"));
});

test("feedback batch retains disambiguation and stops subsequent work on cancellation", async () => {
  const ambiguous = await executeOpportunityFeedbackBatch(
    { items: [{ companyName: "Example", feedback: "like" }] },
    async () => ({
      ok: false,
      reason: "ambiguous",
      message: "Choose an exact recommendation.",
      candidates: [
        {
          id: "rec",
          roleId: "role",
          companyName: "Example",
          title: "Engineer",
          privateField: "hidden",
        },
      ],
    })
  );
  assert.match(
    formatToolResultText(ambiguous),
    /Choose an exact recommendation/
  );
  assert.match(formatToolResultText(ambiguous), /opportunityId rec/);
  assert.ok(!formatToolResultText(ambiguous).includes("hidden"));
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    executeOpportunityFeedbackBatch(
      { items: [{}, {}] },
      async () => {
        calls++;
        controller.abort();
        return { ok: true };
      },
      controller.signal
    ),
    /abort/i
  );
  assert.equal(calls, 1);
});

test("registered feedback schema and executor accept items and isolate invalid decisions", async () => {
  const schema = getOpenAIChatTools("chat").find(
    (t) => t.function.name === "update_recommended_opportunity_feedback"
  )!.function.parameters as any;
  assert.deepEqual(schema.required, ["items"]);
  assert.deepEqual(schema.properties.items.items.required, ["feedback"]);
  const owner = "11111111-1111-4111-8111-111111111111";
  let reads = 0;
  const admin = {
    from(table: string) {
      assert.equal(table, "logs");
      return { insert: async () => ({ error: null }) };
    },
    async rpc(name: string, args: any) {
      assert.equal(name, "set_timeout_and_execute_raw_sql");
      assert.ok(args.sql_query.includes(owner));
      reads++;
      return { data: [{ result: [{ items: [] }] }], error: null };
    },
  };
  const result = (await executeTalentTool({
    name: "update_recommended_opportunity_feedback",
    channel: "chat",
    logging: false,
    context: { admin, userId: owner },
    input: {
      items: [
        {
          opportunityId: "22222222-2222-4222-8222-222222222222",
          feedback: "like",
        },
        { feedback: "invalid" },
      ],
    },
  })) as any;
  assert.equal(reads, 1);
  assert.equal(result.results[0].reason, "not_found", JSON.stringify(result.results[0]));
  assert.equal(result.results[1].ok, false);
  assert.match(
    formatToolResultText(result),
    /No recommended opportunity matched/
  );
  assert.match(formatToolResultText(result), /valid feedback/);
  await assert.rejects(
    executeTalentTool({
      name: "update_recommended_opportunity_feedback",
      logging: false,
      input: { items: [] },
    }),
    /user context/
  );
});
