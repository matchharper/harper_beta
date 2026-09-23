import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type JsonRecord = Record<string, unknown>;
type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type EvalCase = {
  id: string;
  opportunityMention: { label: string; roleId: string };
  recentRecommendedOpportunitiesText: string;
  structuredProfileText: string;
  talentContextSection: string;
  title: string;
  toolInput: JsonRecord;
  toolResult: JsonRecord;
  userMessage: string;
};

type EvalDataset = {
  capturedAt: string;
  cases: EvalCase[];
  datasetVersion: string;
  locale: string;
  task: string;
};

type PromptVariant = {
  id: string;
  instruction?: string | null;
  instructionSource?: "production_common";
  title: string;
};

type PromptVariants = {
  datasetVersion: string;
  task: string;
  variants: PromptVariant[];
};

type ProviderMessage = {
  content: string | null;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: Array<{
    function: { arguments: string; name: string };
    id: string;
    type: "function";
  }>;
};

const TASK_DIR = path.resolve(
  process.cwd(),
  "docs/evaluation/career-request-intro-reply"
);
const CASES_PATH = path.join(TASK_DIR, "cases-v1.json");
const GOLD_PATH = path.join(TASK_DIR, "gold-v1.json");
const VARIANTS_PATH = path.join(TASK_DIR, "prompt-variants-v1.json");
const RUNS_DIR = path.join(TASK_DIR, "runs");
const MAX_OUTPUT_TOKENS = 1_500;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function writePrivate(filePath: string, content: string) {
  writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function writePrivateJson(filePath: string, value: unknown) {
  writePrivate(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function cliValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function reasoningEffort(value: string | undefined): ReasoningEffort {
  const normalized = value?.trim().toLowerCase() ?? "high";
  assert(
    ["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(
      normalized
    ),
    `invalid reasoning effort: ${value}`
  );
  return normalized as ReasoningEffort;
}

function gitOutput(args: string[]) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

function providerText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as JsonRecord;
      return typeof record.text === "string" ? [record.text] : [];
    })
    .join("\n")
    .trim();
}

function markdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function validateDataset(dataset: EvalDataset, variants: PromptVariants) {
  assert(dataset.task === "career-request-intro-reply", "unexpected task");
  assert(dataset.datasetVersion === "v1", "unexpected dataset version");
  assert(dataset.locale === "ko", "v1 locale must be ko");
  assert(dataset.cases.length === 1, "v1 must contain exactly one case");
  assert(variants.task === dataset.task, "variant task mismatch");
  assert(
    variants.datasetVersion === dataset.datasetVersion,
    "variant dataset version mismatch"
  );
  assert(variants.variants.length >= 2, "at least two variants are required");
  assert(
    new Set(variants.variants.map((item) => item.id)).size ===
      variants.variants.length,
    "variant IDs must be unique"
  );
  for (const evalCase of dataset.cases) {
    assert(evalCase.id, "case id is required");
    assert(evalCase.userMessage, `${evalCase.id}: userMessage is required`);
    assert(
      Object.keys(evalCase.toolResult).length > 0,
      `${evalCase.id}: toolResult is required`
    );
  }
}

async function main() {
  const dataset = readJson<EvalDataset>(CASES_PATH);
  const variants = readJson<PromptVariants>(VARIANTS_PATH);
  validateDataset(dataset, variants);
  JSON.parse(readFileSync(GOLD_PATH, "utf8"));

  if (process.argv.includes("--validate-only")) {
    process.stdout.write(
      `Validated ${dataset.cases.length} case and ${variants.variants.length} prompt variants.\n`
    );
    return;
  }

  const outputArg = cliValue("--output-dir");
  assert(outputArg, "--output-dir is required");
  const outputDir = path.resolve(process.cwd(), outputArg);
  assert(
    outputDir.startsWith(`${RUNS_DIR}${path.sep}`),
    `output directory must be inside ${RUNS_DIR}`
  );
  mkdirSync(outputDir, { mode: 0o700, recursive: true });
  chmodSync(outputDir, 0o700);
  assert(readdirSync(outputDir).length === 0, "output directory is not empty");

  const [
    conversationPlan,
    promptUtils,
    careerTools,
    llm,
    careerLlm,
    modelConfig,
    talentTools,
    mentionText,
    messageText,
  ] = await Promise.all([
    import("../src/lib/career/prompts/conversationPlan"),
    import("../src/lib/career/prompts/promptUtils"),
    import("../src/lib/career/llmTools"),
    import("../src/lib/llm/llm"),
    import("../src/lib/career/llm"),
    import("../src/lib/llm/modelConfig"),
    import("../src/lib/talentOnboarding/tools"),
    import("../src/lib/career/opportunityMentionText"),
    import("../src/lib/career/opportunityFeedbackNote"),
  ]);

  const selectedModel =
    cliValue("--model")?.trim() || modelConfig.OPENROUTER_GLM_53_FLASH_MODEL;
  const selectedReasoningEffort = reasoningEffort(
    cliValue("--reasoning-effort")
  );
  const selectedOpenAIReasoningEffort =
    selectedReasoningEffort === "minimal"
      ? ("low" as const)
      : selectedReasoningEffort;
  const selectedProvider = llm.getLlmChatProviderForModel(selectedModel);
  const selectedTools = careerTools.resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: true,
    responseLocale: dataset.locale,
  });
  const selectedVariantIds = new Set(
    (cliValue("--variants") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const variantsToRun = selectedVariantIds.size
    ? variants.variants.filter((item) => selectedVariantIds.has(item.id))
    : variants.variants;
  assert(variantsToRun.length > 0, "no matching variants selected");

  const outputs: Array<{
    instruction: string | null;
    response: string;
    title: string;
    variantId: string;
  }> = [];
  const promptFingerprints: string[] = [];

  for (const evalCase of dataset.cases) {
    const plan = conversationPlan.buildCareerConversationPromptPlan({
      channel: "chat",
      conversationMode: "default",
      currentPreferences: { preferredLocale: dataset.locale },
      isOnboardingDone: true,
      profile: { current_location: "서울" },
      recentRecommendedOpportunitiesText:
        evalCase.recentRecommendedOpportunitiesText,
      structuredProfileText: evalCase.structuredProfileText,
      talentContextSection: evalCase.talentContextSection,
      timeZone: "Asia/Seoul",
      toolNames: selectedTools.toolNames,
    });
    const systemInstructions = promptUtils.renderCareerPromptBlocks(
      plan.promptBlocks
    );
    const persistedUserMessage =
      mentionText.appendCareerOpportunityMentionMetadata(evalCase.userMessage, [
        evalCase.opportunityMention,
      ]);
    const formattedUserMessage =
      messageText.formatTalentMessageContentForLlmPrompt(
        {
          content: persistedUserMessage,
          createdAt: dataset.capturedAt,
          messageType: "chat",
        },
        {
          includeCreatedAt: true,
          preferredLocale: dataset.locale,
          timeZone: "Asia/Seoul",
        }
      );

    for (const variant of variantsToRun) {
      const instruction =
        variant.instructionSource === "production_common"
          ? talentTools.TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION
          : typeof variant.instruction === "string"
            ? variant.instruction.trim() || null
            : null;
      const toolCallId = `request_intro_${variant.id}`;
      const toolResult = {
        ...evalCase.toolResult,
        ...(instruction ? { assistantInstruction: instruction } : {}),
      };
      const continuationInstruction = [
        careerLlm.buildToolResultFollowupInstruction(dataset.locale),
        instruction
          ? [
              "Additional tool-result instruction for the final user-facing reply:",
              `- ${instruction}`,
            ].join("\n")
          : "",
        "No additional tools are callable for this turn. Answer now using the available conversation and tool results.",
      ]
        .filter(Boolean)
        .join("\n\n");
      const messages: ProviderMessage[] = [
        { content: systemInstructions, role: "system" },
        { content: formattedUserMessage, role: "user" },
        {
          content: null,
          role: "assistant",
          tool_calls: [
            {
              function: {
                arguments: JSON.stringify(evalCase.toolInput),
                name: "read_recommended_opportunities",
              },
              id: toolCallId,
              type: "function",
            },
          ],
        },
        {
          content: JSON.stringify(toolResult),
          role: "tool",
          tool_call_id: toolCallId,
        },
        { content: continuationInstruction, role: "user" },
      ];
      process.stdout.write(`Running ${evalCase.id}/${variant.id}...\n`);
      const completion = await llm.createChatCompletionWithFallback({
        buildRequest: () => ({
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          messages,
        }),
        ...(selectedProvider === "openrouter"
          ? {
              chatCompletionReasoning: {
                reasoningEffort: selectedReasoningEffort,
              },
            }
          : {}),
        debugLabel: `career-request-intro-reply:${evalCase.id}:${variant.id}`,
        model: selectedModel,
        ...(selectedProvider === "openai"
          ? {
              openAIResponses: {
                reasoningEffort: selectedOpenAIReasoningEffort,
              },
            }
          : {}),
      });
      const choice = completion.response?.choices?.[0];
      const response = providerText(choice?.message?.content);
      assert(response, `${variant.id}: provider returned empty content`);
      outputs.push({
        instruction,
        response,
        title: variant.title,
        variantId: variant.id,
      });
      const artifact = {
        case: { id: evalCase.id, title: evalCase.title },
        execution: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          model: selectedModel,
          provider: selectedProvider,
          reasoningEffort: selectedReasoningEffort,
          variantId: variant.id,
          variantTitle: variant.title,
        },
        messages,
        productionCommonInstruction:
          talentTools.TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION,
        providerResponse: completion.response,
        response,
        resolvedInstruction: instruction,
      };
      writePrivateJson(
        path.join(outputDir, `${evalCase.id}__${variant.id}.json`),
        artifact
      );
      promptFingerprints.push(sha256(JSON.stringify(messages)));
    }
  }

  const comparisonHeader = `| ${outputs
    .map((item) => markdownCell(item.title))
    .join(" | ")} |`;
  const comparisonDivider = `| ${outputs.map(() => "---").join(" | ")} |`;
  const comparisonOutputRow = `| ${outputs
    .map((item) => markdownCell(item.response))
    .join(" | ")} |`;
  const promptDetails = outputs
    .map((item) =>
      [
        `### ${item.title}`,
        "",
        `ID: \`${item.variantId}\``,
        "",
        item.instruction
          ? `\`\`\`text\n${item.instruction}\n\`\`\``
          : "추가 post-tool instruction 없음.",
      ].join("\n")
    )
    .join("\n\n");
  const comparison = [
    "# Request Intro reply prompt comparison",
    "",
    `- 생성 시각: ${new Date().toISOString()}`,
    `- 모델: \`${selectedModel}\``,
    `- reasoning: \`${selectedReasoningEffort}\``,
    `- 사용자 발화: ${dataset.cases[0]?.userMessage ?? ""}`,
    "- 고정 상태: 회사 Request Intro 수락·연결 완료, 14일 경과, 이후 회사 연락과 Talent relay 없음",
    "",
    comparisonHeader,
    comparisonDivider,
    comparisonOutputRow,
    "",
    "## Applied post-tool instructions",
    "",
    promptDetails,
    "",
    "## Review",
    "",
    "`gold-v1.json`을 기준으로 사람이 원문을 검토한다. 이 보고서는 자동으로 자연스러움의 승자를 정하지 않는다.",
    "",
  ].join("\n");
  writePrivate(path.join(outputDir, "comparison.md"), comparison);

  const sourceStatus = gitOutput(["status", "--porcelain=v1"]);
  const sourceDiff = gitOutput(["diff", "--binary", "HEAD"]);
  writePrivateJson(path.join(outputDir, "manifest.json"), {
    createdAt: new Date().toISOString(),
    datasetVersion: dataset.datasetVersion,
    execution: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      model: selectedModel,
      provider: selectedProvider,
      reasoningEffort: selectedReasoningEffort,
      variantIds: variantsToRun.map((item) => item.id),
    },
    fixtureHash: sha256(readFileSync(CASES_PATH)),
    goldHash: sha256(readFileSync(GOLD_PATH)),
    promptFingerprint: sha256(promptFingerprints.join("\n")),
    rawArtifactPath: path.relative(process.cwd(), outputDir),
    runnerHash: sha256(
      readFileSync(
        path.resolve(
          process.cwd(),
          "scripts/evalCareerRequestIntroPromptComparison.ts"
        )
      )
    ),
    sourceDiffFingerprint: sha256(`${sourceStatus}\n${sourceDiff}`),
    sourceRevision: gitOutput(["rev-parse", "HEAD"]),
    task: dataset.task,
    variantsHash: sha256(readFileSync(VARIANTS_PATH)),
  });
  process.stdout.write(
    `Run complete: ${path.relative(process.cwd(), outputDir)}/comparison.md\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
