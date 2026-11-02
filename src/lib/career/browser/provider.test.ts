import test from "node:test";
import assert from "node:assert/strict";
import { browserUseAgents } from "../simulation/browserUseAgents";
import {
  USE_BROWSER_TOOL,
  browserInputSchema,
  formatBrowserToolResult,
} from "./tool";
import type { ExternalOperation } from "../externalOperations/store";
const run = "00000000-0000-4000-8000-000000000001",
  session = "00000000-0000-4000-8000-000000000002";
process.env.BROWSER_USE_API_KEY = "fixture-key";
test("new browser calls omit session IDs and results identify the exact references accepted for follow-up calls", () => {
  const parameters = USE_BROWSER_TOOL.parameters;
  assert.deepEqual(
    browserInputSchema.parse({ action: "run", task: "Open the application" }),
    {
      action: "run",
      task: "Open the application",
    }
  );
  assert.equal(parameters.properties.session_id.format, "uuid");
  assert.match(
    parameters.properties.session_id.description,
    /Omit for action=run to create a new browser/
  );
  assert.match(
    parameters.properties.execution_id.description,
    /Existing execution_id returned by use_browser/
  );
  assert.match(formatBrowserToolResult([]), /No browser operations found/);
});
test("general browsing retains the session for human login and cancellation never closes the browser", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${new URL(url).pathname}`);
    if (url.endsWith("/runs")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.keepAlive, 3600);
      assert.equal(body.sessionId, session);
      assert.equal(body.agentmail, false);
      return Response.json({ id: run, sessionId: session, status: "running" });
    }
    return Response.json({ status: "cancelled" });
  });
  await browserUseAgents.createRun(
    "Continue the application after login",
    {},
    undefined,
    session,
    { keepAlive: 3600 }
  );
  await browserUseAgents.cancelRun(run);
  assert.deepEqual(calls, [
    "POST /api/v4/runs",
    `POST /api/v4/runs/${run}/cancel`,
    `GET /api/v4/runs/${run}/status`,
  ]);
});
test("running task projection reports state without promising a separate conversation continuation", () => {
  const operation = {
    id: run,
    kind: "browser_run",
    status: "running",
    revision: 2,
    parent_id: session,
    request: { task: "Open the sign-in screen" },
    result: { observation_scheduled: true },
    updated_at: "2026-10-29T00:01:02.000Z",
  } as unknown as ExternalOperation;
  const output = formatBrowserToolResult([operation]);
  assert.match(output, /status: running/);
  assert.doesNotMatch(output, /resume this conversation|Background observation/);
  operation.result = {};
  assert.doesNotMatch(
    formatBrowserToolResult([operation]),
    /Completion will resume/
  );
});
test("interactive viewer is explicit and its credentials never enter model projection", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      items: [{ liveUrl: "https://live.browser-use.com/session?token=secret" }],
    })
  );
  const url = new URL((await browserUseAgents.livePreview(session, true))!);
  assert.equal(url.searchParams.get("readOnly"), "false");
  const operation = {
    id: run,
    kind: "browser_run",
    status: "completed",
    revision: 2,
    parent_id: session,
    request: {
      task: "Apply for role",
      authorization: [{ id: 42, content: "Apply with this resume" }],
    },
    result: {
      summary: "The confirmation page appeared.",
      evidence: ["Application received"],
      needsUser: false,
    },
    provider_refs: { liveUrl: url.toString(), session_id: session },
    updated_at: "2026-10-29T00:01:02.000Z",
  } as unknown as ExternalOperation;
  const output = formatBrowserToolResult([operation]);
  assert.match(output, /2026-10-29 09:01/);
  assert.match(output, /User message 42/);
  assert.match(output, /Application received/);
  assert.ok(output.includes(`execution_id: ${run}`));
  assert.ok(output.includes(`session_id: ${session}`));
  assert.doesNotMatch(output, /token=|2026-10-29T|provider_refs/);
});

test("browser availability requires actual stopped records and checks later pages for an active browser", async (t) => {
  const pages: number[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("agentSessionId"), session);
    assert.equal(url.searchParams.has("filterBy"), false);
    const pageNumber = Number(url.searchParams.get("pageNumber"));
    pages.push(pageNumber);
    return Response.json({
      items: pageNumber === 1
        ? Array.from({ length: 100 }, () => ({ status: "stopped" }))
        : [{ status: "active", liveUrl: "https://live.browser-use.com/?wss=https%3A%2F%2Fbrowser.example" }],
      totalItems: 101,
    });
  });
  const result = await browserUseAgents.inspectSessionBrowser(session, true);
  assert.equal(result.availability, "active");
  assert.equal(new URL(result.liveUrl!).searchParams.get("readOnly"), "false");
  assert.deepEqual(pages, [1, 2]);
});

test("empty, preparing and stopped browser lists remain distinct", async (t) => {
  for (const [items, expected] of [
    [[], "unknown"],
    [[{ status: "starting" }], "unknown"],
    [[{ status: "stopped" }], "stopped"],
  ] as const) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ items, totalItems: items.length }));
    const result = await browserUseAgents.inspectSessionBrowser(session);
    assert.equal(result.availability, expected);
    assert.equal(result.liveUrl, null);
    mock.mock.restore();
  }
});
