import { workerCard } from "../src/lib/externalRecommendationsV2/worker";
import {
  getSearchPlan,
  generateSummaries,
  rerankCandidates,
  v2CompletionRequest,
} from "../src/lib/externalRecommendationsV2/engine";
import { runTalentAssistantCompletion } from "../src/lib/talentOnboarding/llm";
import { rankScore } from "../src/lib/externalRecommendationsV2/contract";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  callDecisions,
  buildDecisionRequest,
} from "../src/lib/externalRecommendationsV2/decisions";
import {
  providerModels,
  PROMPT_VERSION,
  providerSchema,
  type FitProvider,
} from "../src/lib/externalRecommendationsV2/contract";
import {
  buildScoringInput,
  v2PromptCandidate,
} from "../src/lib/externalRecommendationsV2/scoringInput";
import { roleCard } from "../src/lib/talentOnboarding/jobPostingRecommendations";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";
const task = "docs/evaluation/external-recommendations-v2";
async function main() {
  const providerArg =
    process.argv.find((a) => a.startsWith("--provider="))?.split("=")[1] ??
    "both";
  const providers: FitProvider[] =
    providerArg === "both"
      ? ["openai", "jev"]
      : [providerSchema.parse(providerArg)];
  const repeats = Number(
    process.argv.find((a) => a.startsWith("--repeats="))?.split("=")[1] ?? 1
  );
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5)
    throw new Error("Expected 1–5 repeats");
  const dry = process.argv.includes("--dry-run");
  const dataset =
    process.argv.find((a) => a.startsWith("--dataset="))?.split("=")[1] ?? "v1";
  if (!["v1", "v2", "v3", "v4"].includes(dataset))
    throw new Error("Unknown frozen dataset version");
  const files = await Promise.all(
    [`cases-${dataset}.json`, `gold-${dataset}.json`].map((f) =>
      readFile(`${task}/${f}`, "utf8")
    )
  );
  const fixture = JSON.parse(files[0]);
  const gold = JSON.parse(files[1]);
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const prepared = fixture.batches.map((batch: any) => ({
    caseIds: batch.roles.map((r: any) => r.caseId),
    roleIds: batch.roles.map((r: any) => r.row.role_id),
    input: buildScoringInput(
      batch.userContext,
      batch.roles.map((r: any) => v2PromptCandidate(roleCard(r.row), "en"))
    ),
  }));
  if (dry) {
    console.log(
      JSON.stringify({
        batches: prepared.map((b: any) => b.roleIds.length),
        providers,
        repeats,
        dry: true,
      })
    );
    return;
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = `${task}/runs/${runId}`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) =>
    writeFile(`${dir}/${name}`, JSON.stringify(value, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  const sources = [
    "src/lib/externalRecommendationsV2/decisions.ts",
    "src/lib/externalRecommendationsV2/fitQuestions.v3.json",
    "src/lib/externalRecommendationsV2/scoringInput.ts",
    "src/lib/externalRecommendationsV2/engine.ts",
    "src/lib/externalRecommendationsV2/prompts.ts",
    "src/lib/externalRecommendationsV2/legacyPlanner.v1.json",
    "src/lib/externalRecommendationsV2/contract.ts",
    "src/lib/externalRecommendationsV2/countries.ts",
    "src/lib/externalRecommendationsV2/retrieval.ts",
    "src/lib/talentOnboarding/jobPostingFullJdScoring.ts",
  ];
  await save("manifest.json", {
    runId,
    datasetVersion: fixture.version,
    fixtureHash: sha(files[0]),
    goldHash: sha(files[1]),
    promptVersion: PROMPT_VERSION,
    providers,
    models: providerModels,
    repeats,
    gitRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim()
    ),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        sources.map(async (f) => [f, sha(await readFile(f, "utf8"))])
      )
    ),
    privacy: "Synthetic only. No DB/recommendations/messages. Secrets omitted.",
    reasoning: null,
    timeoutMs: 90000,
  });
  const results: any[] = [];
  for (let repeat = 0; repeat < repeats; repeat++)
    for (const provider of repeat % 2 ? [...providers].reverse() : providers) {
      const byCase = new Map<string, any>();
      let elapsedMs = 0;
      let cost = 0;
      let unknown = 0;
      let failed = 0;
      for (let batchIndex = 0; batchIndex < prepared.length; batchIndex++) {
        const batch = prepared[batchIndex];
        const began = Date.now();
        let receipt: any;
        try {
          receipt = await callDecisions(provider, batch.input, batch.roleIds);
        } catch (error) {
          receipt = {
            error: error instanceof Error ? error.message : String(error),
            elapsedMs: Date.now() - began,
          };
        }
        await save(`${provider}-${repeat}-${batchIndex}.json`, {
          caseIds: batch.caseIds,
          request: buildDecisionRequest(provider, batch.input, batch.roleIds),
          receipt,
        });
        elapsedMs += receipt.elapsedMs;
        failed += receipt.error ? batch.roleIds.length : receipt.errors.length;
        const c = directUsageCost(
          provider === "openai" ? "openai_decisions" : "jev_decisions",
          receipt.usage
        );
        if (c.usd === null) unknown++;
        else cost += c.usd;
        for (const e of receipt.evaluations ?? [])
          byCase.set(batch.caseIds[batch.roleIds.indexOf(e.roleId)], e.fit);
      }
      const checks = gold.orderingChecks.map((check: any) => ({
        ...check,
        passed:
          byCase.has(check.higher) &&
          byCase.has(check.lower) &&
          byCase.get(check.higher)[check.axis] >
            byCase.get(check.lower)[check.axis],
      }));
      const constraintChecks = (
        gold.constraintChecks ?? [
          { caseId: "hard-conflict", operator: "<=", threshold: 50 },
          { caseId: "quality-strong", operator: ">", threshold: 50 },
        ]
      ).map((check: any) => {
        const actual = byCase.get(check.caseId)?.constraintPass ?? null;
        return {
          ...check,
          actual,
          passed:
            actual !== null &&
            (check.operator === "<="
              ? actual <= check.threshold
              : actual > check.threshold),
        };
      });
      const summary = {
        provider,
        repeat,
        elapsedMs,
        validPairs: byCase.size,
        failedPairs: failed,
        knownCostUsd: cost,
        unknownCostCalls: unknown,
        checksPassed: checks.filter((c: any) => c.passed).length,
        checksTotal: checks.length,
        constraintChecks,
      };
      results.push({ summary, checks });
      console.log(JSON.stringify(summary));
    }
  await save("summary.json", results);
  if (process.argv.includes("--stages")) {
    const stageCalls: any[] = [];
    const complete = async (system: string, input: string, label: string) => {
      const request = {
        ...v2CompletionRequest(system, input, label),
        usageLabel: `offline_external_v2:${label}`,
      };
      const began = Date.now();
      let metadata: unknown;
      try {
        const raw = await runTalentAssistantCompletion({
          ...request,
          onCompletionMetadata: (value) => {
            metadata = value;
          },
        });
        const receipt = {
          request,
          raw,
          metadata,
          elapsedMs: Date.now() - began,
        };
        stageCalls.push(receipt);
        await save(`stage-${stageCalls.length}-${label}.json`, receipt);
        return JSON.parse(raw);
      } catch (error) {
        await save(`stage-${stageCalls.length + 1}-${label}-error.json`, {
          request,
          metadata,
          elapsedMs: Date.now() - began,
          error: error instanceof Error ? error.message : "Stage failed",
        });
        throw error;
      }
    };
    const stageBatch = Number(
      process.argv.find((a) => a.startsWith("--stage-batch="))?.split("=")[1] ??
        0
    );
    if (!Number.isInteger(stageBatch) || !fixture.batches[stageBatch])
      throw new Error("Invalid stage batch");
    const batch = fixture.batches[stageBatch];
    const cards = batch.roles.map((r: any) => roleCard(r.row));
    const args: any = {
      admin: {},
      userId: "00000000-0000-4000-8000-000000000000",
      surface: batch.surface ?? "web",
      language: batch.language ?? "en",
      request: batch.request,
      workerSearchContext: batch.workerSearchContext,
      dryRun: true,
    };
    const plan = await getSearchPlan(
      args,
      {
        context: batch.userContext,
        contextFingerprint: `synthetic-${dataset}`,
        setting: {},
        blockedCompanies: [],
      } as any,
      complete
    );
    await generateSummaries(args, cards, complete);
    const receipt = JSON.parse(
      await readFile(`${dir}/${providers[0]}-0-${stageBatch}.json`, "utf8")
    ).receipt;
    const fits = new Map(
      (receipt.evaluations ?? []).map((e: any) => [e.roleId, e.fit])
    );
    const ranked = cards
      .flatMap((card: any) => {
        const fit: any = fits.get(card.roleId);
        return fit
          ? [
              {
                card,
                fit,
                score: rankScore(fit),
              },
            ]
          : [];
      })
      .sort((a: any, b: any) => b.score - a.score);
    const selected = await rerankCandidates(
      args,
      {
        ...batch.userContext,
        current_search_scope: plan.plan,
        ...(args.surface === "worker"
          ? { current_search_purpose: plan.plan.searchIntentSummary }
          : {}),
      },
      ranked,
      complete
    );
    await save("stages.json", {
      calls: stageCalls,
      dataset,
      stageBatch,
      surface: args.surface,
      userContext: batch.userContext,
      workerCards: selected.map((s, i) => workerCard(s, i + 1)),
      plan: { ...plan, titleVectors: undefined },
      selected: selected.map((s) => ({
        roleId: s.card.roleId,
        note: s.recommendationNote,
        summary: s.fitSummary,
      })),
    });
    console.log(
      JSON.stringify({
        stageCalls: stageCalls.length,
        selected: selected.length,
      })
    );
  }
  console.log(`Saved ${dir}`);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
});
