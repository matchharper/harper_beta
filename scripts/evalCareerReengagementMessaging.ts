import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import { createReengagementToolFixture } from "./evaluation/careerReengagementToolFixture";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { runCareerChatAssistant, runCareerChatAssistantStream } from "@/lib/career/llm";
import {
  withLlmProviderTrace,
  type LlmProviderExchange,
} from "@/lib/llm/providerTrace";
import { buildCareerSessionStartTurnInstruction } from "@/lib/career/prompts";
import {
  extractCareerReengagementActions,
  resolveCareerReengagementActionKeys,
} from "@/lib/career/reengagementActions";
import { formatRecentRecommendedOpportunitiesForPrompt } from "@/lib/talentOpportunity";
import { captureReengagementTurnInput } from "./evaluation/careerReengagementHarness";

type EvalCase = Record<string, any> & { id: string };
const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
};
const inputPath = argValue("--input"),
  outputDir = argValue("--output-dir");
if (!inputPath || !outputDir)
  throw new Error("--input and --output-dir are required");
const streaming = process.argv.includes("--stream");
const caseId = argValue("--case");
const writeJson = (file: string, value: unknown) => {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
};

async function main() {
  const bytes = readFileSync(inputPath);
  const fixture = JSON.parse(bytes.toString("utf8")) as {
    cases: EvalCase[];
    datasetVersion: string;
  };
  if (!Array.isArray(fixture.cases) || !fixture.cases.length)
    throw new Error("Fixture has no cases");
  const cases = caseId ? fixture.cases.filter(item => item.id === caseId) : fixture.cases;
  if (!cases.length) throw new Error(`Unknown case: ${caseId}`);
  mkdirSync(outputDir, { mode: 0o700, recursive: true });
  const outputs: Record<string, unknown>[] = [];
  const sourcePaths = [
    "src/lib/career/chatTurn.ts",
    "src/lib/career/reengagementOpportunities.ts",
    "src/lib/career/matching/externalEvaluationResults.ts",
    "src/lib/career/matching/tools.ts",
    "src/lib/llm/toolDescriptions.ts",
    "src/lib/career/handbooks/opportunitySearch.ts",
    "scripts/evaluation/careerReengagementToolFixture.ts",
    "src/lib/career/prompts/cases/lifecyclePrompts.ts",
    "src/lib/career/prompts/conversationPlan.ts",
    "src/lib/career/prompts/mainPrompts.ts",
    "src/lib/career/prompts/mainPrompt2.ts",
    "src/lib/career/llm.ts",
    "src/lib/llm/providerTrace.ts",
    "src/lib/career/textChatModelConfig.ts",
    "scripts/evaluation/careerReengagementHarness.ts",
    "scripts/evalCareerReengagementMessaging.ts",
  ];
  const manifest = {
    task: "career-session-reengagement",
    datasetVersion: fixture.datasetVersion,
    streaming,
    caseIds: cases.map(item => item.id),
    fixtureHash: createHash("sha256").update(bytes).digest("hex"),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    sourceDiffHash: createHash("sha256").update(
      execFileSync("git", ["diff", "HEAD", "--", ...sourcePaths])
    ).digest("hex"),
    model: CLAUDE_HAIKU_MODEL,
    usageLabel: "career/chat:session_reengagement",
    requestedTemperature: 0.8,
    sourceHashes: Object.fromEntries(
      sourcePaths.map((file) => [
        file,
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      ])
    ),
    startedAt: new Date().toISOString(),
    humanReview: "pending",
    tools: fixture.cases.some((item) => item.opportunitySnapshot)
      ? "Production opportunities preloaded; synthetic read/search and in-memory publication"
      : [],
    boundary:
      "Actual chatTurn + capability runtime + Career provider. Synthetic reads/search, publication executor against in-memory RPC. No production persistence or delivery.",
  };
  writeJson(path.join(outputDir, "manifest.json"), manifest);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (
      !["https://api.openai.com", "https://api.anthropic.com"].includes(
        url.origin
      )
    )
      throw new Error(`Evaluation blocked network to ${url.origin}`);
    return originalFetch(input, init);
  };
  try {
    for (const evalCase of cases) {
      if (!evalCase.isOnboardingDone)
        throw new Error(
          "This harness covers post-onboarding session returns only"
        );
      const proactiveContext = buildCareerSessionStartTurnInstruction({
        currentAccessAt: evalCase.currentAccessAt,
        idleMs: evalCase.idleMs,
        isOnboardingDone: evalCase.isOnboardingDone,
        pendingActions: evalCase.pendingActions,
        preferredLocale: evalCase.preferredLocale,
        previousChatAt: evalCase.previousChatAt,
        recentReengagementHistory: evalCase.recentReengagementHistory,
        timeZone: evalCase.timeZone,
      });
      const args = await captureReengagementTurnInput({
        proactiveContext,
        onTextDelta: streaming ? () => {} : undefined,
        opportunitySnapshot: evalCase.opportunitySnapshot,
        assistantModel: CLAUDE_HAIKU_MODEL,
        recentMessages: evalCase.recentMessages,
        structuredProfileText: evalCase.structuredProfileText,
        talentContextSection: evalCase.talentContextSection,
        recentRecommendedOpportunitiesText:
          formatRecentRecommendedOpportunitiesForPrompt(
            evalCase.recentRecommendations ?? []
          ),
        timeZone: evalCase.timeZone,
        currentPreferences: evalCase.currentPreferences ?? {
          getExternalRecommendation: true,
          periodicIntervalDays: 3,
          preferredLocale: evalCase.preferredLocale,
          profileVisibility: "open_to_matches",
          recommendationBatchSize: 3,
          talentSettingStatus: "active",
        },
      });
      const toolFixture = evalCase.opportunitySnapshot
        ? createReengagementToolFixture(evalCase)
        : null;
      const progressMessages: string[] = [];
      const exchanges: LlmProviderExchange[] = [];
      const started = Date.now();
      const textDeltas: { atMs: number; text: string }[] = [];
      const rawOutput = await withLlmProviderTrace(
        (exchange) => exchanges.push(exchange),
        () => {
          const modelArgs = {
            ...args,
            onAssistantMessage: async (text: string) => { progressMessages.push(text); },
            onToolStart: undefined,
            abortSignal: AbortSignal.timeout(180_000),
            executeTool:
              toolFixture?.execute ??
              (async () => {
                throw new Error(
                  "Tools are disabled in this read-only evaluation"
                );
              }),
          };
          return streaming
            ? runCareerChatAssistantStream({ ...modelArgs, onTextDelta: delta => { textDeltas.push({ atMs: Date.now() - started, text: delta }); } })
            : runCareerChatAssistant(modelArgs);
        }
      );
      // This checks transport fidelity, not qualitative response wording.
      assert.ok(exchanges.length > 0, "Provider trace was not captured");
      for (const exchange of toolFixture ? [] : exchanges) {
        const request = exchange.request as any;
        const history = (request.input ?? request.messages).filter(
          (item: any) => item.role === "user" || item.role === "assistant"
        );
        const text = (item: any) =>
          typeof item.content === "string"
            ? item.content
            : item.content.map((block: any) => block.text).join("\n");
        assert.deepEqual(
          history.map((item: any) => ({
            role: item.role,
            content: text(item),
          })),
          structuredClone(args.messages)
        );
        assert.equal(request.model, args.primaryModel);
      }
      const resolvedOutput = resolveCareerReengagementActionKeys({
        content: rawOutput,
        resolvePendingActionRef: (key) =>
          evalCase.pendingActions?.some(
            (action: any) => action.actionKey === key
          )
            ? `${key}.evaluation`
            : null,
      });
      const parsed = extractCareerReengagementActions(resolvedOutput);
      outputs.push({
        caseId: evalCase.id,
        durationMs: Date.now() - started,
        ...(streaming ? { textDeltas, firstTextDeltaMs: textDeltas[0]?.atMs ?? null } : {}),
        model: args.primaryModel,
        reasoning: args.openAIResponsesReasoningEffort,
        progressMessages,
        toolCalls: toolFixture?.calls,
        published: toolFixture?.published,
        offeredTools: args.tools.map((tool) => tool.function.name),
        messages: args.messages,
        systemBlocks: args.systemBlocks,
        exchanges,
        rawOutput,
        visibleOutput: parsed.content,
        actions: parsed.actions,
      });
      writeJson(path.join(outputDir, "outputs.json"), outputs);
      process.stdout.write(
        `${JSON.stringify({ completed: outputs.length, caseId: evalCase.id, total: cases.length })}\n`
      );
    }
    writeJson(path.join(outputDir, "manifest.json"), {
      ...manifest,
      completedAt: new Date().toISOString(),
      outputCount: outputs.length,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
