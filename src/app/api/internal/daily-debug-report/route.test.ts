import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://daily-debug.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
process.env.CRON_SECRET = "test-cron-secret";
process.env.SLACK_BOT_TOKEN = "test-slack-token";

test("cron auth precedes reads; dry-run never sends; publishing uses the requested channel and one thread", async () => {
  const { GET } = await import("./route");
  const oldFetch = global.fetch;
  const sent: Array<{ channel: string; thread_ts?: string; text: string }> = [];
  let reads = 0;
  global.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://slack.com/api/chat.postMessage") {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ ok: true, ts: `${sent.length}.0` }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    reads++;
    const query = new URL(url);
    const rows = query.pathname.endsWith("/talent_users")
      ? [{ user_id: "candidate-id", email: "candidate@example.net", deleted_at: null }]
      : query.searchParams.get("type") === "like.career_profile_source_save_failed:%"
        ? [{ id: 1, user_id: "candidate-id", error: "DOMMatrix is not defined" }]
        : [];
    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const request = (query = "", authorized = true) =>
      new NextRequest(
        `https://harper.test/api/internal/daily-debug-report${query}`,
        {
          headers: authorized
            ? { authorization: "Bearer test-cron-secret" }
            : {},
        }
      );
    assert.equal((await GET(request("", false))).status, 401);
    assert.equal(reads, 0);
    const preview = await (
      await GET(request("?dryRun=1&date=2026-11-10"))
    ).json();
    assert.equal(preview.dryRun, true);
    assert.equal(preview.channelId, "C0BULQ5K5EJ");
    assert.equal(sent.length, 0);
    const result = await (await GET(request("?date=2026-11-10"))).json();
    assert.equal(result.sent, true);
    assert.equal(result.complete, true);
    assert.equal(sent.length, 2);
    assert.ok(sent.every((m) => m.channel === "C0BULQ5K5EJ"));
    assert.equal(sent[0].thread_ts, undefined);
    assert.ok(sent.slice(1).every((m) => m.thread_ts === "1.0"));
    assert.match(sent[1].text, /이력서·프로필 오류 1건 · DOMMatrix is not defined/);
    assert.doesNotMatch(sent[1].text, /candidate-id/);
  } finally {
    global.fetch = oldFetch;
  }
});
