import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { formatPromptText, formatToolResultText } = await import("../src/lib/llm/promptText");
  const { CLAUDE_HAIKU_MODEL } = await import("../src/lib/llm/modelConfig");
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { buildCareerConversationPromptPlan } =
    await import("../src/lib/career/prompts/conversationPlan");
  const {
    createSimulationSession,
    mutateSimulationSession,
    sessionMutationSchema,
  } = await import("../src/lib/career/simulation/session");
  const { createPreparation } =
    await import("../src/lib/career/simulation/preparation");
  const {
    askApplicationInput,
    finishApplicationAnswer,
    pendingApplicationBatch,
  } = await import("../src/lib/career/simulation/applicationInput");
  const { suggestionAction } =
    await import("../src/lib/career/simulation/suggestionSchema");
  const { manageApplicationSuggestions, applicationSuggestionsResult } =
    await import("../src/lib/career/simulation/suggestions");
  const { applicationDocumentResult } = await import("../src/lib/career/simulation/applicationWritingContract");
  const { writeDocument } = await import("../src/lib/documents/authoring");
  const { applicationBatchContinuation } = await import("../src/lib/career/simulation/applicationAnswerContext");
  const { readyForRole } =
    await import("../src/lib/career/simulation/readyForRole");
  const { startApplicationBrowser } =
    await import("../src/lib/career/simulation/applicationBrowserServer");
  const { APPLICATION_PREPARATION_SESSION_ACTIONS } =
    await import("../src/lib/career/simulation/sessionTool");
  const { readTalentDocumentForTool } =
    await import("../src/lib/talentOnboarding/documentTool");
  const { resumePlainText } = await import("../src/lib/resumes/template");
  const { applicationPreparationEvalStore } =
    await import("./lib/applicationPreparationEvalStore");
  const model = CLAUDE_HAIKU_MODEL;
  const task = "docs/evaluation/application-suggestions";
  const runId = "journey-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID();
  const dir = task + "/runs/" + runId;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, v: unknown) =>
    writeFileSync(dir + "/" + name + ".json", JSON.stringify(v, null, 2), {
      mode: 0o600,
    });
  const hash = (x: string | Buffer) =>
    createHash("sha256").update(x).digest("hex");
  const originalFetch = globalThis.fetch;
  const requestedModels = new Set<string>();
  let signal = AbortSignal.timeout(180000);
  let providerRequestIndex = 0;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = new URL(
      typeof input === "string" ? input : (input.url ?? input.href)
    );
    if (url.hostname !== "api.anthropic.com")
      throw new Error(
        "Synthetic evaluation blocks non-Anthropic network access"
      );
    if (typeof init?.body === "string") {
      const outgoing = JSON.parse(init.body);
      save(`provider-request-${++providerRequestIndex}`, outgoing);
      const requested = outgoing.model;
      if (requested) {
        assert.equal(requested, model);
        requestedModels.add(requested);
      }
    }
    return originalFetch(input, {
      ...init,
      signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]),
    });
  }) as typeof fetch;
  const sourcePaths = [
    "src/lib/career/simulation/preparationPrompt.ts",
    "src/lib/career/simulation/suggestionWriter.ts",
    "src/lib/career/simulation/suggestionSchema.ts",
    "src/lib/talentOnboarding/tools.ts",
    "src/lib/career/simulation/session.ts",
    "src/lib/career/simulation/applicationAnswerContext.ts",
    "src/lib/career/simulation/applicationInput.ts",
    "src/lib/career/simulation/readyForRole.ts",
    "src/lib/career/simulation/applicationWritingContract.ts",
    "src/lib/career/simulation/applicationReview.ts",
    "src/lib/documents/authoring.ts",
    "src/lib/career/simulation/suggestions.ts",
    "src/lib/career/prompts/rawPrompts.ts",
    "src/lib/career/prompts/resumePolicy.ts",
    "src/lib/career/prompts/conversationPlan.ts",
    "src/lib/career/prompts/conversationSections.ts",
    "src/lib/career/prompts/toolPolicyPrompt.ts",
    "src/lib/career/llmTools.ts",
    "src/lib/career/llm.ts",
    "src/lib/resumes/schema.ts",
    "src/lib/resumes/service.ts",
    "scripts/lib/applicationPreparationEvalStore.ts",
    "scripts/evalApplicationPreparationJourney.ts",
  ];
  const sourceHashes = Object.fromEntries(
    sourcePaths.map((path) => [path, hash(readFileSync(path))])
  );
  const versionArg = process.argv.indexOf("--dataset");
  const version = versionArg < 0 ? "v1" : process.argv[versionArg + 1];
  if (!["v1", "v2", "memory-v1", "memory-v2", "inline-v1", "delegated-v1", "delegated-v2", "delegated-v3"].includes(version)) throw new Error("Unknown dataset");
  const inputPath = task + `/journeys-${version}.json`;
  const fixtures = JSON.parse(readFileSync(inputPath, "utf8"));
  const selected = process.argv.indexOf("--case");
  const cases =
    selected < 0
      ? fixtures
      : fixtures.filter((f: any) => f.id === process.argv[selected + 1]);
  assert.ok(cases.length);
  const results: any[] = [];
  for (const f of cases) {
    const documentId = "22222222-2222-4222-8222-222222222222";
    const original = {
      schema_version: 1,
      template_version: "synthetic",
      source_document_ids: [],
      source_refs: [],
      content: {
        language: "en",
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
    let state = createSimulationSession({
      roleName: "Example Labs · API Engineer",
      roleRef: "job:synthetic",
      documentId,
      documentName: "Alex Resume.pdf",
      documentOriginType: f.uploaded ? "upload" : "harper_generated_resume",
    });
    state.analysisStatus = "completed";
    state.preparation = createPreparation();
    state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
    state.applicationUrl = "https://example.test/apply";
    if (f.applicationForm) {
      state.applicationForm = f.applicationForm;
      state.applicationInspection = { status: f.applicationForm.status === "unavailable" ? "failed" : "completed", runId: "synthetic-inspection" };
    }
    state.actions = f.suggestions.map((s: any, i: number) =>
      suggestionAction(s, "S" + (i + 1))
    );
    if (state.actions.length)
      state = askApplicationInput(
        state,
        {
          purpose: "suggestions",
          items: state.actions.map((a) => ({ actionId: a.id })),
        },
        "initial"
      );
    const source = {
      id: documentId,
      talent_id: "11111111-1111-4111-8111-111111111111",
      kind: "resume",
      file_name: "Alex Resume.pdf",
      origin_type: state.documentOriginType,
      revision: 1,
      is_deleted: false,
      is_public: false,
      is_primary: true,
      storage_path: f.uploaded ? "original.pdf" : null,
      structured_content: f.uploaded ? null : original,
      extracted_text: resumePlainText(original.content as any),
    } as any;
    const db = applicationPreparationEvalStore(
      { messageId: 10, state },
      source
    );
    const selection = resolveCareerChatTools({
      channel: "chat",
      isOnboardingDone: true,
      simulationActive: true,
      simulationPreparation: true,
    });
    // Test-only persistence adapter. No shared-context writes reach a database.
    const profileRows: any[] = structuredClone(f.profileRows ?? []);
    const memories: any[] = [];
    const sharedContext = () => formatPromptText({ profileRows, memories });
    const transcript: any[] = [];
    const turns: any[] = [];
    const started = Date.now();
    for (const [index, step] of f.steps.entries()) {
      signal = AbortSignal.timeout(180000);
      let current = db.record;
      const waiting = pendingApplicationBatch(current.state);
      if (step.responses) {
        if (!waiting) {
          turns.push({
            error: "Expected a review batch before scripted user approval",
            calls: [],
            state: current.state,
          });
          break;
        }
        assert.equal(
          step.responses.length,
          waiting.itemIds.length,
          "Respond to exactly the shown items"
        );
        for (let i = 0; i < waiting.itemIds.length; i++)
          current = {
            ...current,
            state: mutateSimulationSession(
              current.state,
              {
                action: "respond",
                actionId: waiting.itemIds[i],
                response: step.responses[i],
              },
              index + 1
            ),
          };
        current = { ...current, state: finishApplicationAnswer(current.state) };
        db.setRecord(current);
      }
      const user = step.automaticContinuation ? applicationBatchContinuation(waiting!.id) : step.user;
      transcript.push({ role: "user", content: user });
      const plan = () =>
        buildCareerConversationPromptPlan({
          channel: "chat",
          isOnboardingDone: true,
          currentPreferences: { preferredLocale: "ko" },
          conversationMode: "simulation",
          simulationSession: db.record.state,
          profile: null,
          structuredProfileText:
            (f.profileContext ?? "Alex Example, alex@example.test. Confirmed: API design and on-call incident response at Example Studio. No known ML training. Motivation: enjoys building useful developer tools. ") +
            (f.context ?? "") + (f.profileRows ? "\n" + sharedContext() : ""),
          talentContextSection: memories.length ? formatPromptText(memories) : "",
          toolNames: selection.toolNames,
        });
      const blocks = plan().promptBlocks;
      blocks.push({
        key: "synthetic_application",
        text:
          "Actual application inventory: " +
          (f.application ??
            "Name, email and resume only. No cover letter or references.") +
          " Respond in Korean. This is preparation for Example Labs · API Engineer.",
      });
      save(`${f.id}-provider-input-${index}`, { systemBlocks: blocks, messages: transcript });
      const calls: any[] = [];
      try {
        const reply = await runCareerChatAssistant({
          primaryModel: model,
          responseLocale: "ko",
          systemBlocks: blocks,
          messages: transcript,
          tools: selection.tools,
          stopAfterToolNames: selection.stopAfterToolNames,
          usageLabel: "eval/application-journey",
          executeTool: async ({ name, input }) => {
            const { _uiStatusMessage, ...clean } = input;
            const call: any = { name, input: clean };
            calls.push(call);
            try {
              let result: any;
              const r = db.record;
              if (name === "read_document")
                result = await readTalentDocumentForTool({
                  ...db.store,
                  input: clean,
                });
              else if (name === "write_document")
                result = applicationDocumentResult(await writeDocument({ ...db.store, input: clean, userMessageId: index + 1, requestId: `turn-${index}-${calls.length}` }));
              else if (name === "manage_application_suggestions") {
                const next = manageApplicationSuggestions(
                  r.state,
                  clean,
                  `turn-${index}-${calls.length}`,
                  index + 1,
                  step.responses ? waiting?.id : undefined
                );
                db.setRecord({ ...r, state: next });
                result = applicationSuggestionsResult(next, r.state);
              } else if (name === "ready_for_role") {
                const saved = await readyForRole(
                  db.store,
                  r,
                  clean,
                  index + 1,
                  `turn-${index}-${calls.length}`
                );
                db.setRecord(saved.record);
                result = saved.result;
              } else if (name === "manage_simulation_session") {
                const mutation = sessionMutationSchema.parse(clean);
                assert.ok(
                  APPLICATION_PREPARATION_SESSION_ACTIONS.includes(
                    mutation.action
                  )
                );
                db.setRecord({
                  ...r,
                  state: mutateSimulationSession(r.state, mutation, index + 1),
                });
                result = { ok: true, sessionStatus: db.record.state.status };
              } else if (name === "apply_for_role") {
                db.setRecord(await startApplicationBrowser(db.store, r, clean));
                result = {
                  ok: true,
                  status: "queued",
                  applicationUrl: db.record.state.applicationUrl,
                };
                // Deliberately no dispatcher: only the local queued-state boundary is tested.
              } else if (name === "update_talent_profile") {
                assert.ok(f.profileRows, "Fixture must explicitly enable shared persistence");
                assert.deepEqual(Object.keys(clean), ["rowMemos"]);
                for (const change of clean.rowMemos as any[]) {
                  const row = profileRows.find(row => row.rowId === change.rowId);
                  assert.ok(row, "Profile row must belong to the fixture");
                  assert.equal(change.type, "experience");
                  assert.ok(["append", "update"].includes(change.operation));
                  assert.equal(typeof change.memo, "string");
                  row.memo = change.operation === "append"
                    ? [row.memo, change.memo].filter(Boolean).join("\n") : change.memo;
                }
                result = {ok: true, profileRows};
              } else if (name === "write_talent_context") {
                assert.ok(f.profileRows, "Fixture must explicitly enable shared persistence");
                for (const change of clean.changes as any[]) {
                  assert.equal(change.op, "add");
                  assert.equal(change.collection, "memory");
                  assert.ok([1, 2, 3].includes(change.importance));
                  assert.equal(typeof change.content, "string");
                  memories.push({...change, ref: memories.length + 1});
                }
                result = {ok: true, memories};
              } else if (name === "read_talent_context")
                result = {
                  results: memories,
                  text: sharedContext(),
                };
              else
                throw new Error(
                  "This synthetic fixture does not provide that capability"
                );
              const fresh = plan().promptBlocks;
              for (const block of blocks) {
                const update = fresh.find((b) => b.key === block.key);
                if (update) block.text = update.text;
              }
              call.result = result;
              return { ...result, modelOutput: result.modelOutput ?? formatToolResultText(result) };
            } catch (error) {
              call.error = String(error);
              throw error;
            }
          },
        });
        if (reply) transcript.push({ role: "assistant", content: reply });
        turns.push({
          user,
          reply,
          calls,
          state: structuredClone(db.record.state),
          documents: structuredClone([...db.docs.values()]),
        });
        save(f.id, { turns });
      } catch (error) {
        turns.push({ user, error: String(error), calls });
        break;
      }
    }
    assert.deepEqual(
      db.docs.get(documentId),
      source,
      "The source must remain unchanged"
    );
    let nextApplication;
    if (f.nextRole) {
      signal = AbortSignal.timeout(180000);
      const {writeApplicationSuggestions} = await import("../src/lib/career/simulation/suggestionWriter");
      nextApplication = await writeApplicationSuggestions({
        admin: db.store.admin, userId: source.talent_id, model, signal,
        candidate: sharedContext(), resume: source.extracted_text,
        role: f.nextRole, language: "Korean",
        application: "Only name, email and resume. No other materials or unknown requirements.",
        readTool: async ({name}) => name === "read_talent_context"
          ? {results: memories, text: sharedContext()}
          : {excerpt: source.extracted_text, hasMore: false, nextOffset: null},
      });
    }
    results.push({ id: f.id, model, durationMs: Date.now() - started, turns, profileRows, memories, nextApplication });
    save("outputs", results);
    console.log(
      JSON.stringify({
        id: f.id,
        turns: turns.length,
        toolErrors: turns.flatMap((t) => t.calls).filter((c) => c.error).length,
      })
    );
  }
  save("manifest", {
    task: "application-suggestions",
    datasetVersion: `journeys-${version}`,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"])
      .toString()
      .trim(),
    dirtyDiffHash: hash(
      execFileSync("git", ["diff", "--", "src/lib/career", "scripts"])
    ),
    model,
    requestedModels: [...requestedModels],
    sourceHashes,
    provider: "Anthropic",
    reasoning: "provider default",
    temperature: "runtime default",
    timeoutMs: 180000,
    maxToolCalls: 8,
    maxToolLoops: 8,
    fixtureHash: hash(readFileSync(inputPath)),
    goldHash: hash(readFileSync(task + `/journey-gold-${version}.json`)),
    promptFingerprint: hash(
      readFileSync("src/lib/career/simulation/preparationPrompt.ts")
    ),
    runnerHash: hash(
      readFileSync("scripts/evalApplicationPreparationJourney.ts")
    ),
    rawArtifacts: dir,
    productionWrites: false,
    metrics: "Manual review pending",
  });
  console.log(dir);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
