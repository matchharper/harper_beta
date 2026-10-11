import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import Ajv from "ajv";

dotenv.config({ path: ".env.local", quiet: true });
const root = path.resolve("docs/evaluation/career-capability-loading");
const read = (file: string) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const option = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const version = option("--dataset-version") ?? "v5";
const dataset = read(`cases-${version}.json`),
  gold = read(`gold-${version}.json`),
  frozen = read(`manifest-${version}.json`);
for (const [file, digest] of Object.entries(frozen.files))
  if (hash(readFileSync(path.join(root, file), "utf8")) !== digest)
    throw new Error(`Frozen file changed: ${file}`);
if (dataset.cases.length !== gold.cases.length)
  throw new Error("Dataset/gold mismatch");
if (
  new Set(dataset.cases.map((c: any) => c.id)).size !== dataset.cases.length ||
  dataset.cases.some((c: any) => !gold.cases.some((g: any) => g.id === c.id))
)
  throw new Error("Dataset/gold identifiers mismatch");
for (const fixture of dataset.cases) {
  const expected = gold.cases.find((g: any) => g.id === fixture.id);
  if (
    expected.idealReplies &&
    expected.idealReplies.length !== fixture.turns.length
  )
    throw new Error(`Ideal reply count mismatch: ${fixture.id}`);
}
if (process.argv.includes("--validate-only")) {
  console.log(`${dataset.cases.length} frozen cases validated`);
  process.exit(0);
}
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(root, "runs", runId);
mkdirSync(out, { recursive: true, mode: 0o700 });
const save = (file: string, value: unknown) =>
  writeFileSync(path.join(out, file), JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
const requests: any[] = [],
  logs: any[] = [];
const captureContext = new AsyncLocalStorage<Record<string, unknown>>();
const originalFetch = globalThis.fetch;
// Installed before importing runtime clients. Nothing can reach a database or a real tool.
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  if (url.pathname.startsWith("/rest/v1/")) {
    if (url.pathname.endsWith("/llm_logs") && init?.body)
      logs.push({
        ...captureContext.getStore(),
        ...JSON.parse(String(init.body)),
      });
    return Response.json([]);
  }
  if (
    !["api.anthropic.com", "api.openai.com", "openrouter.ai"].includes(
      url.hostname
    )
  )
    throw new Error(`Evaluation blocked external request: ${url.hostname}`);
  const body = JSON.parse(String(init?.body ?? "{}"));
  const row: any = {
    ...captureContext.getStore(),
    startedAt: new Date().toISOString(),
    request: body,
    promptFingerprint: hash(JSON.stringify(body)),
    endpoint: `${url.origin}${url.pathname}`,
  };
  requests.push(row);
  const start = Date.now();
  let response: Response;
  try {
    response = await originalFetch(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(90_000),
      ]),
    });
  } catch (error) {
    row.elapsedMs = Date.now() - start;
    row.error = String(error);
    throw error;
  }
  row.elapsedMs = Date.now() - start;
  row.status = response.status;
  row.response = await response
    .clone()
    .json()
    .catch(() => null);
  return response;
};
async function main() {
  const [
    { resolveCareerChatTools },
    { CareerCapabilityRuntime },
    { restoreCareerCapabilityLeases },
    { runCareerChatAssistant, CAREER_LLM_CONFIG },
    { parseResumeInput },
    { applyResumeChanges },
    { isSuccessfulCareerToolResult },
    { renderTalentContextPrompt },
    { formatCareerDocumentLink, getCareerDocumentHref },
    { extractLlmTokenUsage, estimateLlmUsageCost },
    { buildCareerCoachingResultInstruction },
    { formatRelayableCompanyTalentConnections },
    { COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT },
  ] = await Promise.all([
    import("@/lib/career/llmTools"),
    import("@/lib/career/capabilities/runtime"),
    import("@/lib/career/capabilities/lease"),
    import("@/lib/career/llm"),
    import("@/lib/resumes/schema"),
    import("@/lib/resumes/changes"),
    import("@/lib/career/capabilities/runtime"),
    import("@/lib/talentOnboarding/talentContexts"),
    import("@/lib/career/documentLinks"),
    import("@/lib/llm/usageLogging"),
    import("@/lib/career/prompts/cases/coachingPrompts"),
    import("@/lib/companyTalentRequests/server"),
    import("@/lib/companyTalentRequests/relayContract"),
  ]);
  const model = option("--model") ?? CAREER_LLM_CONFIG.assistant.primaryModel;
  const manifest: any = {
    task: dataset.task,
    datasetVersion: dataset.datasetVersion,
    runId,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
        .length > 0,
    model,
    provider: model.startsWith("claude")
      ? "anthropic"
      : model.includes("/")
        ? "openrouter"
        : "openai",
    reasoning: CAREER_LLM_CONFIG.assistant.openAIResponsesReasoningEffort,
    fallbackModel: CAREER_LLM_CONFIG.assistant.fallbackModel,
    anthropicOverloadFallbackModel:
      CAREER_LLM_CONFIG.assistant.anthropicOverloadFallbackModel,
    configuredChatMaxTokens: CAREER_LLM_CONFIG.chat.maxTokens,
    temperature: CAREER_LLM_CONFIG.chat.temperature,
    timeoutMs: 90_000,
    fixtureHash: frozen.files,
    modes: option("--mode") ?? "full,progressive",
    only: option("--only") ?? null,
    strictModel: process.argv.includes("--strict-model"),
    rawArtifactPath: out,
    limits:
      "Synthetic challenge; no production data, DB writes, or live tool effects. Not representative cost evidence.",
  };
  const sourceFiles = [
    "src/lib/career/capabilities/registry.ts",
    "src/lib/career/capabilities/resolver.ts",
    "src/lib/career/capabilities/runtime.ts",
    "src/lib/career/capabilities/lease.ts",
    "src/lib/career/llm.ts",
    "src/lib/talentOnboarding/llm.ts",
    "src/lib/career/prompts/conversationPlan.ts",
    "src/lib/career/prompts/rawPrompts.ts",
    "src/lib/career/prompts/toolPolicyPrompt.ts",
    "src/lib/talentOnboarding/tools.ts",
    "scripts/evalCareerCapabilities.ts",
    "src/lib/llm/pricing.ts",
    "src/lib/llm/usageLogging.ts",
    "src/lib/llm/modelConfig.ts",
    "src/lib/career/llmTools.ts",
    "src/lib/career/promptLocale.ts",
    "src/lib/companyTalentRequests/server.ts",
    "src/lib/companyTalentRequests/relayContract.ts",
    "src/lib/career/prompts/cases/coachingPrompts.ts",
    "src/lib/llm/responsesChatAdapter.ts",
    "src/lib/llm/llm.ts",
    "package.json",
    "pnpm-lock.yaml",
  ];
  manifest.sourceFiles = Object.fromEntries(
    sourceFiles.map((file) => [file, hash(readFileSync(file, "utf8"))])
  );
  save("manifest.json", manifest);
  const results: any[] = [];
  const documentId = "11111111-1111-4111-8111-111111111111",
    entryId = "22222222-2222-4222-8222-222222222222",
    connectionId = "33333333-3333-4333-8333-333333333333";
  for (const [index, rawFixture] of dataset.cases.entries()) {
    const fixture = { ...dataset.defaults, ...rawFixture };
    if (option("--only") && !option("--only")!.split(",").includes(fixture.id))
      continue;
    const modes = option("--mode")
      ? [option("--mode")!]
      : index % 2
        ? ["progressive", "full"]
        : ["full", "progressive"];
    for (const mode of modes) {
      if (mode !== "full" && mode !== "progressive")
        throw new Error("Invalid mode");
      const expected = gold.cases.find((row: any) => row.id === fixture.id);
      const selection = resolveCareerChatTools({
        channel: "chat",
        isOnboardingDone: true,
        responseLocale: "ko",
        hasActiveGmailIntegration: Boolean(fixture.gmail),
        allowedToolNames: fixture.allowed,
      });
      const ajv = new Ajv({ strict: false, allErrors: true });
      const validators = new Map(
        selection.tools.map((tool) => [
          tool.function.name,
          ajv.compile(tool.function.parameters),
        ])
      );
      let activity: any = fixture.activeCoaching
        ? {
            activityId: "synthetic-activity",
            messageId: 50,
            revision: 1,
            topic: "이직 결정",
            agenda: ["안정성과 성장의 기준"],
            status: "active",
            channel: "chat",
            plannedMinutes: 10,
            suggestedMinutes: 10,
            createdAt: "2026-10-09T00:00:00Z",
            updatedAt: "2026-10-09T00:00:00Z",
            startedAt: "2026-10-09T00:00:00Z",
            endedAt: null,
          }
        : null;
      const originalContent: any = fixture.documents?.[0]?.content ?? {
        language: "ko",
        basics: { name: "민재" },
        experience: [
          {
            id: entryId,
            title: "백엔드 엔지니어",
            organization: "합성 소프트웨어 회사",
            period: "2023–현재",
            bullets: ["API 응답시간 개선을 담당"],
          },
        ],
      };
      const documents = new Map<string, any>(
        (
          fixture.documents ?? [
            {
              id: documentId,
              revision: 1,
              fileName: "민재_백엔드.pdf",
              content: structuredClone(originalContent),
            },
          ]
        ).map((d: any) => [d.id, structuredClone(d)])
      );
      if (fixture.extraDocument)
        documents.set(fixture.extraDocument.id, {
          ...structuredClone(documents.get(documentId)),
          ...fixture.extraDocument,
        });
      const initialDocuments = new Map<string, any>(
        [...documents].map(([id, d]) => [id, structuredClone(d)])
      );
      let contextRows: any[] | null = fixture.contextRows
        ? structuredClone(fixture.contextRows)
        : null;
      let nextDocument = 444444444444;
      let faultInjected = false;
      const completedMutations = new Map<string, any>();
      const connections = structuredClone(
        fixture.connections ?? [
          {
            id: connectionId,
            company: "합성 소프트웨어",
            role: "백엔드 엔지니어",
            lastMessage: "면접 가능한 시간을 알려주세요.",
          },
        ]
      ).map((connection: any) => ({ ...connection, relays: [] as any[] }));
      const history: Array<{ role: "user" | "assistant"; content: string }> = [
        ...(fixture.history ?? []),
      ];
      const records: any[] = [],
        turns: any[] = [],
        calls: any[] = [];
      let memory =
        "현재 Search Brief: 백엔드 개발 업무를 희망. 저장된 Memory 없음.";
      for (const [turnIndex, text] of fixture.turns.entries()) {
        const start = Date.now(),
          requestStart = requests.length;
        const createdAt = new Date(
          Date.parse("2026-10-09T00:00:00Z") + turnIndex * 60_000
        ).toISOString();
        const steps: any[] = [];
        const events: any[] = [];
        let preparedReply: string | null = null;
        const runtime = new CareerCapabilityRuntime({
          mode,
          eligibleTools: selection.tools,
          remembered: restoreCareerCapabilityLeases({
            currentCreatedAt: createdAt,
            rows: records.slice(-3).reverse(),
          }),
          promptArgs: () => ({
            channel: "chat",
            isOnboardingDone: true,
            profile: null,
            careerCoachingActivity: activity,
            conversationMode:
              activity?.status === "active" ? "career_coaching" : "default",
            currentPreferences: {
              preferredLocale: "ko",
              profileVisibility: "open_to_matches",
            },
            gmailCapability: fixture.gmail
              ? fixture.allowed
                ? "connected_but_unavailable_this_turn"
                : "available"
              : "not_connected",
            structuredProfileText:
              fixture.profileText ??
              "민재. 합성 소프트웨어 회사의 백엔드 엔지니어. 2023년부터 API 개발 업무. 저장된 Harper 생성 이력서: 민재_백엔드.pdf. 성과 수치는 사용자가 확인해 준 경우만 사용.",
            talentContextSection: contextRows
              ? renderTalentContextPrompt({
                  briefs: contextRows.filter(
                    (row) => row.collection === "brief"
                  ),
                  allBriefs: contextRows.filter(
                    (row) => row.collection === "brief"
                  ),
                  memories: contextRows.filter(
                    (row) => row.collection === "memory"
                  ),
                  memorySelection: "recent_fallback",
                  memoryTruncated: false,
                } as any)
              : memory,
          }),
          onStep: (step) => steps.push(step),
          onEvent: (event) => events.push(event),
        });
        const first = runtime.resolveStep(false);
        history.push({ role: "user", content: text });
        const executeTool = async ({
          name,
          input,
        }: {
          name: string;
          input: Record<string, unknown>;
        }) => {
          const call: any = { turnIndex, name, input: structuredClone(input) };
          calls.push(call);
          try {
            const validate = validators.get(name);
            if (!validate || !validate(input))
              throw new Error(
                `Invalid tool input: ${JSON.stringify(validate?.errors)}`
              );
            const { _uiStatusMessage, ...data } = input;
            let result: any;
            if (name === "list_documents")
              result = {
                documents: [...documents.values()].map((d) => ({
                  id: d.id,
                  file_name: d.fileName,
                  kind: d.kind ?? "resume",
                  origin_type: d.originType ?? "harper_generated_resume",
                  revision: d.revision,
                  is_public: d.isPublic ?? false,
                  is_primary: false,
                  textAvailable: true,
                })),
                hasMore: false,
                nextOffset: null,
              };
            else if (name === "read_document") {
              const d = documents.get(String(data.document_id));
              if (!d) throw new Error("Document not found");
              result = {
                document: {
                  id: d.id,
                  file_name: d.fileName,
                  origin_type: d.originType ?? "harper_generated_resume",
                },
                revision: d.revision,
                ...(data.format === "structured"
                  ? {
                      structuredContent: {
                        schema_version: 1,
                        template_version: "v1",
                        content: d.content,
                        source_document_ids: [],
                        source_refs: [],
                      },
                    }
                  : {
                      excerpt: (d.text ?? JSON.stringify(d.content)).slice(
                        Number(data.offset ?? 0),
                        Number(data.offset ?? 0) +
                          Number(data.max_chars ?? 4000)
                      ),
                      textAvailable: true,
                      hasMore: false,
                      nextOffset: null,
                    }),
              };
            } else if (name === "generate_resume") {
              const mutationKey = `${turnIndex}:${hash(JSON.stringify(data))}`;
              if (completedMutations.has(mutationKey)) {
                call.result = structuredClone(
                  completedMutations.get(mutationKey)
                );
                call.idempotent = true;
                return call.result;
              }
              const parsed = parseResumeInput(data);
              const source =
                parsed.action === "create"
                  ? null
                  : documents.get(parsed.document_id!);
              if (
                fixture.fault?.tool === name &&
                fixture.fault.kind === "unavailable"
              ) {
                call.result = {
                  ok: false,
                  error: "saving_unavailable",
                  message:
                    "Document save is unavailable; no document was changed. Retrying this request will not resolve it.",
                };
                return call.result;
              }
              if (
                fixture.fault?.tool === name &&
                fixture.fault.kind === "revision_conflict_once" &&
                !faultInjected &&
                source
              ) {
                source.revision++;
                source.content.basics = {
                  ...source.content.basics,
                  ...fixture.fault.concurrentBasics,
                };
                faultInjected = true;
              }
              if (
                parsed.action !== "create" &&
                (!source || source.revision !== parsed.expected_revision)
              ) {
                call.result = {
                  ok: false,
                  error: "revision_conflict",
                  message:
                    "The resume changed. Read the current structured document before retrying.",
                };
                return call.result;
              }
              const content =
                parsed.action === "create"
                  ? parsed.content
                  : applyResumeChanges(source!.content, parsed.changes ?? []);
              const id =
                parsed.action === "update"
                  ? source!.id
                  : `44444444-4444-4444-8444-${nextDocument++}`;
              const d = {
                id,
                content,
                revision: parsed.action === "update" ? source!.revision + 1 : 1,
                fileName: parsed.document_name
                  ? `${parsed.document_name}.pdf`
                  : (source?.fileName ?? "이력서.pdf"),
              };
              documents.set(id, d);
              result = {
                ok: true,
                documentId: id,
                revision: d.revision,
                fileName: d.fileName,
                isPrivate: true,
                href: getCareerDocumentHref(id),
                documentLink: formatCareerDocumentLink({
                  id,
                  title: d.fileName,
                }),
              };
              completedMutations.set(mutationKey, structuredClone(result));
            } else if (name === "write_talent_context") {
              if (contextRows) {
                const rows = structuredClone(contextRows);
                for (const change of data.changes as any[]) {
                  if (change.op === "add") {
                    if (!change.collection || !change.content)
                      throw new Error("Missing context fields");
                    rows.push({
                      ...change,
                      ref: Math.max(0, ...rows.map((row) => row.ref)) + 1,
                    });
                  } else {
                    const index = rows.findIndex(
                      (row) => row.ref === change.ref
                    );
                    if (index < 0) throw new Error("Unknown context ref");
                    if (change.op === "delete") rows.splice(index, 1);
                    else rows[index] = { ...rows[index], ...change };
                  }
                }
                contextRows = rows;
              } else memory += `\nSaved user facts: ${JSON.stringify(data)}`;
              result = {
                ok: true,
                applied: data.changes,
                assistantInstruction:
                  "Continue the original request. Explain the practical criteria or context that changed when useful; do not mention storage, collections, refs or tool names, and do not turn the reply into a receipt.",
                skipCommonAssistantInstruction: true,
              };
            } else if (name === "read_talent_context")
              result = {
                rows: (contextRows ?? []).filter(
                  (row) =>
                    (!data.collection || row.collection === data.collection) &&
                    (!Array.isArray(data.refs) || data.refs.includes(row.ref))
                ),
                hasMore: false,
              };
            else if (name === "manage_career_coaching_activity") {
              if (data.action === "suggest") {
                if (activity) throw new Error("Current activity exists");
                activity = {
                  activityId: "synthetic-activity",
                  messageId: 50,
                  revision: 1,
                  status: "suggested",
                  topic: data.topic,
                  agenda: data.agenda ?? [],
                  suggestedMinutes: data.suggestedMinutes,
                  plannedMinutes: null,
                  channel: null,
                  createdAt,
                  updatedAt: createdAt,
                  startedAt: null,
                  endedAt: null,
                };
              } else {
                if (
                  !activity ||
                  data.activityMessageId !== activity.messageId ||
                  data.expectedRevision !== activity.revision
                )
                  throw new Error("Activity revision conflict");
                activity = {
                  ...activity,
                  ...data,
                  revision: activity.revision + 1,
                  status:
                    data.action === "end"
                      ? "ended"
                      : data.action === "start"
                        ? "active"
                        : activity.status,
                  updatedAt: createdAt,
                };
              }
              result = {
                ok: true,
                status: activity.status,
                activityMessage: { coachingActivity: activity },
                assistantInstruction: buildCareerCoachingResultInstruction(
                  activity.status,
                  activity.channel
                ),
                skipCommonAssistantInstruction: true,
              };
            } else if (name === "read_career_coaching_list")
              result = {
                modelOutput:
                  "커리어 방향, 이직 결정, 강점 정리, 면접 준비를 코칭할 수 있습니다.",
              };
            else if (name === "open_url")
              result = {
                ok: true,
                url: data.url,
                title: "Engineering at Example",
                markdown:
                  "The engineering team reviews API latency weekly and documents incidents. New engineers pair with a mentor during their first month.",
              };
            else if (name === "web_search") result = { ok: true, results: [] };
            else if (name === "recommend_job_postings")
              result = {
                ok: true,
                status: "completed",
                candidateCount: 0,
                recommendationCount: 0,
                recommendations: [],
                message:
                  "The requested search completed with no suitable public postings.",
              };
            else if (name === "read_talent_activity_events")
              result = { events: [], hasMore: false, nextOffset: null };
            else if (name === "search_connected_gmail")
              result = fixture.gmailResult ?? {
                ok: true,
                messages: [],
                hasMore: false,
                query: data.query,
              };
            else if (name === "read_company_connections")
              result = {
                ok: true,
                connections: formatRelayableCompanyTalentConnections(
                  connections.map((c: any) => ({
                    connectionId: c.id,
                    recommendationId: c.id,
                    companyName: c.company,
                    roleName: c.role,
                    positionState: "active",
                    origin: "company_request_intro",
                    establishedAt: "2026-10-08T00:00:00Z",
                    latestCompanyContactAt: "2026-10-08T00:00:00Z",
                    latestRelayAt: c.relays.at(-1)?.at ?? null,
                    latestRelayStatus: c.relays.length ? "delivered" : null,
                    recentContacts: [
                      {
                        direction: "company_to_talent",
                        at: "2026-10-08T00:00:00Z",
                        content: c.lastMessage,
                      },
                      ...c.relays,
                    ],
                  }))
                ),
                assistantInstruction:
                  "Use these relationship facts and contact history to identify the intended company and Role. An old contact is not an obligation to answer it. Do not claim the company read or answered a contact. Do not expose IDs.",
                skipCommonAssistantInstruction: true,
              };
            else if (name === "contact_company") {
              const connection = connections.find(
                (c: any) => c.id === data.connectionId
              );
              if (!connection) throw new Error("Unknown connection");
              connection.relays.push({
                direction: "talent_to_company",
                at: createdAt,
                content: data.relayContent,
                documentId: data.documentId ?? null,
              });
              result = {
                ok: true,
                status: "delivered",
                delivered: true,
                companyName: connection.company,
                relayContent: data.relayContent,
                assistantInstruction: COMPANY_RELAY_DELIVERY_RESPONSE_CONTRACT,
                skipCommonAssistantInstruction: true,
              };
            } else if (name === "research_company" && fixture.researchReport) {
              preparedReply = fixture.researchReport;
              result = { ok: true, report: fixture.researchReport };
            } else if (
              [
                "update_talent_profile",
                "update_setting",
                "update_language_setting",
              ].includes(name)
            )
              result = { ok: true, applied: data };
            else throw new Error(`No external effect allowed: ${name}`);
            call.result = structuredClone(result);
            return result;
          } catch (error) {
            call.error = error instanceof Error ? error.message : String(error);
            throw error;
          }
        };
        try {
          const modelResponse = await captureContext.run(
            { caseId: fixture.id, mode, turnIndex },
            () =>
              runCareerChatAssistant({
                modelConfig: {
                  ...CAREER_LLM_CONFIG.assistant,
                  primaryModel: model,
                },
                toolRuntime: runtime,
                tools: first.tools,
                systemBlocks: first.systemBlocks,
                messages: history,
                responseLocale: "ko",
                executeTool,
                stopAfterToolNames: selection.stopAfterToolNames,
                usageLabel: "career/chat:capability-evaluation",
              })
          );
          const response = preparedReply ?? modelResponse;
          history.push({ role: "assistant", content: response });
          records.push({
            created_at: createdAt,
            payload: { careerCapabilityTurn: runtime.completedRecord() },
          });
          turns.push({
            text,
            response,
            elapsedMs: Date.now() - start,
            steps,
            events,
            initialToolNames: first.tools.map((t) => t.function.name),
            requestIndexes: Array.from(
              { length: requests.length - requestStart },
              (_, n) => requestStart + n
            ),
            record: runtime.completedRecord(),
          });
        } catch (error) {
          turns.push({
            text,
            error: String(error),
            elapsedMs: Date.now() - start,
            steps,
            events,
          });
          break;
        }
        save("requests.json", requests);
        save("logs.json", logs);
      }
      const successful = calls.filter(
        (c) => !c.error && isSuccessfulCareerToolResult(c.result)
      );
      const errors = [
        ...calls
          .filter((call) => call.error)
          .map((call) => `executor_error:${call.name}:${call.error}`),
        ...turns.flatMap((turn) =>
          turn.events
            .filter(
              (event: any) =>
                event.event === "call_rejected" ||
                event.event === "load_rejected"
            )
            .map(
              (event: any) =>
                `runtime_rejected:${event.tool ?? "loader"}:${event.error}`
            )
        ),
        ...(expected.attempted ?? [])
          .filter((name: string) => !calls.some((call) => call.name === name))
          .map((name: string) => `not_attempted:${name}`),
        ...Object.entries(expected.maxSuccessfulCalls ?? {})
          .filter(
            ([name, limit]) =>
              successful.filter(
                (call) => call.name === name && !call.idempotent
              ).length > Number(limit)
          )
          .map(([name]) => `too_many_effects:${name}`),
        ...Object.entries(expected.maxAttemptedCalls ?? {})
          .filter(
            ([name, limit]) =>
              calls.filter((call) => call.name === name).length > Number(limit)
          )
          .map(([name]) => `too_many_attempts:${name}`),
        ...(expected.forbiddenByTurn ?? []).flatMap((rule: any) =>
          successful
            .filter(
              (call) =>
                call.turnIndex === rule.turnIndex &&
                rule.names.includes(call.name)
            )
            .map((call) => `forbidden_turn:${rule.turnIndex}:${call.name}`)
        ),
        ...(expected.preserveDocumentIds ?? [])
          .filter(
            (id: string) =>
              JSON.stringify(documents.get(id)) !==
              JSON.stringify(initialDocuments.get(id))
          )
          .map((id: string) => `changed_preserved_document:${id}`),
        ...(expected.contextUpdateRefs ?? [])
          .filter(
            (ref: number) =>
              !successful.some(
                (call) =>
                  call.name === "write_talent_context" &&
                  call.input.changes.some(
                    (change: any) =>
                      change.op === "update" && change.ref === ref
                  )
              )
          )
          .map((ref: number) => `missing_context_update:${ref}`),
        ...Object.entries(expected.finalBasics ?? {})
          .filter(
            ([key, value]) =>
              documents.get(documentId)?.content.basics[key] !== value
          )
          .map(([key]) => `lost_concurrent_edit:${key}`),
        ...successful
          .filter(
            (call) =>
              call.name === "contact_company" &&
              ((expected.contactConnectionId &&
                call.input.connectionId !== expected.contactConnectionId) ||
                (expected.contactWithoutDocument && call.input.documentId))
          )
          .map(() => "incorrect_contact_target_or_attachment"),
        ...(manifest.strictModel
          ? requests
              .filter(
                (request) =>
                  request.caseId === fixture.id &&
                  request.mode === mode &&
                  request.request.model !== model
              )
              .map((request) => `unexpected_model:${request.request.model}`)
          : []),
        ...(expected.requiredActions ?? [])
          .filter(
            (action: any) =>
              !successful.some(
                (call) =>
                  call.turnIndex === action.turnIndex &&
                  call.name === action.name &&
                  call.input.action === action.action &&
                  (!action.documentId ||
                    call.input.document_id === action.documentId)
              )
          )
          .map(
            (action: any) =>
              `missing_action:${action.turnIndex}:${action.name}:${action.action}`
          ),
        ...(expected.forbiddenActions ?? [])
          .filter((action: any) =>
            successful.some(
              (call) =>
                call.turnIndex === action.turnIndex &&
                call.name === action.name &&
                call.input.action === action.action
            )
          )
          .map(
            (action: any) =>
              `forbidden_action:${action.turnIndex}:${action.name}:${action.action}`
          ),
        ...(expected.required
          ?.filter((name: string) => !successful.some((c) => c.name === name))
          .map((name: string) => `missing:${name}`) ?? []),
        ...successful
          .filter((c) => expected.forbidden?.includes(c.name))
          .map((c) => `forbidden:${c.name}`),
        ...successful
          .filter(
            (c) =>
              c.name === "generate_resume" &&
              expected.resumeAction &&
              c.input.action !== expected.resumeAction
          )
          .map((c) => `wrong_resume_action:${c.input.action}`),
        ...turns
          .filter((t) => t.error || !t.response)
          .map(() => "missing_response"),
      ];
      if (
        expected.resumeAction === "copy" &&
        JSON.stringify(documents.get(documentId)!.content) !==
          JSON.stringify(originalContent)
      )
        errors.push("copy_mutated_original");
      const result = {
        id: fixture.id,
        mode,
        turns,
        calls,
        structuralErrors: errors,
        semanticReview: "pending",
        documents: [...documents.values()],
        contextRows,
      };
      results.push(result);
      save("results.json", results);
      console.log(
        JSON.stringify({
          id: fixture.id,
          mode,
          turns: turns.length,
          errors,
          toolCalls: calls.length,
        })
      );
    }
  }
  manifest.completedAt = new Date().toISOString();
  manifest.promptFingerprint = hash(
    JSON.stringify(requests.map((r) => r.promptFingerprint))
  );
  manifest.metricSummary = {
    completedCases: results.length,
    structuralFailures: results.filter((r) => r.structuralErrors.length).length,
    semanticReview: "pending",
    requests: requests.length,
  };
  manifest.observedRequestConfigs = [
    ...new Map(
      requests.map((row) => {
        const config = {
          model: row.request.model,
          endpoint: row.endpoint,
          reasoning: row.request.reasoning ?? null,
          maxOutputTokens:
            row.request.max_output_tokens ?? row.request.max_tokens,
          store: row.request.store,
        };
        return [JSON.stringify(config), config];
      })
    ).values(),
  ];
  save("manifest.json", manifest);
  save("requests.json", requests);
  save("logs.json", logs);
  const pricedRequests = requests.map((row) => {
    const usage = extractLlmTokenUsage(row.response);
    return {
      caseId: row.caseId,
      mode: row.mode,
      turnIndex: row.turnIndex,
      model: row.request.model,
      status: row.status,
      usage,
      cost:
        usage.inputTokens !== null && usage.outputTokens !== null
          ? estimateLlmUsageCost(row.request.model, usage)
          : null,
    };
  });
  save("usage-summary.json", {
    model,
    requests: pricedRequests.length,
    inputTokens: pricedRequests.reduce(
      (sum, row) => sum + (row.usage?.inputTokens ?? 0),
      0
    ),
    outputTokens: pricedRequests.reduce(
      (sum, row) => sum + (row.usage?.outputTokens ?? 0),
      0
    ),
    totalProcessedInputTokens: pricedRequests.reduce(
      (sum, row) => sum + (row.usage.totalProcessedInputTokens ?? 0),
      0
    ),
    estimatedCostUsd: pricedRequests.reduce(
      (sum, row) => sum + (row.cost?.estimatedCostUsd ?? 0),
      0
    ),
    unpricedRequests: pricedRequests.filter((row) => !row.cost).length,
    note: "Assistant requests only; external tool effects are synthetic. Missing prices are unknown, not free. Credits/billing balance is not measured.",
    requestUsage: pricedRequests,
  });
  if (results.some((result) => result.structuralErrors.length))
    process.exitCode = 1;
  console.log(`Saved ${out}`);
}
main().catch((error) => {
  save("failure.json", { error: String(error) });
  process.exitCode = 1;
});
// Keep the network boundary installed until process exit, including late usage logs.
