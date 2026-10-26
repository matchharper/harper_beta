import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserUseSession, stopBrowserUseSession, browserUseStagehandOptions } from "./browserUseCloud.mjs";

function mock(t, handler) {
  const original = globalThis.fetch, key = process.env.BROWSER_USE_API_KEY;
  process.env.BROWSER_USE_API_KEY = "synthetic-test-key";
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.BROWSER_USE_API_KEY;
    else process.env.BROWSER_USE_API_KEY = key;
  });
}

test("remote-only CDP creation preserves the 30 minute budget and disables paid proxy", async (t) => {
  const calls = [];
  mock(t, async (url, init) => {
    calls.push({ url, ...init });
    return Response.json({ id: "owned-browser", cdpUrl: "wss://cloud.browser-use.com/connect" });
  });
  const session = await createBrowserUseSession();
  assert.equal(calls[0].url, "https://api.browser-use.com/api/v4/browsers");
  assert.equal(calls[0].headers["X-Browser-Use-API-Key"], "synthetic-test-key");
  const body = JSON.parse(calls[0].body);
  assert.equal(body.timeout, 30); // API uses minutes, not Browserbase seconds.
  assert.equal(body.proxyCountryCode, null);
  assert.equal(body.enableRecording, false);
  assert.deepEqual(browserUseStagehandOptions(session), {
    env: "LOCAL", localBrowserLaunchOptions: { cdpUrl: session.connectUrl },
  });
  await stopBrowserUseSession(session.id);
  assert.equal(calls[1].method, "PATCH");
  assert.equal(calls[1].url, "https://api.browser-use.com/api/v4/browsers/owned-browser");
  assert.deepEqual(JSON.parse(calls[1].body), { action: "stop" });
});

test("missing CDP releases the created browser instead of launching locally", async (t) => {
  const methods = [];
  mock(t, async (_url, init) => {
    methods.push(init.method);
    return Response.json({ id: "orphan" });
  });
  await assert.rejects(createBrowserUseSession, /secure CDP URL/);
  assert.deepEqual(methods, ["POST", "PATCH"]);
  assert.throws(() => browserUseStagehandOptions({}), /remote CDP/);
});

test("failed or ambiguous creation is not retried and errors do not expose response secrets", async (t) => {
  let count = 0;
  mock(t, async () => { count++; return new Response("secret-connection-url", { status: 402 }); });
  await assert.rejects(createBrowserUseSession, /Browser Use Cloud POST failed \(402\)/);
  assert.equal(count, 1);
});

test("cleanup accepts already removed sessions but surfaces failures", async (t) => {
  let status = 404;
  mock(t, async () => new Response(null, { status }));
  await stopBrowserUseSession("gone");
  status = 503;
  await assert.rejects(() => stopBrowserUseSession("running"), /503/);
});

test("missing credentials fail before any paid request", async (t) => {
  mock(t, async () => { throw Error("must not fetch"); });
  delete process.env.BROWSER_USE_API_KEY;
  await assert.rejects(createBrowserUseSession, /BROWSER_USE_API_KEY is required/);
});

test("HTTPS discovery is resolved for Stagehand without forwarding the API key", async (t) => {
  const calls = [];
  mock(t, async (url, init) => {
    calls.push({ url: String(url), ...init });
    return calls.length === 1
      ? Response.json({ id: "owned", cdpUrl: "https://owned.cdp.browser-use.com" })
      : Response.json({ webSocketDebuggerUrl: "wss://owned.cdp.browser-use.com/devtools/browser/123" });
  });
  const session = await createBrowserUseSession();
  assert.equal(calls[1].url, "https://owned.cdp.browser-use.com/json/version");
  assert.equal(calls[1].headers, undefined);
  assert.equal(browserUseStagehandOptions(session).localBrowserLaunchOptions.cdpUrl,
    "wss://owned.cdp.browser-use.com/devtools/browser/123");
});
