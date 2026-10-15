/** Three real-role preparations with synthetic owners; no submission capability. */
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });

async function main() {
  // Parse the uploaded binary before loading the full Career dependency graph.
  const { extractTalentDocumentTextContent } =
    await import("../src/lib/talentOnboarding/documentUpload");
  const sourcePdf = readFileSync(
    "docs/evaluation/application-suggestions/private/context-rich-live-v1/source-resume.pdf"
  );
  const sourcePdfText = await extractTalentDocumentTextContent({
    bytes: sourcePdf,
    fileName: "source-resume.pdf",
  });
  const { writeApplicationSuggestions, APPLICATION_SUGGESTION_PROMPT } =
    await import("../src/lib/career/simulation/suggestionWriter");
  const { simulationProfileSnapshot } =
    await import("../src/lib/career/simulation/profileSnapshot");
  const { buildTalentProfileContext } =
    await import("../src/lib/talentOnboarding/profileStore");
  const { renderTalentContextPrompt } =
    await import("../src/lib/talentOnboarding/talentContexts");
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { getOpenAIChatTools } =
    await import("../src/lib/talentOnboarding/tools");
  const { buildCareerConversationPromptPlan } =
    await import("../src/lib/career/prompts/conversationPlan");
  const {
    createSimulationSession,
    mutateSimulationSession,
    endSimulationSession,
    sessionMutationSchema,
  } = await import("../src/lib/career/simulation/session");
  const { applicationSessionToolResult } =
    await import("../src/lib/career/simulation/sessionTool");
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
  const { readyForRole } =
    await import("../src/lib/career/simulation/readyForRole");
  const { readTalentDocumentForTool } =
    await import("../src/lib/talentOnboarding/documentTool");
  const { generateResume } = await import("../src/lib/resumes/service");
  const { structureResume } = await import("../src/lib/resumes/schema");
  const { resumePlainText } = await import("../src/lib/resumes/template");
  const { DEFAULT_CAREER_TEXT_CHAT_MODEL } =
    await import("../src/lib/career/textChatModelConfig");
  const { inspectApplicationForm, formInspectionInstructions } =
    await import("../src/lib/career/simulation/applicationFormInspection");
  const { createApplicationBrowserRuntime } =
    await import("../src/lib/career/simulation/applicationBrowserRuntime");
  const { agentsRequest } =
    await import("../src/lib/career/simulation/agentsApi");
  const { createBrowserResultStore } =
    await import("../src/lib/career/simulation/applicationBrowserResultStore");
  const { applicationPreparationEvalStore } =
    await import("./lib/applicationPreparationEvalStore");
  const { executeApplicationSimulation } =
    await import("../src/lib/career/simulation/server");
  const task = "docs/evaluation/application-suggestions";
  const datasetVersion = "context-rich-live-v1";
  const privateDir = `${task}/private/${datasetVersion}`;
  const cases = JSON.parse(readFileSync(`${privateDir}/inputs.json`, "utf8"));
  const selected = process.argv.indexOf("--case");
  const inspectionSourceFlag = process.argv.indexOf("--inspection-source");
  const previousInspection =
    inspectionSourceFlag < 0
      ? []
      : JSON.parse(
          readFileSync(
            `${process.argv[inspectionSourceFlag + 1]}/outputs.json`,
            "utf8"
          )
        );
  const active =
    selected < 0
      ? cases
      : cases.filter((c: any) => c.id === process.argv[selected + 1]);
  assert.ok(active.length);
  const runId = `${datasetVersion}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = `${task}/runs/${runId}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) =>
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const model = DEFAULT_CAREER_TEXT_CHAT_MODEL;
  const network: any[] = [],
    resources: string[] = [];
  const originalFetch = globalThis.fetch;
  const storageHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  const resultPrefix = `_evaluation/${runId}`;
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : (input.url ?? input.href)
    );
    const method = init?.method ?? "GET";
    assert.ok(
      [
        "api.anthropic.com",
        "api.openai.com",
        "api.ashbyhq.com",
        "jobs.ashbyhq.com",
        storageHost,
      ].includes(url.hostname),
      "Evaluation blocks database, messaging and application-site mutation requests"
    );
    if (url.hostname.includes("ashby") && method !== "GET") {
      assert.equal(url.pathname, "/api/non-user-graphql");
      assert.equal(
        JSON.parse(String(init?.body)).operationName,
        "ApiJobPosting"
      );
    }
    if (url.hostname === storageHost) {
      assert.ok(
        url.pathname.startsWith("/storage/v1/"),
        "No production database requests"
      );
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const ownedPath = decodeURIComponent(url.pathname).includes(resultPrefix);
      const bucketRead =
        method === "GET" &&
        url.pathname === "/storage/v1/bucket/talent-resumes";
      const listOwn =
        method === "POST" &&
        url.pathname.includes("/object/list/") &&
        String(body.prefix).startsWith(resultPrefix + "/");
      const deleteOwn =
        method === "DELETE" &&
        Array.isArray(body.prefixes) &&
        body.prefixes.every((p: string) => p.startsWith(resultPrefix + "/"));
      assert.ok(
        ownedPath || bucketRead || listOwn || deleteOwn,
        "Storage limited to this run's transient public-page inspection results"
      );
    }
    network.push({ host: url.hostname, path: url.pathname, method });
    return originalFetch(input, {
      ...init,
      signal: AbortSignal.any([
        AbortSignal.timeout(180000),
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
  }) as typeof fetch;
  const trackedRequest: typeof agentsRequest = async (
    path,
    body,
    method,
    signal
  ) => {
    const result = await agentsRequest<any>(path, body, method, signal);
    if (path === "sessions" && body) {
      resources.push(`sessions/${result.id}`);
      if (result.environment?.id)
        resources.push(`environments/${result.environment.id}`);
    }
    return result;
  };
  const resultStore = createBrowserResultStore();
  const prefixFor = (prefix: string) => `${resultPrefix}/${prefix}`;
  const core = createApplicationBrowserRuntime({
    request: trackedRequest,
    results: {
      check: () => resultStore.check(),
      target: (prefix) => resultStore.target(prefixFor(prefix)),
      read: (target) => resultStore.read(target),
      remove: (path) => {
        assert.ok(path.startsWith(resultPrefix + "/"));
        return resultStore.remove(path);
      },
      clear: (prefix) => resultStore.clear(prefixFor(prefix)),
    },
  });
  const inspectionCommands: any[] = [];
  const runtime: typeof core = {
    ...core,
    async create(files, url, options) {
      assert.ok(options?.readOnly && files.length === 0);
      return core.create(files, url, options);
    },
    async execute(ref, input, files, id, signal) {
      assert.ok(
        ref.readOnly &&
          files.length === 0 &&
          ["inspect", "navigate", "click"].includes(input.action)
      );
      inspectionCommands.push({ action: input.action, id });
      return core.execute(ref, input, files, id, signal);
    },
  };
  const sourceFiles = [
    "scripts/evalApplicationContextJourney.ts",
    "scripts/lib/applicationPreparationEvalStore.ts",
    "src/lib/career/simulation/suggestionWriter.ts",
    "src/lib/career/simulation/preparationPrompt.ts",
    "src/lib/career/prompts/conversationPlan.ts",
    "src/lib/career/simulation/readyForRole.ts",
    "src/lib/career/simulation/applicationFormInspection.ts",
    "src/lib/talentOnboarding/documentUpload.ts",
  ];
  const manifest: any = {
    task: "application-suggestions",
    datasetVersion,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"])
      .toString()
      .trim(),
    dirtyDiffHash: hash(
      execFileSync("git", ["diff", "--", "src/lib/career", "scripts"])
    ),
    sourceHashes: Object.fromEntries(
      sourceFiles.map((p) => [p, hash(readFileSync(p))])
    ),
    promptFingerprint: hash(APPLICATION_SUGGESTION_PROMPT),
    inspectionPromptFingerprint: hash(formInspectionInstructions),
    fixtureHash: hash(readFileSync(`${privateDir}/inputs.json`)),
    sourcePdfHash: hash(sourcePdf),
    goldHash: hash(readFileSync(`${task}/context-rich-live-gold-v1.json`)),
    model,
    provider: "Anthropic",
    reasoning: "provider default",
    temperature: { suggestions: 0.2, conversation: "runtime default" },
    timeoutMs: 180000,
    candidateProductionWrites: false,
    transientBrowserResultStorage: resultPrefix,
    inspectionMode:
      inspectionSourceFlag < 0
        ? "live read-only"
        : "previous real read-only snapshot",
    inspectionSource:
      inspectionSourceFlag < 0 ? null : process.argv[inspectionSourceFlag + 1],
    applicationSubmissionCapability: false,
    memoryRetrieval:
      "fixed complete snapshot under production 4000-token preparation budget; semantic retrieval itself not evaluated",
    rawArtifacts: dir,
    metrics: "pending",
  };
  save("manifest", manifest);
  console.log(
    JSON.stringify({ runId, model, cases: active.map((c: any) => c.id) })
  );
  const results: any[] = [];
  for (const f of active) {
    const started = Date.now(),
      userId = randomUUID(),
      documentId = randomUUID();
    const roleName = `${f.role.company} · ${f.role.name}`;
    const memoryContext = renderTalentContextPrompt({
      briefs: f.profile.briefs,
      allBriefs: f.profile.briefs,
      memories: f.profile.memories,
      memorySelection: "semantic",
      memoryTruncated: false,
    } as any);
    const profileContext = buildTalentProfileContext({
      profile: f.profile.talentUser,
      structuredProfile: f.profile,
      includeResumeText: false,
      includeRowIds: true,
    });
    const candidate = [
      simulationProfileSnapshot(f.profile),
      JSON.stringify({
        name: f.profile.talentUser.name,
        email: f.profile.talentUser.email,
      }),
      memoryContext,
    ].join("\n\n");
    const originalContent = structuredClone(f.content);
    for (const collection of ["experience", "education"])
      for (const entry of originalContent[collection] ?? []) delete entry.id;
    const structured =
      f.origin === "harper_generated_resume"
        ? structureResume({
            action: "create",
            document_name: "Original",
            content: originalContent,
          })
        : null;
    const pdfBytes =
      f.origin === "upload"
        ? readFileSync(`${privateDir}/source-resume.pdf`)
        : undefined;
    const extracted = pdfBytes
      ? sourcePdfText
      : structured
        ? resumePlainText(structured.content)
        : null;
    const source: any = {
      id: documentId,
      talent_id: userId,
      kind: f.origin === "none" ? "document" : "resume",
      file_name: f.origin === "upload" ? "source-resume.pdf" : "Original.pdf",
      origin_type: f.origin === "none" ? "upload" : f.origin,
      storage_path: pdfBytes ? "isolated/source-resume.pdf" : null,
      structured_content: structured,
      extracted_text: extracted,
      revision: 1,
      is_deleted: false,
      is_public: false,
      is_primary: f.origin !== "none",
    };
    const state = createSimulationSession({
      roleName,
      roleRef: `job:${f.role.role_id}`,
      documentId: f.origin === "none" ? null : documentId,
      documentName: f.origin === "none" ? null : source.file_name,
      documentOriginType: f.origin,
      locale: "ko",
    });
    state.preparation = createPreparation();
    state.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
    state.applicationUrl = f.role.external_jd_url;
    const rows = {
      talent_experiences: f.profile.talentExperiences.map((r: any) => ({
        ...r,
        talent_id: userId,
      })),
      talent_educations: f.profile.talentEducations.map((r: any) => ({
        ...r,
        talent_id: userId,
      })),
      talent_contexts: [...f.profile.memories, ...f.profile.briefs].map(
        (r: any) => ({ ...r, talent_id: userId })
      ),
      talent_users: [{ ...f.profile.talentUser, user_id: userId }],
    };
    const db = applicationPreparationEvalStore(
      { messageId: 10, state },
      source,
      rows
    );
    if (process.argv.includes("--binary-only")) {
      assert.equal(f.origin, "upload");
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => {
          assert.equal(filters.user_id, userId);
          return { data: { id: "isolated-conversation" }, error: null };
        },
      };
      const unused = async () => {
        throw new Error(
          "Binary-only boundary must stop before analysis, writes or network"
        );
      };
      const boundary = await executeApplicationSimulation(
        {
          admin: {
            from: (table: string) => {
              assert.equal(table, "talent_conversations");
              return query;
            },
          } as any,
          userId,
          conversationId: "isolated-conversation",
          documentId,
          roleName,
          roleRef: `job:${f.role.role_id}`,
          requestKey: "binary-only",
          role: f.role,
        },
        {
          fetchTalentStructuredProfile: async () => f.profile,
          fetchTalentDocument: async () => ({
            ...source,
            extracted_text: null,
          }),
          fetchTalentDocuments: unused,
          fetchTalentContextPromptSnapshot: unused,
          fetchTalentUserProfile: unused,
          executeSharedWebSearch: unused,
          executeSharedOpenUrl: unused,
          inspectApplicationForm: unused,
          writeApplicationSuggestions: unused,
        } as any
      );
      assert.equal(boundary.ok, false);
      results.push({
        id: f.id,
        binaryOnlyBoundary: boundary,
        providerRequests: network.length,
        structuralPass: true,
      });
      save("outputs", results);
      console.log(JSON.stringify({ id: f.id, binaryOnlyBoundary: boundary }));
      continue;
    }
    const turns: any[] = [],
      transcript: any[] = [];
    const plan = (preparing = true, names: string[] = []) =>
      buildCareerConversationPromptPlan({
        channel: "chat",
        isOnboardingDone: true,
        currentPreferences: { preferredLocale: "ko" },
        conversationMode: preparing ? "simulation" : "default",
        ...(preparing ? { simulationSession: db.record.state } : {}),
        profile: null,
        structuredProfileText: profileContext,
        talentContextSection: memoryContext,
        toolNames: names,
      }).promptBlocks;
    const read = async ({ name, input }: any) =>
      name === "read_talent_context"
        ? { results: f.profile.memories, text: memoryContext }
        : readTalentDocumentForTool({ ...db.store, input });
    try {
      let resume = extracted;
      if (f.origin === "none") {
        const tools = getOpenAIChatTools("chat").filter((t) =>
          [
            "generate_resume",
            "read_talent_context",
            "read_document",
            "list_documents",
          ].includes(t.function.name)
        );
        const calls: any[] = [];
        const user = `이력서는 아직 없어. 저장된 프로필과 메모를 바탕으로 영어 이력서를 만들어줘. ${roleName} 지원을 준비하려고 해. 실제 지원 제출은 하지 마.`;
        const reply = await runCareerChatAssistant({
          primaryModel: model,
          responseLocale: "ko",
          systemBlocks: plan(
            false,
            tools.map((t) => t.function.name)
          ),
          messages: [{ role: "user", content: user }],
          tools,
          usageLabel: "eval/application-context:create",
          executeTool: async ({ name, input }) => {
            const { _uiStatusMessage, ...clean } = input;
            const call: any = { name, input: clean };
            calls.push(call);
            const result =
              name === "generate_resume"
                ? await generateResume({
                    ...db.store,
                    userMessageId: 1,
                    requestId: "initial-create",
                    input: clean,
                  })
                : name === "list_documents"
                  ? {
                      documents: [...db.docs.values()].filter(
                        (d) => d.kind === "resume"
                      ),
                    }
                  : await read({ name, input: clean });
            call.result = result;
            return result;
          },
        });
        turns.push({ phase: "no-resume-create", user, reply, calls });
        const generated = [...db.docs.values()].find(
          (d) => d.origin_type === "harper_generated_resume"
        );
        assert.ok(generated, "No-resume flow must save a generated resume");
        Object.assign(db.record.state, {
          documentId: generated.id,
          documentName: generated.file_name,
          documentOriginType: generated.origin_type,
        });
        resume = generated.extracted_text;
      }
      assert.ok(resume, "Readable resume text required");
      const selectedSource = structuredClone(
        db.docs.get(db.record.state.documentId!)!
      );
      // Foreground suggestions use pending inspection, just as the web runtime does.
      const knownForm = previousInspection.find(
        (c: any) => c.id === f.id
      )?.applicationForm;
      if (knownForm)
        assert.equal(
          new URL(knownForm.url).hostname,
          new URL(f.role.external_jd_url).hostname
        );
      const inspected = knownForm
        ? Promise.resolve(knownForm)
        : inspectApplicationForm(
            f.role.external_jd_url,
            AbortSignal.timeout(180000),
            { request: trackedRequest, runtime }
          ).catch((error) => ({
            status: "unavailable",
            url: f.role.external_jd_url,
            checkedAt: new Date().toISOString(),
            fields: [],
            limitations: [String(error)],
            submission: {
              status: "unknown",
              reason: "Application requirements could not be verified.",
            },
          }));
      const suggestions = await writeApplicationSuggestions({
        ...db.store,
        candidate,
        resume,
        role: roleName + "\n" + f.role.description,
        application: JSON.stringify({
          status: "pending",
          url: f.role.external_jd_url,
        }),
        language: "Korean",
        model,
        signal: AbortSignal.timeout(180000),
        readTool: read,
      });
      save(`${f.id}-initial`, { suggestions, resume, candidate });
      console.log(
        JSON.stringify({
          id: f.id,
          initialChanges: suggestions.filter((s) => s.kind === "change").length,
          questions: suggestions.filter((s) => s.kind === "question").length,
        })
      );
      const applicationForm = await inspected;
      Object.assign(db.record.state, {
        analysisStatus: "completed",
        applicationForm,
        applicationInspection: {
          status:
            applicationForm.status === "unavailable" ? "failed" : "completed",
          runId: randomUUID(),
        },
        actions: suggestions.map((s, i) => suggestionAction(s, `S${i + 1}`)),
      });
      if (suggestions.length)
        db.setRecord({
          ...db.record,
          state: askApplicationInput(
            db.record.state,
            {
              purpose: "suggestions",
              items: db.record.state.actions.map((a) => ({ actionId: a.id })),
            },
            "initial"
          ),
        });
      const selection = resolveCareerChatTools({
        channel: "chat",
        isOnboardingDone: true,
        simulationActive: true,
        simulationPreparation: true,
      });
      for (
        let turn = 0;
        turn < 4 && !db.record.state.preparation?.finalDocumentId;
        turn++
      ) {
        const waiting = pendingApplicationBatch(db.record.state);
        if (waiting) {
          let next = db.record.state;
          for (const id of waiting.itemIds) {
            const action = next.actions.find((a) => a.id === id)!;
            next = mutateSimulationSession(
              next,
              {
                action: "respond",
                actionId: id,
                response: {
                  decision: action.inputKind === "question" ? "skip" : "accept",
                },
              },
              turn + 2
            );
          }
          db.setRecord({ ...db.record, state: finishApplicationAnswer(next) });
        }
        const user =
          "표시된 수정 제안은 적용했어. 모르는 정보 질문은 건너뛰었어. 이미 저장된 프로필·메모·Memory의 확인된 사실은 활용하고, 확인되지 않은 경력이나 숫자는 추가하지 마. 이력서 저장까지 마무리해줘. 회사에 연락하거나 지원서를 제출하지 마.";
        transcript.push({ role: "user", content: user });
        const blocks = plan(true, selection.toolNames),
          calls: any[] = [];
        const reply = await runCareerChatAssistant({
          primaryModel: model,
          responseLocale: "ko",
          systemBlocks: blocks,
          messages: transcript,
          tools: selection.tools,
          stopAfterToolNames: selection.stopAfterToolNames,
          usageLabel: "eval/application-context:prepare",
          executeTool: async ({ name, input }) => {
            const { _uiStatusMessage, ...clean } = input;
            const call: any = { name, input: clean };
            calls.push(call);
            let result: any;
            if (name === "read_document" || name === "read_talent_context")
              result = await read({ name, input: clean });
            else if (name === "manage_application_suggestions") {
              db.setRecord({
                ...db.record,
                state: manageApplicationSuggestions(
                  db.record.state,
                  clean,
                  `turn-${turn}-${calls.length}`,
                  turn + 2,
                  waiting?.id
                ),
              });
              result = applicationSuggestionsResult(db.record.state);
            } else if (name === "ready_for_role") {
              const saved = await readyForRole(
                db.store,
                db.record,
                clean,
                turn + 2,
                `ready-${turn}-${calls.length}`
              );
              db.setRecord(saved.record);
              result = saved.result;
            } else if (name === "manage_simulation_session") {
              db.setRecord({
                ...db.record,
                state: mutateSimulationSession(
                  db.record.state,
                  sessionMutationSchema.parse(clean),
                  turn + 2
                ),
              });
              result = applicationSessionToolResult(
                db.record.state,
                String(clean.action)
              );
            } else if (name === "list_documents")
              result = { documents: [...db.docs.values()] };
            else throw new Error(`No side effect permitted: ${name}`);
            call.result = result;
            const fresh = plan(true, selection.toolNames);
            for (const b of blocks) {
              const match = fresh.find((v) => v.key === b.key);
              if (match) b.text = match.text;
            }
            return result;
          },
        });
        if (reply) transcript.push({ role: "assistant", content: reply });
        turns.push({
          phase: "preparation",
          user,
          reply,
          calls,
          state: structuredClone(db.record.state),
        });
        save(`${f.id}-turns`, turns);
      }
      assert.ok(
        db.record.state.preparation?.finalDocumentId,
        "Preparation did not save a final document"
      );
      const final = db.docs.get(db.record.state.preparation.finalDocumentId);
      assert.ok(final);
      assert.deepEqual(
        db.docs.get(source.id),
        source,
        "Original source must be unchanged"
      );
      assert.deepEqual(
        db.docs.get(selectedSource.id),
        selectedSource,
        "Selected resume must be unchanged"
      );
      if (pdfBytes)
        assert.equal(
          hash(readFileSync(`${privateDir}/source-resume.pdf`)),
          hash(pdfBytes)
        );
      db.setRecord({
        ...db.record,
        state: endSimulationSession(db.record.state, "user"),
      });
      results.push({
        id: f.id,
        durationMs: Date.now() - started,
        initialSuggestions: suggestions,
        applicationForm,
        turns,
        finalDocument: final,
        documents: [...db.docs.values()],
        endState: db.record.state,
        structuralPass: true,
        sourcePreserved: true,
        applicationSubmitted: false,
      });
    } catch (error) {
      db.setRecord({
        ...db.record,
        state: endSimulationSession(db.record.state, "failed"),
      });
      results.push({
        id: f.id,
        durationMs: Date.now() - started,
        error: String(error),
        turns,
        documents: [...db.docs.values()],
        structuralPass: false,
      });
    }
    save("outputs", results);
    console.log(
      JSON.stringify({
        id: f.id,
        structuralPass: results.at(-1).structuralPass,
        error: results.at(-1).error,
      })
    );
  }
  const cleanup: any[] = [];
  for (const path of resources) {
    try {
      await agentsRequest(path, undefined, "GET", AbortSignal.timeout(10000));
      cleanup.push({ path, deleted: false });
    } catch (error: any) {
      cleanup.push({
        path,
        deleted: error.status === 404,
        status: error.status,
      });
    }
  }
  save("network", network);
  save("inspectionCommands", inspectionCommands);
  save("cleanup", cleanup);
  manifest.metrics = {
    structuralPass: results.filter((r) => r.structuralPass).length,
    total: results.length,
    semanticReview: "pending",
  };
  save("manifest", manifest);
  console.log(dir);
  if (results.some((r) => !r.structuralPass)) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
