import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCompanySnapshotMarkdown,
  runCompanySnapshotResearch,
  runCompanySnapshotPersonalization,
} from "@/lib/career/companySnapshot";
import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { getLlmChatProviderForModel } from "@/lib/llm/llm";

type EvaluationCase = {
  companyName: string;
  id: string;
  reason: string;
  talentContext: string;
};

type EvaluationFixture = {
  cases: EvaluationCase[];
  datasetVersion: string;
};

function readArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function gitValue(args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

async function writePrivateFile(filePath: string, content: string) {
  await writeFile(filePath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
}

async function main() {
  const outputDirectory = readArgument("--output-dir");
  const requestedCaseId = readArgument("--case-id");
  const adHocCompanyName = readArgument("--company-name");
  const adHocReason = readArgument("--reason") ?? "";
  const adHocTalentContext = readArgument("--talent-context") ?? "";
  if (!outputDirectory) {
    throw new Error("--output-dir is required");
  }

  const repositoryRoot = process.cwd();
  const fixturePath = path.resolve(
    repositoryRoot,
    readArgument("--fixture") ??
      "docs/evaluation/career-company-research/cases-v2.json"
  );
  const promptSourcePath = path.join(
    repositoryRoot,
    "src/lib/career/companySnapshot.ts"
  );
  const fixtureRaw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(fixtureRaw) as EvaluationFixture;
  const adHocCase: EvaluationCase | null = adHocCompanyName
    ? {
        companyName: adHocCompanyName,
        id: "ADHOC001",
        reason: adHocReason,
        talentContext: adHocTalentContext,
      }
    : null;
  const evaluationCases = adHocCase
    ? [adHocCase]
    : requestedCaseId
      ? fixture.cases.filter((item) => item.id === requestedCaseId)
      : fixture.cases;
  const datasetVersion = adHocCase ? "ad-hoc-v1" : fixture.datasetVersion;
  const evaluatedInputRaw = adHocCase
    ? JSON.stringify({ cases: [adHocCase], datasetVersion }, null, 2)
    : fixtureRaw;
  if (evaluationCases.length === 0) {
    throw new Error(`Unknown --case-id: ${requestedCaseId}`);
  }
  const promptSource = await readFile(promptSourcePath, "utf8");
  const absoluteOutputDirectory = path.resolve(repositoryRoot, outputDirectory);
  await mkdir(absoluteOutputDirectory, { recursive: true, mode: 0o700 });
  await chmod(absoluteOutputDirectory, 0o700);

  const dossierRun = readArgument("--dossier-run");
  const dossierRaw = dossierRun
    ? await readFile(
        path.resolve(repositoryRoot, dossierRun, "raw.json"),
        "utf8"
      )
    : null;
  const reusedResults = dossierRaw
    ? (JSON.parse(dossierRaw).results as Array<{
        case: EvaluationCase;
        content: Record<string, unknown>;
      }>)
    : null;

  const results: Array<{
    case: EvaluationCase;
    content: Record<string, unknown>;
    latencyMs: number;
    markdown: string;
  }> = [];

  for (const evaluationCase of evaluationCases) {
    const startedAt = Date.now();
    const reused = reusedResults?.find(
      (result) => result.case.id === evaluationCase.id
    );
    if (
      reusedResults &&
      (!reused ||
        JSON.stringify(reused.case) !== JSON.stringify(evaluationCase))
    ) {
      throw new Error(
        `Dossier input does not match frozen case ${evaluationCase.id}`
      );
    }
    let content: Record<string, unknown>;
    if (reused) {
      const calls: Array<{
        estimated_cost_usd: number | null;
        model: string;
        stage: string;
      }> = [];
      const personalized = await runCompanySnapshotPersonalization({
        companyName: evaluationCase.companyName,
        preferredLocale: "ko",
        reason: evaluationCase.reason,
        talentContext: evaluationCase.talentContext,
        content: reused.content,
        onUsage: (call) => calls.push(call),
      });
      const cost = calls.reduce(
        (sum, call) => sum + (call.estimated_cost_usd ?? 0),
        0
      );
      content = {
        ...reused.content,
        personalized,
        metadata: {
          evaluation_mode: "personalization_only",
          reused_dossier: dossierRun,
          costs_usd: { llm: cost, total: cost, llm_calls: calls, exa: 0 },
        },
      };
    } else {
      content = await runCompanySnapshotResearch({
        companyDbId: null,
        companyName: evaluationCase.companyName,
        preferredLocale: "ko",
        reason: evaluationCase.reason,
        talentContext: evaluationCase.talentContext,
      });
    }
    const latencyMs = Date.now() - startedAt;
    const markdown = buildCompanySnapshotMarkdown({
      companyName: evaluationCase.companyName,
      content,
      includePersonalized: true,
      preferredLocale: "ko",
    });
    results.push({ case: evaluationCase, content, latencyMs, markdown });
    process.stdout.write(
      `${evaluationCase.id} ${evaluationCase.companyName}: ${latencyMs}ms\n`
    );
  }

  const createdAt = new Date().toISOString();
  const report = [
    "# Career company research raw run",
    "",
    `- Created at: ${createdAt}`,
    `- Dataset: ${datasetVersion}`,
    `- Research model: ${dossierRun ? "reused dossier" : CAREER_LLM_CONFIG.companySnapshotResearch.primaryModel}`,
    `- Personalization model: ${CAREER_LLM_CONFIG.companySnapshotPersonalization.primaryModel}`,
    "- Inputs: public company names plus synthetic reason and talent context",
    "",
    ...results.flatMap((result) => [
      `# ${result.case.id} · ${result.case.companyName}`,
      "",
      `- Wall time: ${result.latencyMs}ms`,
      `- Synthetic reason: ${result.case.reason}`,
      `- Synthetic talent context: ${result.case.talentContext}`,
      `- Cost metadata: ${JSON.stringify((result.content.metadata as any)?.costs_usd ?? null)}`,
      "",
      result.markdown,
      "",
      "---",
      "",
    ]),
  ].join("\n");

  const raw = {
    createdAt,
    datasetVersion,
    results,
  };
  const manifest = {
    task: "career-company-research",
    datasetVersion,
    runId: path.basename(absoluteOutputDirectory),
    createdAt,
    sourceRevision: gitValue(["rev-parse", "HEAD"]),
    sourceDirty: Boolean(gitValue(["status", "--porcelain"])),
    diffFingerprint: sha256(
      gitValue([
        "diff",
        "--",
        "src/lib/career/companySnapshot.ts",
        "src/lib/career/llm.ts",
      ])
    ),
    fixtureHash: sha256(evaluatedInputRaw),
    promptFingerprint: sha256(promptSource),
    primaryModel: CAREER_LLM_CONFIG.companySnapshotResearch.primaryModel,
    personalization: CAREER_LLM_CONFIG.companySnapshotPersonalization,
    reusedDossier: dossierRun
      ? { run: dossierRun, sha256: sha256(dossierRaw!) }
      : null,
    fallbackModel: CAREER_LLM_CONFIG.companySnapshotResearch.fallbackModel,
    provider: getLlmChatProviderForModel(
      CAREER_LLM_CONFIG.companySnapshotResearch.primaryModel
    ),
    reasoning: {
      researchDecision: "low",
      finalSynthesis: "low when repair search is used",
      personalization:
        CAREER_LLM_CONFIG.companySnapshotPersonalization.reasoningEffort,
    },
    search: {
      provider: "exa",
      initialType: "deep",
      initialCalls: 1,
      maximumRepairCalls: 3,
      maximumResultsPerCall: 10,
      maxAgeHours: null,
      clientTimeoutMs: null,
    },
    latencyMs: results.map((result) => ({
      caseId: result.case.id,
      value: result.latencyMs,
    })),
    rawArtifact: "raw.json",
    renderedArtifact: "report.md",
  };

  await Promise.all([
    writePrivateFile(
      path.join(absoluteOutputDirectory, "raw.json"),
      `${JSON.stringify(raw, null, 2)}\n`
    ),
    writePrivateFile(path.join(absoluteOutputDirectory, "report.md"), report),
    writePrivateFile(
      path.join(absoluteOutputDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    ),
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
