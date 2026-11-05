import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { NextRequest } from "next/server";

let POST: typeof import("./route").POST;
const calls: string[] = [];
const limits: number[] = [];
before(async () => {
  const module = Module as any, load = module._load;
  const scan = (name: string) => async () => { calls.push(name); return {}; };
  const stubs: Record<string, unknown> = {
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => ({}) },
    "@/lib/career/background/server": { recoverCareerBackgroundRuns: scan("background") },
    "@/lib/career/background/delivery": { recoverCareerEmailDeliveries: scan("deliveries") },
    "@/lib/career/schedules/server": { collectDueCareerWork: async ({ limit }: { limit: number }) => {
      limits.push(limit); return { runIds: [], scheduleCount: 0 };
    } },
    "@/lib/career/agentContinuation": {},
    "@/lib/career/matching/externalSearch": { recoverCareerMatchingSearches: scan("matching") },
    "@/lib/career/matching/internalScoring/backend": { recoverInternalEvaluations: scan("internalMatching") },
  };
  module._load = function (name: string, ...args: unknown[]) {
    return stubs[name] ?? load.call(this, name, ...args);
  };
  try { ({ POST } = await import("./route")); } finally { module._load = load; }
});

test("collection capacity only paces new work; recovery continues at zero and values above six are allowed", async () => {
  const previous = process.env.INTERNAL_WORKER_API_SECRET;
  process.env.INTERNAL_WORKER_API_SECRET = "fixture-secret";
  try {
    for (const limit of [0, 2, 9]) {
      calls.length = 0; limits.length = 0;
      const response = await POST(new NextRequest("http://localhost/api/internal/career-agent", {
        method: "POST", headers: { authorization: "Bearer fixture-secret" },
        body: JSON.stringify({ action: "collect_due", maxNewRuns: limit }),
      }));
      assert.equal(response.status, 200);
      assert.deepEqual(limits, [limit]);
      assert.deepEqual(calls.sort(), ["background", "deliveries", "internalMatching", "matching"]);
    }
    for (const maxNewRuns of [-1, 1.5, "6"]) {
      calls.length = 0; limits.length = 0;
      const response = await POST(new NextRequest("http://localhost/api/internal/career-agent", {
        method: "POST", headers: { authorization: "Bearer fixture-secret" },
        body: JSON.stringify({ action: "collect_due", maxNewRuns }),
      }));
      assert.equal(response.status, 400);
      assert.deepEqual(calls, []); assert.deepEqual(limits, []);
    }
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
    else process.env.INTERNAL_WORKER_API_SECRET = previous;
  }
});
