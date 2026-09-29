import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  buildCompanyResearchTalentContext,
  buildCompanySnapshotMarkdown,
  runCompanySnapshotResearch,
  runCompanySnapshotReportFromCachedResearch,
} from "@/lib/career/companySnapshot";
import { CAREER_LLM_CONFIG } from "@/lib/career/llm";
import { getLlmChatProviderForModel } from "@/lib/llm/llm";
import type { Database } from "@/types/database.types";

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

async function captureAuthorizedTalentContext(args: {
  companyName: string;
  email: string;
  reason: string;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are required");
  const admin = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method !== "GET" && method !== "HEAD") {
          throw new Error("Evaluation capture permits read-only GET/HEAD requests");
        }
        return fetch(input, { ...init, signal: AbortSignal.timeout(50_000) });
      },
    },
  });
  // GET RPCs execute read-only. Preserve the runtime's semantic Memory reader.
  const rpc = admin.rpc.bind(admin);
  admin.rpc = (fn, params, options) =>
    rpc(fn, params, { ...options, get: true });
  const { data, error } = await admin
    .from("talent_users")
    .select("user_id")
    .eq("email", args.email)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Talent not found");
  const context = await buildCompanyResearchTalentContext({
    admin,
    companyName: args.companyName,
    reason: args.reason,
    userId: data.user_id,
  });
  if (!context.trim()) throw new Error("Talent context capture returned empty");
  return context;
}

async function main() {
  const outputDirectory = readArgument("--output-dir");
  const requestedCaseId = readArgument("--case-id");
  const adHocCompanyName = readArgument("--company-name");
  const adHocReason = readArgument("--reason") ?? "";
  const talentEmail = readArgument("--talent-email");
  let adHocTalentContext = readArgument("--talent-context") ?? "";
  if (!outputDirectory) {
    throw new Error("--output-dir is required");
  }

  const repositoryRoot = process.cwd();
  const absoluteOutputDirectory = path.resolve(repositoryRoot, outputDirectory);
  let capturedAt: string | null = null;
  if (talentEmail) {
    if (!adHocCompanyName || adHocTalentContext || requestedCaseId) {
      throw new Error("--talent-email requires --company-name and cannot override a frozen case or --talent-context");
    }
    const runsRoot = path.join(repositoryRoot, "docs/evaluation/career-company-research/runs");
    if (!absoluteOutputDirectory.startsWith(`${runsRoot}${path.sep}`)) {
      throw new Error("Production-context runs must be saved in the task's ignored runs directory");
    }
    adHocTalentContext = await captureAuthorizedTalentContext({
      companyName: adHocCompanyName,
      email: talentEmail,
      reason: adHocReason,
    });
    capturedAt = new Date().toISOString();
  }
  const fixturePath = path.resolve(
    repositoryRoot,
    readArgument("--fixture") ??
      "docs/evaluation/career-company-research/cases-v2.json"
  );
  const promptSourceFiles = [
    "src/lib/career/companySnapshot.ts",
    "src/lib/career/prompts/companyResearchExample.ts",
  ];
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
  const datasetVersion = talentEmail
    ? "authorized-production-ad-hoc-v1"
    : adHocCase ? "ad-hoc-v1" : fixture.datasetVersion;
  const evaluatedInputRaw = adHocCase
    ? JSON.stringify({ cases: [adHocCase], datasetVersion }, null, 2)
    : fixtureRaw;
  if (evaluationCases.length === 0) {
    throw new Error(`Unknown --case-id: ${requestedCaseId}`);
  }
  const promptSources = await Promise.all(
    promptSourceFiles.map(async (file) => ({
      file,
      content: await readFile(path.join(repositoryRoot, file), "utf8"),
    }))
  );
  await mkdir(absoluteOutputDirectory, { recursive: true, mode: 0o700 });
  await chmod(absoluteOutputDirectory, 0o700);
  await writePrivateFile(
    path.join(absoluteOutputDirectory, "input.json"),
    `${evaluatedInputRaw}\n`
  );

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
      const privateReport = await runCompanySnapshotReportFromCachedResearch({
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
        // A failed new generation must never display the previous private article.
        private_markdown: "",
        full_markdown: "",
        personalized: undefined,
        ...privateReport,
        metadata: {
          ...((privateReport.metadata as Record<string, unknown>) ?? {}),
          evaluation_mode: "cached_base_research",
          reused_dossier: dossierRun,
          observed_llm_cost_usd: cost,
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
    const markdown = content.error ? "" : buildCompanySnapshotMarkdown({
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
    `- Writer model: ${CAREER_LLM_CONFIG.companySnapshotResearch.primaryModel}`,
    `- Base research: ${dossierRun ? "reused cached evidence" : "three parallel Exa searches"}`,
    `- Inputs: public company names plus ${talentEmail ? "explicitly authorized production Profile/Brief/Memory" : "supplied evaluation context"}`,
    "",
    ...results.flatMap((result) => [
      `# ${result.case.id} · ${result.case.companyName}`,
      "",
      `- Wall time: ${result.latencyMs}ms`,
      ...(result.content.error ? [`- Generation error: ${result.content.error} (${result.content.reason ?? "unspecified"})`] : []),
      `- Question: ${result.case.reason}`,
      `- Talent context: ${result.case.talentContext}`,
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
        "src/lib/career/prompts/companyResearchExample.ts",
        "src/lib/career/llm.ts",
      ])
    ),
    fixtureHash: sha256(evaluatedInputRaw),
    promptFingerprint: sha256(JSON.stringify(promptSources)),
    promptSourceFiles,
    primaryModel: CAREER_LLM_CONFIG.companySnapshotResearch.primaryModel,
    reusedDossier: dossierRun
      ? { run: dossierRun, sha256: sha256(dossierRaw!) }
      : null,
    fallbackModel: null,
    provider: getLlmChatProviderForModel(
      CAREER_LLM_CONFIG.companySnapshotResearch.primaryModel
    ),
    ...(talentEmail ? {
      dataProvenance: {
        kind: "authorized_production_context",
        capturedAt,
        authorization: "Explicit user request to run research_company with this account's data",
        capture: "Read-only Supabase GET/HEAD; existing Profile + full Brief + relevant Memory builder",
        inputArtifact: "input.json",
        providers: [
          { name: "OpenAI", endpoint: "https://api.openai.com/v1/responses", store: false, accountDataCollection: "not verified by this runner" },
          { name: "OpenAI", endpoint: "https://api.openai.com/v1/embeddings", purpose: "Memory query embedding if needed", accountDataCollection: "not verified by this runner" },
          { name: "Exa", endpoint: "https://api.exa.ai/search", contextInQueries: "model-selected, as authorized", accountDataCollection: "not verified by this runner" },
        ],
      },
    } : {}),
    reasoning: {
      terraWriter: CAREER_LLM_CONFIG.companySnapshotResearch.reasoningEffort,
    },
    search: {
      provider: "exa",
      initialType: "auto",
      initialCalls: 3,
      initialResultsPerCall: 6,
      maximumAgentCalls: 6,
      maximumAgentResultsPerCall: 10,
      baseMaxAgeHours: 24,
      agentMaxAgeHours: "model-selected",
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
  if (results.some((result) => result.content.error)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
