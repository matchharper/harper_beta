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

type EvalCase = {
  id: string;
  title: string;
  profile: {
    current_location?: string | null;
    location?: string | null;
  };
  preferences: {
    getExternalRecommendation?: boolean | null;
    periodicIntervalDays?: number | null;
    preferredLocale?: string | null;
    profileVisibility?: string | null;
    recommendationBatchSize?: number | null;
    talentSettingStatus?: string | null;
  };
  recentConversationSection?: string;
  structuredProfileText: string;
  talentContextSection: string;
  userTurns: string[];
};

type EvalDataset = {
  cases: EvalCase[];
  datasetVersion: string;
  kind: string;
  locale: string;
  task: string;
};

type ToolCall = {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type: "function";
};

type EvalMessage = {
  _responses_output?: unknown[];
  content: string | null;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type RecordedToolCall = {
  input: JsonRecord;
  name: string;
  output: JsonRecord;
  toolCallId: string;
};

type ToolState = {
  ended: boolean;
  errors: number;
  savedChanges: unknown[];
};

const TASK_DIR = path.resolve(
  process.cwd(),
  "docs/evaluation/career-coaching-dialogue"
);
const DEFAULT_CASES_PATH = path.join(TASK_DIR, "cases-v1.json");
const RUNS_DIR = path.join(TASK_DIR, "runs");
const MAX_TOOL_LOOPS_PER_TURN = 4;
const MAX_OUTPUT_TOKENS = 2_000;
const KOREAN_END_CALL_FALLBACK =
  "답변 감사합니다. 말씀해주신 내용은 잘 반영할게요. 그럼 통화는 여기서 마무리하겠습니다.";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writePrivateJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(filePath, 0o600);
}

function cliValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseToolCalls(message: JsonRecord): ToolCall[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap((raw, index) => {
    const toolCall = asRecord(raw);
    const fn = asRecord(toolCall.function);
    const name = text(fn.name);
    if (!name) return [];
    return [
      {
        function: {
          arguments:
            typeof fn.arguments === "string"
              ? fn.arguments
              : JSON.stringify(fn.arguments ?? {}),
          name,
        },
        id: text(toolCall.id) || `career_coaching_eval_tool_${index}`,
        type: "function" as const,
      },
    ];
  });
}

function parseToolInput(rawArguments: string): JsonRecord {
  try {
    return asRecord(JSON.parse(rawArguments));
  } catch {
    return {};
  }
}

function runToolStub(args: {
  evalCase: EvalCase;
  input: JsonRecord;
  name: string;
  state: ToolState;
}) {
  const { evalCase, input, name, state } = args;

  if (name === "end_call") {
    state.ended = true;
    return {
      assistantInstruction:
        "The live call is now ending. Do not ask another question or claim any additional action.",
      ok: true,
    };
  }

  if (name === "write_talent_context") {
    const changes = Array.isArray(input.changes) ? input.changes : [];
    if (changes.length === 0) {
      state.errors += 1;
      return {
        assistantInstruction:
          "No context was saved because the request contained no valid changes. Do not claim that it was saved.",
        error: "no_changes",
        ok: false,
      };
    }
    state.savedChanges.push(...changes);
    return {
      appliedChanges: changes,
      assistantInstruction:
        "The explicitly confirmed Search Brief or Memory changes were saved. Continue naturally without mentioning storage internals.",
      ok: true,
    };
  }

  if (name === "update_talent_profile") {
    const recommendationBatchSize = Number(input.recommendationBatchSize);
    if (
      !Number.isInteger(recommendationBatchSize) ||
      recommendationBatchSize < 3 ||
      recommendationBatchSize > 10
    ) {
      state.errors += 1;
      return {
        assistantInstruction:
          "No recommendation batch setting changed. Do not claim that it changed.",
        error: "invalid_recommendation_batch_size",
        ok: false,
      };
    }
    state.savedChanges.push({ recommendationBatchSize });
    return {
      assistantInstruction:
        "The requested recommendation batch size was updated. Confirm its practical effect naturally.",
      ok: true,
      updatedRecommendationSettings: ["recommendationBatchSize"],
    };
  }

  if (name === "update_setting") {
    const action = text(input.action);
    if (!["stop_external", "stop_all", "resume"].includes(action)) {
      state.errors += 1;
      return {
        assistantInstruction:
          "No recommendation scope changed. Do not claim that it changed.",
        error: "invalid_setting_action",
        ok: false,
      };
    }
    state.savedChanges.push({ settingAction: action });
    return {
      action,
      assistantInstruction:
        action === "stop_external"
          ? "External public-posting recommendations are now disabled; directly connectable opportunities remain enabled. Explain that practical result naturally."
          : "The requested recommendation contact scope was updated. Explain the practical result naturally.",
      ok: true,
    };
  }

  if (name === "read_talent_context") {
    return {
      assistantInstruction:
        "Use only the relevant returned context and continue the original conversation naturally.",
      context: evalCase.talentContextSection,
      ok: true,
      truncated: false,
    };
  }

  if (name === "read_recommended_opportunities") {
    return {
      assistantInstruction:
        "No prior opportunities are needed for this synthetic case. Continue without inventing any.",
      count: 0,
      ok: true,
      opportunities: [],
    };
  }

  if (name === "get_role_context") {
    return {
      assistantInstruction:
        "No role details are available in this synthetic case. Continue without inventing any.",
      ok: true,
      roles: [],
    };
  }

  if (name === "web_search") {
    return {
      assistantInstruction:
        "No external search result is available in this content-only evaluation. Continue without inventing one.",
      ok: true,
      results: [],
    };
  }

  state.errors += 1;
  return {
    assistantInstruction:
      "The requested tool is unavailable in this evaluation. Do not claim that it succeeded.",
    error: "unsupported_tool",
    ok: false,
  };
}

function gitOutput(args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

async function main() {
  const outputArg = cliValue("--output-dir");
  const casesArg = cliValue("--cases");
  assert(outputArg, "--output-dir is required");

  const outputDir = path.resolve(process.cwd(), outputArg);
  const runsRootWithSeparator = `${RUNS_DIR}${path.sep}`;
  assert(
    outputDir.startsWith(runsRootWithSeparator),
    `output directory must be inside ${RUNS_DIR}`
  );
  mkdirSync(outputDir, { mode: 0o700, recursive: true });
  chmodSync(outputDir, 0o700);
  assert(
    readdirSync(outputDir).length === 0,
    `output directory is not empty: ${outputDir}`
  );

  const casesPath = path.resolve(process.cwd(), casesArg ?? DEFAULT_CASES_PATH);
  const dataset = readJson<EvalDataset>(casesPath);
  assert(dataset.task === "career-coaching-dialogue", "unexpected task");
  assert(dataset.datasetVersion === "v1", "runner currently expects v1");
  assert(dataset.cases.length > 0, "dataset has no cases");

  const [conversationPlan, promptUtils, conversationStarters, initialResponse, careerTools, talentTools, llm, modelConfig] =
    await Promise.all([
      import("../src/lib/career/prompts/conversationPlan"),
      import("../src/lib/career/prompts/promptUtils"),
      import("../src/lib/career/prompts/conversationStarters"),
      import("../src/lib/career/realtimeInitialResponse"),
      import("../src/lib/career/llmTools"),
      import("../src/lib/talentOnboarding/tools"),
      import("../src/lib/llm/llm"),
      import("../src/lib/llm/modelConfig"),
    ]);

  const promptSnapshots: Record<string, string> = {};
  const caseResults: Array<{
    assistantTurnCount: number;
    ended: boolean;
    id: string;
    nonemptyAssistantTurnCount: number;
    savedChangeCount: number;
    toolCallCount: number;
    toolErrorCount: number;
  }> = [];

  for (const evalCase of dataset.cases) {
    process.stdout.write(`Running ${evalCase.id}...\n`);
    const startedAt = Date.now();
    const starter = conversationStarters.getCareerConversationStarter(
      "career_coaching",
      evalCase.preferences.preferredLocale
    );
    assert(starter, "career_coaching starter is unavailable");

    const realtimeCandidates = careerTools.getCareerRealtimeToolCandidates(
      evalCase.preferences.preferredLocale
    );
    const candidateToolNames = realtimeCandidates.map((tool) => tool.name);
    const plan = conversationPlan.buildCareerConversationPromptPlan({
      channel: "voice",
      conversationMode: "career_coaching",
      currentPreferences: evalCase.preferences,
      isOnboardingDone: true,
      profile: evalCase.profile,
      recentConversationSection: evalCase.recentConversationSection ?? "",
      structuredProfileText: evalCase.structuredProfileText,
      talentContextSection: evalCase.talentContextSection,
      toolNames: candidateToolNames,
    });
    const resolvedTools = careerTools.resolveCareerRealtimeTools({
      candidateTools: realtimeCandidates,
      enabledToolNames: plan.enabledToolNames,
      preferredLocale: evalCase.preferences.preferredLocale,
    });
    const enabledToolNameSet = new Set(resolvedTools.toolNames);
    const tools = talentTools
      .getOpenAIChatTools("voice", {
        responseLocale: evalCase.preferences.preferredLocale,
      })
      .filter((tool) => enabledToolNameSet.has(tool.function.name));
    const baseInstructions = promptUtils.renderCareerPromptBlocks(
      plan.promptBlocks
    );
    const systemInstructions =
      initialResponse.appendRealtimeInitialResponseInstruction({
        initialResponseInstruction: starter.callOpeningText,
        instructions: baseInstructions,
      });
    promptSnapshots[evalCase.id] = systemInstructions;

    const messages: EvalMessage[] = [
      { content: systemInstructions, role: "system" },
      {
        content:
          "통화가 연결되었습니다. 지금 자연스럽게 첫 응답을 시작하세요.",
        role: "user",
      },
    ];
    const toolState: ToolState = {
      ended: false,
      errors: 0,
      savedChanges: [],
    };
    const dialogue: Array<{
      role: "assistant" | "user";
      segments?: string[];
      text: string;
      toolCalls?: RecordedToolCall[];
    }> = [];
    const providerTurns: unknown[] = [];
    let totalToolCalls = 0;

    const runAssistantTurn = async () => {
      const visibleSegments: string[] = [];
      const recordedToolCalls: RecordedToolCall[] = [];

      for (let toolLoop = 0; toolLoop < MAX_TOOL_LOOPS_PER_TURN; toolLoop += 1) {
        const completion = await llm.createChatCompletionWithFallback({
          buildRequest: () => ({
            max_completion_tokens: MAX_OUTPUT_TOKENS,
            messages,
            parallel_tool_calls: false,
            tool_choice: "auto",
            tools,
          }),
          debugLabel: `career-coaching-dialogue:${evalCase.id}`,
          model: modelConfig.GPT_56_TERRA_MODEL,
          openAIResponses: { reasoningEffort: "high" },
        });
        const choice = completion.response?.choices?.[0];
        const rawMessage = asRecord(choice?.message);
        const content = text(rawMessage.content);
        const toolCalls = parseToolCalls(rawMessage);
        if (content) visibleSegments.push(content);
        providerTurns.push({
          finishReason: choice?.finish_reason ?? null,
          model: completion.model,
          response: completion.response,
          toolLoop,
        });

        messages.push({
          _responses_output: Array.isArray(rawMessage._responses_output)
            ? rawMessage._responses_output
            : undefined,
          content: content || null,
          role: "assistant",
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        if (toolCalls.length === 0) break;

        for (const toolCall of toolCalls) {
          const input = parseToolInput(toolCall.function.arguments);
          const output = runToolStub({
            evalCase,
            input,
            name: toolCall.function.name,
            state: toolState,
          });
          recordedToolCalls.push({
            input,
            name: toolCall.function.name,
            output,
            toolCallId: toolCall.id,
          });
          totalToolCalls += 1;
          messages.push({
            content: JSON.stringify(output),
            role: "tool",
            tool_call_id: toolCall.id,
          });
        }

        if (toolState.ended) {
          if (visibleSegments.length === 0) {
            visibleSegments.push(KOREAN_END_CALL_FALLBACK);
          }
          break;
        }
      }

      const combinedText = visibleSegments.join(" ").trim();
      dialogue.push({
        role: "assistant",
        segments: visibleSegments,
        text: combinedText,
        ...(recordedToolCalls.length > 0
          ? { toolCalls: recordedToolCalls }
          : {}),
      });
      return combinedText;
    };

    await runAssistantTurn();
    for (const userTurn of evalCase.userTurns) {
      if (toolState.ended) break;
      messages.push({ content: userTurn, role: "user" });
      dialogue.push({ role: "user", text: userTurn });
      await runAssistantTurn();
    }

    const assistantTurns = dialogue.filter(
      (turn) => turn.role === "assistant"
    );
    const result = {
      case: {
        id: evalCase.id,
        title: evalCase.title,
      },
      dialogue,
      execution: {
        durationMs: Date.now() - startedAt,
        ended: toolState.ended,
        model: modelConfig.GPT_56_TERRA_MODEL,
        provider: "openai_responses",
        reasoningEffort: "high",
        savedChanges: toolState.savedChanges,
        toolErrors: toolState.errors,
        toolNames: resolvedTools.toolNames,
      },
      input: {
        initialDriverMessage:
          "통화가 연결되었습니다. 지금 자연스럽게 첫 응답을 시작하세요.",
        profile: evalCase.profile,
        preferences: evalCase.preferences,
        recentConversationSection: evalCase.recentConversationSection ?? "",
        structuredProfileText: evalCase.structuredProfileText,
        talentContextSection: evalCase.talentContextSection,
        userTurns: evalCase.userTurns,
      },
      providerTurns,
      systemInstructions,
    };
    writePrivateJson(path.join(outputDir, `${evalCase.id}.json`), result);

    caseResults.push({
      assistantTurnCount: assistantTurns.length,
      ended: toolState.ended,
      id: evalCase.id,
      nonemptyAssistantTurnCount: assistantTurns.filter((turn) => turn.text)
        .length,
      savedChangeCount: toolState.savedChanges.length,
      toolCallCount: totalToolCalls,
      toolErrorCount: toolState.errors,
    });
    process.stdout.write(
      `Completed ${evalCase.id}: ${assistantTurns.length} assistant turns, ${totalToolCalls} tool calls.\n`
    );
  }

  const sourceRevision = gitOutput(["rev-parse", "HEAD"]);
  const sourceStatus = gitOutput(["status", "--porcelain=v1"]);
  const sourceDiff = gitOutput(["diff", "--binary", "HEAD"]);
  const runnerPath = path.resolve(
    process.cwd(),
    "scripts/evalCareerCoachingDialogue.ts"
  );
  const manifest = {
    createdAt: new Date().toISOString(),
    datasetVersion: dataset.datasetVersion,
    execution: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxToolLoopsPerTurn: MAX_TOOL_LOOPS_PER_TURN,
      model: modelConfig.GPT_56_TERRA_MODEL,
      parallelToolCalls: false,
      provider: "openai_responses",
      reasoningEffort: "high",
      sampling: null,
      toolChoice: "auto",
    },
    fixtureHash: sha256(readFileSync(casesPath)),
    promptFingerprint: sha256(JSON.stringify(promptSnapshots)),
    rawArtifactPath: path.relative(process.cwd(), outputDir),
    runId: path.basename(outputDir),
    runnerHash: sha256(readFileSync(runnerPath)),
    sourceDiffFingerprint: sha256(`${sourceStatus}\n${sourceDiff}`),
    sourceRevision,
    sourceStatus,
    structuralSummary: {
      caseCount: caseResults.length,
      cases: caseResults,
      expectedCaseCount: dataset.cases.length,
      totalToolErrors: caseResults.reduce(
        (sum, item) => sum + item.toolErrorCount,
        0
      ),
    },
    task: dataset.task,
  };
  writePrivateJson(path.join(outputDir, "manifest.json"), manifest);
  process.stdout.write(
    `Run complete: ${path.relative(process.cwd(), outputDir)}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
