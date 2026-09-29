import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { config } from "dotenv";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, "..");
const TASK_ROOT = path.join(
  REPO_ROOT,
  "docs/evaluation/company-side-background-result-writing"
);
const DEFAULT_FIXTURE_PATH = path.join(TASK_ROOT, "private/current-v1.json");
const RUNS_ROOT = path.join(TASK_ROOT, "runs");
const CAPTURE_SCRIPT = path.join(
  WORKSPACE_ROOT,
  "harper_worker/scripts/capture_company_background_result_eval.py"
);

config({ path: path.join(REPO_ROOT, ".env.local"), quiet: true });

type Fixture = {
  candidates: Array<{
    presentation?: {
      headline?: string | null;
      name?: string | null;
      summary?: string | null;
    };
    reason?: string | null;
    roleId: string;
    roleName?: string | null;
    talentId: string;
  }>;
  companyName?: string | null;
  companyUserId: string;
  conversation: {
    company_workspace_id: string;
    created_at: string;
    id: string;
    last_message_at: string | null;
    last_message_id: number | null;
    metadata: Record<string, unknown>;
    role_id: string;
    summary_cursor_message_id: number | null;
    title: string | null;
    updated_at: string;
  };
  conversationMessages: Array<{
    content: string;
    id: number;
    role: "assistant" | "user";
  }>;
  datasetVersion: string;
  roles: Array<{
    automaticSearchEnabled: boolean;
    id: string;
    name: string;
  }>;
  runStatus: string;
  schemaVersion: number;
  source?: Record<string, unknown>;
  workspaceId: string;
};

type ModelResult = {
  durationMs: number;
  error?: string;
  estimatedCostUsd?: number | null;
  model: string;
  output?: string;
  provider: string;
  providerReportedCostUsd?: number | null;
  responseModel?: string | null;
  usage?: Record<string, unknown>;
};

const MODELS = [
  { label: "GPT-5.6 Terra", model: "gpt-5.6-terra", provider: "OpenAI" },
  { label: "Claude Sonnet 5", model: "claude-sonnet-5", provider: "Anthropic" },
  {
    label: "GLM 5.3 Flash",
    model: "z-ai/glm-5.3-flash",
    provider: "OpenRouter",
  },
  {
    label: "Muse Spark 1.3",
    model: "meta/muse-spark-1.3",
    provider: "OpenRouter",
  },
  {
    label: "MiMo V2.6 Pro",
    model: "xiaomi/mimo-v2.6-pro",
    provider: "OpenRouter",
  },
] as const;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function gitValue(args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  } catch {
    return "unavailable";
  }
}

function assistantText(response: any) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) =>
      typeof item?.text === "string"
        ? item.text
        : typeof item?.content === "string"
          ? item.content
          : ""
    )
    .join("")
    .trim();
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 4_000);
  return String(error ?? "Unknown error").slice(0, 4_000);
}

function candidateProfileUrl(args: {
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const baseUrl = String(
    process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://matchharper.com"
  ).replace(/\/$/, "");
  const params = new URLSearchParams({
    detailRoleId: args.roleId,
    detailWorkspaceId: args.workspaceId,
    orgId: args.workspaceId,
    roleId: args.roleId,
    source: "company_matching_result",
    tab: "pipeline",
    talentId: args.talentId,
    view: "pipeline",
  });
  return `${baseUrl}/org/role?${params.toString()}`;
}

async function privateWrite(filePath: string, value: string) {
  await writeFile(filePath, value, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
}

async function captureFixture(runId: string, fixturePath: string) {
  const { stdout, stderr } = await execFileAsync(
    "python3",
    [CAPTURE_SCRIPT, "--run-id", runId, "--output", fixturePath],
    {
      cwd: path.join(WORKSPACE_ROOT, "harper_worker"),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    }
  );
  if (stderr.trim()) process.stderr.write(stderr);
  if (stdout.trim()) process.stderr.write(`${stdout.trim()}\n`);
}

async function main() {
  const fixturePath = path.resolve(
    argument("--fixture") ?? DEFAULT_FIXTURE_PATH
  );
  const runId = argument("--run-id");
  if (runId) await captureFixture(runId, fixturePath);

  const fixtureRaw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(fixtureRaw) as Fixture;
  if (fixture.schemaVersion !== 1) {
    throw new Error(`Unsupported fixture schema: ${fixture.schemaVersion}`);
  }
  if (!fixture.roles.length) throw new Error("Fixture has no Role");

  const [
    { createChatCompletionWithFallback, getLlmErrorMessage },
    { buildCompanyMatchingResultContext },
    { buildOrgAgentBackgroundResultMessages },
    { buildOrgAgentSystemPrompt },
    { estimateLlmUsageCost, extractLlmTokenUsage },
  ] = await Promise.all([
    import("@/lib/llm/llm"),
    import("@/lib/companyFirstSearch/resultContext"),
    import("@/lib/org/agent/backgroundResultPrompt"),
    import("@/lib/org/agent/prompts"),
    import("@/lib/llm/usageLogging"),
  ]);

  const resultText = buildCompanyMatchingResultContext({
    candidates: fixture.candidates.map((candidate) => ({
      headline: candidate.presentation?.headline ?? null,
      name: candidate.presentation?.name?.trim() || "이름 비공개",
      profileUrl: candidateProfileUrl({
        roleId: candidate.roleId,
        talentId: candidate.talentId,
        workspaceId: fixture.workspaceId,
      }),
      reason: String(candidate.reason ?? "").trim(),
      roleId: candidate.roleId,
      roleName: candidate.roleName?.trim() || "Role",
      summary: candidate.presentation?.summary ?? null,
    })),
    roles: fixture.roles,
    runStatus: fixture.runStatus,
  });
  const requestMessage = fixture.conversationMessages.at(-1);
  if (!requestMessage?.content.trim()) {
    throw new Error("Fixture has no triggering company message");
  }
  const systemPrompt = buildOrgAgentSystemPrompt({ surface: "chat" });
  const messages = buildOrgAgentBackgroundResultMessages({
    companyName: fixture.companyName?.trim() || "현재 회사",
    requestMessage: requestMessage.content,
    resultText,
    roleId: fixture.roles[0]!.id,
    roleName: fixture.roles[0]!.name,
    systemPrompt,
  });

  const compareOne = async (entry: (typeof MODELS)[number]) => {
    const startedAt = performance.now();
    try {
      const completion = await createChatCompletionWithFallback({
        buildRequest: () => ({
          max_tokens: 2_000,
          messages,
          ...(entry.provider === "OpenRouter"
            ? {
                provider: {
                  allow_fallbacks: false,
                  data_collection: "deny",
                  sort: "price",
                },
              }
            : {}),
          temperature: 0.3,
        }),
        chatCompletionReasoning: { reasoningEffort: "xhigh" },
        debugLabel: `evaluation/company-side-background-result-writing:${entry.model}`,
        model: entry.model,
        openAIResponses: { reasoningEffort: "xhigh" },
        signal: AbortSignal.timeout(240_000),
      });
      const output = assistantText(completion.response);
      if (!output) throw new Error("Model returned an empty answer");
      const usage = extractLlmTokenUsage(completion.response);
      const estimatedCost = estimateLlmUsageCost(completion.model, usage);
      const providerCost = Number(completion.response?.usage?.cost);
      return {
        durationMs: Math.round(performance.now() - startedAt),
        estimatedCostUsd: estimatedCost?.estimatedCostUsd ?? null,
        model: entry.model,
        output,
        provider: entry.provider,
        providerReportedCostUsd: Number.isFinite(providerCost)
          ? providerCost
          : null,
        responseModel: String(completion.response?.model ?? "").trim() || null,
        usage,
      } satisfies ModelResult;
    } catch (error) {
      return {
        durationMs: Math.round(performance.now() - startedAt),
        error: getLlmErrorMessage(error) || errorText(error),
        model: entry.model,
        provider: entry.provider,
      } satisfies ModelResult;
    }
  };

  const startedAt = new Date();
  const results = await Promise.all(MODELS.map(compareOne));
  const completedAt = new Date();
  const gitStatus = gitValue(["status", "--porcelain"]);
  const gitDiff = gitValue(["diff", "--binary", "HEAD"]);
  const runSlug = timestampSlug(startedAt);
  await mkdir(RUNS_ROOT, { recursive: true, mode: 0o700 });
  await chmod(RUNS_ROOT, 0o700);

  const artifact = {
    task: "company-side-background-result-writing",
    datasetVersion: fixture.datasetVersion,
    runId: runSlug,
    createdAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    sourceRevision: gitValue(["rev-parse", "HEAD"]),
    sourceDirty: gitStatus !== "",
    sourceDiffFingerprint: sha256(gitDiff),
    promptFingerprint: sha256(JSON.stringify(messages)),
    fixtureSha256: sha256(fixtureRaw),
    fixtureSource: fixture.source ?? null,
    generation: {
      maxTokens: 2_000,
      reasoning: "xhigh where supported",
      temperature: 0.3,
      toolUse: false,
      timeoutMs: 240_000,
      openRouterDataCollection: "deny",
      fallbacks: false,
    },
    resultContext: resultText,
    messages,
    results,
  };

  const reportLines = [
    "# Company-side background result model comparison",
    "",
    `- Run: \`${runSlug}\``,
    `- Dataset: \`${fixture.datasetVersion}\``,
    `- Prompt fingerprint: \`${artifact.promptFingerprint}\``,
    `- Wall time: ${((artifact.durationMs || 0) / 1_000).toFixed(1)}s`,
    "",
    ...MODELS.flatMap((entry) => {
      const result = results.find((item) => item.model === entry.model)!;
      const usage = result.usage as
        | { inputTokens?: number | null; outputTokens?: number | null }
        | undefined;
      return [
        `## ${entry.label}`,
        "",
        result.error
          ? `**Error:** ${result.error}`
          : [
              result.output,
              "",
              `_${(result.durationMs / 1_000).toFixed(1)}s · input ${usage?.inputTokens ?? "?"} · output ${usage?.outputTokens ?? "?"} · estimated $${(result.estimatedCostUsd ?? 0).toFixed(6)}${result.providerReportedCostUsd !== null && result.providerReportedCostUsd !== undefined ? ` · provider $${result.providerReportedCostUsd.toFixed(6)}` : ""}_`,
            ].join("\n"),
        "",
      ];
    }),
  ];
  const jsonPath = path.join(RUNS_ROOT, `${runSlug}.json`);
  const markdownPath = path.join(RUNS_ROOT, `${runSlug}.md`);
  await Promise.all([
    privateWrite(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`),
    privateWrite(markdownPath, `${reportLines.join("\n")}\n`),
  ]);
  process.stdout.write(`${reportLines.join("\n")}\n`);
  process.stderr.write(`\nJSON: ${jsonPath}\nMarkdown: ${markdownPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${errorText(error)}\n`);
  process.exitCode = 1;
});
