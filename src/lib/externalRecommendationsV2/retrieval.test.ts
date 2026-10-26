import test from "node:test";
import assert from "node:assert/strict";
import { getTalentSupabaseAdmin } from "../talentOnboarding/admin";
import { retrieveRoles } from "./retrieval";
import type { V2SearchPlan } from "./countries";

const plan: V2SearchPlan = {
  searchIntentSummary: "Backend work",
  roleTitles: ["Backend Engineer"],
  ftsKeywords: [],
  includeContract: false,
  includeIntern: false,
  includeParttime: false,
  includeRemote: true,
  remoteOnly: false,
  isPreferEntry: 0,
  countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
  postingRecency: null,
};
const input = {
  plan,
  userId: "00000000-0000-4000-8000-000000000001",
  blockedCompanies: [],
  vectors: [Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))],
};
const rows = [{ role_id: "00000000-0000-4000-8000-000000000002" }];
function stub(
  responses: any[],
  onRead?: (signal: AbortSignal, call: number) => void
) {
  const queries: string[] = [];
  const admin = {
    rpc(name: string, args: { p_sql: string }) {
      assert.equal(name, "search_external_roles_filter_first");
      queries.push(args.p_sql);
      return {
        abortSignal(signal: AbortSignal) {
          onRead?.(signal, queries.length);
          return Promise.resolve(
            responses[Math.min(queries.length - 1, responses.length - 1)]
          );
        },
      };
    },
  };
  return { admin: admin as any, queries };
}

test("role retrieval survives the admin client's 50s timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      ms
    );
    return controller.signal;
  });
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-key";
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let finish!: (response: Response) => void;
  let signal!: AbortSignal;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      signal = init.signal!;
      ready();
      return new Promise<Response>((resolve, reject) => {
        finish = resolve;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    }
  );
  try {
    const pending = retrieveRoles({
      ...input,
      admin: getTalentSupabaseAdmin(),
    });
    await started;
    t.mock.timers.tick(51_000);
    assert.equal(signal.aborted, false);
    finish(
      new Response(JSON.stringify(rows), {
        headers: { "Content-Type": "application/json" },
      })
    );
    assert.deepEqual((await pending).rows, rows);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("transient DB and transport timeouts retry the same read once", async () => {
  for (const error of [
    { code: "57014", message: "canceling statement due to statement timeout" },
    { code: "", message: "AbortError: This operation was aborted" },
  ]) {
    const { admin, queries } = stub([{ error }, { data: rows, error: null }]);
    assert.deepEqual((await retrieveRoles({ ...input, admin })).rows, rows);
    assert.equal(queries.length, 2);
    assert.equal(queries[0], queries[1]);
  }
});

test("persistent timeout is bounded and unrelated errors are not retried", async () => {
  for (const [code, expectedCalls] of [
    ["57014", 2],
    ["42501", 1],
  ] as const) {
    const { admin, queries } = stub([
      { error: { code, message: "database failure" } },
    ]);
    await assert.rejects(
      retrieveRoles({ ...input, admin }),
      /External role retrieval: database failure/
    );
    assert.equal(queries.length, expectedCalls);
  }
});

test("caller cancellation never starts a retry", async () => {
  const caller = new AbortController();
  const { admin, queries } = stub(
    [{ error: { code: "57014", message: "statement timeout" } }],
    () => caller.abort()
  );
  await assert.rejects(
    retrieveRoles({ ...input, admin, signal: caller.signal }),
    { name: "AbortError" }
  );
  assert.equal(queries.length, 1);
});

test("the total retrieval deadline includes retries", async (t) => {
  const budget = new AbortController();
  t.mock.method(AbortSignal, "timeout", (ms: number) =>
    ms === 110_000 ? budget.signal : new AbortController().signal
  );
  const { admin, queries } = stub(
    [{ error: { code: "57014", message: "statement timeout" } }],
    (_signal, call) => {
      if (call === 2)
        budget.abort(new DOMException("Timed out", "TimeoutError"));
    }
  );
  await assert.rejects(retrieveRoles({ ...input, admin }), {
    name: "TimeoutError",
  });
  assert.equal(queries.length, 2);
});
