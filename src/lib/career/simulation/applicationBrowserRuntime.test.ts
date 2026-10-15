import test from "node:test";
import { ASK_APPLICATION_INPUT } from "./applicationInput";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApplicationBrowserRuntime } from "./applicationBrowserRuntime";
import { applicationBrowserTools } from "./applicationBrowserServer";
import { agentsRequest, ApplicationBrowserApiError } from "./agentsApi";
import type { BrowserResultStore } from "./applicationBrowserResultStore";

function fixture() {
  let status = "connected",
    deleted = 0,
    targetId = 0;
  const calls: { path: string; body: any; method?: string }[] = [];
  const receipts = new Map<string, unknown>(),
    chunks = new Map<string, Buffer>();
  const commands: Record<string, any>[] = [],
    installed: Buffer[] = [],
    cleared: string[] = [];
  const results: BrowserResultStore = {
    check: async () => {},
    target: async (prefix) => ({
      path: `${prefix}/${++targetId}.txt`,
      url: "https://storage.invalid/scoped",
      key: "synthetic-per-command-key",
    }),
    read: async (target) => receipts.get(target.path) ?? null,
    remove: async (path) => {
      receipts.delete(path);
    },
    clear: async (prefix) => {
      cleared.push(prefix);
    },
  };
  const request = (async (path: string, body?: any, method?: string) => {
    calls.push({ path, body, method });
    if (method === "DELETE") {
      deleted++;
      return {};
    }
    if (path === "sessions") {
      const configuration = body.environment.files.find((f: any) =>
        f.path.endsWith("/configuration.json")
      );
      const { ready } = JSON.parse(
        Buffer.from(configuration.data, "base64").toString()
      );
      receipts.set(ready.path, { ready: true });
      return { id: "executor-session", environment: { id: "executor-env" } };
    }
    if (path.endsWith("/files")) {
      const data = Buffer.from(body.data, "base64");
      if (body.path.includes("/chunks/")) chunks.set(body.path, data);
      else {
        const { input, target } = JSON.parse(data.toString());
        commands.push(input);
        let result;
        if (input.operation === "install_file") {
          const bytes = Buffer.concat(
            input.chunks.map((path: string) => chunks.get(path)!)
          );
          assert.equal(
            createHash("sha256").update(bytes).digest("hex"),
            input.hash
          );
          installed.push(bytes);
          result = { installed: true };
        } else result = { executed: true };
        receipts.set(target.path, { commandId: input.commandId, result });
      }
      return {};
    }
    return { status };
  }) as typeof agentsRequest;
  const runtime = createApplicationBrowserRuntime({
    request,
    results,
    sleep: async () => {},
  });
  return {
    runtime,
    request,
    results,
    calls,
    commands,
    installed,
    cleared,
    get deleted() {
      return deleted;
    },
    set status(value: string) {
      status = value;
    },
  };
}

test("OpenAI provisions the executor without a model turn, code/approval tools or credentials", async () => {
  const f = fixture();
  const ref = await f.runtime.create(
    [
      {
        path: "/workspace/attachments/synthetic/resume.pdf",
        data: Buffer.from("synthetic bytes").toString("base64"),
      },
    ],
    "https://example.org/job"
  );
  const created = f.calls[0].body;
  assert.equal(created.environment.type, "openai_hosted");
  assert.ok(!("input" in created), "the executor never receives a model task");
  assert.ok(
    !("env" in created.environment),
    "no provider/admin credential reaches the sandbox"
  );
  assert.ok(
    !("desktop" in created.environment),
    "Playwright owns the single page"
  );
  assert.ok(
    created.environment.files.some((file: any) =>
      file.path.endsWith("/worker.cjs")
    )
  );
  assert.ok(
    created.environment.setup_commands.at(-1).command.includes("start.py")
  );
  assert.equal(ref.provider, "openai");
  assert.equal(ref.sessionId, "executor-session");
  assert.equal(f.installed[0].toString(), "synthetic bytes");
  assert.deepEqual(
    applicationBrowserTools
      .filter((tool) => "name" in tool)
      .map((tool) => tool.name),
    [
      "perform_application_browser_action",
      ASK_APPLICATION_INPUT,
      "report_application_outcome",
    ]
  );
  assert.deepEqual(applicationBrowserTools[0], {
    type: "programmatic_tool_calling",
    enabled: false,
  });
  assert.ok(
    !f.calls.some((call) => call.path.includes("/events")),
    "no shell or agent input transport"
  );
  await f.runtime.stop(ref);
  assert.equal(f.deleted, 1);
  assert.equal(f.cleared.length, 1);
});

test("large verified attachments are transferred in bounded chunks with unchanged bytes", async () => {
  const f = fixture(),
    bytes = Buffer.alloc(6 * 1024 * 1024 + 3, 155);
  await f.runtime.create(
    [
      {
        path: "/workspace/attachments/synthetic/large.pdf",
        data: bytes.toString("base64"),
      },
    ],
    "https://example.org/job"
  );
  assert.equal(f.installed[0].equals(bytes), true);
  const chunkUploads = f.calls.filter((call) =>
    call.body?.path?.includes("/chunks/")
  );
  assert.equal(chunkUploads.length, 7);
  assert.ok(
    chunkUploads.every(
      (call) => Buffer.byteLength(call.body.data, "base64") <= 1024 * 1024
    )
  );
  await assert.rejects(
    f.runtime.upload(
      { name: "unused", expiresAt: new Date().toISOString() },
      []
    ),
    /expired/
  );
});

test("read-only runtime cannot receive files, edit fields or release held requests", async () => {
  const f = fixture();
  await assert.rejects(
    f.runtime.create(
      [{ path: "/workspace/attachments/private.pdf", data: "YQ==" }],
      "https://example.org/job",
      { readOnly: true }
    ),
    /Read-only/
  );
  assert.equal(f.calls.length, 0);
  const ref = await f.runtime.create([], "https://example.org/job", {
    readOnly: true,
  });
  assert.equal(ref.readOnly, true);
  const configuration = f.calls[0].body.environment.files.find((file: any) =>
    file.path.endsWith("/configuration.json")
  );
  assert.equal(
    JSON.parse(Buffer.from(configuration.data, "base64").toString()).readOnly,
    true
  );
  const count = f.calls.length;
  await assert.rejects(
    f.runtime.execute(
      ref,
      { action: "fill", ref: "1", value: "candidate" },
      [],
      "edit"
    )
  );
  await assert.rejects(f.runtime.upload(ref, []), /Read-only/);
  await assert.rejects(f.runtime.execute(ref, {
    action: "fill_fields", fields: [{ action: "fill", ref: "1", value: "candidate" }],
  }, [], "batch"));
  await assert.rejects(
    f.runtime.resolve(
      ref,
      {
        id: "held",
        url: "https://example.org/submit",
        method: "POST",
        bodyHash: "h",
        formHash: "f",
        pageUrl: "https://example.org/job",
        fields: [],
      },
      true
    ),
    /Read-only/
  );
  assert.equal(f.calls.length, count);
});

test("abort interrupts provisioning and result polling without restarting a browser", async () => {
  const f = fixture();
  f.status = "pending";
  const controller = new AbortController();
  const timedRuntime = createApplicationBrowserRuntime({
    request: f.request,
    results: f.results,
    sleep: async () => new Promise((resolve) => setTimeout(resolve, 1)),
  });
  const promise = timedRuntime.create([], "https://example.org/job", {
    readOnly: true,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(new Error("deadline")), 15);
  await assert.rejects(promise, /deadline/);
  assert.equal(f.deleted, 1);
  assert.equal(f.cleared.length, 1);
  f.status = "connected";
  const ref = await f.runtime.create([], "https://example.org/job", {
    readOnly: true,
  });
  f.results.read = async () => new Promise(() => {});
  const second = new AbortController();
  setTimeout(() => second.abort(new Error("stop read")), 15);
  await assert.rejects(
    f.runtime.execute(ref, { action: "inspect" }, [], "read", second.signal),
    /stop read/
  );
});

test("commands stay typed and owner-bound; expired/lost/legacy pages never restart", async () => {
  const f = fixture(),
    ref = await f.runtime.create([], "https://example.org/job");
  const count = f.calls.length;
  await assert.rejects(
    f.runtime.execute(
      ref,
      { action: "navigate", url: "http://example.org" },
      [],
      "read"
    ),
    /public HTTPS/
  );
  await assert.rejects(
    f.runtime.execute(
      ref,
      { action: "attach", ref: "1", documentId: "other-owner" },
      [],
      "attach"
    ),
    /verified/
  );
  await assert.rejects(
    f.runtime.execute(
      ref,
      { action: "inspect", code: "submit()" } as any,
      [],
      "code"
    )
  );
  await assert.rejects(f.runtime.execute(ref, {
    action: "fill_fields", fields: [
      { action: "fill", ref: "1", value: "candidate" },
      { action: "attach", ref: "2", documentId: "other-owner" },
    ],
  }, [], "unowned-batch"), /verified/);
  assert.equal(f.calls.length, count);
  await f.runtime.execute(ref, {
    action: "fill_fields", fields: [
      { action: "fill", ref: "1", value: "candidate" },
      { action: "attach", ref: "2", documentId: "owned" },
    ],
  }, [{ documentId: "owned", path: "/workspace/attachments/owned.pdf" }], "owned-batch");
  assert.deepEqual(f.commands.at(-1)?.fields, [
    { action: "fill", ref: "1", value: "candidate" },
    { action: "attach", ref: "2", documentId: "owned", path: "/workspace/attachments/owned.pdf" },
  ]);
  await f.runtime.execute(
    ref,
    { action: "attach", ref: "1", documentId: "owned" },
    [{ documentId: "owned", path: "/workspace/attachments/owned.pdf" }],
    "attach"
  );
  assert.equal(f.commands.at(-1)?.path, "/workspace/attachments/owned.pdf");
  const held = {
    id: "held",
    url: "https://example.org/submit",
    method: "POST",
    bodyHash: "hash",
    formHash: "scope",
    pageUrl: "https://example.org/job",
    fields: [],
  };
  await f.runtime.resolve(ref, held, true);
  assert.deepEqual(f.commands.at(-1), {
    operation: "resolve",
    commandId: "approval:held:true",
    id: "held",
    bodyHash: "hash",
    formHash: "scope",
    approved: true,
  });
  const writes = f.commands.length;
  await assert.rejects(
    f.runtime.execute(
      { ...ref, expiresAt: new Date(0).toISOString() },
      { action: "inspect" },
      [],
      "expired"
    ),
    /expired/
  );
  await assert.rejects(
    f.runtime.execute(
      { name: "old-vercel-page", expiresAt: ref.expiresAt },
      { action: "inspect" },
      [],
      "legacy"
    ),
    /legacy/
  );
  f.status = "disconnected";
  await assert.rejects(
    f.runtime.execute(ref, { action: "inspect" }, [], "lost"),
    /lost/
  );
  assert.equal(f.commands.length, writes);
});

test("failed provisioning is cleaned; busy deletion is bounded and already-deleted sessions are safe", async () => {
  const f = fixture();
  f.status = "failed";
  await assert.rejects(
    f.runtime.create([], "https://example.org/job"),
    /setup failed/
  );
  assert.equal(f.deleted, 1);
  assert.equal(f.cleared.length, 1);
  let attempts = 0;
  const runtime = createApplicationBrowserRuntime({
    results: f.results,
    sleep: async () => {},
    request: (async () => {
      attempts++;
      throw new ApplicationBrowserApiError(attempts < 3 ? 409 : 404);
    }) as typeof agentsRequest,
  });
  await runtime.stop({
    name: "550e8400-e29b-41d4-a716-446655440000",
    expiresAt: new Date(0).toISOString(),
    provider: "openai",
    sessionId: "deleted",
    environmentId: "deleted-env",
  });
  assert.equal(attempts, 3);
});
