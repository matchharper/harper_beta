import test from "node:test";
import assert from "node:assert/strict";
import { agentsRequest, cancelBrowserSession } from "./agentsApi";

test("Agents transport accepts empty successful event responses and parses JSON reads", async () => {
  const original = globalThis.fetch;
  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test";
  try {
    for (const status of [200, 202, 204]) {
      globalThis.fetch = async () => new Response(null, { status });
      await assert.doesNotReject(() => cancelBrowserSession("test-session"));
    }
    globalThis.fetch = async () => Response.json({ id: "session" });
    assert.deepEqual(await agentsRequest("sessions/session"), {
      id: "session",
    });
    globalThis.fetch = async () => new Response("bad", { status: 403 });
    await assert.rejects(() => cancelBrowserSession("test-session"), /403/);
    globalThis.fetch = async () => new Response("{broken", { status: 200 });
    await assert.rejects(() => agentsRequest("sessions/session"), SyntaxError);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});

test("ending an activity skips finished browsers and tolerates already deleted sessions", async () => {
  const {stopApplicationBrowser} = await import("./agentsApi");
  const original = globalThis.fetch;
  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test";
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response(null, {status:404}); };
    for (const status of ["failed", "succeeded", "uncertain", "cancelled"]) {
      await stopApplicationBrowser({status, sessionId:"deleted-session"});
    }
    assert.equal(calls, 0);
    await stopApplicationBrowser({status:"queued"});
    assert.equal(calls, 0);
    for (const status of ["running", "waiting"]) {
      await assert.doesNotReject(() => stopApplicationBrowser({status,sessionId:"deleted-session"}));
    }
    assert.equal(calls, 2);
    for (const status of [401,403,500]) {
      globalThis.fetch = async () => new Response(null, {status});
      await assert.rejects(() => stopApplicationBrowser({status:"running",sessionId:"live-session"}));
    }
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
