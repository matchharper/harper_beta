import assert from "node:assert/strict";
import test from "node:test";

process.env.OPENROUTER_API_KEY ||= "test-openrouter-key";

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

test("accepts a typed Decisions choice and otherwise defaults to responding", async () => {
  const { parseSlackReplyRoutingDecision } = await router;
  const raw = (type: string, choice: unknown) => ({
    answers: { reply: { type, choice } },
  });
  assert.equal(
    parseSlackReplyRoutingDecision(raw("choice", "respond")),
    "respond"
  );
  assert.equal(
    parseSlackReplyRoutingDecision(raw("choice", "ignore")),
    "ignore"
  );
  for (const invalid of [
    raw("noul", "ignore"),
    raw("choice", "IGNORE"),
    raw("choice", "uncertain"),
    {},
    null,
    "ignore",
  ])
    assert.equal(parseSlackReplyRoutingDecision(invalid), "respond");
});

test("calls native Jev Decisions once and preserves reported cost and request duration", async (t) => {
  const { decideHarperSlackThreadReply, SLACK_REPLY_ROUTING_ENDPOINT } =
    await router;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, SLACK_REPLY_ROUTING_ENDPOINT);
    const request = JSON.parse(String(init.body));
    assert.equal(request.model, "typesafe/jev-1.13");
    assert.equal(request.questions.reply.type, "choice");
    assert.deepEqual(Object.keys(request.questions.reply.criteria), [
      "respond",
      "ignore",
    ]);
    assert.deepEqual(request.provider, {
      data_collection: "deny",
      allow_fallbacks: false,
    });
    assert.equal(request.messages, undefined);
    assert.equal(request.reasoning, undefined);
    assert.equal(init.cache, "no-store");
    return Response.json({
      model: "typesafe/jev-1.13-20260917",
      answers: { reply: { type: "choice", choice: "ignore" } },
      usage: { input_tokens: 500, output_tokens: 25, cost: 0.00001 },
    });
  });
  let receipt: any;
  assert.equal(
    await decideHarperSlackThreadReply(
      [
        {
          content: "민수님은 어떻게 생각하세요?",
          role: "user",
          slackUserId: "U1",
        },
      ],
      {
        logUsage: false,
        onDebugCall: (call) => {
          receipt = call;
        },
      }
    ),
    "ignore"
  );
  assert.equal(calls, 1);
  assert.equal(receipt.model, "typesafe/jev-1.13-20260917");
  assert.equal(receipt.estimatedCostUsd, 0.00001);
  assert.equal(receipt.pricingStatus, "provider_reported");
  assert.ok(receipt.durationMs >= 0);
});

test("provider errors and invalid answers fail open without a second model call", async (t) => {
  const { decideHarperSlackThreadReply } = await router;
  let response: Response;
  let calls = 0;
  t.mock.method(console, "warn", () => {});
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return response;
  });
  for (response of [
    new Response(null, { status: 503 }),
    Response.json({ answers: {} }),
    new Response("invalid json"),
  ]) {
    assert.equal(
      await decideHarperSlackThreadReply(
        [{ content: "후속 정보 알려줘", role: "user" }],
        { logUsage: false }
      ),
      "respond"
    );
  }
  assert.equal(calls, 3);
});

test("does not call the provider for empty input", async (t) => {
  const { decideHarperSlackThreadReply } = await router;
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("unexpected provider call");
  });
  assert.equal(
    await decideHarperSlackThreadReply([], { logUsage: false }),
    "respond"
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("a provider timeout fails open without treating it as caller cancellation", async (t) => {
  const { decideHarperSlackThreadReply } = await router;
  t.mock.method(console, "warn", () => {});
  t.mock.method(AbortSignal, "timeout", () =>
    AbortSignal.abort(
      new DOMException("Decision request timed out", "TimeoutError")
    )
  );
  t.mock.method(globalThis, "fetch", async (_: string, init: RequestInit) => {
    init.signal!.throwIfAborted();
    throw new Error("timeout signal was not propagated");
  });
  assert.equal(
    await decideHarperSlackThreadReply(
      [{ content: "후보 정보를 더 알려줘", role: "user" }],
      { logUsage: false }
    ),
    "respond"
  );
});

test("cancels an in-flight Decisions request when a newer Slack message arrives", async (t) => {
  const { decideHarperSlackThreadReply } = await router;
  t.mock.method(
    globalThis,
    "fetch",
    (_: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true }
        );
      })
  );
  const controller = new AbortController();
  const reason = new Error("newer Slack message arrived");
  const request = decideHarperSlackThreadReply(
    [{ content: "답해줘", role: "user" }],
    { signal: controller.signal, logUsage: false }
  );
  controller.abort(reason);
  await assert.rejects(request, reason);
});

test("propagates cancellation instead of converting it to a routing decision", async () => {
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
