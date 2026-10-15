/** Explicit read-only production capture; all LLM outputs stay in ignored owner-only runs. */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import {
  runExternalV2,
  v2CompletionRequest,
  type EngineDiagnostics,
} from "../src/lib/externalRecommendationsV2/engine";
import { runTalentAssistantCompletion } from "../src/lib/talentOnboarding/llm";
import {
  PROMPT_VERSION,
  providerModels,
} from "../src/lib/externalRecommendationsV2/contract";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";
const task = "docs/evaluation/external-recommendations-v2";
const bridgePath = resolve(
  "../harper_worker/llm_evals/external_recommendations_v2/read_only_capture.py"
);
async function bridge(request: unknown): Promise<any> {
  return new Promise((done, reject) => {
    const child = spawn("python3", [bridgePath], {
      cwd: resolve("../harper_worker"),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    child.stdout.on("data", (v) => {
      output += v;
    });
    child.stderr.on("data", (v) => {
      error += v;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code ? reject(new Error(error)) : done(JSON.parse(output))
    );
    child.stdin.end(JSON.stringify(request));
  });
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function main() {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const output = `${task}/runs/live-${id}`;
  await mkdir(output, { recursive: true, mode: 0o700 });
  const save = async (name: string, value: unknown) =>
    writeFile(`${output}/${name}.json`, JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  const frozenPath = process.argv
    .find((v) => v.startsWith("--frozen="))
    ?.slice(9);
  const count = Number(
    process.argv.find((v) => v.startsWith("--count="))?.split("=")[1] ?? 3
  );
  if (!Number.isInteger(count) || count < 1 || count > 5)
    throw new Error("Expected 1–5 talents");
  const surface = process.argv.includes("--worker") ? "worker" : "web";
  const admin: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          if (!["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase()))
            throw new Error("Production evaluation blocks HTTP writes");
          return fetch(input, { ...init, signal: AbortSignal.timeout(50_000) });
        },
      },
    }
  );
  admin.rpc = async (name: string, params: unknown) => ({
    data: await bridge({ kind: "rpc", name, params }),
    error: null,
  });
  const samplePath = process.argv
    .find((v) => v.startsWith("--sample="))
    ?.slice(9);
  const frozenCases: any[] | undefined = frozenPath
    ? JSON.parse(await readFile(frozenPath, "utf8"))
    : undefined;
  const sampleRows =
    frozenCases ??
    (samplePath
      ? JSON.parse(await readFile(samplePath, "utf8"))
      : await bridge({ kind: "sample", seed: id, count }));
  const sample = sampleRows.slice(0, count);
  await save(
    "sample",
    sample.map((v: any, i: number) => ({
      caseId: `candidate-${i + 1}`,
      userId: v.user_id ?? v.userId,
    }))
  );
  const sources = [
    "engine",
    "contract",
    "retrieval",
    "context",
    "decisions",
    "scoringInput",
    "prompts",
  ];
  await save("manifest", {
    datasetVersion: frozenPath
      ? basename(dirname(frozenPath))
      : "production-pilot-v3",
    capturedAt: id,
    frozenPath,
    frozenInputHash: frozenPath
      ? sha(await readFile(frozenPath, "utf8"))
      : null,
    sampleSeed: id,
    samplePath,
    sampling: samplePath
      ? "Reuse IDs from the earlier hash-random sample with fresh data; no manual role selection"
      : "Hash-random eligible talent with experience, Brief and Behavior snapshot; no role matching manual selection",
    surface,
    providers: providerModels,
    promptVersion: PROMPT_VERSION,
    sourceHashes: Object.fromEntries(
      await Promise.all(
        sources.map(async (n) => [
          n,
          sha(
            await readFile(`src/lib/externalRecommendationsV2/${n}.ts`, "utf8")
          ),
        ])
      )
    ),
    gold: "review-rubric-live-v1.json",
    readOnly: true,
  });
  const captures: any[] = [],
    results: any[] = [];
  for (let i = 0; i < sample.length; i++) {
    const userId = sample[i].user_id ?? sample[i].userId;
    let frozen: EngineDiagnostics["frozenInput"] = frozenCases
      ? sample[i].input
      : undefined;
    for (const provider of ["openai", "jev"] as const) {
      const prefix = `case-${i + 1}-${provider}`;
      let sequence = 0;
      const captured: any = {};
      const stageTimings: any[] = [];
      const complete = async (system: string, input: string, label: string) => {
        const began = Date.now();
        let metadata: unknown;
        const request = {
          ...v2CompletionRequest(system, input, label),
          usageLabel: `offline_external_v2:${label}`,
        };
        await save(`${prefix}-${++sequence}-${label}-request`, {
          request,
          startedAt: new Date().toISOString(),
        });
        const raw = await runTalentAssistantCompletion({
          ...request,
          onCompletionMetadata: (value) => {
            metadata = value;
          },
        });
        const elapsedMs = Date.now() - began;
        stageTimings.push({ label, elapsedMs });
        await save(`${prefix}-${++sequence}-${label}`, {
          request,
          raw,
          metadata,
          elapsedMs,
        });
        return JSON.parse(raw);
      };
      try {
        const began = Date.now();
        const result = await runExternalV2(
          {
            admin,
            userId,
            surface,
            language: "ko",
            provider,
            dryRun: true,
            targetCount: 5,
          },
          {
            complete,
            frozenInput: frozen,
            trace: async (stage, data) => {
              if (["context", "plan", "candidates"].includes(stage))
                captured[stage] = structuredClone(data);
              await save(`${prefix}-${++sequence}-${stage}`, data);
            },
          }
        );
        if (!frozen) {
          frozen = {
            context: captured.context,
            plan: captured.plan,
            cards: captured.candidates,
          };
          captures.push({ userId, input: frozen });
          await save(`${prefix}-frozen-input`, frozen);
        }
        const row = {
          caseId: `candidate-${i + 1}`,
          provider,
          elapsedMs: Date.now() - began,
          ...result,
          stageTimings,
          knownScoringCostUsd: result.metrics.scoringUsage?.reduce(
            (sum: number, r: any) =>
              sum +
              (directUsageCost(
                provider === "openai" ? "openai_decisions" : "jev_decisions",
                r.usage
              ).usd ?? 0),
            0
          ),
        };
        results.push(row);
        await save(`${prefix}-result`, row);
        console.log(
          JSON.stringify({
            caseId: row.caseId,
            provider,
            elapsedMs: row.elapsedMs,
            candidates: row.metrics.candidateCount,
            scored: row.metrics.scoredCount,
            failed: row.metrics.failedRoleIds?.length,
            selected: row.selected.length,
            knownScoringCostUsd: row.knownScoringCostUsd,
            stageTimings,
          })
        );
      } catch (error) {
        await save(`${prefix}-error`, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        console.log(
          JSON.stringify({
            caseId: `candidate-${i + 1}`,
            provider,
            error: error instanceof Error ? error.message : String(error),
          })
        );
        if (!frozen) break;
      }
    }
  }
  await save("frozen-cases", frozenCases ?? captures);
  await save("results", results);
  console.log(`Saved ${output}`);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
});
