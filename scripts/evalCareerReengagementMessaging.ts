import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import { GPT_56_LUNA_MODEL, GPT_56_TERRA_MODEL } from "@/lib/llm/modelConfig";
import {
  buildCareerConversationPromptPlan,
  buildCareerSessionStartTurnInstruction,
} from "@/lib/career/prompts";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";
import {
  extractCareerReengagementActions,
  resolveCareerReengagementActionKeys,
} from "@/lib/career/reengagementActions";
import { formatRecentRecommendedOpportunitiesForPrompt } from "@/lib/talentOpportunity";

type EvalCase = Record<string, any> & { id: string };

const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
};
const inputPath = argValue("--input");
const outputDir = argValue("--output-dir");
if (!inputPath || !outputDir) {
  throw new Error("--input and --output-dir are required");
}

async function main() {
  const inputBytes = readFileSync(inputPath);
  const fixture = JSON.parse(inputBytes.toString("utf8")) as {
    cases: EvalCase[];
    datasetVersion: string;
  };
  if (!Array.isArray(fixture.cases) || fixture.cases.length < 10) {
    throw new Error("Evaluation fixture must contain at least 10 cases");
  }

  mkdirSync(outputDir, { mode: 0o700, recursive: true });
  const outputPath = path.join(outputDir, "outputs.json");
  const manifestPath = path.join(outputDir, "manifest.json");
  const outputs: Record<string, unknown>[] = [];
  const promptFingerprint = createHash("sha256");
  const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const isDirty = Boolean(
    execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim()
  );

  const writeOwnerOnlyJson = (filePath: string, value: unknown) => {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(filePath, 0o600);
  };

  for (const [index, evalCase] of fixture.cases.entries()) {
    const proactiveContext = buildCareerSessionStartTurnInstruction({
      currentAccessAt: evalCase.currentAccessAt,
      idleMs: evalCase.idleMs,
      isOnboardingDone: evalCase.isOnboardingDone,
      pendingActions: evalCase.pendingActions,
      preferredLocale: evalCase.preferredLocale,
      previousChatAt: evalCase.previousChatAt,
    });
    const recentRecommendedOpportunitiesText =
      formatRecentRecommendedOpportunitiesForPrompt(
        evalCase.recentRecommendations ?? []
      );
    const { promptBlocks } = buildCareerConversationPromptPlan({
      channel: "chat",
      currentPreferences: {
        getExternalRecommendation: true,
        periodicIntervalDays: 3,
        preferredLocale: evalCase.preferredLocale,
        profileVisibility: "open_to_matches",
        recommendationBatchSize: 3,
        talentSettingStatus: "active",
      },
      isOnboardingDone: evalCase.isOnboardingDone,
      profile: null,
      recentRecommendedOpportunitiesText,
      runtimeInstruction: proactiveContext,
      structuredProfileText: evalCase.structuredProfileText,
      talentContextSection: "",
      toolNames: [],
    });
    const historicalMessages = (evalCase.recentMessages ?? [])
      .filter(
        (message: Record<string, unknown>) =>
          message.role === "user" || message.role === "assistant"
      )
      .map((message: Record<string, unknown>) => ({
        content: formatTalentMessageContentForLlmPrompt(
          message as Record<string, unknown> & {
            content: string | null | undefined;
          },
          {
            includeCreatedAt: true,
          }
        ),
        role: message.role as "user" | "assistant",
      }))
      .filter((message: { content: string }) => message.content.trim());
    if (historicalMessages[historicalMessages.length - 1]?.role !== "user") {
      historicalMessages.push({
        content:
          "Use the runtime context above to write the next assistant message now.",
        role: "user",
      });
    }
    const messages = [
      {
        content: promptBlocks
          .map((block) => block.text.trim())
          .filter(Boolean)
          .join("\n\n"),
        role: "system" as const,
      },
      ...historicalMessages,
    ];
    promptFingerprint.update(JSON.stringify({ caseId: evalCase.id, messages }));
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const rawOutput = await runTalentAssistantCompletion({
      anthropicOverloadFallbackModel: GPT_56_TERRA_MODEL,
      fallbackModel: GPT_56_TERRA_MODEL,
      maxTokens: 4096,
      messages,
      openAIResponsesReasoningEffort: "xhigh",
      primaryModel: GPT_56_LUNA_MODEL,
      temperature: 0.8,
    });
    const resolvedOutput = resolveCareerReengagementActionKeys({
      content: rawOutput,
      resolvePendingActionRef: (actionKey) =>
        evalCase.pendingActions?.some(
          (action: Record<string, unknown>) => action.actionKey === actionKey
        )
          ? `${actionKey}.evaluation`
          : null,
    });
    const parsed = extractCareerReengagementActions(resolvedOutput);
    outputs.push({
      actions: parsed.actions,
      accountAlias: evalCase.accountAlias,
      caseId: evalCase.id,
      condition: {
        locale: evalCase.preferredLocale,
        pendingActionKind: evalCase.pendingActions?.[0]?.kind ?? "none",
        pendingInternalCountAtCapture:
          evalCase.pendingInternalCountAtCapture ?? 0,
        source: evalCase.source,
      },
      durationMs: Date.now() - startedMs,
      rawOutput,
      resolvedOutput,
      startedAt,
      visibleOutput: parsed.content,
    });
    writeOwnerOnlyJson(outputPath, outputs);
    process.stdout.write(
      `${JSON.stringify({ completed: index + 1, caseId: evalCase.id, total: fixture.cases.length })}\n`
    );
  }

  writeOwnerOnlyJson(manifestPath, {
    createdAt: new Date().toISOString(),
    datasetVersion: fixture.datasetVersion,
    fixtureHash: createHash("sha256").update(inputBytes).digest("hex"),
    humanReview: "pending",
    model: GPT_56_LUNA_MODEL,
    openAIResponsesReasoningEffort: "xhigh",
    outputCount: outputs.length,
    outputPath,
    privacy: "raw production-derived inputs and raw outputs are local-only",
    promptFingerprint: promptFingerprint.digest("hex"),
    provider: "OpenAI",
    runId: path.basename(outputDir),
    sourceRevision: `${gitRevision}${isDirty ? "+dirty" : ""}`,
    task: "internal-role-conversation-qa/reengagement-messaging",
    temperature: 0.8,
    timeout: "provider default",
    tools: [],
  });
  process.stdout.write(
    `${JSON.stringify({ manifestPath, outputCount: outputs.length, outputPath })}\n`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
