import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import assert from "node:assert/strict";
import { buildScoringInput, v2PromptCandidate } from "../src/lib/externalRecommendationsV2/scoringInput";
import { roleCard } from "../src/lib/talentOnboarding/jobPostingRecommendations";
import { evaluatorKey, rankScore } from "../src/lib/externalRecommendationsV2/contract";
import { buildDecisionRequest, parseDecisionBatch } from "../src/lib/externalRecommendationsV2/decisions";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";
import currentRubric from "../src/lib/externalRecommendationsV2/fitQuestions.v4.json";

const task = resolve("docs/evaluation/external-scoring-cost");
const arms = ["baseline", "summary", "four_metrics", "both"];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const read = async (file: string) => JSON.parse(await readFile(resolve(task, file), "utf8"));
async function save(file: string, value: unknown) {
  const path = resolve(task, file);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

async function prepare() {
  const capture = await read("private/capture-v1.json");
  const oldRubric = JSON.parse(execFileSync("git", ["show", "HEAD:src/lib/externalRecommendationsV2/fitQuestions.v4.json"], { encoding: "utf8" }));
  const jobs: any[] = [];
  for (const [batchIndex, sample] of capture.samples.entries()) {
    const context = { ...sample.context };
    delete context.behavior_source_watermark;
    const baseline = sample.evaluator.includes("-v6-") ? oldRubric : currentRubric;
    const rotation = batchIndex % arms.length;
    for (const arm of [...arms.slice(rotation), ...arms.slice(0, rotation)]) {
      const rubric = structuredClone(baseline);
      if (arm === "four_metrics" || arm === "both") {
        const merged = structuredClone(rubric.questions.mutualFit);
        merged.instructions += "\nInclude demonstrated ability to perform the actual duties at the required scope and seniority in this overall fit assessment.";
        rubric.questions = {
          candidateInterest: rubric.questions.candidateInterest,
          companyInterest: rubric.questions.companyInterest,
          fit: merged,
          constraintPass: rubric.questions.constraintPass,
        };
        for (const question of Object.values(rubric.questions) as any[])
          question.instructions = question.instructions.replaceAll("mutualFit", "fit").replaceAll("roleFit", "fit");
      }
      const candidates = sample.candidates.map((candidate: any) => ({
        ...candidate,
        roleDescription: (arm === "summary" || arm === "both") && sample.summaries[candidate.roleId]?.trim()
          ? sample.summaries[candidate.roleId] : candidate.roleDescription,
      }));
      const request = {
        ...buildDecisionRequest("openai", buildScoringInput(context, candidates), sample.role_ids, rubric),
        prompt_cache_key: `harper-cost-probe-${randomUUID()}`,
      };
      jobs.push({ id: `batch${batchIndex + 1}-${arm}`, batch: batchIndex + 1, arm,
        roles: candidates.length, request, hash: hash(JSON.stringify(request)) });
    }
  }
  await save("private/requests-v1.json", jobs);
  const sources = ["src/lib/externalRecommendationsV2/scoringInput.ts", "src/lib/externalRecommendationsV2/workerInputText.ts",
    "src/lib/externalRecommendationsV2/decisions.ts", "src/lib/externalRecommendationsV2/fitQuestions.v4.json",
    "src/lib/externalRecommendationsV2/usage.ts", "scripts/probeExternalScoringCost.ts"];
  await save("manifest-v1.json", {
    capturedAt: capture.capturedAt, preparedAt: new Date().toISOString(), roles: 30, calls: jobs.length,
    summariesPresent: capture.samples.reduce((n: number, s: any) => n + s.candidates.filter((c: any) => s.summaries[c.roleId]?.trim()).length, 0),
    arms, sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceHashes: Object.fromEntries(await Promise.all(sources.map(async f => [f, hash(await readFile(f, "utf8"))]))),
    captureHash: hash(JSON.stringify(capture)), requestHashes: jobs.map(({ id, hash }: any) => ({ id, hash })),
    model: "gpt-6-luna", qualityGold: null, pricing: "https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability",
  });
  console.log(JSON.stringify({ prepared: jobs.length, arms, summaries: (await read("manifest-v1.json")).summariesPresent }));
}

async function run() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const jobs = await read("private/requests-v1.json");
  const manifest = await read("manifest-v1.json");
  const receipts: any[] = [];
  let spent = 0;
  for (const job of jobs) {
    const body = JSON.stringify(job.request);
    if (hash(body) !== manifest.requestHashes.find((j: any) => j.id === job.id)?.hash) throw new Error("Frozen request changed");
    const reserve = (Buffer.byteLength(body) + 4096 + job.request.questions.length * 128) / 1e6;
    if (spent + reserve > 0.25) throw new Error("Probe budget ceiling");
    await save(`runs/${job.id}.attempt.json`, { startedAt: new Date().toISOString(), requestHash: job.hash, reserve });
    const start = performance.now();
    const response = await fetch("https://api.openai.com/v1/decisions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body, signal: AbortSignal.timeout(45000), redirect: "error",
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Decisions HTTP ${response.status}; attempt retained, no retry`); }
    const raw = await response.json();
    await save(`runs/${job.id}.response.json`, { raw, requestId: response.headers.get("x-request-id") });
    const u = raw.usage;
    const cost = directUsageCost("openai_decisions", u);
    if (cost.usd === null) throw new Error("Cost unavailable; no further dispatch");
    spent += cost.usd;
    const answers = new Map((raw.answers ?? []).map((a: any) => [a.name, a]));
    const complete = job.request.questions.every((q: any) => (answers.get(q.name) as any)?.type === q.type);
    if (!complete || answers.size !== job.request.questions.length) throw new Error("Incomplete answer contract; raw response retained");
    const shared = (u.input_tokens_details?.cached_tokens ?? 0) + (u.input_tokens_details?.cache_write_tokens ?? 0);
    const normalizedCost = (warm: boolean) => directUsageCost("openai_decisions", { input_tokens: u.input_tokens,
      input_tokens_details: { cached_tokens: warm ? shared : 0, cache_write_tokens: warm ? 0 : shared } }).usd;
    const receipt = { id: job.id, batch: job.batch, arm: job.arm, roles: job.roles, questions: job.request.questions.length,
      inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedTokens: u.input_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: u.input_tokens_details?.cache_write_tokens ?? 0,
      actualUsd: cost.usd, coldUsd: normalizedCost(false), warmUsd: normalizedCost(true), elapsedMs: performance.now() - start };
    receipts.push(receipt);
    await save(`runs/${job.id}.receipt.json`, receipt);
    console.log(JSON.stringify(receipt));
  }
  const totals = arms.map(arm => {
    const rows = receipts.filter(r => r.arm === arm);
    return { arm, ...Object.fromEntries(["roles", "inputTokens", "actualUsd", "coldUsd", "warmUsd"].map(k => [k, rows.reduce((n, r) => n + r[k], 0)])) } as any;
  });
  const baseline = totals[0];
  for (const row of totals) for (const key of ["inputTokens", "actualUsd", "coldUsd", "warmUsd"]) {
    row[`${key}PerPair`] = row[key] / row.roles;
    row[`${key}Reduction`] = 1 - row[key] / baseline[key];
  }
  const report = { observedAt: new Date().toISOString(), totalProbeCostUsd: spent, manifest: "manifest-v1.json", totals, receipts };
  await save("report-v1.json", report);
  console.log(JSON.stringify({ totalProbeCostUsd: spent, totals }, null, 2));
}

async function smoke(mode: "format" | "compact" = "format") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const capture = await read("private/capture-v1.json");
  const batchIndex = capture.samples.findIndex((sample: any) => sample.evaluator.includes("-v8-"));
  assert.ok(batchIndex >= 0, "Frozen v8 batch required");
  const sample = capture.samples[batchIndex];
  assert.deepEqual(sample.candidates.map((c: any) => c.roleId), sample.role_ids);
  const context = { ...sample.context };
  delete context.behavior_source_watermark;
  const candidates = mode === "format" ? sample.candidates : sample.candidates.map((candidate: any) =>
    v2PromptCandidate({
      ...roleCard({ role_id: candidate.roleId, description: candidate.roleDescription }),
      ...candidate,
      companyWorkspaceId: candidate.companyKey,
      roleSummary: { ko: { content: sample.summaries[candidate.roleId] } },
    }, "ko"));
  const request = {
    ...buildDecisionRequest("openai", buildScoringInput(context, candidates), sample.role_ids),
    prompt_cache_key: `harper-${mode}-smoke-${randomUUID()}`,
  };
  const requestedQuestions = request.questions;
  assert.ok(Array.isArray(requestedQuestions));
  const baseline = (await read("private/requests-v1.json")).find((job: any) => job.batch === batchIndex + 1 && job.arm === "baseline");
  if (mode === "format") {
    assert.deepEqual(request.input?.[0], baseline.request.input[0], "Shared rubric must remain unchanged");
    assert.deepEqual(requestedQuestions, baseline.request.questions.map((question: any) => {
      const index = Number(question.name.match(/^r(\d+)_/)[1]);
      return { ...question, instructions: question.instructions.replace(`For role_id ${sample.role_ids[index]},`, `For role_id r${index},`) };
    }), "Only question role references change");
  } else {
    assert.equal(requestedQuestions.length, sample.role_ids.length * 4);
    assert.ok(!requestedQuestions.some(q => q.name.endsWith("_roleFit") || q.name.endsWith("_evidence")));
    candidates.forEach((candidate: any, index: number) => assert.equal(candidate.roleDescription,
      sample.summaries[candidate.roleId]?.trim() ? sample.summaries[candidate.roleId] : sample.candidates[index].roleDescription));
  }
  const artifact = `${mode}-smoke-v1`;
  const sources = ["src/lib/externalRecommendationsV2/scoringInput.ts", "src/lib/externalRecommendationsV2/workerInputText.ts",
    "src/lib/externalRecommendationsV2/decisions.ts", "src/lib/externalRecommendationsV2/contract.ts", "src/lib/externalRecommendationsV2/fitQuestions.v4.json", "scripts/probeExternalScoringCost.ts"];
  const body = JSON.stringify(request);
  await save(`private/${artifact}.request.json`, request);
  await save(`${artifact}.manifest.json`, {
    preparedAt: new Date().toISOString(), sampleHash: hash(JSON.stringify(sample)), requestHash: hash(body),
    sourceHashes: Object.fromEntries(await Promise.all(sources.map(async f => [f, hash(await readFile(f, "utf8"))]))),
    model: request.model, roles: sample.role_ids.length, questions: requestedQuestions.length,
    calls: 1, retries: 0, qualityGold: null, evaluator: evaluatorKey("openai"),
    scope: mode === "format" ? "UUID refs and generated indentation; structural smoke only" : "Summary fallback and four metrics; structural smoke only",
  });
  await save(`runs/${artifact}.attempt.json`, { startedAt: new Date().toISOString(), requestHash: hash(body) });
  const started = performance.now();
  const response = await fetch("https://api.openai.com/v1/decisions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body, signal: AbortSignal.timeout(45000), redirect: "error",
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Decisions HTTP ${response.status}; no retry`); }
  const raw = await response.json();
  await save(`runs/${artifact}.response.json`, { raw, requestId: response.headers.get("x-request-id") });
  const parsed = parseDecisionBatch("openai", raw, sample.role_ids);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.evaluations.map(row => row.roleId), sample.role_ids);
  assert.ok(parsed.evaluations.every(row => Number.isFinite(rankScore(row.fit))));
  assert.deepEqual(raw.answers.map((answer: any) => [answer.name, answer.type]).sort(),
    requestedQuestions.map(question => [question.name, question.type]).sort());
  const prior = await read(`runs/batch${batchIndex + 1}-baseline.receipt.json`);
  const report = {
    observedAt: new Date().toISOString(), manifest: `${artifact}.manifest.json`, httpStatus: response.status,
    roles: parsed.evaluations.length, answers: raw.answers.length, parseErrors: parsed.errors.length, originalIdsRestored: true,
    inputTokens: raw.usage.input_tokens, baselineInputTokens: prior.inputTokens,
    inputReduction: 1 - raw.usage.input_tokens / prior.inputTokens,
    costUsd: directUsageCost("openai_decisions", raw.usage).usd, elapsedMs: performance.now() - started,
    qualityEvaluated: false,
    summariesUsed: mode === "compact" ? sample.candidates.filter((c: any) => sample.summaries[c.roleId]?.trim()).length : 0,
  };
  await save(`${artifact}.report.json`, report);
  console.log(JSON.stringify(report, null, 2));
}

const command = process.argv[2];
(command === "prepare" ? prepare() : command === "run" ? run() : command === "smoke" ? smoke() : command === "compact-smoke" ? smoke("compact") : Promise.reject(new Error("Use prepare, run, smoke or compact-smoke")))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
