import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  callJevFit,
  fitQuestions,
  FIT_PROMPT_VERSION,
  JEV_MODEL,
  JEV_ENDPOINT,
} from "../src/lib/ops/externalFitPlayground";

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  const task = "docs/evaluation/external-fit-playground";
  const datasetVersion = process.argv[2] ?? "v1";
  if (!/^v[1-9][0-9]*$/.test(datasetVersion))
    throw new Error("Dataset version must be v<N>");
  const fixtureText = await readFile(
    `${task}/cases-${datasetVersion}.json`,
    "utf8"
  );
  const fixture = JSON.parse(fixtureText);
  if (fixture.datasetVersion !== datasetVersion)
    throw new Error("Dataset version mismatch");
  const cases = fixture.cases ?? [fixture];
  const goldText = await readFile(
    `${task}/gold-${datasetVersion}.json`,
    "utf8"
  );
  const gold = JSON.parse(goldText);
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = `${task}/runs/${runId}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const manifest = {
    task: "external-fit-playground",
    datasetVersion,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirtyWorktree: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
    ),
    sourceSha256: sha(
      await readFile("src/lib/ops/externalFitPlayground.ts", "utf8")
    ),
    runnerSha256: sha(
      await readFile("scripts/evalExternalFitPlayground.ts", "utf8")
    ),
    promptFingerprint: sha(JSON.stringify(fitQuestions)),
    fixtureSha256: sha(fixtureText),
    goldSha256: sha(goldText),
    promptVersion: FIT_PROMPT_VERSION,
    model: JEV_MODEL,
    provider: "TypeSafe via OpenRouter",
    endpoint: JEV_ENDPOINT,
    dataCollection: "deny",
    reasoning: null,
    temperature: null,
    timeoutMs: 75000,
    input: "synthetic only; no DB access",
    rawArtifact: "result.json",
  };
  await writeFile(
    `${directory}/manifest.json`,
    JSON.stringify(manifest, null, 2),
    { mode: 0o600, flag: "wx" }
  );
  const results = [];
  for (const item of cases) {
    const result = await callJevFit(item.state, apiKey);
    results.push({ caseId: item.caseId, state: item.state, result });
  }
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify({ questions: fitQuestions, results }, null, 2),
    { mode: 0o600, flag: "wx" }
  );
  const byId = new Map(
    results.map((item) => [item.caseId, item.result.answers])
  );
  const comparisons = (gold.orderingChecks ?? []).map(
    (check: { higher: string; lower: string; axis: string }) => {
      const field = ["roleFit", "mutualFit"].includes(check.axis)
        ? "score"
        : "noul";
      const higher = byId.get(check.higher) as
        | Record<string, Record<string, number>>
        | null
        | undefined;
      const lower = byId.get(check.lower) as
        | Record<string, Record<string, number>>
        | null
        | undefined;
      return {
        ...check,
        passed: Boolean(
          higher &&
          lower &&
          higher[check.axis][field] > lower[check.axis][field]
        ),
      };
    }
  );
  const summary = {
    validCases: results.filter(({ result }) => result.answers).length,
    totalCases: results.length,
    comparisons,
    interpretation:
      "Synthetic author-defined ordering checks; not independent gold or calibrated outcome probabilities.",
  };
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify(summary, null, 2),
    { mode: 0o600, flag: "wx" }
  );
  console.log(
    JSON.stringify({
      directory,
      promptVersion: FIT_PROMPT_VERSION,
      datasetVersion,
      summary,
      results: results.map(({ caseId, result }) => ({
        caseId,
        valid: Boolean(result.answers),
        elapsedMs: result.elapsedMs,
        costUsd: result.costUsd,
        candidateInterest: result.answers?.candidateInterest.noul,
        companyInterest: result.answers?.companyInterest.noul,
        mutualFit: result.answers?.mutualFit.score,
        roleFit: result.answers?.roleFit.score,
        constraintPass: result.answers?.constraintPass.noul,
        evidence: result.answers?.evidence.choice,
        error: result.error,
      })),
    })
  );
  if (results.some(({ result }) => !result.answers)) process.exitCode = 1;
}
void main();
