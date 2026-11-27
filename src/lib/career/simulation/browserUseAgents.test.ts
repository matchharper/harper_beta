import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { browserUseAgents, SESSION_PAGE_CAPTURE_MS, type CaptureBrowser } from "./browserUseAgents";
const workspace = "00000000-0000-4000-8000-000000000001";
const run = "00000000-0000-4000-8000-000000000002";
const session = "00000000-0000-4000-8000-000000000003";
process.env.BROWSER_USE_API_KEY = "fixture-secret";

test("live preview queries only the owned active session and returns only the read-only viewer URL", async (t) => {
  let liveUrl: string | null = null;
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("agentSessionId"), session);
    assert.equal(url.searchParams.get("filterBy"), "active");
    return Response.json({ items: [{ liveUrl, cdpUrl: "private-control-credential" }] });
  });
  assert.equal(await browserUseAgents.livePreview(session), null);
  liveUrl = "https://live.browser-use.com/session/fixture?token=secret";
  const preview = new URL((await browserUseAgents.livePreview(session))!);
  assert.equal(preview.searchParams.get("readOnly"), "true");
  assert.equal(preview.searchParams.get("ui"), "false");
  assert.equal(preview.searchParams.get("token"), "secret");
  liveUrl = "https://unrelated.example/session";
  await assert.rejects(browserUseAgents.livePreview(session), /viewer origin/);
});

test("V4 uploads exact bytes with signed headers and sends explicit Luna model without mail", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === `/api/v4/workspaces/${workspace}/files/upload`) {
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, {
        files: [
          { name: "Resume.pdf", contentType: "application/pdf", size: 3 },
        ],
        allowOverrides: true,
      });
      return Response.json({
        files: [
          {
            name: "Resume.pdf",
            path: "uploads/Resume.pdf",
            uploadUrl: "https://upload.example/signed",
          },
        ],
      });
    }
    if (path === "/signed") {
      assert.equal(init.method, "PUT");
      assert.deepEqual(init.headers, {
        "Content-Type": "application/pdf",
        "Content-Length": "3",
      });
      assert.deepEqual(
        Buffer.from(init.body as Uint8Array),
        Buffer.from([1, 2, 3])
      );
      return new Response(null, { status: 200 });
    }
    assert.equal(path, "/api/v4/runs");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "gpt-6-luna");
    assert.deepEqual(body.modelParams, { reasoning: { effort: "high" }, service_tier: "priority" });
    assert.equal(body.agentmail, false);
    assert.equal(body.workspaceId, workspace);
    assert.equal(body.sessionId, session);
    assert.deepEqual(body.outputSchema, { type: "object" });
    return Response.json({ id: run, sessionId: session, status: "running" });
  });
  const files = await browserUseAgents.upload(workspace, [
    {
      name: "Resume.pdf",
      documentId: "resume",
      path: "/ignored",
      mimeType: "application/pdf",
      data: Buffer.from([1, 2, 3]).toString("base64"),
    },
  ]);
  assert.equal(files[0].path, "uploads/Resume.pdf");
  await browserUseAgents.createRun(
    "Approved task",
    { type: "object" },
    workspace,
    session
  );
  assert.equal(calls.length, 3);
});

test("Standard override keeps the same model and high reasoning on new and continued runs", async (t) => {
  const calls: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    assert.equal(body.model, "gpt-6-luna");
    assert.deepEqual(body.modelParams, { reasoning: { effort: "high" }, service_tier: "default" });
    return Response.json({ id: run, sessionId: session, status: "running" });
  });
  await browserUseAgents.createRun("Inspect public page", {}, undefined, undefined, { serviceTier: "default" });
  await browserUseAgents.createRun("Continue", {}, workspace, session, { serviceTier: "default", keepAlive: 600 });
  assert.equal(calls[0].sessionId, undefined);
  assert.equal(calls[1].sessionId, session);
  assert.equal(calls[1].keepAlive, 600);
});

test("reselection replaces an earlier upload but cannot overwrite another selected attachment", async (t) => {
  const uploadedBytes: number[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (new URL(url).pathname.endsWith("/files/upload")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.allowOverrides, true);
      return Response.json({ files: [{ name: "Resume.pdf", path: "uploads/resume.pdf", uploadUrl: "https://upload.example/signed" }] });
    }
    uploadedBytes.push(Buffer.from(init.body as Uint8Array)[0]);
    return new Response(null, { status: 200 });
  });
  const file = (documentId: string, byte: number) => ({ documentId, name: "Resume.pdf", path: "Resume.pdf", mimeType: "application/pdf", data: Buffer.from([byte]).toString("base64") });
  await browserUseAgents.upload(workspace, [file("original", 1)]);
  await browserUseAgents.upload(workspace, [file("revised", 2)]);
  assert.deepEqual(uploadedBytes, [1, 2]);
  await assert.rejects(browserUseAgents.upload(workspace, [file("first", 3), file("second", 4)]), /same browser file path/);
  assert.deepEqual(uploadedBytes, [1, 2, 3]);
});

test("cleanup waits for cancellation then stops session browsers and deletes exact workspace paths", async (t) => {
  const calls: string[] = [];
  let statusReads = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const u = new URL(url),
      path = u.pathname;
    calls.push(`${init.method} ${path}${u.search}`);
    if (path === `/api/v4/runs/${run}/status`)
      return Response.json({
        status: ++statusReads === 1 ? "running" : "cancelled",
      });
    if (path.endsWith("/cancel")) return Response.json({ status: "cancelled" });
    if (path === "/api/v4/browsers")
      return Response.json({
        items: [{ id: workspace, status: "active" }],
        totalItems: 1,
      });
    if (path === `/api/v4/browsers/${workspace}`) {
      assert.deepEqual(JSON.parse(String(init.body)), { action: "stop" });
      return Response.json({ status: "stopped" });
    }
    if (path.endsWith("/files") && init.method === "GET")
      return Response.json({
        files: [{ path: "uploads/Resume.pdf" }, { path: "copy.txt" }],
        hasMore: false,
      });
    assert.equal(init.method, "DELETE");
    assert.ok(
      ["uploads/Resume.pdf", "copy.txt"].includes(u.searchParams.get("path")!)
    );
    return new Response(null, { status: 204 });
  });
  await browserUseAgents.stop({
    runId: run,
    sessionId: session,
    workspaceId: workspace,
    dispatchStarted: true,
  });
  assert.equal(calls.length, 8);
});

test("ambiguous creation has no retry or secret-bearing provider body in error", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("fixture-secret", { status: 502 });
  });
  await assert.rejects(
    browserUseAgents.createRun("task", {}, workspace),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("fixture-secret"));
      return true;
    }
  );
  assert.equal(calls, 1);
});

const completePage = "https://company-a.example/apply/complete";
const socket = "wss://live.cdp.example/devtools/browser/fixture";

/** Fakes the provider's browser listing for the session, and the CDP discovery endpoint when one is given. */
function provider(t: TestContext, browsers: () => unknown[], discovery?: (url: URL, init: RequestInit) => Response) {
  const listed: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v4/browsers") {
      listed.push(url);
      return Response.json({ items: browsers(), totalItems: browsers().length });
    }
    assert.ok(discovery, `no request expected to ${url.host}`);
    return discovery(url, init);
  });
  return listed;
}

/** A fake CDP connection holding pages at these URLs, and what a capture did with it. */
function cdpBrowser(urls: string[], shoot: () => Promise<Buffer> = async () => Buffer.from([0xff, 0xd8, 0xff])) {
  const seen = { shots: [] as { url: string; options: Record<string, unknown> }[], disconnects: 0, pagesClosed: 0 };
  const pages = urls.map((url) => ({
    url: () => url,
    screenshot: async (options: Record<string, unknown>) => {
      seen.shots.push({ url, options });
      return shoot();
    },
    close: async () => { seen.pagesClosed++; },
  }));
  const browser: CaptureBrowser = { contexts: () => [{ pages: () => pages }], close: async () => { seen.disconnects++; } };
  return { seen, browser };
}

const noConnection = async (): Promise<CaptureBrowser> => assert.fail("must not connect");

test("page capture attaches to the session's active browser over CDP, pictures the run's page and only disconnects", async (t) => {
  const listed = provider(t, () => [
    { status: "stopped", cdpUrl: "https://stale.cdp.example" },
    { status: "active", liveUrl: "https://live.browser-use.com/session/fixture", cdpUrl: "https://live.cdp.example/" },
  ], (url, init) => {
    assert.equal(url.href, "https://live.cdp.example/json/version");
    // The discovery endpoint gets no API key, and a redirect cannot send the connection elsewhere.
    assert.equal(init.headers, undefined);
    assert.equal(init.redirect, "error");
    return Response.json({ webSocketDebuggerUrl: socket });
  });
  const { seen, browser } = cdpBrowser(["about:blank", completePage, "https://company-a.example/careers"]);
  const connections: { url: string; timeout: number }[] = [];
  const capture = await browserUseAgents.captureSessionPage(session, completePage, async (url, timeout) => {
    connections.push({ url, timeout });
    return browser;
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].searchParams.get("agentSessionId"), session);
  assert.deepEqual(connections.map((connection) => connection.url), [socket]);
  assert.ok(connections[0].timeout > 0 && connections[0].timeout <= SESSION_PAGE_CAPTURE_MS);
  assert.ok(capture.status === "captured");
  // The result names the page, never the browser's control address.
  assert.deepEqual(Object.keys(capture).sort(), ["capturedAt", "jpeg", "pageUrl", "status"]);
  assert.deepEqual(capture.jpeg, Buffer.from([0xff, 0xd8, 0xff]));
  assert.equal(capture.pageUrl, completePage);
  assert.ok(!Number.isNaN(Date.parse(capture.capturedAt)));
  assert.deepEqual(seen.shots.map((shot) => shot.url), [completePage]);
  const { timeout, ...options } = seen.shots[0].options;
  assert.deepEqual(options, { type: "jpeg", quality: 70, scale: "css", caret: "initial" });
  assert.ok(Number(timeout) > 0 && Number(timeout) <= SESSION_PAGE_CAPTURE_MS);
  assert.equal(seen.disconnects, 1);
  assert.equal(seen.pagesClosed, 0);
});

test("without the run's page open, capture pictures the most recent web page; a wss address needs no discovery", async (t) => {
  const listed = provider(t, () => [{ status: "active", cdpUrl: socket }]);
  const { seen, browser } = cdpBrowser(["https://company-a.example/first", "https://company-a.example/latest", "about:blank"]);
  const connections: string[] = [];
  const capture = await browserUseAgents.captureSessionPage(session, "https://company-a.example/closed-tab", async (url) => {
    connections.push(url);
    return browser;
  });
  assert.equal(listed.length, 1);
  assert.deepEqual(connections, [socket]);
  assert.ok(capture.status === "captured");
  assert.equal(capture.pageUrl, "https://company-a.example/latest");
  assert.deepEqual(seen.shots.map((shot) => shot.url), ["https://company-a.example/latest"]);
  assert.equal(seen.disconnects, 1);
});

test("an active browser without a secure CDP address is unavailable and nothing connects", async (t) => {
  let cdpUrl: unknown;
  provider(t, () => [{ status: "active", liveUrl: "https://live.browser-use.com/session/fixture", ...(cdpUrl === undefined ? {} : { cdpUrl }) }]);
  for (cdpUrl of [undefined, null, "", "not a url", 42, "http://live.cdp.example", "ws://live.cdp.example/devtools"])
    assert.deepEqual(await browserUseAgents.captureSessionPage(session, completePage, noConnection),
      { status: "unavailable", reason: "no_cdp_url" });
});

test("a session whose browsers are all stopped has nothing to picture, after every listing page is read", async (t) => {
  const stopped = Array.from({ length: 101 }, () => ({ status: "stopped", cdpUrl: socket }));
  const pages: number[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const pageNumber = Number(new URL(input).searchParams.get("pageNumber"));
    pages.push(pageNumber);
    return Response.json({ items: stopped.slice((pageNumber - 1) * 100, pageNumber * 100), totalItems: stopped.length });
  });
  assert.deepEqual(await browserUseAgents.captureSessionPage(session, completePage, noConnection),
    { status: "unavailable", reason: "no_active_browser" });
  assert.deepEqual(pages, [1, 2]);
});

test("a capture still connecting when its limit passes is a timeout, and the late connection is dropped unused", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  provider(t, () => [{ status: "active", cdpUrl: socket }]);
  const { seen, browser } = cdpBrowser([completePage]);
  let connect!: (value: CaptureBrowser) => void;
  let asked!: () => void;
  const connecting = new Promise<void>((resolve) => { asked = resolve; });
  const pending = browserUseAgents.captureSessionPage(session, completePage, () => {
    asked();
    return new Promise((resolve) => { connect = resolve; });
  });
  await connecting;
  t.mock.timers.tick(SESSION_PAGE_CAPTURE_MS);
  assert.deepEqual(await pending, { status: "unavailable", reason: "timeout" });
  connect(browser);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(seen.disconnects, 1);
  assert.deepEqual(seen.shots, []);
});

test("listing, discovery, connection, page and screenshot failures each come back as a reason, never a throw", async (t) => {
  let listing = () => new Response("fixture-secret", { status: 503 });
  let discovery = () => Response.json({});
  t.mock.method(globalThis, "fetch", async (input: string | URL) =>
    new URL(String(input)).pathname === "/api/v4/browsers" ? listing() : discovery());
  const unavailable = (reason: string) => ({ status: "unavailable", reason });
  assert.deepEqual(await browserUseAgents.captureSessionPage(session, completePage, noConnection), unavailable("provider_error"));
  assert.deepEqual(await browserUseAgents.captureSessionPage("not-a-session", completePage, noConnection), unavailable("provider_error"));
  listing = () => Response.json({ items: [{ status: "active", cdpUrl: "https://live.cdp.example" }], totalItems: 1 });
  for (discovery of [
    () => new Response(null, { status: 404 }),
    () => Response.json({ webSocketDebuggerUrl: "ws://live.cdp.example/devtools/browser/fixture" }),
    () => Response.json({}),
  ])
    assert.deepEqual(await browserUseAgents.captureSessionPage(session, completePage, noConnection), unavailable("cdp_discovery_failed"));
  discovery = () => Response.json({ webSocketDebuggerUrl: socket });
  assert.deepEqual(await browserUseAgents.captureSessionPage(session, completePage, async () => { throw new Error("refused"); }),
    unavailable("connect_failed"));
  const blank = cdpBrowser(["about:blank"]);
  assert.deepEqual(await browserUseAgents.captureSessionPage(session, undefined, async () => blank.browser), unavailable("no_page"));
  assert.equal(blank.seen.disconnects, 1);
  const failing = cdpBrowser([completePage], async () => { throw new Error("Target closed"); });
  assert.deepEqual(await browserUseAgents.captureSessionPage(session, completePage, async () => failing.browser),
    unavailable("screenshot_failed"));
  assert.equal(failing.seen.disconnects, 1);
  // A disconnect that throws does not undo a picture already taken.
  const closing = cdpBrowser([completePage]);
  closing.browser.close = () => { throw new Error("already disconnected"); };
  assert.equal((await browserUseAgents.captureSessionPage(session, completePage, async () => closing.browser)).status, "captured");
});
