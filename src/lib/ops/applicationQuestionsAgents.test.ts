import test from "node:test";
import assert from "node:assert/strict";
import { createSimulationSession } from "@/lib/career/simulation/session";
import { prepareApplicationReview } from "@/lib/career/simulation/applicationReview";
import { applicationReviewView } from "@/lib/career/simulation/applicationReviewView";
import { applicationFormText } from "@/lib/career/simulation/applicationFormText";
import {
  inspectManagedQuestions,
  inspectManagedApplicationForm,
  QuestionsAgentError,
  readBrowserUseSessionCost,
} from "./applicationQuestionsAgents.server";

const run = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const browser = "33333333-3333-4333-8333-333333333333";
const report = {
  status: "partial",
  questions: ["이름", "경력에 관해 설명해 주세요"].map((label) => ({
    label,
    type: "textarea",
    required: null,
    options: [],
    fileTypes: [],
    multiple: null,
    instructions: "",
  })),
  limitations: ["다음 단계는 입력이 필요합니다."],
};
const costs = {
  llmCostUsd: "0.020000",
  searchCostUsd: "0.000000",
  browserCostUsd: "0.000200",
  proxyCostUsd: "0.000100",
  totalCostUsd: "0.020300",
};
function mock(
  steps: Array<{
    path: string;
    method?: string;
    body?: unknown;
    status?: number;
    check?: (init: RequestInit) => void;
  }>
) {
  const fetcher: typeof fetch = async (url, init = {}) => {
    const step = steps.shift();
    assert.ok(step, `Unexpected request ${url}`);
    assert.equal(
      new URL(String(url)).pathname + new URL(String(url)).search,
      step.path
    );
    assert.equal(init.method, step.method ?? "GET");
    step.check?.(init);
    return new Response(JSON.stringify(step.body ?? {}), {
      status: step.status ?? 200,
    });
  };
  return {
    fetch: fetcher,
    wait: async (signal: AbortSignal) => {
      signal.throwIfAborted();
    },
    done: () => assert.equal(steps.length, 0),
  };
}
process.env.BROWSERBASE_API_KEY = "fixture-bb-secret";
process.env.BROWSER_USE_API_KEY = "fixture-bu-secret";

test("Browserbase uses resultSchema, preserves partial results, and never sends a model", async () => {
  const deps = mock([
    {
      path: "/v1/agents/runs",
      method: "POST",
      body: { runId: run },
      check: (init) => {
        const body = JSON.parse(String(init.body));
        assert.ok(body.resultSchema);
        assert.equal(body.model, undefined);
        assert.match(body.task, /Read-only/);
        assert.equal(
          (init.headers as Record<string, string>)["X-BB-API-Key"],
          "fixture-bb-secret"
        );
      },
    },
    { path: `/v1/agents/runs/${run}`, body: { status: "RUNNING" } },
    {
      path: `/v1/agents/runs/${run}`,
      body: {
        status: "COMPLETED",
        result: {
          output: report,
          summary: "Narrative",
          stepsTaken: 6,
          taskDuration: 30000,
        },
        sessionId: session,
      },
    },
  ]);
  const result = await inspectManagedQuestions(
    "https://example.com/apply",
    "browserbase",
    "ignored",
    new AbortController().signal,
    deps
  );
  assert.deepEqual(result.questions, report.questions);
  assert.equal(result.status, "partial");
  assert.equal(result.execution?.model, null);
  assert.equal(result.execution?.runCostUsd, undefined);
  deps.done();
});

test("Browser Use V4 reads output, stops the distinct browser ID, and separates session costs", async () => {
  const deps = mock([
    {
      path: "/api/v4/runs",
      method: "POST",
      body: { id: run, sessionId: session },
      check: (init) => {
        const body = JSON.parse(String(init.body));
        assert.equal(body.model, "gpt-6-luna");
        assert.ok(body.outputSchema);
        assert.equal(body.agentmail, false);
      },
    },
    { path: `/api/v4/runs/${run}/status`, body: { status: "completed" } },
    {
      path: `/api/v4/runs/${run}`,
      body: {
        output: report,
        result: "A narrative, not JSON",
        totalCostUsd: "0.020000",
        totalInputTokens: 120,
        totalOutputTokens: 25,
      },
    },
    {
      path: `/api/v4/browsers?agentSessionId=${session}&pageSize=100&pageNumber=1`,
      body: { items: [{ id: browser, status: "idle" }], totalItems: 1 },
    },
    {
      path: `/api/v4/browsers/${browser}`,
      method: "PATCH",
      body: { status: "stopped" },
      check: (init) =>
        assert.deepEqual(JSON.parse(String(init.body)), { action: "stop" }),
    },
    { path: `/api/v4/sessions/${session}/cost`, body: costs },
  ]);
  const result = await inspectManagedQuestions(
    "https://example.com",
    "browser-use",
    "gpt-6-luna",
    new AbortController().signal,
    deps
  );
  assert.deepEqual(result.questions, report.questions);
  assert.deepEqual(result.execution?.sessionCost, costs);
  assert.equal(result.execution?.runCostUsd, "0.020000");
  assert.equal(result.execution?.inputTokens, 120);
  deps.done();
});

test("aborting during creation still stops Browserbase and waits for actual termination", async () => {
  const parent = new AbortController();
  const deps = mock([
    {
      path: "/v1/agents/runs",
      method: "POST",
      body: { runId: run },
      check: () => parent.abort(),
    },
    {
      path: `/v1/agents/runs/${run}/stop`,
      method: "POST",
      status: 202,
      check: (init) => assert.equal(init.signal?.aborted, false),
    },
    { path: `/v1/agents/runs/${run}`, body: { status: "RUNNING" } },
    { path: `/v1/agents/runs/${run}`, body: { status: "STOPPED" } },
  ]);
  await assert.rejects(
    inspectManagedQuestions(
      "https://example.com",
      "browserbase",
      "",
      parent.signal,
      deps
    ),
    (error) => {
      assert.ok(error instanceof QuestionsAgentError);
      assert.equal(error.execution.runId, run);
      assert.deepEqual(error.execution.warnings, []);
      return true;
    }
  );
  deps.done();
});

test("Browser Use failure retains the run and cost; cleanup warnings do not replace the original failure", async () => {
  const deps = mock([
    {
      path: "/api/v4/runs",
      method: "POST",
      body: { id: run, sessionId: session },
    },
    { path: `/api/v4/runs/${run}/status`, body: { status: "failed" } },
    {
      path: `/api/v4/runs/${run}`,
      body: { error: "Navigation failed", totalCostUsd: "0.01" },
    },
    {
      path: `/api/v4/browsers?agentSessionId=${session}&pageSize=100&pageNumber=1`,
      status: 503,
    },
    { path: `/api/v4/sessions/${session}/cost`, body: costs },
  ]);
  await assert.rejects(
    inspectManagedQuestions(
      "https://example.com",
      "browser-use",
      "gpt-6-luna",
      new AbortController().signal,
      deps
    ),
    (error) => {
      assert.ok(error instanceof QuestionsAgentError);
      assert.match(error.message, /Navigation failed/);
      assert.equal(error.execution.runCostUsd, "0.01");
      assert.equal(error.execution.warnings.length, 1);
      return true;
    }
  );
  deps.done();
});

test("creation is never retried and API errors redact the key", async () => {
  const deps = mock([
    {
      path: "/v1/agents/runs",
      method: "POST",
      status: 500,
      body: { error: "fixture-bb-secret" },
    },
  ]);
  await assert.rejects(
    inspectManagedQuestions(
      "https://example.com",
      "browserbase",
      "",
      new AbortController().signal,
      deps
    ),
    (error) => {
      assert.ok(error instanceof QuestionsAgentError);
      assert.ok(!error.message.includes("fixture-bb-secret"));
      return true;
    }
  );
  deps.done();
});

test("cost refresh is a read-only request and keeps all metering components", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests++;
    assert.equal(
      String(url),
      `https://api.browser-use.com/api/v4/sessions/${session}/cost`
    );
    assert.equal(init?.method, undefined);
    assert.equal(init?.cache, "no-store");
    return new Response(JSON.stringify(costs));
  };
  assert.deepEqual(
    await readBrowserUseSessionCost(
      session,
      new AbortController().signal,
      fetcher
    ),
    costs
  );
  await assert.rejects(
    readBrowserUseSessionCost("../runs", new AbortController().signal, fetcher)
  );
  assert.equal(requests, 1);
});

test("Career full inspection uses Browser Use and preserves actual form URL, types and access evidence", async () => {
  const deps = mock([
    { path: "/api/v4/runs", method: "POST", body: { id: run, sessionId: session }, check: init => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "gpt-6-luna");
      assert.equal(body.agentmail, false);
      assert.ok(body.outputSchema.properties.submission);
      assert.match(body.task, /Read-only/);
    } },
    { path: `/api/v4/runs/${run}/status`, body: { status: "completed" } },
    { path: `/api/v4/runs/${run}`, body: { sessionId: session, output: {
      ...report, questions: report.questions.map(q => ({ ...q, maxLength: 1000 })),
      formUrl: "https://official.example/form", text: "Resume must be PDF",
      submission: { status: "supported", reason: "Public form was read" },
    } } },
    { path: `/api/v4/browsers?agentSessionId=${session}&pageSize=100&pageNumber=1`, body: { items: [], totalItems: 0 } },
    { path: `/api/v4/sessions/${session}/cost`, body: costs },
  ]);
  const form = await inspectManagedApplicationForm("https://official.example/job", new AbortController().signal, deps);
  assert.equal(form.url, "https://official.example/form");
  assert.equal(form.fields[0].type, "textarea");
  assert.equal(form.fields[0].maxLength, 1000);
  assert.equal(form.fields[0].multiple, null);
  assert.equal(form.submission.status, "supported");
  deps.done();
});

test("a closed posting without a form URL retains its barrier in the Career review and model context", async () => {
  const sourceUrl = "https://official.example/job";
  const reason = "공고 페이지에서 ‘마감된 공고’ 버튼이 비활성화된 상태로 표시되어 지원할 수 없습니다.";
  const limitations = ["지원 폼이나 지원 링크가 없어 지원서 질문과 실제 지원 URL을 확인할 수 없습니다."];
  for (const formUrl of ["", null]) {
    const deps = mock([
      { path: "/api/v4/runs", method: "POST", body: { id: run, sessionId: session } },
      { path: `/api/v4/runs/${run}/status`, body: { status: "completed" } },
      { path: `/api/v4/runs/${run}`, body: { sessionId: session, output: {
        status: "unavailable", questions: [], limitations, formUrl, text: "",
        submission: { status: "unsupported", reason },
      } } },
      { path: `/api/v4/browsers?agentSessionId=${session}&pageSize=100&pageNumber=1`, body: { items: [], totalItems: 0 } },
      { path: `/api/v4/sessions/${session}/cost`, body: costs },
    ]);
    const form = await inspectManagedApplicationForm(sourceUrl, new AbortController().signal, deps);
    const state = createSimulationSession({
      roleName: "Example · Engineer", roleRef: "job:fixture",
      documentId: "resume", documentName: "Original",
    });
    state.applicationForm = form;
    state.applicationUrl = form.url;
    state.applicationReview = prepareApplicationReview(state, "resume");
    const view = applicationReviewView({ messageId: 10, state });
    assert.equal(view.applicationUrl, sourceUrl);
    assert.equal(view.review?.form.status, "unavailable");
    assert.deepEqual(view.review?.form.submission, { status: "unsupported", reason });
    assert.deepEqual(view.review?.form.limitations, limitations);
    assert.deepEqual(view.review?.fields, []);
    const context = applicationFormText(form);
    assert.ok(context.includes(`Assisted submission access: unsupported. ${reason}`));
    assert.ok(context.includes(`Inspection limitation: ${limitations[0]}`));
    deps.done();
  }
});
