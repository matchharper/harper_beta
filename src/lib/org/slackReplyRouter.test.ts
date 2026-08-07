import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENAI_API_KEY ||= "test-openai-key";

const router = import("./slackReplyRouter");

test("builds compact text context with stable speaker labels", async () => {
  const { buildSlackReplyRoutingInput } = await router;
  assert.equal(
    buildSlackReplyRoutingInput([
      {
        content: "이 후보는   B2B SaaS 경험이 있습니다.",
        role: "assistant",
      },
      {
        content: "민수님은 어떻게 생각하세요?",
        role: "user",
        slackUserId: "U1",
      },
      {
        content: "저는 좋아 보여요.\n인터뷰 잡을게요.",
        role: "user",
        slackUserId: "U2",
      },
    ]),
    [
      "Harper: 이 후보는 B2B SaaS 경험이 있습니다.",
      "Person A: 민수님은 어떻게 생각하세요?",
      "Latest - Person B: 저는 좋아 보여요. 인터뷰 잡을게요.",
    ].join("\n")
  );
});

test("keeps only the latest ten messages and caps each message", async () => {
  const { buildSlackReplyRoutingInput } = await router;
  const input = buildSlackReplyRoutingInput(
    Array.from({ length: 12 }, (_, index) => ({
      content: index === 11 ? "가".repeat(500) : `message ${index}`,
      role: "user" as const,
      slackUserId: "U1",
    }))
  );
  assert.equal(
    input.split("\n").some((line) => line.endsWith("message 0")),
    false
  );
  assert.equal(
    input.split("\n").some((line) => line.endsWith("message 1")),
    false
  );
  assert.match(input, /^Person A: message 2/m);
  assert.equal(input.split("\n").length, 10);
  assert.equal(
    input.split("\n").at(-1),
    `Latest - Person A: ${"가".repeat(360)}`
  );
});

test("accepts only the three decision tokens", async () => {
  const { parseSlackReplyRoutingDecision } = await router;
  assert.equal(parseSlackReplyRoutingDecision("respond\n"), "respond");
  assert.equal(parseSlackReplyRoutingDecision("IGNORE"), "ignore");
  assert.equal(parseSlackReplyRoutingDecision("uncertain"), "uncertain");
  assert.equal(
    parseSlackReplyRoutingDecision("respond because asked"),
    "uncertain"
  );
  assert.equal(parseSlackReplyRoutingDecision(""), "uncertain");
});

test("propagates cancellation instead of converting it to uncertain", async () => {
  const { decideHarperSlackThreadReply } = await router;
  const reason = new Error("newer Slack message arrived");
  const signal = AbortSignal.abort(reason);
  await assert.rejects(
    decideHarperSlackThreadReply(
      [{ content: "답해줘", role: "user", slackUserId: "U1" }],
      { signal }
    ),
    reason
  );
});
