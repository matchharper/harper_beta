import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const { DEFAULT_CAREER_TEXT_CHAT_MODEL, isCareerTextChatModelId } =
    await import("../src/lib/career/textChatModelConfig");
  const modelArg = process.argv.indexOf("--model");
  const model =
    modelArg >= 0 ? process.argv[modelArg + 1] : DEFAULT_CAREER_TEXT_CHAT_MODEL;
  if (!isCareerTextChatModelId(model))
    throw new Error("Unknown evaluation model");
  const dir =
    "docs/evaluation/application-suggestions/runs/conversation-" +
    new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (n: string, v: unknown) =>
    writeFileSync(dir + "/" + n + ".json", JSON.stringify(v, null, 2), {
      mode: 0o600,
    });
  const hash = (s: string | Buffer) =>
    createHash("sha256").update(s).digest("hex");
  const fetch = globalThis.fetch;
  let caseSignal = AbortSignal.timeout(180000);
  globalThis.fetch = (async (input: any, init: any) => {
    const host = new URL(
      typeof input === "string" ? input : (input.url ?? input.href)
    ).hostname;
    if (!["api.openai.com", "api.anthropic.com"].includes(host))
      throw new Error("Evaluation blocked non-provider access");
    if (typeof init?.body === "string") {
      const requested = JSON.parse(init.body).model;
      if (requested && requested !== model)
        throw new Error("Evaluation blocked an unintended model");
    }
    return fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, caseSignal])
        : caseSignal,
    });
  }) as typeof fetch;
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { getOpenAIChatTools, withUiStatusMessageParameter } =
    await import("../src/lib/talentOnboarding/tools");
  const { createSimulationSession, mutateSimulationSession } =
    await import("../src/lib/career/simulation/session");
  const { createPreparation } =
    await import("../src/lib/career/simulation/preparation");
  const {
    askApplicationInput,
    finishApplicationAnswer,
    pendingApplicationBatch,
  } = await import("../src/lib/career/simulation/applicationInput");
  const { suggestionAction } =
    await import("../src/lib/career/simulation/suggestionSchema");
  const {
    manageApplicationSuggestions,
    manageApplicationSuggestionsTool,
    MANAGE_APPLICATION_SUGGESTIONS,
  } = await import("../src/lib/career/simulation/suggestions");
  const { readyForRoleTool, READY_FOR_ROLE, readyForRoleSchema } =
    await import("../src/lib/career/simulation/readyForRole");
  const { buildPreparationPrompt } =
    await import("../src/lib/career/simulation/preparationPrompt");
  const { parseResumeInput, structureResume } =
    await import("../src/lib/resumes/schema");
  const documentId = "22222222-2222-4222-8222-222222222222";
  const original = {
    schema_version: 1 as const,
    template_version: "synthetic",
    source_document_ids: [],
    source_refs: [],
    content: {
      language: "en" as const,
      basics: { name: "Alex Example", email: "alex@example.test" },
      experience: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          title: "Backend Engineer",
          organization: "Example Studio",
          period: "2022–2025",
          bullets: ["Built APIs."],
        },
      ],
      education: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "BSc Computer Science",
          organization: "Example University",
          period: "2022",
        },
      ],
    },
  };
  const fixtures = JSON.parse(
      readFileSync(
        "docs/evaluation/application-suggestions/conversations-v1.json",
        "utf8"
      )
    ),
    results = [];
  for (const f of fixtures) {
    caseSignal = AbortSignal.timeout(180000);
    let state = createSimulationSession({
      roleName: "Example · API Engineer",
      roleRef: "job:synthetic",
      documentId,
      documentName: "Alex Resume.pdf",
      documentOriginType: "harper_generated_resume",
    });
    state.analysisStatus = "completed";
    state.preparation = createPreparation();
    state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
    state.actions = [
      suggestionAction(
        f.kind === "change"
          ? {
              kind: "change",
              title: "API 운영 경험을 구체적으로 담을까요?",
              reason: "프로필에서 설계와 운영을 맡은 사실이 확인됐어요.",
              edits: [
                {
                  target: "Experience",
                  originalText: "Built APIs.",
                  suggestedText:
                    "Owned API design and production incident response.",
                },
              ],
            }
          : {
              kind: "question",
              title: "모델 평가 경험이 있으신가요?",
              reason: "이 역할에서 평가 경험을 중요하게 봐요.",
            },
        "S1"
      ),
    ];
    state = askApplicationInput(
      state,
      { purpose: "suggestions", items: [{ actionId: "S1" }] },
      "initial"
    );
    state = finishApplicationAnswer(
      mutateSimulationSession(
        state,
        {
          action: "respond",
          actionId: "S1",
          response: f.answer
            ? { decision: "answer", text: f.answer }
            : { decision: "skip" },
        },
        1
      )
    );
    for (let i = 1; i < f.rounds; i++)
      state.activity!.batches.unshift({
        ...structuredClone(state.activity!.batches[0]),
        id: "earlier-" + i,
        key: "earlier-" + i,
      });
    const tools = [
      ...getOpenAIChatTools("chat").filter(
        (t) => t.function.name === "read_document"
      ),
      manageApplicationSuggestionsTool,
      readyForRoleTool,
    ].map((t) => ({
      ...t,
      function: {
        ...t.function,
        parameters: withUiStatusMessageParameter(t.function.parameters),
      },
    }));
    const blocks = buildPreparationPrompt(
      state,
      tools.map((t) => t.function.name)
    );
    blocks.unshift({
      key: "fixture_context",
      text: "Respond naturally in Korean. Synthetic confirmed profile: API design and on-call incident response at Example Studio. Selected resume has its original English language. No known ML training experience. This application only asks for name, email and resume; no cover letter or references.",
    });
    const calls: any[] = [],
      start = Date.now();
    let prepared: any;
    const refresh = () => {
      const context = blocks.find(
        (b) => b.key === "application_preparation_context"
      )!;
      context.text = buildPreparationPrompt(
        state,
        tools.map((t) => t.function.name)
      )[1].text;
    };
    try {
      const reply = await runCareerChatAssistant({
        primaryModel: model,
        responseLocale: "ko",
        systemBlocks: blocks,
        messages: [{ role: "user", content: f.user }],
        tools,
        usageLabel: "eval/application-preparation",
        executeTool: async ({ name, input }) => {
          const { _uiStatusMessage, ...cleanInput } = input;
          input = cleanInput;
          calls.push({ name, input });
          if (name === "read_document") {
            const document = {
              id: documentId,
              kind: "resume",
              fileName: "Alex Resume.pdf",
              originType: "harper_generated_resume",
            };
            return input.format === "structured"
              ? { document, revision: 1, structuredContent: original }
              : {
                  document,
                  excerpt:
                    "Alex Example\nBackend Engineer, Example Studio, 2022–2025\nBuilt APIs.\nBSc Computer Science, Example University, 2022.",
                  offset: 0,
                  nextOffset: null,
                  textAvailable: true,
                  hasMore: false,
                };
          }
          if (name === MANAGE_APPLICATION_SUGGESTIONS) {
            state = manageApplicationSuggestions(
              state,
              input,
              "eval-" + calls.length,
              2
            );
            refresh();
            return {
              ok: true,
              awaitingUserInput: !!pendingApplicationBatch(state),
              actions: state.actions,
            };
          }
          if (name === READY_FOR_ROLE) {
            const ready = readyForRoleSchema.parse(input);
            if (
              pendingApplicationBatch(state) ||
              state.actions.some(
                (a) => !["completed", "skipped"].includes(a.status)
              )
            )
              throw new Error("Outstanding suggestions");
            if (ready.resume) {
              const command = parseResumeInput(ready.resume);
              if (
                command.action !== "copy" ||
                command.document_id !== documentId
              )
                throw new Error("Preserve the generated original with copy");
              prepared = structureResume(command, original);
            } else prepared = original;
            state.preparation!.finalDocumentId =
              "55555555-5555-4555-8555-555555555555";
            refresh();
            return {
              ok: true,
              documentId: state.preparation!.finalDocumentId,
              documentLink:
                "[Alex Resume](/career/profile?profileSection=links&documentId=" +
                state.preparation!.finalDocumentId +
                ")",
              resumeChanged: !!ready.resume,
              assistantInstruction:
                "Show the link, explain actual changes briefly and offer to apply; this did not submit anything.",
            };
          }
          throw new Error("Unavailable synthetic tool");
        },
      });
      results.push({
        id: f.id,
        durationMs: Date.now() - start,
        reply,
        calls,
        prepared,
        state,
      });
    } catch (error) {
      results.push({ id: f.id, error: String(error), calls, state });
    }
    save("outputs", results);
    console.log(
      JSON.stringify({
        id: f.id,
        calls: calls.map((c) => c.name),
        durationMs: Date.now() - start,
      })
    );
  }
  save("manifest", {
    task: "application-suggestions",
    datasetVersion: "conversations-v1",
    model,
    provider: model.startsWith("claude-") ? "Anthropic" : "OpenAI",
    configuration: {
      responseLocale: "ko",
      timeoutMs: 180000,
      maxToolCalls: 8,
      maxToolLoops: 8,
    },
    runnerHash: hash(
      readFileSync("scripts/evalApplicationPreparationConversation.ts")
    ),
    goldHash: hash(
      readFileSync(
        "docs/evaluation/application-suggestions/conversation-gold-v1.json"
      )
    ),
    readyToolHash: hash(
      readFileSync("src/lib/career/simulation/readyForRole.ts")
    ),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"])
      .toString()
      .trim(),
    promptFingerprint: hash(
      readFileSync("src/lib/career/simulation/preparationPrompt.ts")
    ),
    dirtyDiffHash: hash(
      execFileSync("git", [
        "diff",
        "--",
        "src/lib/career",
        "src/lib/talentOnboarding/llm.ts",
      ])
    ),
    fixtureHash: hash(
      readFileSync(
        "docs/evaluation/application-suggestions/conversations-v1.json"
      )
    ),
    metricSummary: "Manual review pending",
    rawArtifacts: dir,
    productionWrites: false,
  });
  console.log(dir);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
