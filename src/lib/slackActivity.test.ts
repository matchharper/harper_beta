import assert from "node:assert/strict";
import test from "node:test";
import { notifySlackActivity } from "./slackActivity";

test("posts a channel override through Slack chat.postMessage", async () => {
  const originalFetch = globalThis.fetch;
  const originalBotToken = process.env.SLACK_BOT_TOKEN;
  const originalTestMode = process.env.NEXT_PUBLIC_WORKER_TEST_MODE;
  const requests: { body: string; headers: Headers; url: string }[] = [];

  process.env.SLACK_BOT_TOKEN = "bot-token";
  delete process.env.NEXT_PUBLIC_WORKER_TEST_MODE;
  globalThis.fetch = (async (input, init) => {
    requests.push({
      body: String(init?.body ?? ""),
      headers: new Headers(init?.headers),
      url: String(input),
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const sent = await notifySlackActivity({
      action: "Internal position accepted ☘️",
      channelId: "C09CRN4TFC4",
      email: "hojin@example.com",
      userId: "talent-1",
    });

    assert.equal(sent, true);
    const request = requests[0];
    assert.ok(request);
    assert.equal(request.url, "https://slack.com/api/chat.postMessage");
    assert.equal(request.headers.get("Authorization"), "Bearer bot-token");
    assert.equal(JSON.parse(request.body).channel, "C09CRN4TFC4");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBotToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalBotToken;
    if (originalTestMode === undefined)
      delete process.env.NEXT_PUBLIC_WORKER_TEST_MODE;
    else process.env.NEXT_PUBLIC_WORKER_TEST_MODE = originalTestMode;
  }
});
