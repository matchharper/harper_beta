import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  createSupabaseCompanyIdentityLookup,
  resolveTalentExperienceCompanies,
  type TalentExperienceCompanyResolutionInput,
} from "@/lib/talentOnboarding/companyResolution";
import type { Database } from "@/types/database.types";

type CapturedExperience = {
  companyId: string | null;
  companyLink: string | null;
  companyLocation: string | null;
  companyName: string;
  experienceId: string;
};

type CapturedCase = {
  caseId: string;
  experiences: CapturedExperience[];
  sourceUserId: string;
};

type PrivateFixture = {
  capturedAt: string;
  datasetVersion: string;
  eligibleResumeCount: number;
  cases: CapturedCase[];
  seed: string;
};

type GoldLabel = {
  caseId: string;
  expectedCompanyDbId: number | null;
  experienceId: string;
  outcome: "company_db_match" | "no_company_db_match" | "exclude";
};

type GoldFile = {
  datasetVersion: string;
  labels: GoldLabel[];
};

type EvaluationStrategy = "candidate-only" | "db-only" | "exa" | "glm";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function evaluationStrategy(value: string | undefined): EvaluationStrategy {
  if (
    value === "candidate-only" ||
    value === "db-only" ||
    value === "exa" ||
    value === "glm"
  ) {
    return value;
  }
  if (value) throw new Error(`Unsupported --strategy: ${value}`);
  return "glm";
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

function requiredEnv(name: string) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseCompanyId(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createReadOnlyAdmin() {
  const guardedFetch: typeof fetch = async (input, init) => {
    const method = String(init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      throw new Error(`Read-only evaluation blocked ${method} request`);
    }
    const timeoutSignal = AbortSignal.timeout(10_000);
    return fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal,
    });
  };

  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: guardedFetch },
    }
  );
}

async function privateWrite(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(filePath, 0o600);
}

async function captureFixture(args: {
  admin: ReturnType<typeof createReadOnlyAdmin>;
  count: number;
  datasetVersion: string;
  excludedUserIds: Set<string>;
  fixturePath: string;
  seed: string;
}) {
  const userIds: string[] = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await args.admin
      .from("talent_users")
      .select("user_id")
      .not("resume_text", "is", null)
      .neq("resume_text", "")
      .is("deleted_at", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((row) => row.user_id).filter(Boolean);
    userIds.push(...page);
    if (page.length < pageSize) break;
  }

  const randomizedIds = userIds
    .filter((userId) => !args.excludedUserIds.has(userId))
    .sort((left, right) =>
      sha256(`${args.seed}:${left}`).localeCompare(sha256(`${args.seed}:${right}`))
    );
  const capturedCases: CapturedCase[] = [];
  const candidateBatchSize = 50;

  for (
    let offset = 0;
    offset < randomizedIds.length && capturedCases.length < args.count;
    offset += candidateBatchSize
  ) {
    const candidateIds = randomizedIds.slice(offset, offset + candidateBatchSize);
    const { data, error } = await args.admin
      .from("talent_experiences")
      .select(
        "id,talent_id,company_id,company_link,company_location,company_name,start_date,end_date"
      )
      .in("talent_id", candidateIds);
    if (error) throw new Error(error.message);

    const rowsByUser = new Map<string, NonNullable<typeof data>>();
    for (const row of data ?? []) {
      if (!String(row.company_name ?? "").trim()) continue;
      const rows = rowsByUser.get(row.talent_id) ?? [];
      rows.push(row);
      rowsByUser.set(row.talent_id, rows);
    }

    for (const userId of candidateIds) {
      if (capturedCases.length >= args.count) break;
      const rows = (rowsByUser.get(userId) ?? [])
        .sort((left, right) => {
          const leftDate = left.end_date ?? left.start_date ?? "9999-12-31";
          const rightDate = right.end_date ?? right.start_date ?? "9999-12-31";
          return rightDate.localeCompare(leftDate);
        })
        .slice(0, 10);
      if (rows.length === 0) continue;

      const caseIndex = capturedCases.length + 1;
      capturedCases.push({
        caseId: `RCR${String(caseIndex).padStart(3, "0")}`,
        experiences: rows.map((row, experienceIndex) => ({
          companyId: row.company_id,
          companyLink: row.company_link,
          companyLocation: row.company_location,
          companyName: String(row.company_name).trim(),
          experienceId: `E${String(experienceIndex + 1).padStart(2, "0")}`,
        })),
        sourceUserId: userId,
      });
    }
  }

  if (capturedCases.length !== args.count) {
    throw new Error(
      `Only found ${capturedCases.length} eligible resumes with experiences`
    );
  }

  const fixture: PrivateFixture = {
    capturedAt: new Date().toISOString(),
    datasetVersion: args.datasetVersion,
    eligibleResumeCount: userIds.length,
    cases: capturedCases,
    seed: args.seed,
  };
  await privateWrite(args.fixturePath, fixture);
  return fixture;
}

function resolutionInput(
  experience: CapturedExperience
): TalentExperienceCompanyResolutionInput {
  return {
    company_id: null,
    company_link: null,
    company_location: experience.companyLocation,
    company_logo: null,
    company_name: experience.companyName,
    linkedin_company_id: null,
  };
}

async function referenceCompanyDbId(args: {
  experience: CapturedExperience;
  lookup: ReturnType<typeof createSupabaseCompanyIdentityLookup>;
}) {
  if (args.experience.companyLink) {
    const result = await resolveTalentExperienceCompanies({
      enableExternalSearch: false,
      enableLlmResolution: false,
      experiences: [
        {
          ...resolutionInput(args.experience),
          company_link: args.experience.companyLink,
        },
      ],
      lookup: args.lookup,
    });
    if (result.experiences[0].company_id) {
      return { companyDbId: result.experiences[0].company_id, source: "saved_link" };
    }
  }

  const savedId = parseCompanyId(args.experience.companyId);
  if (savedId) {
    const rows = await args.lookup.findById(savedId);
    if (rows.length === 1) {
      return { companyDbId: savedId, source: "saved_internal_id" };
    }
  }

  return { companyDbId: null, source: "none" };
}

function scoreGold(args: {
  gold: GoldFile | null;
  outputs: Array<{
    caseId: string;
    experiences: Array<{ companyDbId: number | null; experienceId: string }>;
  }>;
}) {
  if (!args.gold) return null;
  const outputByKey = new Map(
    args.outputs.flatMap((item) =>
      item.experiences.map((experience) => [
        `${item.caseId}:${experience.experienceId}`,
        experience.companyDbId,
      ] as const)
    )
  );
  let correct = 0;
  let expectedMatches = 0;
  let falseLinks = 0;
  let labeled = 0;
  let predictedLinks = 0;
  let trueLinks = 0;

  for (const label of args.gold.labels) {
    if (label.outcome === "exclude") continue;
    labeled += 1;
    const predicted = outputByKey.get(`${label.caseId}:${label.experienceId}`) ?? null;
    const expected =
      label.outcome === "company_db_match" ? label.expectedCompanyDbId : null;
    if (expected !== null) expectedMatches += 1;
    if (predicted !== null) predictedLinks += 1;
    if (predicted === expected) correct += 1;
    if (predicted !== null && predicted === expected) trueLinks += 1;
    if (predicted !== null && predicted !== expected) falseLinks += 1;
  }

  return {
    exactAccuracy: labeled > 0 ? correct / labeled : null,
    falseLinks,
    labeled,
    precision: predictedLinks > 0 ? trueLinks / predictedLinks : null,
    recall: expectedMatches > 0 ? trueLinks / expectedMatches : null,
  };
}

async function main() {
  const repositoryRoot = process.cwd();
  const captureCount = positiveInteger(argument("--capture-count"), 5);
  const maxExternalSearches = nonNegativeInteger(argument("--max-exa"), 3);
  const strategy = evaluationStrategy(argument("--strategy"));
  const datasetVersion = argument("--dataset-version") ?? "private-pilot-v1";
  const seed = argument("--seed") ?? "resume-company-resolution-v1";
  const fixturePath = path.resolve(
    repositoryRoot,
    argument("--fixture") ??
      "docs/evaluation/resume-company-resolution/private/pilot-v1.json"
  );
  const outputDirectory = path.resolve(
    repositoryRoot,
    argument("--output-dir") ??
      `docs/evaluation/resume-company-resolution/runs/${Date.now()}`
  );
  const goldPath = argument("--gold")
    ? path.resolve(repositoryRoot, argument("--gold")!)
    : null;
  const excludeFixturePath = argument("--exclude-fixture")
    ? path.resolve(repositoryRoot, argument("--exclude-fixture")!)
    : null;
  await mkdir(path.dirname(fixturePath), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(fixturePath), 0o700);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await chmod(outputDirectory, 0o700);

  const admin = createReadOnlyAdmin();
  const excludedUserIds = new Set<string>();
  if (excludeFixturePath) {
    const excludedFixture = JSON.parse(
      await readFile(excludeFixturePath, "utf8")
    ) as PrivateFixture;
    for (const item of excludedFixture.cases) {
      excludedUserIds.add(item.sourceUserId);
    }
  }
  let fixture: PrivateFixture;
  try {
    fixture = JSON.parse(await readFile(fixturePath, "utf8")) as PrivateFixture;
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    fixture = await captureFixture({
      admin,
      count: captureCount,
      datasetVersion,
      excludedUserIds,
      fixturePath,
      seed,
    });
  }

  const lookup = createSupabaseCompanyIdentityLookup(admin);
  const outputs: Array<{
    caseId: string;
    experiences: Array<{
      companyDbId: number | null;
      companyName: string;
      experienceId: string;
      llmCandidateIds: number[];
      matchedBy: string;
      referenceCompanyDbId: number | null;
      referenceSource: string;
    }>;
    summary: Awaited<ReturnType<typeof resolveTalentExperienceCompanies>>["summary"];
  }> = [];

  const runStartedAt = Date.now();
  for (const evaluationCase of fixture.cases) {
    const inputs = evaluationCase.experiences.map(resolutionInput);
    const resolution = await resolveTalentExperienceCompanies({
      admin,
      enableExternalSearch: strategy === "exa",
      enableLlmResolution: strategy === "glm" || strategy === "candidate-only",
      experiences: inputs,
      judge:
        strategy === "candidate-only"
          ? {
              resolve: async (cases) => ({
                costUsd: 0,
                inputTokens: 0,
                latencyMs: 0,
                matches: new Map(cases.map((item) => [item.key, null])),
                model: "candidate-only",
                outputTokens: 0,
              }),
            }
          : undefined,
      lookup,
      maxExternalSearches,
    });
    const references = await Promise.all(
      evaluationCase.experiences.map((experience) =>
        referenceCompanyDbId({ experience, lookup })
      )
    );
    outputs.push({
      caseId: evaluationCase.caseId,
      experiences: evaluationCase.experiences.map((experience, index) => ({
        companyDbId: resolution.experiences[index].company_id,
        companyName: experience.companyName,
        experienceId: experience.experienceId,
        llmCandidateIds: resolution.diagnostics[index].llmCandidateIds,
        matchedBy: resolution.diagnostics[index].matchedBy,
        referenceCompanyDbId: references[index].companyDbId,
        referenceSource: references[index].source,
      })),
      summary: resolution.summary,
    });
    process.stdout.write(
      `${evaluationCase.caseId}: ${resolution.summary.matched}/${resolution.summary.total} matched, ${resolution.summary.wallTimeMs}ms, $${(resolution.summary.exaCostUsd + resolution.summary.llmCostUsd).toFixed(6)}\n`
    );
  }

  const gold = goldPath
    ? (JSON.parse(await readFile(goldPath, "utf8")) as GoldFile)
    : null;
  const metrics = scoreGold({ gold, outputs });
  const aggregate = {
    cases: outputs.length,
    estimatedCostUsd: outputs.reduce(
      (sum, item) =>
        sum + item.summary.exaCostUsd + item.summary.llmCostUsd,
      0
    ),
    exactNameMatches: outputs.reduce(
      (sum, item) =>
        sum +
        item.experiences.filter((experience) => experience.matchedBy === "exact_name")
          .length,
      0
    ),
    exaMatches: outputs.reduce(
      (sum, item) =>
        sum +
        item.experiences.filter((experience) =>
          experience.matchedBy.startsWith("exa_")
        ).length,
      0
    ),
    exaSearches: outputs.reduce((sum, item) => sum + item.summary.exaSearches, 0),
    experiences: outputs.reduce((sum, item) => sum + item.summary.total, 0),
    matched: outputs.reduce((sum, item) => sum + item.summary.matched, 0),
    llmCalls: outputs.reduce((sum, item) => sum + item.summary.llmCalls, 0),
    llmCostUsd: outputs.reduce(
      (sum, item) => sum + item.summary.llmCostUsd,
      0
    ),
    llmInputTokens: outputs.reduce(
      (sum, item) => sum + item.summary.llmInputTokens,
      0
    ),
    llmMatches: outputs.reduce(
      (sum, item) =>
        sum +
        item.experiences.filter(
          (experience) => experience.matchedBy === "glm_candidate_selection"
        ).length,
      0
    ),
    llmOutputTokens: outputs.reduce(
      (sum, item) => sum + item.summary.llmOutputTokens,
      0
    ),
    wallTimeMs: Date.now() - runStartedAt,
  };
  const fixtureRaw = await readFile(fixturePath);
  const sourcePaths = [
    "src/lib/talentOnboarding/companyResolution.ts",
    "scripts/evalResumeCompanyResolution.ts",
  ];
  const sourceFingerprint = sha256(
    (
      await Promise.all(
        sourcePaths.map((filePath) => readFile(path.join(repositoryRoot, filePath)))
      )
    ).map((buffer) => sha256(buffer)).join(":")
  );
  const createdAt = new Date().toISOString();
  const manifest = {
    task: "resume-company-resolution",
    datasetVersion: fixture.datasetVersion,
    runId: path.basename(outputDirectory),
    createdAt,
    sourceRevision: gitValue(["rev-parse", "HEAD"]),
    sourceDirty: Boolean(gitValue(["status", "--porcelain"])),
    sourceFingerprint,
    fixtureHash: sha256(fixtureRaw),
    goldHash: goldPath ? sha256(await readFile(goldPath)) : null,
    privacy: {
      databaseAccess: "Supabase REST GET/HEAD only; write methods blocked",
      externalProviderInput:
        "company name/location and up to eight shortlisted company_db identities; no user id or resume text",
      resumeTextLoaded: false,
    },
    resolver: {
      externalProvider: strategy === "exa" ? "Exa fast company search" : null,
      llm: strategy === "glm" ? "z-ai/glm-5.3-flash via OpenRouter" : null,
      llmCallPattern:
        strategy === "glm"
          ? "one multi-candidate selection call, then two parallel conservative audit calls when proposals exist; both audits must approve"
          : null,
      llmReasoningEffort: strategy === "glm" ? "high" : null,
      maxExternalSearchesPerResume:
        strategy === "exa" ? maxExternalSearches : 0,
      resultsPerSearch: strategy === "exa" ? 5 : 0,
      strategy,
    },
    aggregate,
    metrics,
  };
  await privateWrite(path.join(outputDirectory, "raw.json"), {
    createdAt,
    fixture,
    outputs,
  });
  await privateWrite(path.join(outputDirectory, "manifest.json"), manifest);
  await privateWrite(path.join(outputDirectory, "metrics.json"), {
    aggregate,
    metrics,
  });
  process.stdout.write(`${JSON.stringify({ aggregate, metrics }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
