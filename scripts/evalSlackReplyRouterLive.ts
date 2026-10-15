import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  buildSlackReplyRoutingRequest,
  decideHarperSlackThreadReply,
  SLACK_REPLY_ROUTING_ENDPOINT,
  slackReplyRoutingResponseSchema,
  type SlackReplyRoutingMessage,
} from "../src/lib/org/slackReplyRouter";
import type { LlmDebugCall } from "../src/lib/llm/debugUsage";

dotenv.config({ path: ".env.local", quiet: true });
const sha = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const arg = (name: string, fallback: string) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;

type EvalCase = {
  id: string;
  name: string;
  messages: SlackReplyRoutingMessage[];
};
type Gold = { id: string; expected: string[] };

async function main() {
  const dataset = arg("dataset", "v2");
  if (!["v1", "v2"].includes(dataset))
    throw new Error("Unknown dataset version");
  const taskDir = path.resolve("docs/evaluation/slack-reply-routing");
  const inputBytes = fs.readFileSync(
    path.join(taskDir, `cases-${dataset}.json`)
  );
  const goldBytes = fs.readFileSync(path.join(taskDir, `gold-${dataset}.json`));
  const frozen = JSON.parse(
    fs.readFileSync(path.join(taskDir, `manifest-${dataset}.json`), "utf8")
  );
  if (
    sha(inputBytes) !== frozen.inputSha256 ||
    sha(goldBytes) !== frozen.goldSha256
  )
    throw new Error("Frozen input or gold hash changed");
  const cases: EvalCase[] = JSON.parse(inputBytes.toString());
  const gold: Gold[] = JSON.parse(goldBytes.toString());
  if (
    cases.length !== gold.length ||
    new Set(cases.map((c) => c.id)).size !== cases.length
  )
    throw new Error("Invalid fixture/gold coverage");
  const labels = new Map(gold.map((c) => [c.id, c.expected]));
  if (cases.some((c) => !labels.has(c.id)))
    throw new Error("Missing gold label");
  const request = buildSlackReplyRoutingRequest(cases[0].messages);
  const promptFingerprint = sha(JSON.stringify(request.questions));
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify({
        dataset,
        cases: cases.length,
        model: request.model,
        promptFingerprint,
        inputSha256: sha(inputBytes),
        goldSha256: sha(goldBytes),
      })
    );
    return;
  }
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required");
  const runId = arg(
    "run",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
  );
  if (!/^[a-zA-Z0-9_-]+$/.test(runId))
    throw new Error("Invalid run identifier");
  const runsDir = path.join(taskDir, "runs");
  fs.mkdirSync(runsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(runsDir, 0o700);
  const runDir = path.join(runsDir, runId);
  fs.mkdirSync(runDir, { mode: 0o700 });
  const save = (name: string, data: unknown) =>
    fs.writeFileSync(
      path.join(runDir, name),
      JSON.stringify(data, null, 2) + "\n",
      { mode: 0o600 }
    );
  const sourceFiles = [
    "src/lib/org/slackReplyRouter.ts",
    "src/lib/llm/modelConfig.ts",
    "src/lib/llm/pricing.ts",
    "src/lib/llm/debugUsage.ts",
    "src/lib/llm/usageLogging.ts",
    "src/app/api/internal/org-agent/slack-turn/route.ts",
    "scripts/evalSlackReplyRouterLive.ts",
  ];
  const sourceSnapshots = Object.fromEntries(
    sourceFiles.map((file) => [file, fs.readFileSync(file, "utf8")])
  );
  const sourceDiff = execFileSync(
    "git",
    ["diff", "HEAD", "--", ...sourceFiles],
    { encoding: "utf8" }
  );
  const manifest: any = {
    task: "slack-reply-routing",
    datasetVersion: dataset,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: Boolean(sourceDiff),
    sourceDiffFingerprint: sha(sourceDiff),
    sourceHashes: Object.fromEntries(
      Object.entries(sourceSnapshots).map(([file, content]) => [
        file,
        sha(content),
      ])
    ),
    promptFingerprint,
    fixtureHash: sha(inputBytes),
    goldHash: sha(goldBytes),
    model: request.model,
    provider: "openrouter/TypeSafe",
    endpoint: SLACK_REPLY_ROUTING_ENDPOINT,
    reasoning: null,
    temperature: null,
    timeoutMs: 5000,
    repetitions: 1,
    providerPolicy: request.provider,
    privacy: "synthetic only; no database or Slack calls",
    rawArtifacts: runDir,
    status: "running",
    results: [],
  };
  save("manifest.json", manifest);
  save("sources.json", sourceSnapshots);
  const originalFetch = globalThis.fetch;
  let captures: any[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) !== SLACK_REPLY_ROUTING_ENDPOINT)
      throw new Error("Evaluation blocked a non-provider network call");
    const capture: any = {
      request: JSON.parse(String(init?.body)),
      startedAt: new Date().toISOString(),
    };
    captures.push(capture);
    const began = performance.now();
    try {
      const response = await originalFetch(url, init);
      capture.httpStatus = response.status;
      capture.raw = await response
        .clone()
        .json()
        .catch(() => null);
      return response;
    } catch (error) {
      capture.error =
        error instanceof Error ? error.message : "Provider request failed";
      throw error;
    } finally {
      capture.durationMs = Math.round(performance.now() - began);
    }
  };
  try {
    for (const c of cases) {
      captures = [];
      const receipts: LlmDebugCall[] = [];
      const decision = await decideHarperSlackThreadReply(c.messages, {
        logUsage: false,
        onDebugCall: (call) => {
          receipts.push(call);
        },
      });
      const valid =
        captures.length === 1 &&
        captures[0].httpStatus === 200 &&
        slackReplyRoutingResponseSchema.safeParse(captures[0].raw).success;
      const passed = valid && labels.get(c.id)!.includes(decision);
      const result = {
        id: c.id,
        passed,
        valid,
        decision,
        expected: labels.get(c.id),
        durationMs: receipts[0]?.durationMs ?? null,
        costUsd: receipts[0]?.estimatedCostUsd ?? null,
        costStatus: receipts[0]?.pricingStatus ?? "unknown",
        resolvedModel: receipts[0]?.model ?? null,
      };
      save(`${c.id}.json`, { case: c, result, captures, receipts });
      manifest.results.push(result);
      save("manifest.json", manifest);
      console.log(
        `${passed ? "PASS" : "FAIL"} | ${c.id} | ${c.name} | ${decision} | ${result.durationMs ?? "unknown"}ms`
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  const results = manifest.results;
  const times: number[] = results
    .map((r: any) => r.durationMs)
    .filter((t: unknown) => typeof t === "number")
    .sort((a: number, b: number) => a - b);
  const costs: number[] = results
    .map((r: any) => r.costUsd)
    .filter((c: unknown) => typeof c === "number");
  const passed = results.filter((r: any) => r.passed).length;
  manifest.metrics = {
    passed,
    total: cases.length,
    valid: results.filter((r: any) => r.valid).length,
    missedResponses: results.filter(
      (r: any) =>
        r.valid && r.expected.includes("respond") && r.decision !== "respond"
    ).length,
    interruptions: results.filter(
      (r: any) =>
        r.valid && !r.expected.includes("respond") && r.decision === "respond"
    ).length,
    meanDurationMs: times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null,
    medianDurationMs: times.length
      ? (times[Math.floor((times.length - 1) / 2)] +
          times[Math.ceil((times.length - 1) / 2)]) /
        2
      : null,
    p95DurationMs: times.length
      ? times[Math.ceil(times.length * 0.95) - 1]
      : null,
    knownCostCount: costs.length,
    totalKnownCostUsd: costs.reduce((a, b) => a + b, 0),
    meanKnownCostUsd: costs.length
      ? costs.reduce((a, b) => a + b, 0) / costs.length
      : null,
  };
  manifest.status = passed === cases.length ? "passed" : "failed";
  manifest.finishedAt = new Date().toISOString();
  save("manifest.json", manifest);
  console.log(
    JSON.stringify({
      status: manifest.status,
      ...manifest.metrics,
      artifacts: runDir,
    })
  );
  if (manifest.status !== "passed") process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
