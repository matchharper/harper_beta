import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  formatGmailSearchResult,
  type GmailSearchResult,
} from "@/lib/integrations/gmail";

test("Gmail debugger enforces internal self access and the actual tool schema, preserving model output and failures", async (t) => {
  for (const [key, value] of Object.entries({
    OPENAI_API_KEY: "test-only",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-only",
  })) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  const modules = Module as unknown as {
    _load: (name: string, ...args: unknown[]) => unknown;
  };
  const originalLoad = modules._load;
  modules._load = function (name, ...args) {
    if (name === "server-only") return {};
    return originalLoad.call(this, name, ...args);
  };
  t.after(() => {
    modules._load = originalLoad;
  });
  const talentTools = await import("@/lib/talentOnboarding/tools");
  let user: User | null = {
    id: "daniel-id",
    email: "daniel@matchharper.com",
  } as User;
  let fail = false;
  const executions: Array<{
    name: string;
    input: unknown;
    context: { userId: string };
  }> = [];
  const lookups: string[] = [];
  const result: GmailSearchResult = {
    status: "ok",
    emails: [
      {
        messageId: "m1",
        threadId: "t1",
        from: "sender@example.com",
        to: "daniel@matchharper.com",
        cc: null,
        subject: "Interview",
        receivedAt: "2026-11-02T00:00:00Z",
        snippet: "Hello",
        content: "Full email content",
      },
    ],
    truncated: true,
    nextPageToken: "next-page",
    assistantInstruction: "Only returned messages were retrieved.",
  };
  result.modelOutput = formatGmailSearchResult(result);
  const mocks: Record<string, unknown> = {
    "@/lib/supabaseServer": { getRequestUser: async () => user },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/integrations/gmail": {
      fetchTalentGmailIntegration: async ({
        talentId,
      }: {
        talentId: string;
      }) => {
        lookups.push(talentId);
        return { status: "active" };
      },
    },
    "@/lib/talentOnboarding/tools": {
      ...talentTools,
      executeTalentTool: async (args: (typeof executions)[number]) => {
        executions.push(args);
        if (fail) throw new Error("Provider unavailable");
        return result;
      },
    },
  };
  modules._load = function (name, ...args) {
    return mocks[name] ?? originalLoad.call(this, name, ...args);
  };
  try {
    const { GET, POST } = await import("./route");
    const post = (body: unknown) =>
      POST(
        new NextRequest("http://localhost/api/internal/debug/career-gmail", {
          method: "POST",
          body: JSON.stringify(body),
        })
      );
    const options = await GET(
      new NextRequest(
        "http://localhost/api/internal/debug/career-gmail?userId=someone-else"
      )
    );
    assert.equal(options.status, 200);
    assert.equal(options.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(lookups, ["daniel-id"]);
    const metadata = await options.json();
    assert.equal(metadata.tool.name, "search_connected_gmail");

    for (const input of [
      null,
      [],
      {},
      { query: 5 },
      { query: "in:inbox", max_results: 501 },
      { query: "in:inbox", include_content: "true" },
      { query: "in:inbox", userId: "someone-else" },
      { query: "in:inbox", name: "write_email" },
    ]) {
      assert.equal((await post(input)).status, 400);
    }
    assert.equal(executions.length, 0);
    const input = {
      query: "from:example.com",
      max_results: 2,
      include_content: true,
    };
    const response = await post(input);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const payload = await response.json();
    assert.equal(payload.account.userId, "daniel-id");
    assert.deepEqual(payload.input, input);
    assert.deepEqual(payload.result, result);
    assert.equal(payload.llmText, result.modelOutput);
    assert.equal(executions[0].context.userId, "daniel-id");
    assert.equal(executions[0].name, "search_connected_gmail");

    fail = true;
    const failed = await (await post(input)).json();
    assert.equal(failed.result, null);
    assert.match(failed.error, /Provider unavailable/);
    assert.match(failed.llmText, /Provider unavailable/);

    user = { id: "external", email: "external@example.com" } as User;
    assert.equal((await post(input)).status, 403);
    assert.equal(
      (
        await GET(
          new NextRequest("http://localhost/api/internal/debug/career-gmail")
        )
      ).status,
      403
    );
    user = null;
    assert.equal((await post(input)).status, 401);
    assert.equal(executions.length, 2);
    assert.deepEqual(lookups, ["daniel-id"]);
  } finally {
    modules._load = originalLoad;
  }
});
