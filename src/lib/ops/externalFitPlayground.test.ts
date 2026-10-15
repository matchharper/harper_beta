import assert from "node:assert/strict";
import test from "node:test";
import {
  callJevFit,
  existingFit,
  fitRunInput,
  JEV_ENDPOINT,
  parseFitResponse,
} from "./externalFitPlayground";

const answers = {
  candidateInterest: { type: "noul", noul: 0.82 },
  companyInterest: { type: "noul", noul: 0.61 },
  mutualFit: {
    type: "score",
    score: 2.71,
    probabilities: { 0: 0.01, 1: 0.05, 2: 0.2, 3: 0.7, 4: 0.04 },
  },
  roleFit: { type: "score", score: 3.2 },
  constraintPass: { type: "noul", noul: 0.95 },
  evidence: { type: "choice", choice: "partial" },
};
test("historical fit scores preserve zero, score100 precedence and legacy scale", () => {
  for (const [meta, expected] of [
    [{ score: 0 }, 0],
    [{ score: 82 }, 82],
    [{ score: 0.82 }, 82],
    [{ score100: 1, score: 0.9 }, 1],
    [{ fitScore: "73" }, 73],
    [{}, null],
    [{ score: "" }, null],
    [{ score: false }, null],
    [{ score: 120 }, null],
  ] as const) {
    assert.equal(existingFit(meta, "2026-10-13").score, expected);
  }
});
test("keeps independent model axes and original probability distribution", () => {
  const raw = {
    answers,
    model: "typesafe/jev-1.13-dated",
    usage: { cost: 0.000032, input_tokens: 900, output_tokens: 80 },
  };
  const result = parseFitResponse(raw, 210);
  assert.deepEqual(result.answers, answers);
  assert.equal(result.raw, raw);
  assert.equal(result.costUsd, 0.000032);
  assert.equal(result.resolvedModel, raw.model);
});
test("invalid/missing answers retain charged usage and raw output without repaired scores", () => {
  for (const broken of [
    { ...answers, companyInterest: undefined },
    { ...answers, mutualFit: { type: "score", score: 5 } },
    { ...answers, candidateInterest: { type: "noul", noul: -0.1 } },
  ]) {
    const raw = { answers: broken, usage: { cost: 0.12 } };
    const result = parseFitResponse(raw, 1);
    assert.equal(result.answers, null);
    assert.ok(result.error);
    assert.equal(result.costUsd, 0.12);
    assert.equal(result.raw, raw);
  }
});
test("unknown costs differ from actual zero cost", () => {
  for (const cost of [undefined, null, "0.5", -1, Number.NaN])
    assert.equal(
      parseFitResponse({ answers, usage: { cost } }, 1).costUsd,
      null
    );
  assert.equal(parseFitResponse({ answers, usage: { cost: 0 } }, 1).costUsd, 0);
});
test("uses Decisions API once and preserves provider failure", async () => {
  let calls = 0;
  const result = await callJevFit(
    { fixture: true },
    "test-key",
    async (url, init) => {
      calls++;
      assert.equal(url, JEV_ENDPOINT);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.provider.data_collection, "deny");
      assert.equal(Object.keys(body.questions).length, 6);
      return new Response(
        JSON.stringify({ error: { message: "rate limited" } }),
        { status: 429 }
      );
    }
  );
  assert.equal(calls, 1);
  assert.equal(result.answers, null);
  assert.equal(result.costUsd, null);
  assert.match(result.error!, /429/);
});
test("network failure does not retry or invent billing", async () => {
  const result = await callJevFit({}, "test-key", async () => {
    throw new DOMException("timeout", "TimeoutError");
  });
  assert.equal(result.costUsd, null);
  assert.match(result.error!, /75초/);
});
test("rejects invalid IDs, oversized batch and client-authored context", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(
    fitRunInput.safeParse({ talentId: id, roleIds: [id] }).success,
    true
  );
  for (const input of [
    { talentId: "no", roleIds: [id] },
    { talentId: id, roleIds: [] },
    { talentId: id, roleIds: Array(11).fill(id) },
    { talentId: id, roleIds: [id], context: "override" },
  ])
    assert.equal(fitRunInput.safeParse(input).success, false);
});
