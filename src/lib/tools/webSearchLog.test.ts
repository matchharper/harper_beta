import assert from "node:assert/strict";
import test from "node:test";
import Exa from "exa-js";
import { executeSharedWebSearch } from "@/lib/agentTools/web";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ExaSearchClient } from "./exaClient";
import { getExaClient } from "./exaClient";
import { WEB_SEARCH_LOG_TYPE } from "./webSearchLog";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function database(write = async () => ({ error: null as unknown })) {
  const rows: any[] = [];
  const scheduled: Array<() => Promise<void>> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "logs");
      return { insert(row: unknown) { rows.push(row); return write(); } };
    },
  } as unknown as TalentAdminClient;
  return {
    admin, rows,
    scheduleAfter: (task: () => Promise<void>) => { scheduled.push(task); },
    flush: () => Promise.all(scheduled.map(task => task())),
    scheduled,
  };
}

test("persists the actual SDK request body and provider cost without waiting for DB", async () => {
  const pendingWrite = deferred<{ error: null }>();
  const db = database(() => pendingWrite.promise);
  const exa = new Exa("test-only-key");
  let sentBody: unknown;
  const costDollars = { total: 0.009, search: { neural: 0.007 }, contents: { text: 0.002 } };
  exa.request = async <T>(endpoint: string, method: string, body?: unknown): Promise<T> => {
    assert.equal(endpoint, "/search");
    assert.equal(method, "POST");
    sentBody = JSON.parse(JSON.stringify(body));
    return { requestId: "exa-1", results: [], costDollars, resolvedSearchType: "neural" } as T;
  };
  // Longer than the old console cutoff, so this proves DB inputs are not clipped.
  const query = `  ${"회사 검색 ".repeat(1000)}  `;
  const result = await withLlmUsageContext({ requestId: "request-1", careerOrigin: "server" }, () =>
    executeSharedWebSearch({ query, maxResults: 90, structured_text: "투자와 채용 현황" }, {
      admin: db.admin, exa,
      searchPurpose: "mock_interview",
      logging: { scheduleAfter: db.scheduleAfter, attribution: {
        source: "career/background", userId: "talent-1", conversationId: "conversation-1",
        backgroundRunId: "run-1", replyId: "reply-1",
      } },
    })
  );
  // The write is unresolved here, yet the complete product result has returned.
  assert.equal(result.resultCount, 0);
  assert.equal(result.query, query.trim());
  assert.equal(db.rows.length, 1);
  assert.equal(db.scheduled.length, 1);
  assert.equal(db.rows[0].type, WEB_SEARCH_LOG_TYPE);
  assert.equal(db.rows[0].user_id, "talent-1");
  const log = db.rows[0].meta_data;
  assert.deepEqual(log.parameters, sentBody);
  assert.equal(log.parameters.numResults, 10);
  assert.equal(log.parameters.contents.highlights.maxCharacters, 2500);
  assert.equal(log.parameters.outputSchema.description, "투자와 채용 현황");
  assert.equal(log.parameters.query, query.trim());
  assert.equal(log.attribution.backgroundRunId, "run-1");
  assert.equal(log.attribution.requestId, "request-1");
  assert.equal(log.providerRequestId, "exa-1");
  assert.equal(log.costUsd, 0.009);
  assert.equal(log.costStatus, "provider_reported");
  assert.deepEqual(log.costDollars, costDollars);
  assert.equal(log.status, "succeeded");
  assert.ok(log.durationMs >= 0);
  assert.ok(!JSON.stringify(log).includes("test-only-key"));
  assert.ok(!JSON.stringify(result).includes("costDollars"), "telemetry does not change model output");
  pendingWrite.resolve({ error: null });
  await db.flush();
  assert.equal(db.rows.length, 1, "after keeps the same write alive, without duplication");
});

test("missing provider cost stays unknown; reported zero remains zero", async () => {
  for (const costDollars of [undefined, { total: 0 }]) {
    const db = database();
    await executeSharedWebSearch({ query: "example" }, {
      admin: db.admin,
      exa: { search: async () => ({ results: [], costDollars }) } as unknown as ExaSearchClient,
      logging: { scheduleAfter: db.scheduleAfter },
    });
    await db.flush();
    assert.equal(db.rows[0].meta_data.costUsd, costDollars ? 0 : null);
    assert.equal(db.rows[0].meta_data.costStatus, costDollars ? "provider_reported" : "unknown");
    assert.equal(db.rows[0].meta_data.parameters.numResults, 10);
  }
});

test("failed searches are recorded once and preserve the original error", async () => {
  const db = database();
  const error = Object.assign(new Error("Provider unavailable"), { statusCode: 503 });
  await assert.rejects(executeSharedWebSearch({ query: "a failed query" }, {
    admin: db.admin,
    exa: { search: async () => { throw error; } } as unknown as ExaSearchClient,
    logging: { scheduleAfter: db.scheduleAfter },
  }), value => value === error);
  await db.flush();
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].meta_data.status, "failed");
  assert.equal(db.rows[0].meta_data.error.statusCode, 503);
  assert.equal(db.rows[0].meta_data.parameters.query, "a failed query");
  assert.equal(db.rows[0].meta_data.costUsd, null);
});

test("DB errors and a missing Next lifecycle never fail or retry the paid search", async t => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => warnings.push(args));
  const db = database(async () => ({ error: new Error("DB unavailable") }));
  let searches = 0;
  const result = await executeSharedWebSearch({ query: "example" }, {
    admin: db.admin,
    exa: { search: async () => { searches++; return { results: [] }; } } as unknown as ExaSearchClient,
    logging: { scheduleAfter: () => { throw new Error("No Next request"); } },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.resultCount, 0);
  assert.equal(searches, 1);
  assert.equal(db.rows.length, 1);
  assert.equal(warnings.length, 1);
});

test("parallel callers retain their own attribution and previews use the logging DB", async () => {
  const db = database();
  const gate = deferred<void>();
  const search = (source: string, requestId: string) => withLlmUsageContext({ requestId, companyRunId: requestId }, () =>
    executeSharedWebSearch({ query: source }, {
      // No documents are returned; this cache intentionally has no logs table.
      admin: {} as TalentAdminClient,
      exa: { search: async () => { await gate.promise; return { results: [] }; } } as unknown as ExaSearchClient,
      logging: { admin: db.admin, scheduleAfter: db.scheduleAfter, attribution: {
        source, userId: requestId, companyWorkspaceId: `${requestId}-workspace`,
      } },
    })
  );
  const one = search("org/role-research-preview", "one");
  const two = search("career/tool", "two");
  gate.resolve();
  await Promise.all([one, two]);
  await db.flush();
  assert.deepEqual(db.rows.map(row => [row.meta_data.attribution.source, row.meta_data.attribution.requestId, row.user_id]), [
    ["org/role-research-preview", "one", "one"], ["career/tool", "two", "two"],
  ]);
  assert.notEqual(db.rows[0].meta_data.executionId, db.rows[1].meta_data.executionId);
});

test("the Career executor logs scheduled runs as well as interactive searches", async t => {
  const previousKey = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "test-only-key";
  try {
    const { getEnabledTalentTools } = await import("@/lib/talentOnboarding/tools");
    const tool = getEnabledTalentTools("chat").find(tool => tool.name === "web_search")!;
    t.mock.method(getExaClient(), "search", async () => ({ requestId: "exa-scheduled", results: [], costDollars: { total: 0.007 } }));
    const db = database();
    for (const backgroundInvocation of [undefined, { runId: "scheduled-run", trigger: "career_daily_due", sourceMessageCursor: 42 }]) {
      await tool.execute!({ query: "scheduled company news", maxResults: 2 }, {
        admin: db.admin, userId: "talent", conversationId: "conversation",
        backgroundInvocation, scheduleAfter: db.scheduleAfter,
      });
    }
    await db.flush();
    assert.equal(db.rows.length, 2);
    assert.equal(db.rows[0].meta_data.attribution.source, "career/tool");
    assert.equal(db.rows[1].meta_data.attribution.source, "career/background");
    assert.equal(db.rows[1].meta_data.attribution.backgroundRunId, "scheduled-run");
    assert.equal(db.rows[1].meta_data.attribution.backgroundTrigger, "career_daily_due");
    assert.equal(db.rows[1].meta_data.parameters.numResults, 2);
    assert.equal(db.rows[1].meta_data.costUsd, 0.007);
  } finally {
    if (previousKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previousKey;
  }
});

test("JSONB rows can be read and summed without treating unknown costs as zero", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  try {
    await pg.exec("create table logs (id bigserial primary key, type text, user_id uuid, meta_data jsonb, created_at timestamptz default now())");
    const pending: Array<() => Promise<void>> = [];
    const admin = { from(table: string) {
      assert.equal(table, "logs");
      return { insert: async (row: any) => {
        await pg.query("insert into logs(type,user_id,meta_data) values ($1,$2,$3::jsonb)", [row.type, row.user_id, JSON.stringify(row.meta_data)]);
        return { error: null };
      } };
    } } as unknown as TalentAdminClient;
    for (const costDollars of [{ total: 0.007 }, undefined]) {
      await executeSharedWebSearch({ query: '한국 회사 "R&D"\n채용', maxResults: 3 }, {
        admin,
        exa: { search: async () => ({ results: [], costDollars }) } as unknown as ExaSearchClient,
        logging: { scheduleAfter: task => pending.push(task), attribution: {
          source: "career/background", backgroundRunId: "run", backgroundTrigger: "career_daily_due",
        } },
      });
    }
    await Promise.all(pending.map(task => task()));
    const { rows } = await pg.query<{ query: string; cost: string; unknown: number }>(`
      select meta_data#>>'{parameters,query}' as query,
             sum((meta_data->>'costUsd')::numeric)::text as cost,
             count(*) filter(where meta_data->>'costStatus'='unknown')::int as unknown
      from logs where type='web_search_exa' and meta_data#>>'{attribution,backgroundTrigger}'='career_daily_due'
      group by 1`);
    assert.deepEqual(rows, [{ query: '한국 회사 "R&D"\n채용', cost: "0.007", unknown: 1 }]);
  } finally {
    await pg.close();
  }
});
