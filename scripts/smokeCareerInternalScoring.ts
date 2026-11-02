import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  evaluateStage,
  buildRequest,
} from "../src/lib/career/matching/internalScoring/decisions";
import {
  evaluationText,
  inputFingerprint,
} from "../src/lib/career/matching/internalScoring/evidence";

async function main() {
  const folder = resolve("docs/evaluation/career-internal-scoring"),
    text = readFileSync(folder + "/cases-v1.json", "utf8"),
    source = JSON.parse(text);
  const traces: unknown[] = [],
    results = [];
  const now = new Date("2026-11-02T15:30:00Z");
  for (const stage of [1, 2] as const) {
    results.push(
      await evaluateStage(source, stage, {
        now,
        onCall: (trace) => traces.push(trace),
      })
    );
    console.log(`Stage ${stage}: provider response parsed`);
  }
  const oracle = spawnSync(
    "python3",
    [
      resolve("src/lib/career/matching/internalScoring/workerParity.py"),
      resolve("../harper_worker"),
    ],
    {
      input: JSON.stringify({ source, responses: results.map((r) => r.raw) }),
      encoding: "utf8",
    }
  );
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  assert.deepEqual(
    results.map((r) => r.assessment),
    expected.assessments
  );
  assert.deepEqual(
    ([1, 2] as const).map((stage) =>
      buildRequest(
        stage,
        evaluationText(source, stage, now),
        source.role.criteria
      )
    ),
    expected.requests
  );
  assert.equal(inputFingerprint(source), expected.fingerprint);
  assert.equal(results[0].assessment.proceedToStage2, true);
  const run = {
    at: new Date().toISOString(),
    fixtureSha256: createHash("sha256").update(text).digest("hex"),
    parity: true,
    results,
    traces,
  };
  mkdirSync(folder + "/runs", { recursive: true, mode: 0o700 });
  writeFileSync(
    folder + "/runs/" + Date.now() + ".json",
    JSON.stringify(run, null, 2),
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify({
      parity: true,
      stages: results.map((r) => ({
        model: r.model,
        usage: r.usage,
        elapsedMs: r.elapsedMs,
        assessment: r.assessment,
      })),
    })
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
