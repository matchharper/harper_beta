import assert from "node:assert/strict";
import test from "node:test";
import {
  postUserFeedbackSlackMessage,
  USER_FEEDBACK_SLACK_CHANNEL_ID,
} from "./userFeedbackSlack";

test("posts user feedback to the code-owned support channel", async () => {
  const originalFetch = globalThis.fetch;
  const originalBotToken = process.env.SLACK_BOT_TOKEN;
  const requests: { body: string; headers: Headers; url: string }[] = [];

  process.env.SLACK_BOT_TOKEN = "bot-token";
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
    await postUserFeedbackSlackMessage({ text: "문의 내용" });

    const request = requests[0];
    assert.ok(request);
    assert.equal(request.url, "https://slack.com/api/chat.postMessage");
    assert.equal(request.headers.get("Authorization"), "Bearer bot-token");
    assert.equal(
      JSON.parse(request.body).channel,
      USER_FEEDBACK_SLACK_CHANNEL_ID
    );
    assert.equal(USER_FEEDBACK_SLACK_CHANNEL_ID, "C0BQWKFD058");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBotToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalBotToken;
  }
});
