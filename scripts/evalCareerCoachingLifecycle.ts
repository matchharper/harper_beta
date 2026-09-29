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
type Role = "assistant" | "user";
type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type EvalActivity = {
  activityId: string;
  agenda: string[];
  channel: "chat" | "call" | null;
  createdAt: string;
  endedAt: string | null;
  messageId: number;
  plannedMinutes: number | null;
  revision: number;
  startedAt: string | null;
  status: "suggested" | "active" | "ended";
  suggestedMinutes: number | null;
  topic: string;
  updatedAt: string;
};

type EvalCase = {
  id: string;
  initialActivity?: Partial<EvalActivity> | null;
  recentConversation: Array<{ content: string; role: Role }>;
  structuredProfileText: string;
  talentContextSection: string;
  title: string;
  userTurns: Array<{ runtimeInstruction?: string; text: string }>;
};

type EvalDataset = {
  cases: EvalCase[];
  datasetVersion: string;
  kind: string;
  locale: string;
  task: string;
};

type GoldCase = {
  allowedLifecycleActions: Array<
    "none" | "suggest" | "start" | "update" | "end"
  >;
  id: string;
};

type GoldDataset = {
  cases: GoldCase[];
  datasetVersion: string;
  task: string;
};

type ToolCall = {
  function: { arguments: string; name: string };
  id: string;
  type: "function";
};

type ProviderMessage = {
  _responses_output?: unknown[];
  content: string | null;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type LifecycleCall = {
  action: string;
  input: JsonRecord;
  output: JsonRecord;
  turnIndex: number;
};

type ToolState = {
  activity: EvalActivity | null;
  errors: number;
  lastActivity: EvalActivity | null;
  lifecycleCalls: LifecycleCall[];
};

const TASK_DIR = path.resolve(
  process.cwd(),
  "docs/evaluation/career-coaching-dialogue"
);
const DEFAULT_CASES_PATH = path.join(TASK_DIR, "cases-v4.json");
const DEFAULT_GOLD_PATH = path.join(TASK_DIR, "gold-v4.json");
const RUNS_DIR = path.join(TASK_DIR, "runs");
const MAX_TOOL_LOOPS_PER_TURN = 5;
const MAX_OUTPUT_TOKENS = 2_000;
const LIFECYCLE_TOOL = "manage_career_coaching_activity";

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

function integer(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
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
        id: text(toolCall.id) || `career_coaching_lifecycle_${index}`,
        type: "function" as const,
      },
    ];
  });
}

function parseToolInput(rawArguments: string) {
  try {
    return asRecord(JSON.parse(rawArguments));
  } catch {
    return {};
  }
}

function buildInitialActivity(
  evalCase: EvalCase,
  caseIndex: number
): EvalActivity | null {
  if (!evalCase.initialActivity) return null;
  const now = "2026-09-22T00:00:00.000Z";
  const status = evalCase.initialActivity.status;
  assert(
    status === "suggested" || status === "active",
    `${evalCase.id}: invalid initial status`
  );
  const activity: EvalActivity = {
    activityId: `synthetic-${evalCase.id}`,
    agenda: evalCase.initialActivity.agenda ?? [],
    channel: evalCase.initialActivity.channel ?? null,
    createdAt: now,
    endedAt: null,
    messageId: 9_000 + caseIndex,
    plannedMinutes: evalCase.initialActivity.plannedMinutes ?? null,
    revision: evalCase.initialActivity.revision ?? 1,
    startedAt: status === "active" ? now : null,
    status,
    suggestedMinutes: evalCase.initialActivity.suggestedMinutes ?? null,
    topic: text(evalCase.initialActivity.topic),
    updatedAt: now,
  };
  assert(activity.topic, `${evalCase.id}: initial activity needs topic`);
  return activity;
}

function activityMessage(activity: EvalActivity) {
  return {
    coachingActivity: activity,
    content: "",
    id: activity.messageId,
    messageType: "career_coaching_activity",
    role: "assistant",
  };
}

function lifecycleError(state: ToolState, message: string) {
  state.errors += 1;
  return {
    assistantInstruction: `${message} Do not claim that the lifecycle changed.`,
    error: "invalid_transition",
    ok: false,
  };
}

function runLifecycleTool(args: {
  input: JsonRecord;
  state: ToolState;
  turnIndex: number;
}) {
  const { input, state, turnIndex } = args;
  const action = text(input.action);
  const now = new Date(Date.UTC(2026, 8, 22, 0, turnIndex)).toISOString();
  let output: JsonRecord;

  if (!["suggest", "start", "update", "end"].includes(action)) {
    output = lifecycleError(state, "The action is invalid.");
  } else if (action === "suggest") {
    const topic = text(input.topic);
    const suggestedMinutes = integer(input.suggestedMinutes);
    if (state.activity || !topic || !suggestedMinutes) {
      output = lifecycleError(
        state,
        "A suggestion needs one topic and duration with no open activity."
      );
    } else {
      state.activity = {
        activityId: `synthetic-created-${turnIndex}`,
        agenda: [],
        channel: null,
        createdAt: now,
        endedAt: null,
        messageId: 10_000 + turnIndex,
        plannedMinutes: null,
        revision: 1,
        startedAt: null,
        status: "suggested",
        suggestedMinutes,
        topic,
        updatedAt: now,
      };
      state.lastActivity = state.activity;
      output = {
        activityMessage: activityMessage(state.activity),
        assistantInstruction:
          "The suggestion card is visible. Explain its value briefly and let the user choose without claiming coaching started.",
        ok: true,
        status: "suggested",
      };
    }
  } else if (action === "start") {
    const topic = text(input.topic) || state.activity?.topic || "";
    const plannedMinutes =
      integer(input.plannedMinutes) ?? state.activity?.suggestedMinutes ?? null;
    const agenda = stringList(input.agenda);
    const channel =
      input.channel === "call"
        ? "call"
        : input.channel === "chat"
          ? "chat"
          : null;
    const messageId =
      integer(input.activityMessageId) ?? state.activity?.messageId ?? null;
    const revision =
      integer(input.expectedRevision) ?? state.activity?.revision ?? null;
    const existing = state.activity;
    const validExisting = existing
      ? messageId === existing.messageId && revision === existing.revision
      : !messageId && !revision;
    if (
      !validExisting ||
      (existing && existing.status !== "suggested") ||
      !topic ||
      !plannedMinutes ||
      agenda.length === 0 ||
      !channel
    ) {
      output = lifecycleError(
        state,
        "Start needs the current suggestion reference or a direct start, plus topic, duration, agenda, and channel."
      );
    } else {
      state.activity = {
        activityId: existing?.activityId ?? `synthetic-created-${turnIndex}`,
        agenda,
        channel,
        createdAt: existing?.createdAt ?? now,
        endedAt: null,
        messageId: existing?.messageId ?? 10_000 + turnIndex,
        plannedMinutes,
        revision: existing ? existing.revision + 1 : 1,
        startedAt: now,
        status: "active",
        suggestedMinutes: existing?.suggestedMinutes ?? null,
        topic,
        updatedAt: now,
      };
      state.lastActivity = state.activity;
      output = {
        activityMessage: activityMessage(state.activity),
        assistantInstruction:
          channel === "call"
            ? "The bound call can open. Do not continue coaching in chat."
            : "Continue the active coaching conversation now without reading the agenda back.",
        ok: true,
        status: "active",
      };
    }
  } else {
    const existing = state.activity;
    const messageId =
      integer(input.activityMessageId) ?? existing?.messageId ?? null;
    const revision =
      integer(input.expectedRevision) ?? existing?.revision ?? null;
    if (
      !existing ||
      messageId !== existing.messageId ||
      revision !== existing.revision
    ) {
      output = lifecycleError(state, "The activity reference is stale.");
    } else if (action === "end") {
      const ended: EvalActivity = {
        ...existing,
        endedAt: now,
        revision: existing.revision + 1,
        status: "ended",
        updatedAt: now,
      };
      state.activity = null;
      state.lastActivity = ended;
      output = {
        activityMessage: activityMessage(ended),
        assistantInstruction:
          "The activity ended. Respect the boundary and do not add another coaching question.",
        ok: true,
        status: "ended",
      };
    } else {
      const topic = text(input.topic) || existing.topic;
      const plannedMinutes =
        integer(input.plannedMinutes) ?? existing.plannedMinutes;
      const suggestedMinutes =
        integer(input.suggestedMinutes) ?? existing.suggestedMinutes;
      const agenda = Array.isArray(input.agenda)
        ? stringList(input.agenda)
        : existing.agenda;
      const channel =
        input.channel === "call" || input.channel === "chat"
          ? input.channel
          : existing.channel;
      state.activity = {
        ...existing,
        agenda,
        channel,
        plannedMinutes,
        revision: existing.revision + 1,
        suggestedMinutes,
        topic,
        updatedAt: now,
      };
      state.lastActivity = state.activity;
      output = {
        activityMessage: activityMessage(state.activity),
        assistantInstruction:
          "The visible activity was updated. Continue the user's request naturally.",
        ok: true,
        status: state.activity.status,
      };
    }
  }

  state.lifecycleCalls.push({ action, input, output, turnIndex });
  return output;
}

function runToolStub(args: {
  evalCase: EvalCase;
  input: JsonRecord;
  name: string;
  state: ToolState;
  turnIndex: number;
}) {
  if (args.name === LIFECYCLE_TOOL) {
    return runLifecycleTool(args);
  }
  if (args.name === "read_talent_context") {
    return {
      assistantInstruction:
        "Use only relevant returned context and continue naturally.",
      context: args.evalCase.talentContextSection,
      ok: true,
    };
  }
  if (
    args.name === "read_recommended_opportunities" ||
    args.name === "get_internal_roles" ||
    args.name === "get_role_context" ||
    args.name === "read_talent_activity_events"
  ) {
    return {
      assistantInstruction:
        "No additional role data is available in this synthetic fixture. Do not invent any.",
      ok: true,
      results: [],
    };
  }
  if (args.name === "web_search" || args.name === "open_url") {
    return {
      assistantInstruction:
        "No external result is available in this synthetic fixture. State the limit rather than inventing facts.",
      ok: true,
      results: [],
    };
  }
  if (args.name === "write_talent_context") {
    const changes = Array.isArray(args.input.changes) ? args.input.changes : [];
    if (changes.length > 0) {
      return {
        appliedChanges: changes,
        assistantInstruction:
          "The explicitly stated durable context was saved. Continue without describing storage internals.",
        ok: true,
      };
    }
  }

  args.state.errors += 1;
  return {
    assistantInstruction:
      "This side effect is unavailable in the lifecycle evaluation. Do not claim it succeeded.",
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

function validateDataset(dataset: EvalDataset, gold: GoldDataset) {
  assert(dataset.task === "career-coaching-dialogue", "unexpected task");
  assert(
    /^v[1-9][0-9]*$/.test(dataset.datasetVersion),
    "dataset version must be explicit"
  );
  assert(gold.task === dataset.task, "gold task mismatch");
  assert(
    gold.datasetVersion === dataset.datasetVersion,
    "gold version mismatch"
  );
  assert(dataset.cases.length > 0, "dataset has no cases");
  const ids = new Set(dataset.cases.map((item) => item.id));
  assert(ids.size === dataset.cases.length, "dataset case ids must be unique");
  assert(
    gold.cases.length === dataset.cases.length,
    "gold case count mismatch"
  );
  for (const item of gold.cases) {
    assert(ids.has(item.id), `gold case is missing from dataset: ${item.id}`);
    assert(
      item.allowedLifecycleActions.length > 0,
      `${item.id}: no allowed actions`
    );
  }
}

async function main() {
  const casesPath = path.resolve(
    process.cwd(),
    cliValue("--cases") ?? DEFAULT_CASES_PATH
  );
  const goldPath = path.resolve(
    process.cwd(),
    cliValue("--gold") ?? DEFAULT_GOLD_PATH
  );
  const dataset = readJson<EvalDataset>(casesPath);
  const gold = readJson<GoldDataset>(goldPath);
  validateDataset(dataset, gold);

  if (process.argv.includes("--validate-only")) {
    process.stdout.write(
      `Validated ${dataset.cases.length} career coaching lifecycle cases.\n`
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

  const [conversationPlan, promptUtils, careerTools, llm, modelConfig] =
    await Promise.all([
      import("../src/lib/career/prompts/conversationPlan"),
      import("../src/lib/career/prompts/promptUtils"),
      import("../src/lib/career/llmTools"),
      import("../src/lib/llm/llm"),
      import("../src/lib/llm/modelConfig"),
    ]);
  const selectedModel =
    cliValue("--model")?.trim() || modelConfig.GPT_56_TERRA_MODEL;
  const selectedReasoningEffort = reasoningEffort(
    cliValue("--reasoning-effort")
  );
  const selectedOpenAIReasoningEffort =
    selectedReasoningEffort === "minimal"
      ? ("low" as const)
      : selectedReasoningEffort;
  const selectedProvider = llm.getLlmChatProviderForModel(selectedModel);

  const goldById = new Map(gold.cases.map((item) => [item.id, item]));
  const promptSnapshots: Record<string, string[]> = {};
  const summaries: JsonRecord[] = [];
  let structuralViolationCount = 0;

  for (const [caseIndex, evalCase] of dataset.cases.entries()) {
    process.stdout.write(`Running ${evalCase.id}...\n`);
    const selectedTools = careerTools.resolveCareerChatTools({
      channel: "chat",
      isOnboardingDone: true,
      responseLocale: dataset.locale,
    });
    const history: Array<{ content: string; role: Role }> = [
      ...evalCase.recentConversation,
    ];
    const state: ToolState = {
      activity: buildInitialActivity(evalCase, caseIndex),
      errors: 0,
      lastActivity: null,
      lifecycleCalls: [],
    };
    state.lastActivity = state.activity;
    const dialogue: JsonRecord[] = [];
    const providerTurns: JsonRecord[] = [];
    promptSnapshots[evalCase.id] = [];

    for (const [turnIndex, userTurn] of evalCase.userTurns.entries()) {
      const plan = conversationPlan.buildCareerConversationPromptPlan({
        careerCoachingActivity: state.activity,
        channel: "chat",
        conversationMode:
          state.activity?.status === "active" ? "career_coaching" : "default",
        currentPreferences: { preferredLocale: dataset.locale },
        isOnboardingDone: true,
        profile: { current_location: "서울" },
        runtimeInstruction: userTurn.runtimeInstruction,
        structuredProfileText: evalCase.structuredProfileText,
        talentContextSection: evalCase.talentContextSection,
        toolNames: selectedTools.toolNames,
      });
      const systemInstructions = promptUtils.renderCareerPromptBlocks(
        plan.promptBlocks
      );
      promptSnapshots[evalCase.id].push(systemInstructions);
      const messages: ProviderMessage[] = [
        { content: systemInstructions, role: "system" },
        ...history.map((item) => ({ content: item.content, role: item.role })),
        { content: userTurn.text, role: "user" },
      ];
      const visibleSegments: string[] = [];
      const recordedToolCalls: JsonRecord[] = [];

      for (let loop = 0; loop < MAX_TOOL_LOOPS_PER_TURN; loop += 1) {
        const completion = await llm.createChatCompletionWithFallback({
          buildRequest: () => ({
            max_completion_tokens: MAX_OUTPUT_TOKENS,
            messages,
            ...(selectedTools.tools.length > 0
              ? {
                  parallel_tool_calls: false,
                  tool_choice: "auto",
                  tools: selectedTools.tools,
                }
              : {}),
          }),
          ...(selectedProvider === "openrouter"
            ? {
                chatCompletionReasoning: {
                  reasoningEffort: selectedReasoningEffort,
                },
              }
            : {}),
          debugLabel: `career-coaching-lifecycle:${evalCase.id}:${turnIndex}`,
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
        const rawMessage = asRecord(choice?.message);
        const content = text(rawMessage.content);
        const toolCalls = parseToolCalls(rawMessage);
        if (content) visibleSegments.push(content);
        providerTurns.push({
          finishReason: choice?.finish_reason ?? null,
          loop,
          model: completion.model,
          response: completion.response,
          turnIndex,
        });
        messages.push({
          _responses_output: Array.isArray(rawMessage._responses_output)
            ? rawMessage._responses_output
            : undefined,
          content: content || null,
          role: "assistant",
          tool_calls: toolCalls.length ? toolCalls : undefined,
        });
        if (toolCalls.length === 0) break;

        for (const toolCall of toolCalls) {
          const input = parseToolInput(toolCall.function.arguments);
          const output = runToolStub({
            evalCase,
            input,
            name: toolCall.function.name,
            state,
            turnIndex,
          });
          recordedToolCalls.push({
            input,
            name: toolCall.function.name,
            output,
            toolCallId: toolCall.id,
          });
          messages.push({
            content: JSON.stringify(output),
            role: "tool",
            tool_call_id: toolCall.id,
          });
        }
      }

      const assistantText = visibleSegments.join(" ").trim();
      dialogue.push({ role: "user", text: userTurn.text, turnIndex });
      dialogue.push({
        role: "assistant",
        text: assistantText,
        toolCalls: recordedToolCalls,
        turnIndex,
      });
      history.push({ content: userTurn.text, role: "user" });
      if (assistantText)
        history.push({ content: assistantText, role: "assistant" });
    }

    const actualActions = state.lifecycleCalls.length
      ? state.lifecycleCalls.map((item) => item.action)
      : ["none"];
    const allowedActions =
      goldById.get(evalCase.id)?.allowedLifecycleActions ?? [];
    const unexpectedActions = actualActions.filter(
      (action) =>
        !allowedActions.includes(
          action as GoldCase["allowedLifecycleActions"][number]
        )
    );
    const structuralViolations = [
      ...(unexpectedActions.length
        ? [`unexpected lifecycle action(s): ${unexpectedActions.join(", ")}`]
        : []),
      ...(state.errors ? [`tool errors: ${state.errors}`] : []),
    ];
    structuralViolationCount += structuralViolations.length;

    const result = {
      case: { id: evalCase.id, title: evalCase.title },
      dialogue,
      execution: {
        actualLifecycleActions: actualActions,
        allowedLifecycleActions: allowedActions,
        finalActivity: state.activity,
        lastActivity: state.lastActivity,
        model: selectedModel,
        provider: selectedProvider,
        reasoningEffort: selectedReasoningEffort,
        structuralViolations,
        toolErrors: state.errors,
        toolNames: selectedTools.toolNames,
      },
      input: evalCase,
      lifecycleCalls: state.lifecycleCalls,
      providerTurns,
      systemInstructionsByTurn: promptSnapshots[evalCase.id],
    };
    writePrivateJson(path.join(outputDir, `${evalCase.id}.json`), result);
    summaries.push({
      actualActions,
      id: evalCase.id,
      structuralViolations,
      toolErrors: state.errors,
    });
  }

  const runnerPath = path.resolve(
    process.cwd(),
    "scripts/evalCareerCoachingLifecycle.ts"
  );
  const sourceStatus = gitOutput(["status", "--porcelain=v1"]);
  const sourceDiff = gitOutput(["diff", "--binary", "HEAD"]);
  writePrivateJson(path.join(outputDir, "manifest.json"), {
    createdAt: new Date().toISOString(),
    datasetVersion: dataset.datasetVersion,
    execution: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxToolLoopsPerTurn: MAX_TOOL_LOOPS_PER_TURN,
      model: selectedModel,
      parallelToolCalls: false,
      provider: selectedProvider,
      reasoningEffort: selectedReasoningEffort,
      toolChoice: "auto",
    },
    fixtureHash: sha256(readFileSync(casesPath)),
    goldHash: sha256(readFileSync(goldPath)),
    promptFingerprint: sha256(JSON.stringify(promptSnapshots)),
    rawArtifactPath: path.relative(process.cwd(), outputDir),
    runnerHash: sha256(readFileSync(runnerPath)),
    sourceDiffFingerprint: sha256(`${sourceStatus}\n${sourceDiff}`),
    sourceRevision: gitOutput(["rev-parse", "HEAD"]),
    structuralSummary: {
      caseCount: summaries.length,
      cases: summaries,
      structuralViolationCount,
    },
    task: dataset.task,
  });
  process.stdout.write(
    `Run complete: ${path.relative(process.cwd(), outputDir)}; structural violations=${structuralViolationCount}\n`
  );
  if (structuralViolationCount > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
