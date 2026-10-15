import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  externalVariant,
  evaluatorKey,
  fingerprint,
  rankScore,
  cachedFitEligible,
  mapConcurrent,
  chunks,
  scoreForLlm,
  fitForLlm,
} from "./contract";
import {
  buildDecisionRequest,
  parseDecisionBatch,
  callDecisions,
} from "./decisions";
import { dayKey } from "./calendar";
import { directUsageCost } from "./usage";

const ids = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
);
const fit = {
  candidateInterest: 65,
  companyInterest: 60,
  mutualFit: 60,
  roleFit: 80,
  constraintPass: 90,
  evidence: "partial" as const,
};
function response(provider: "openai" | "jev") {
  const pairs = ids.flatMap((_, i) =>
    Object.entries(fit).map(([metric, value]) => {
      const q = {
        name: `r${i}_${metric}`,
        ...(metric === "evidence"
          ? { type: "choice", choice: value }
          : metric === "mutualFit" || metric === "roleFit"
            ? { type: "score", score: Number(value) / 25 }
            : provider === "openai"
              ? { type: "predicate", probability: Number(value) / 100 }
              : { type: "noul", noul: Number(value) / 100 }),
      };
      return [q.name, q] as const;
    })
  );
  return {
    answers:
      provider === "openai"
        ? pairs.map(([, v]) => v)
        : Object.fromEntries(pairs),
  };
}
test("both provider contracts cover all 10 role pairs and preserve 6 independent axes", () => {
  for (const provider of ["openai", "jev"] as const) {
    const request = buildDecisionRequest(provider, "Synthetic evidence", ids);
    assert.equal(Object.keys(request.questions).length, 60);
    const parsed = parseDecisionBatch(provider, response(provider), ids);
    assert.equal(parsed.evaluations.length, 10);
    assert.deepEqual(parsed.errors, []);
    for (const row of parsed.evaluations) assert.deepEqual(row.fit, fit);
  }
  assert.throws(() => buildDecisionRequest("openai", "", [...ids, ids[0]]));
});
test("one refused, malformed or duplicate answer invalidates only its pair; raw output retained", () => {
  const raw = response("openai");
  const answers = raw.answers as any[];
  answers[0] = { name: "r0_candidateInterest", type: "refusal" };
  answers.push({ ...answers[6] });
  const parsed = parseDecisionBatch("openai", raw, ids);
  assert.equal(parsed.evaluations.length, 8);
  assert.deepEqual(parsed.errors, ids.slice(0, 2));
  assert.equal(parsed.invalid.length, 2);
  assert.ok(parsed.invalid[0].raw);
});
test("cohort is fixed across TS and Python and input order cannot invalidate caches", () => {
  const python = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import sys,json;sys.path.insert(0,'../harper_worker');from opp.utils.external_recommendations_v2 import external_variant;print(json.dumps([external_variant(x) for x in ${JSON.stringify(ids)}]))`,
      ],
      { encoding: "utf8" }
    )
  );
  assert.deepEqual(ids.map(externalVariant), python);
  assert.equal(externalVariant(ids[0].toUpperCase()), externalVariant(ids[0]));
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(evaluatorKey("openai"), evaluatorKey("jev"));
});
test("fit ranking has no opportunity quality input; Decisions threshold is separate", () => {
  assert.equal(
    rankScore(fit),
    0.65 * fit.mutualFit +
      0.15 * fit.candidateInterest +
      0.1 * fit.companyInterest +
      0.1 * fit.roleFit
  );
  assert.equal(cachedFitEligible(fit), true);
  assert.equal(cachedFitEligible({ ...fit, mutualFit: 32.5 }), true);
  assert.equal(cachedFitEligible({ ...fit, mutualFit: 20 }), false);
  assert.equal(cachedFitEligible({ ...fit, constraintPass: 10 }), false);
});
test("all batches drain after a failure, preserving outputs of later calls without early stopping", async () => {
  const visited: number[] = [];
  let active = 0,
    maximum = 0;
  await assert.rejects(
    mapConcurrent(
      chunks(Array.from({ length: 503 }, (_, i) => i)),
      6,
      async (batch) => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((r) => setTimeout(r, 1));
        visited.push(...batch);
        active--;
        if (batch[0] === 10) throw new Error("Synthetic failure");
      }
    ),
    AggregateError
  );
  assert.equal(visited.length, 503);
  assert.equal(maximum, 6);
});
test("daily boundary uses the chosen timezone, including DST, and unknown cost is not zero", () => {
  assert.equal(
    dayKey("Asia/Seoul", new Date("2026-10-13T15:00:00Z")),
    "2026-10-14"
  );
  assert.equal(
    dayKey("America/New_York", new Date("2026-03-08T07:00:00Z")),
    "2026-03-08"
  );
  assert.equal(directUsageCost("jev_decisions", {}).usd, null);
  assert.equal(
    directUsageCost("openai_decisions", {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 100 },
    }).usd,
    0.00009
  );
});

test("transient Decisions failure retries the same provider and records the missing cost receipt", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return calls === 1
        ? new Response("unavailable", { status: 503 })
        : Response.json(response("openai"));
    };
    const result = await callDecisions("openai", "Synthetic", ids);
    assert.equal(calls, 2);
    assert.equal(result.attempts, 2);
    assert.equal(result.unknownCostAttempts, 1);
    assert.equal(result.evaluations.length, 10);
  } finally {
    globalThis.fetch = original;
  }
});
test("a non-transient provider contract error is not retried", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response("bad request", { status: 400 });
    };
    await assert.rejects(callDecisions("openai", "Synthetic", ids), /HTTP 400/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("constraint conflict receives a quadratic penalty before shortlist selection", () => {
  const strong = {
    ...fit,
    mutualFit: 100,
    candidateInterest: 100,
    companyInterest: 100,
    roleFit: 100,
  };
  assert.equal(rankScore({ ...strong, constraintPass: 51 }), 100);
  assert.equal(rankScore({ ...strong, constraintPass: 50 }), 20);
  assert.equal(rankScore({ ...strong, constraintPass: 25 }), 5);
  assert.equal(rankScore({ ...strong, constraintPass: 0 }), 0);
  assert.ok(rankScore(fit) > rankScore({ ...strong, constraintPass: 50 }));
  assert.equal(cachedFitEligible({ ...fit, constraintPass: 50 }), false);
  assert.equal(cachedFitEligible({ ...fit, constraintPass: 50.1 }), true);
});
test("LLM metrics truncate to one decimal, retaining 0–100 scale and stored precision", () => {
  assert.equal(scoreForLlm(37.425000000000004), 37.4);
  assert.equal(scoreForLlm(64.29), 64.2);
  const original = {
    ...fit,
    candidateInterest: 34.999,
    companyInterest: 67.777,
    mutualFit: 28.000000000000004,
    roleFit: 64.25,
  };
  assert.deepEqual(fitForLlm(original), {
    ...fit,
    candidateInterest: 34.9,
    companyInterest: 67.7,
    mutualFit: 28,
    roleFit: 64.2,
  });
  assert.equal(original.roleFit, 64.25);
});
test("native out-of-range answers cannot masquerade as valid percent scores", () => {
  for (const provider of ["openai", "jev"] as const) {
    const raw = response(provider);
    const answers: any = raw.answers;
    const first =
      provider === "openai" ? answers[0] : answers.r0_candidateInterest;
    first[provider === "openai" ? "probability" : "noul"] = 34;
    assert.deepEqual(parseDecisionBatch(provider, raw, ids).errors, [ids[0]]);
  }
});
