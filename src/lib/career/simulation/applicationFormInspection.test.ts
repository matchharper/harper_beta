import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectApplicationForm,
  observedApplicationForm,
  FORM_INSPECTION_TIMEOUT_MS,
} from "./applicationFormInspection";
import type { agentsRequest } from "./agentsApi";
import type { ApplicationBrowserRuntime } from "./applicationBrowserRuntime";

const snapshot = {
  url: "https://example.com/application",
  title: "Application",
  text: "Why this company?",
  elements: [
    { ref: "1", tag: "input", type: "text", label: "Name", required: true },
    {
      ref: "2",
      tag: "textarea",
      type: "textarea",
      label: "Why this company?",
      required: true,
      requiredState: true,
      maxLength: 500,
      instructions: "In English",
      fileTypes: [],
    },
  ],
};
function fixture() {
  let stopped = false;
  const calls: { path: string; body: any; method?: string }[] = [],
    created: unknown[] = [];
  const runtime: ApplicationBrowserRuntime = {
    create: async (files, url, options) => {
      created.push({ files, url, readOnly: options?.readOnly });
      return {
        name: "fixture",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        provider: "openai",
        sessionId: "executor",
        environmentId: "env",
        readOnly: true,
      };
    },
    execute: async () => ({ snapshot }),
    resolve: async () => {
      throw new Error("Not allowed");
    },
    upload: async () => {
      throw new Error("Not allowed");
    },
    stop: async () => {
      stopped = true;
    },
  };
  let reads = 0;
  const request = (async (path: string, body: any, method?: string) => {
    calls.push({ path, body, method });
    if (path === "sessions")
      return { id: "inspect-1", agent: { model: "gpt-6.1-sol" } };
    if (method === "GET")
      return {
        agent: { model: "gpt-6.1-sol" },
        usage: { input_tokens: ++reads > 1 ? 1200 : 1000, output_tokens: 100 },
        required_actions: [
          {
            type: "function_call",
            call_id: "report-1",
            turn_id: "turn-1",
            name: "report_application_form",
            arguments: {
              status: "partial",
              fieldRefs: ["2"],
              limitations: ["Conditional questions were not opened."],
            },
          },
        ],
      };
    return {};
  }) as typeof agentsRequest;
  return {
    runtime,
    request,
    calls,
    created,
    get stopped() {
      return stopped;
    },
  };
}
test("form inspection uses Sol low with a separate read-only browser and keeps cost receipts", async () => {
  const f = fixture(),
    logs: any[][] = [];
  const original = console.log;
  console.log = (...args) => logs.push(args[0] === "[llm-usage]" ? [args[0], JSON.parse(args[1])] : args);
  let result;
  try {
    result = await inspectApplicationForm(
      "https://example.com/job",
      undefined,
      { request: f.request, runtime: f.runtime }
    );
  } finally {
    console.log = original;
  }
  assert.deepEqual(f.created, [
    { files: [], url: "https://example.com/job", readOnly: true },
  ]);
  assert.equal(f.calls[0].body.environment.type, "none");
  assert.equal(f.calls[0].body.agent.model, "gpt-6.1-sol");
  assert.deepEqual(f.calls[0].body.agent.reasoning, { effort: "low" });
  assert.equal(f.calls[0].body.input[0].role, "user");
  assert.deepEqual(
    JSON.parse(f.calls[0].body.input[0].content[0].text).snapshot,
    snapshot
  );
  assert.ok(
    !f.calls.some((call) =>
      call.body?.events?.some(
        (event: any) => event.type === "agent.session.input.message"
      )
    ),
    "Conversation-only session starts with its initial input atomically"
  );
  assert.deepEqual(f.calls[0].body.agent.tools[0], {
    type: "programmatic_tool_calling",
    enabled: false,
  });
  assert.equal(result.fields[0].maxLength, 500);
  assert.equal(result.fields[0].instructions, "In English");
  assert.equal(result.text, snapshot.text);
  assert.deepEqual(
    logs.map(([, receipt]) => receipt.estimatedCostUsd),
    [0.003, 0.0034]
  );
  assert.ok(
    logs.every(([, receipt]) => receipt.usageScope === "agent_session")
  );
  assert.equal(f.calls.at(-1)?.method, "DELETE");
  assert.ok(f.stopped);
  assert.equal(FORM_INSPECTION_TIMEOUT_MS, 180000);
});
test("inspection preserves observed facts with opaque, repeated and unresolved refs", () => {
  const ref = "c26bc21a-b660-479a-a584-2b81937cb287:1";
  const result = observedApplicationForm(
    { ...snapshot, elements: [{ ...snapshot.elements[0], ref }, snapshot.elements[1]] },
    {
      status: "partial", fieldRefs: [ref, "missing", ref, "2"],
      limitations: ["Conditional questions were not opened."],
      submission: { status: "supported", reason: "Public form observed." },
      fields: [{ label: "invented" }],
    },
    "now"
  );
  assert.deepEqual(result.fields.map(field => field.label), ["Name", "Why this company?"]);
  assert.equal(result.fields[0].maxLength, null);
  assert.equal(result.fields[1].instructions, "In English");
  assert.equal(result.status, "partial");
  assert.equal(result.submission?.status, "supported");
  assert.equal(result.text, snapshot.text);
  assert.equal(result.limitations[0], "Conditional questions were not opened.");
  assert.match(result.limitations[1], /missing/);
});

test("inspection preserves model status without rejecting a qualitative combination", () => {
  const result = observedApplicationForm(snapshot, {
    status: "unavailable", fieldRefs: ["1"], limitations: [],
    submission: { status: "supported", reason: "The visible form is accessible; later steps are unknown." },
  }, "now");
  assert.equal(result.status, "unavailable");
  assert.equal(result.submission?.status, "supported");
  assert.equal(result.fields[0].label, "Name");
});

test("unresolved refs preserve usable fields without a correction retry", async () => {
  const f = fixture();
  let failedToolResults = 0;
  const request = (async (path: string, body: any, method?: string) => {
    failedToolResults += body?.events?.filter((event: any) =>
      event.type === "agent.session.input.tool_result" && event.success === false
    ).length ?? 0;
    if (method === "GET") {
      return {
        required_actions: [{
          type: "function_call", call_id: "report-1", name: "report_application_form",
          arguments: { status: "partial", fieldRefs: ["99", "2"], limitations: [] },
        }],
      };
    }
    return path === "sessions" ? { id: "inspect-1" } : {};
  }) as typeof agentsRequest;
  const result = await inspectApplicationForm("https://example.com/job", undefined, {
    request, runtime: f.runtime,
  });
  assert.equal(result.fields[0].label, "Why this company?");
  assert.equal(result.status, "partial");
  assert.match(result.limitations[0], /99/);
  assert.equal(failedToolResults, 0);
  assert.ok(f.stopped);
});

test("blocked access remains unavailable without failing JD analysis", async () => {
  const f = fixture();
  const request = (async (path: string) =>
    path === "sessions"
      ? { id: "inspect-1" }
      : {
          required_actions: [{ type: "computer_use_approval_request" }],
        }) as typeof agentsRequest;
  assert.equal(
    (
      await inspectApplicationForm("https://example.com/job", undefined, {
        request,
        runtime: f.runtime,
      })
    ).status,
    "unavailable"
  );
  assert.equal(
    (
      await inspectApplicationForm(null, undefined, {
        request,
        runtime: f.runtime,
      })
    ).status,
    "unavailable"
  );
  assert.ok(f.stopped);
});
test("deadline bounds even an uncancellable provider read and stops both sessions", async () => {
  const f = fixture();
  let cleaned = false;
  const request = (async (path: string, _body: any, method?: string) => {
    if (method === "DELETE") {
      cleaned = true;
      return {};
    }
    if (path === "sessions") return { id: "inspect-1" };
    if (method === "GET") return new Promise(() => {});
    return {};
  }) as typeof agentsRequest;
  const result = await inspectApplicationForm(
    "https://example.com/job",
    undefined,
    { request, runtime: f.runtime, timeoutMs: 20 }
  );
  assert.equal(result.status, "unavailable");
  assert.match(result.limitations[0], /timed out/);
  assert.ok(cleaned);
  assert.ok(f.stopped);
});


test("non-input and missing refs do not discard the observed form", () => {
  const result = observedApplicationForm({
    ...snapshot,
    elements: [...snapshot.elements, { ref: "3", tag: "button", type: "button", label: "File" }],
  }, { status: "partial", fieldRefs: ["1", "3", "99"], limitations: [] }, "now");
  assert.deepEqual(result.fields.map(field => field.label), ["Name"]);
  assert.equal(result.text, snapshot.text);
  assert.match(result.limitations[0], /3, 99/);
});

test("production Stagehand report retains UUID refs and partial observations", async () => {
  const ref = "c26bc21a-b660-479a-a584-2b81937cb287:1";
  let stopped = false;
  const result = await inspectApplicationForm("https://example.com/application", undefined, {
    stagehand: {
      create: async () => ({ name: "fixture", provider: "browserbase", expiresAt: "2099-01-01", readOnly: true }),
      start: async () => {},
      status: async () => ({
        status: "completed", sessionId: "fixture", steps: 1, maxSteps: 100, required_actions: [],
        snapshot: { ...snapshot, elements: [{ ...snapshot.elements[0], ref }] },
        report: {
          status: "read", fieldRefs: [ref, "stale-ref"], limitations: [],
          submission: { status: "supported", reason: "Public form observed." },
        },
      }),
      stop: async () => { stopped = true; },
    },
  });
  assert.equal(result.fields[0].label, "Name");
  assert.equal(result.status, "read");
  assert.equal(result.submission?.status, "supported");
  assert.match(result.limitations[0], /stale-ref/);
  assert.ok(stopped);
});
