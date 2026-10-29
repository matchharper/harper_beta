import test from "node:test";
import assert from "node:assert/strict";
import { browserUseAgents } from "./browserUseAgents";
const workspace = "00000000-0000-4000-8000-000000000001";
const run = "00000000-0000-4000-8000-000000000002";
const session = "00000000-0000-4000-8000-000000000003";
process.env.BROWSER_USE_API_KEY = "fixture-secret";

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
        allowOverrides: false,
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
