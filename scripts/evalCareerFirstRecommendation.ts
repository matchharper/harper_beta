/**
 * First recommendation after onboarding (docs/evaluation/career-first-recommendation).
 *
 * Runs the post-onboarding background turn (`conversation_completed`) to completion
 * for each frozen synthetic persona with the production prompt plan, capability
 * runtime, Decisions preload selector, tool schemas and default model. Tool results
 * are rendered from the frozen fixture in the current production formats. No DB,
 * queue, email or other external effect; network is limited to model providers.
 *
 *   NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server \
 *     pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerFirstRecommendation.ts \
 *     [--dataset v1|transfer-v1] [--repeat 2] [--only id,id] [--label name] [--concurrency 4] [--render-prompt id] [--validate-only]
 */
import { config } from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Ajv from "ajv";

config({ path: ".env.local", quiet: true });
// No path in this evaluation may reach a database.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
process.umask(0o077);

const TASK = "docs/evaluation/career-first-recommendation";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const option = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
// v1: the four personas the prompts were iterated on; transfer-v1: two personas frozen later to check transfer.
const DATASET = option("--dataset", "v1");
assert.match(DATASET, /^[\w.-]+$/);
type Row = Record<string, any>;

// Files whose text reaches the model in this turn. Their hashes identify the prompt version of a run.
const SOURCE_FILES = [
  "scripts/evalCareerFirstRecommendation.ts",
  "src/lib/career/prompts/mainPrompt2.ts", "src/lib/career/prompts/mainPrompts.ts", "src/lib/career/prompts/conversationPlan.ts",
  "src/lib/career/prompts/conversationSections.ts", "src/lib/career/prompts/postOnboardingGuide.ts", "src/lib/career/prompts/internalOpportunities.ts",
  "src/lib/career/prompts/promptCaching.ts", "src/lib/career/actionItems.ts", "src/lib/career/background/prompt.ts",
  "src/lib/llm/toolDescriptions.ts", "src/lib/career/llmTools.ts", "src/lib/career/llm.ts", "src/lib/talentOnboarding/llm.ts",
  "src/lib/career/matching/searchOutput.ts", "src/lib/career/matching/candidatePool.ts", "src/lib/career/matching/formatters.ts",
  "src/lib/career/matching/workContext.ts", "src/lib/career/matching/publishedFacts.ts", "src/lib/career/matching/tools.ts",
  "src/lib/career/companies/discovery.ts", "src/lib/career/companies/signals.ts", "src/lib/career/companies/readCompanies.ts",
  "src/lib/career/resources/companyData.ts", "src/lib/career/notes/format.ts",
  ...["capabilities", "handbooks", "handbooks/methods"].flatMap(folder => readdirSync(`src/lib/career/${folder}`)
    .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => `src/lib/career/${folder}/${name}`)),
];

async function main() {
  const fixtureText = readFileSync(`${TASK}/cases-${DATASET}.json`);
  const goldText = readFileSync(`${TASK}/gold-${DATASET}.json`);
  const frozen = JSON.parse(readFileSync(`${TASK}/manifest-${DATASET}.json`, "utf8"));
  assert.equal(hash(fixtureText), frozen.hashes[`cases-${DATASET}.json`], "cases changed after the manifest was frozen");
  assert.equal(hash(goldText), frozen.hashes[`gold-${DATASET}.json`], "gold changed after the manifest was frozen");
  const fixture = JSON.parse(fixtureText.toString());
  const gold = JSON.parse(goldText.toString()).cases;

  const { resolveCareerChatTools } = await import("@/lib/career/llmTools");
  const { resolveCareerTextChatModel } = await import("@/lib/career/textChatModelConfig");
  const { CareerCapabilityRuntime } = await import("@/lib/career/capabilities/runtime");
  const { getCareerCapabilityMode } = await import("@/lib/career/capabilities/registry");
  const { selectCareerPreloads } = await import("@/lib/career/capabilities/decisions");
  const { runCareerChatAssistant } = await import("@/lib/career/llm");
  const { withLlmUsageContext, getLlmUsageContext } = await import("@/lib/llm/usageContext");
  const { renderCareerBackgroundInvocation } = await import("@/lib/career/background/prompt");
  const { formatTalentMessageContentForLlmPrompt, formatTalentConversationReferencesForLlm } = await import("@/lib/career/opportunityFeedbackNote");
  const { buildTalentProfileContext } = await import("@/lib/talentOnboarding/profileStore");
  const { renderTalentContextPrompt } = await import("@/lib/talentOnboarding/talentContexts");
  const { formatTalentSchedules } = await import("@/lib/career/meetings/server");
  const { formatNoteIndex } = await import("@/lib/career/notes/format");
  const { formatLlmDateTime } = await import("@/lib/llm/promptDateTime");
  const { listCoverage } = await import("@/lib/career/listCoverage");
  const { directUsageCost } = await import("@/lib/externalRecommendationsV2/usage");
  const { extractLlmTokenUsage, estimateLlmUsageCost } = await import("@/lib/llm/usageLogging");
  const { stripTalentOnboardingCompletionMarker } = await import("@/lib/talentOnboarding/completion");
  const createWorld = await worldFactory();

  const model = resolveCareerTextChatModel(undefined);
  const capabilityMode = getCareerCapabilityMode();
  // Message time labels are relative to the actual clock, so the frozen onboarding times move with the run:
  // the conversation ends minutes before the turn, as it does in production.
  const requestTime = new Date();
  const shift = requestTime.getTime() - Date.parse(fixture.requestTime);
  const shifted = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
  const onboardingCompletedAt = shifted(fixture.onboardingCompletedAt);
  const only = option("--only", "").split(",").filter(Boolean);
  const cases: Row[] = fixture.cases.filter((c: Row) => !only.length || only.includes(c.id));
  for (const id of only) assert.ok(cases.some(c => c.id === id), `Unknown case ${id}`);

  /** Everything chatTurn and the agent runtime put into this turn's prompt arguments, rebuilt from the fixture. */
  const prepare = (scenario: Row) => {
    const selected = resolveCareerChatTools({ channel: "chat", background: false, isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false });
    // A background reply has no visible checklist, so upsert_plan is not offered (chatTurn).
    const tools = selected.tools.filter(tool => tool.function.name !== "upsert_plan");
    const toolNames = tools.map(tool => tool.function.name);
    const profileRow = { name: scenario.talent.name, headline: scenario.talent.headline, location: scenario.talent.location, bio: scenario.talent.bio,
      resume_file_name: scenario.talent.resume_file_name, resume_text: scenario.talent.resume_text, resume_links: [], current_location: scenario.talent.location };
    const structuredProfile = {
      talentUser: profileRow,
      talentExperiences: scenario.experiences.map((row: Row, i: number) => ({ id: `${scenario.id}-exp-${i + 1}`, months: null, memo: null, ...row })),
      talentEducations: scenario.educations.map((row: Row, i: number) => ({ id: `${scenario.id}-edu-${i + 1}`, memo: null, ...row })),
      talentExtras: scenario.extras.map((row: Row, i: number) => ({ id: `${scenario.id}-extra-${i + 1}`, memo: null, ...row })),
    };
    const setting = { ...scenario.setting, preferred_locale: "ko", is_onboarding_done: true, status: "active", get_external_recommendation: true };
    const structuredProfileText = buildTalentProfileContext({ profile: profileRow as any, structuredProfile: structuredProfile as any, setting: setting as any, includeResumeText: true, maxResumeChars: 3000 });
    const contextRows = {
      briefs: scenario.brief.map((row: Row) => ({ id: row.ref, collection: "brief", ...row })),
      memories: scenario.memories.map((row: Row) => ({ id: 100 + row.ref, collection: "memory", ...row })),
    };
    const talentContextSection = renderTalentContextPrompt({ allBriefs: contextRows.briefs, briefs: contextRows.briefs, memories: contextRows.memories,
      memorySelection: "all", memoryTruncated: false } as any);
    const history = scenario.onboarding.map((message: Row, i: number) => ({ id: i + 1, role: message.role, content: message.content, message_type: "chat",
      created_at: shifted(message.at), payload: null }));
    const llmMessages = history.map((row: Row) => ({ role: row.role as "user" | "assistant",
      content: formatTalentMessageContentForLlmPrompt(row as any, { includeCreatedAt: true, preferredLocale: "ko", timeZone: "Asia/Seoul" }) }))
      .filter((row: Row) => row.content.trim());
    // processCareerBackgroundRun: event text, inbox appointments and sent-email history.
    const proactiveContext = [
      renderCareerBackgroundInvocation({ id: `run-${scenario.id}`, talent_id: scenario.id, conversation_id: scenario.id, status: "handed_off",
        trigger: "conversation_completed", trigger_payload: {}, created_at: onboardingCompletedAt } as any),
      formatTalentSchedules({ schedules: [] }),
      `Sent email history (${listCoverage(0, false)}):\n`,
    ].filter(Boolean).join("\n\n");
    const references = formatTalentConversationReferencesForLlm(history as any, { preferredLocale: "ko", timeZone: "Asia/Seoul" });
    const until = new Date(requestTime.getTime() + 3 * 86400000);
    // readCareerAgentResourceContext for a person who has just finished onboarding.
    const resourceIndex = [
      "Harper-connected proposals already selected for this candidate, not yet published: 0. Times: Asia/Seoul.\nread_recommended_opportunities reads recommendations and selected unpublished proposals; get_role_context reads details. This index does not measure all-role evaluation coverage or create new selections.",
      `Upcoming 72 hours, ${formatLlmDateTime(requestTime)} through ${formatLlmDateTime(until)}:\n${formatTalentSchedules({ schedules: [] })}`,
      `Active matchings (${listCoverage(0, false)}):\nActive searches (${listCoverage(0, false)}):`,
      ["Saved Career work (times: Asia/Seoul):", `Saved schedules (${listCoverage(0, false)}):`, `Company follows (${listCoverage(0, false)}):`].join("\n"),
      formatNoteIndex({ notes: [], total: 0 }),
      `Saved documents (${listCoverage(1, false)}; primary resume first; read_document for content):\n- document_id ${scenario.id}-resume; ${scenario.talent.resume_file_name}; resume; primary`,
      `Profiles (${listCoverage(1, false)}):\n- profile ${scenario.id}-profile, revision 1; 기본 프로필; default`,
      `Unresolved forms in this conversation (${listCoverage(0, false)}):`,
    ].join("\n");
    const resources = ["Unfinished work / suspended replies in this conversation: none.", resourceIndex].join("\n\n");
    const promptArgs: Row = {
      isMobile: false, careerCoachingActivity: null, conversationMode: "default", activeInternalFitHoldQuestion: null,
      channel: "chat", backgroundInvocation: false, scheduledWork: undefined, includePostOnboardingConversationGuide: true,
      companyTalentRequestText: null, talentContextSection,
      currentPreferences: { engagementTypes: scenario.setting.engagement_types, getExternalRecommendation: true, periodicIntervalDays: null,
        preferredLocale: "ko", profileVisibility: scenario.setting.profile_visibility, recommendationBatchSize: null, talentSettingStatus: "active" },
      gmailCapability: "not_connected", userChatTurnCount: history.filter((row: Row) => row.role === "user").length,
      isConversationCompletedOpportunityRunActive: true, isOnboardingDone: true, officialJobSignupIntentPrompt: null,
      opportunityStatus: { activeRunCreatedAt: onboardingCompletedAt, activeRunStatus: "handed_off", isInitialSearchRunning: false, onboardingCompletedAt },
      pendingOpportunityFeedbackContext: "", postOnboardingContext: null, profile: profileRow,
      runtimeInstruction: [[proactiveContext, references].filter(Boolean).join("\n\n"), resources].filter(Boolean).join("\n\n"),
      recentActivitySummaries: [], recentRecommendedOpportunitiesText: "", structuredProfileText,
      requestTime, timeZone: "Asia/Seoul", toolNames, actionItems: [],
    };
    return { tools, toolNames, stopAfterToolNames: selected.stopAfterToolNames, promptArgs, llmMessages, proactiveContext, talentContextSection, structuredProfileText };
  };

  const renderOnly = option("--render-prompt", "");
  if (renderOnly || process.argv.includes("--validate-only")) {
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("No network in this mode"); };
    try {
      for (const scenario of cases.filter(c => !renderOnly || c.id === renderOnly)) {
        const prepared = prepare(scenario);
        const runtime = new CareerCapabilityRuntime({ mode: capabilityMode, eligibleTools: prepared.tools, promptArgs: () => prepared.promptArgs as any,
          selection: { capabilityIds: ["opportunities", "resources"], handbookIds: ["opportunity_search"], status: "selected", elapsedMs: 0 } });
        const step = runtime.resolveStep(false);
        if (renderOnly) {
          console.log(step.systemBlocks.map(block => `<<${block.key}>>\n${block.text}`).join("\n\n"));
          console.log("\n<<messages>>\n" + prepared.llmMessages.map((m: Row) => `${m.role}: ${m.content}`).join("\n"));
          console.log("\n<<tools>>\n" + step.tools.map(tool => tool.function.name).join(", "));
          continue;
        }
        const world = createWorld({ fixture, scenario, requestTime, onboardingCompletedAt, talentContextSection: prepared.talentContextSection, profileText: prepared.structuredProfileText });
        const probes: [string, Row][] = [
          ["list_matchings", {}],
          ["upsert_matching", { action: "create", title: "probe", criteria: { brief: scenario.brief.map((b: Row) => ({ label: b.label, content: b.content })) } }],
          ["search_opportunities", { action: "search", postings: { roleTitles: ["probe"], countries: { KR: { weight: 1 }, US: { weight: 0.5 } } }, companies: { about: "probe" }, named: ["Lumen Pay", "https://unknown-company.example"] }],
          ["read_companies", { companies: [1, 2], check: true }],
          ["get_role_context", { roleIds: [1] }],
          ["web_search", { query: "채용 시리즈 A 투자" }],
          ["open_url", { url: ["https://vela.example/careers", "https://nowhere.example/x"] }],
          ["upsert_opportunities", { action: "add", items: [{ candidate: 1, explanation: "probe" }, { candidate: 2, explanation: "probe" }] }],
          ["read_matching", { matchingId: world.state.matching?.id ?? "x" }],
          ["upsert_note", { action: "create", kind: "work", title: "probe", content: "probe body" }],
          ["read_notes", {}],
        ];
        for (const [name, input] of probes) {
          const callInput = name === "read_matching" ? { matchingId: world.state.matching!.id } : input;
          const result = await world.execute(name, callInput);
          world.observe(name, result, callInput);
          assert.ok(typeof result.modelOutput === "string" && result.modelOutput.length, `${scenario.id}: ${name} produced no output`);
        }
        console.log(`${scenario.id}: executors ok; published ${world.state.published.length}; pool ${world.state.pool.size}`);
        console.log(world.calls.map(call => `--- ${call.name}\n${call.output}`).join("\n").slice(0, renderOnly ? 0 : 6000));
      }
    } finally { globalThis.fetch = original; }
    return;
  }

  const repeat = Number(option("--repeat", "2")); assert.ok(Number.isInteger(repeat) && repeat > 0);
  const concurrency = Number(option("--concurrency", "4")); assert.ok(Number.isInteger(concurrency) && concurrency > 0);
  const label = option("--label", "run"); assert.match(label, /^[\w.-]+$/);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
  const dir = `${TASK}/runs/${runId}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}`, typeof value === "string" ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
  const sources = Object.fromEntries(SOURCE_FILES.map(path => [path, readFileSync(path, "utf8")]));
  save("sources.json", sources);
  save("manifest.json", {
    runId, label, datasetVersion: DATASET, fixtureHashes: frozen.hashes, cases: cases.map(c => c.id), repeat, concurrency,
    model, capabilityMode, requestTime: requestTime.toISOString(), fixtureRequestTime: fixture.requestTime,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([path, text]) => [path, hash(text)])),
    workingTreeDiffHash: hash(execFileSync("git", ["diff", "--", "src/lib/career/prompts", "src/lib/career/handbooks", "src/lib/llm/toolDescriptions.ts", "src/lib/career/matching"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })),
    boundary: "Production prompt plan, capability runtime, live Decisions preload selector and default Career model; tool results rendered from frozen synthetic fixtures in production formats; no DB or external effects; network limited to model providers.",
    startedAt: new Date().toISOString(),
  });

  const scope = new AsyncLocalStorage<{ caseId: string; iteration: number }>();
  const normalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const level of ["log", "info", "warn", "error"] as const)
    console[level] = (...args: unknown[]) => appendFileSync(`${dir}/runtime.log`, JSON.stringify({ ...scope.getStore(), level, values: args.map(String) }) + "\n", { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  const requests: Row[] = [], blocked: Row[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const current = scope.getStore();
    const allowed = (url.hostname === "api.openai.com" && ["/v1/responses", "/v1/chat/completions", "/v1/decisions"].includes(url.pathname))
      || (url.hostname === "api.anthropic.com" && url.pathname === "/v1/messages");
    if (!allowed) { blocked.push({ ...current, host: url.hostname, path: url.pathname }); throw new Error("Evaluation blocks non-provider network"); }
    const body = JSON.parse(String(init?.body ?? "{}"));
    const index = requests.length + 1, started = Date.now();
    const record: Row = { ...current, index, path: url.pathname, model: body.model, requestHash: hash(JSON.stringify(body)) };
    requests.push(record);
    save(`request-${String(index).padStart(3, "0")}.json`, { ...current, body });
    try {
      const response = await originalFetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(240_000)]) });
      const text = await response.clone().text();
      record.status = response.status; record.elapsedMs = Date.now() - started;
      try { record.usage = JSON.parse(text).usage; } catch { /* streamed or non-JSON body kept below */ }
      save(`response-${String(index).padStart(3, "0")}.json`, { status: response.status, body: text });
      return response;
    } catch (error) { record.error = error instanceof Error ? error.message : String(error); throw error; }
    finally { save("requests.json", requests); }
  };

  const jobs = cases.flatMap(scenario => Array.from({ length: repeat }, (_, i) => ({ scenario, iteration: i + 1 })));
  const results: Row[] = [];
  const runJob = ({ scenario, iteration }: { scenario: Row; iteration: number }) => scope.run({ caseId: scenario.id, iteration }, async () => {
    const began = Date.now();
    const prepared = prepare(scenario);
    const signal = AbortSignal.timeout(900_000);
    const world = createWorld({ fixture, scenario, requestTime, onboardingCompletedAt, talentContextSection: prepared.talentContextSection, profileText: prepared.structuredProfileText });
    const ajv = new Ajv({ strict: false, allowUnionTypes: true, validateFormats: false });
    const validators = new Map(prepared.tools.map(tool => [tool.function.name, ajv.compile(tool.function.parameters)]));
    // The Decisions selector runs outside a usage context, as in production; its receipt is a log line only.
    const selection = await selectCareerPreloads({ eligibleNames: new Set(prepared.toolNames), eligibleTools: prepared.tools,
      input: { messages: prepared.llmMessages, currentContext: ["Gmail: not_connected.", prepared.proactiveContext].join("\n\n") },
      activeHandbooks: [], signal, background: false });
    const previewUsage: any[] = [];
    let promptArgs = prepared.promptArgs;
    const runtime = new CareerCapabilityRuntime({
      mode: capabilityMode, eligibleTools: prepared.tools, promptArgs: () => promptArgs as any,
      replyId: `${scenario.id}-${iteration}`, handbooks: [], selection, abortSignal: signal,
      refreshAfterTool: async (name, result, input) => {
        world.observe(name, result, input ?? {});
        if (name === "write_talent_context") promptArgs = { ...promptArgs, talentContextSection: world.talentContextText() };
      },
    });
    const first = runtime.resolveStep(false);
    let reply = "", error: string | undefined;
    try {
      reply = await withLlmUsageContext({ requestId: randomUUID(), previewUsage }, () => runCareerChatAssistant({
        toolRuntime: runtime, primaryModel: model.model, openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort,
        chatCompletionReasoningEffort: model.chatCompletionReasoningEffort, responseLocale: "ko", messages: prepared.llmMessages,
        tools: first.tools, systemBlocks: first.systemBlocks, stopAfterToolNames: prepared.stopAfterToolNames, isOnboardingActive: false,
        abortSignal: signal, usageLabel: "career:background-agent",
        executeTool: async call => {
          if (!world.calls.length) normalConsole.log(`usage context inside loop: previewUsage ${Boolean(getLlmUsageContext()?.previewUsage)}`);
          const validate = validators.get(call.name);
          if (validate && !validate(call.input)) { world.recordInvalid(call.name, call.input, ajv.errorsText(validate.errors)); throw new Error(`Invalid ${call.name} input: ${ajv.errorsText(validate.errors)}`); }
          return world.execute(call.name, call.input);
        },
      }));
    } catch (cause) { error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause); }
    const delivered = stripTalentOnboardingCompletionMarker(String(reply ?? "")).trim();
    const own = requests.filter(r => r.caseId === scenario.id && r.iteration === iteration);
    const decisions = own.filter(r => r.path === "/v1/decisions");
    // Priced from each provider response's own usage, with the production pricing table.
    const completions = own.filter(r => r.path !== "/v1/decisions" && r.usage).map(r => {
      const tokens = extractLlmTokenUsage({ usage: r.usage, model: r.model });
      return { tokens, cost: estimateLlmUsageCost(r.model, tokens)?.estimatedCostUsd ?? 0 };
    });
    const usage = {
      previewCalls: previewUsage.length,
      inputTokens: completions.reduce((n, c) => n + (c.tokens.inputTokens ?? 0), 0),
      cachedInputTokens: completions.reduce((n, c) => n + (c.tokens.cacheReadInputTokens ?? 0), 0),
      outputTokens: completions.reduce((n, c) => n + (c.tokens.outputTokens ?? 0), 0),
      estimatedCostUsd: completions.reduce((n, c) => n + c.cost, 0)
        + decisions.reduce((n, r) => n + (directUsageCost("openai_decisions", r.usage ?? null).usd ?? 0), 0),
      providerRequests: own.map(r => ({ index: r.index, path: r.path, model: r.model, status: r.status, elapsedMs: r.elapsedMs, usage: r.usage })),
    };
    const result = {
      caseId: scenario.id, iteration, label, model, selection, elapsedMs: Date.now() - began, error,
      noteToolsOffered: prepared.toolNames.includes("read_notes") && prepared.toolNames.includes("upsert_note"),
      notes: [...world.notes.values()],
      reply: delivered, calls: world.calls, published: world.publishedForReview(gold[scenario.id]), unknownTools: world.unknownTools,
      invalidInputs: world.invalidInputs, runtime: runtime.completedRecord(), usage,
    };
    save(`${scenario.id}-${iteration}.json`, result);
    save(`${scenario.id}-${iteration}.md`, reviewMarkdown(result));
    results.push(result);
    normalConsole.log(JSON.stringify({ caseId: scenario.id, iteration, elapsedMs: result.elapsedMs, published: result.published.length,
      tools: world.calls.map(c => c.name), handbooks: result.runtime.injectedHandbooks, costUsd: Number(usage.estimatedCostUsd.toFixed(3)), error }));
  });

  normalConsole.log(`Run directory: ${dir}`);
  let cursor = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (cursor < jobs.length) await runJob(jobs[cursor++]);
    }));
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(console, normalConsole);
    save("requests.json", requests);
    save("blocked-network.json", blocked);
  }
  results.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.iteration - b.iteration);
  save("results.json", results.map(({ calls, ...rest }) => rest));
  save("review.md", [`# ${runId}`, "", ...results.map(reviewMarkdown)].join("\n\n---\n\n"));
  const total = results.reduce((n, r) => n + r.usage.estimatedCostUsd, 0);
  normalConsole.log(`Saved ${results.length} results to ${dir}; estimated cost ${total.toFixed(2)} USD; blocked network ${blocked.length}`);
}

function reviewMarkdown(result: Row) {
  const quote = (text: string) => text.split("\n").map(line => `> ${line}`).join("\n");
  return [
    `## ${result.caseId} · ${result.iteration} · ${result.label}`,
    `elapsed ${(result.elapsedMs / 1000).toFixed(0)}s · cost ≈ ${result.usage.estimatedCostUsd.toFixed(3)} USD · preload ${JSON.stringify({ capabilities: result.selection.capabilityIds, handbooks: result.selection.handbookIds, status: result.selection.status })} · handbooks supplied ${JSON.stringify(result.runtime.injectedHandbooks)}`,
    result.error ? `**error** ${result.error}` : "",
    `tools: ${result.calls.map((c: Row) => c.name + (c.error ? "(error)" : "")).join(" → ") || "none"}`,
    result.unknownTools.length ? `**unknown tools** ${result.unknownTools.join(", ")}` : "",
    `### Published (${result.published.length})`,
    ...result.published.map((p: Row) => `- [${p.gold ?? "unlabeled"}] ${p.key} · ${p.title}${p.goldReason ? ` — gold: ${p.goldReason}` : ""}\n  explanation: ${String(p.explanation ?? "").replace(/\s+/g, " ")}`),
    "### Reply",
    quote(result.reply || "(empty)"),
    `### Notes (${result.notes?.length ?? 0}; note tools ${result.noteToolsOffered ? "offered" : "not offered"})`,
    ...(result.notes ?? []).map((n: Row) => `- ${n.kind} · ${n.title} · revision ${n.revision}${n.matchingId ? ` · matching ${n.matchingId}` : ""}\n\n${quote(n.content || "(empty)")}`),
  ].filter(Boolean).join("\n\n");
}


/**
 * The frozen market of one persona. Every tool result is rendered in the current production
 * format from the fixture; production formatters are reused wherever they are pure.
 */
async function worldFactory() {
  const { formatLedger, formatRouteHistory } = await import("@/lib/career/matching/candidatePool");
  const { formatCompanyFill } = await import("@/lib/career/matching/searchOutput");
  const { formatCompanyFacts } = await import("@/lib/career/companies/discovery");
  const { formatCareerMatchingResult } = await import("@/lib/career/matching/formatters");
  const { createSearchWorkTally } = await import("@/lib/career/matching/workContext");
  const { observedMatchingId } = await import("@/lib/career/matching/focus");
  const { payFact } = await import("@/lib/career/matching/publishedFacts");
  const { formatCompanyProjection } = await import("@/lib/career/resources/companyData");
  const { formatRoleContextForModel } = await import("@/lib/talentOnboarding/roleContextFormat");
  const { formatMatchingWorkNote, formatNoteBody, formatNoteLine } = await import("@/lib/career/notes/format");
  const { scoreForLlm } = await import("@/lib/externalRecommendationsV2/contract");
  const { formatLlmDateTime, formatLlmElapsed } = await import("@/lib/llm/promptDateTime");
  const { companyIdentityOf } = await import("@/lib/career/companies/linked");
  const { renderTalentContextPrompt } = await import("@/lib/talentOnboarding/talentContexts");

  const ANGLE_LABEL: Record<string, string> = { postings: "postings", roles: "exact roles", about: "companies by description", like: "similar companies", named: "named companies", companies: "companies" };
  const WEIGHTS = "mutualFit 55%, candidateInterest 35%, companyInterest 10%; a constraint conflict lowers it";
  const PAGE = 30;
  const pad = (n: number) => String(n).padStart(12, "0");
  const money = (n: number) => n >= 1e8 ? `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억` : `${Math.round(n / 1e4).toLocaleString("en")}만`;
  const payText = (pay?: Row) => {
    if (!pay) return "";
    const krw = pay.currency === "KRW" && (pay.period ?? "year") === "year";
    const range = krw ? [pay.min, pay.max].filter(v => v != null).map(money).join("–") : `${[pay.min, pay.max].filter(v => v != null).join("–")} ${pay.currency ?? ""}/${pay.period ?? "year"}`;
    return `pay ${range}`;
  };
  const clip = (value: unknown, size: number) => { const text = String(value ?? "").replace(/\s+/g, " ").trim(); return text.length > size ? `${text.slice(0, size - 1)}…` : text; };
  const norm = (value: string) => value.toLowerCase().replace(/[\s·.,()'"_-]+/g, "");
  const hostOf = (value: string) => { try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
  const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value);

  return function createWorld(args: { fixture: Row; scenario: Row; requestTime: Date; onboardingCompletedAt: string; talentContextSection: string; profileText: string }) {
    const { fixture, scenario, requestTime } = args;
    const companies: Record<string, Row> = fixture.companies;
    const companyById = new Map(Object.values(companies).map(c => [c.id, c]));
    const options: Row[] = scenario.options;
    const optionByKey = new Map(options.map(o => [o.key, o]));
    const optionByRoleId = new Map(options.filter(o => o.roleId).map(o => [o.roleId, o]));
    const companyOptionOf = (companyKey: string) => optionByKey.get(`${companyKey}:company`);
    const briefs: Row[] = scenario.brief.map((b: Row) => ({ ...b }));
    const memories: Row[] = scenario.memories.map((m: Row) => ({ ...m }));
    const tally = createSearchWorkTally();
    const calls: Row[] = [], unknownTools: string[] = [], invalidInputs: Row[] = [];
    let seq = 0;
    const id = (prefix: string) => `${prefix}0000000-0000-4000-8000-${pad(++seq)}`;
    type Pool = { matching: Row; entries: Map<string, Row>; next: number; runs: Row[]; listRevision: number };
    const pools = new Map<string, Pool>();
    const runs = new Map<string, Row>();
    const state = { researchMatchingId: undefined as string | undefined, published: [] as Row[], companiesRead: new Set<string>(),
      get matching() { const pool = state.researchMatchingId ? pools.get(state.researchMatchingId) : [...pools.values()].at(-1); return pool?.matching; },
      get pool() { const pool = state.researchMatchingId ? pools.get(state.researchMatchingId) : undefined; return pool?.entries ?? new Map(); } };

    const companyOf = (option: Row) => companies[option.company] ?? option.adhocCompany;
    const titleOf = (option: Row) => option.kind === "posting" ? `${companyOf(option).name} / ${option.title}` : `${companyOf(option).name} (company)`;
    const factsFor = (option: Row) => {
      const company = companyOf(option);
      const facts: Row = { ...(company.facts ?? {}) };
      const reach = option.reach ?? options.find(o => o.company === option.company && o.reach)?.reach;
      if (reach && (reach.sameSchool || reach.sameCompany)) facts.reach = reach;
      if (facts.signals) facts.signals = { companyId: company.id, name: company.name, website: company.homepage ?? null, linkedinUrl: null, ...facts.signals };
      if (option.kind === "posting") facts.hiring = facts.hiring ? { openRoles: facts.hiring.openRoles } : undefined;
      else if (facts.hiring && !facts.hiring.relatedTitles) {
        const titles = options.filter(o => o.kind === "posting" && o.company === option.company).map(o => o.title).slice(0, 3);
        if (titles.length && facts.hiring.openRoles) facts.hiring = { ...facts.hiring, relatedTitles: titles };
      }
      return facts;
    };
    const line = (option: Row, entry: Row | undefined, fresh: boolean | undefined, angles: string[]) => {
      const company = companyOf(option);
      const head = entry ? `[${entry.number}]` : `[${option.roleId ?? company.id}]`;
      const tail = [String(Math.round(scoreForLlm(option.score))), fresh ? "new" : "", angles.length ? angles.map(a => ANGLE_LABEL[a] ?? a).join("/") : ""].filter(Boolean).join(" · ");
      if (option.kind === "posting") {
        const detail = [option.location, option.postedAt ? `posted ${option.postedAt}` : "", payText(option.pay), formatCompanyFacts(factsFor(option) as any, { now: requestTime })].filter(Boolean).join(" · ");
        return `${head} ${company.name} · ${option.title} · ${tail}${detail ? `\n  ${detail}` : ""}`;
      }
      const detail = [clip(company.description, 140), formatCompanyFacts(factsFor(option) as any, { now: requestTime })].filter(Boolean).join(" · ");
      return `${head} ${company.name} · company · ${tail}${detail ? `\n  ${detail}` : ""}`;
    };
    const projectionOf = (company: Row) => {
      const checkedAt = company.facts?.signals?.checkedAt ?? "2026-11-10T03:00:00Z";
      const sourceRef = { kind: "observation", id: `${company.id.slice(0, 8)}-obs`, revision: "1" };
      return {
        companyRef: { kind: "company_workspace", id: company.id }, name: company.name,
        summary: company.overview ? { dataRef: { kind: "company_datum", id: `${company.id.slice(0, 8)}-summary`, revision: "1" }, label: "summary", content: company.overview,
          checkedAt, sourceRefs: [sourceRef], sources: [{ ref: sourceRef, url: company.source.url, title: company.source.title }] } : null,
        labels: [...(company.overview ? [{ label: "summary", count: 1, checkedAt }] : []),
          ...(company.facts?.signals?.total ? [{ label: "hiring signal", count: company.facts.signals.total, checkedAt }] : [])],
        items: [], nextLabelOffset: null, state: "current",
      };
    };

    // ── company references ──
    const findByName = (query: string) => {
      const q = norm(query);
      const all = Object.values(companies);
      const exact = all.filter(c => norm(c.name) === q || norm(c.key) === q);
      if (exact.length) return { matches: exact, partial: false };
      const partial = all.filter(c => q.length >= 3 && (norm(c.name).includes(q) || q.includes(norm(c.name))));
      return { matches: partial, partial: true };
    };
    const adhoc = new Map<string, Row>();
    // Like resolveNamed: a known address resolves to its company; an unknown one is added once, and only where adding is allowed.
    const registerUrl = (value: string, register: boolean): { company?: Row; note?: string } => {
      // The production identity rule: a LinkedIn company page or a site's own address can add a company; a page cannot.
      let identity;
      try { identity = companyIdentityOf(value); } catch (error) { return { note: `${value}: ${(error as Error).message}` }; }
      const host = hostOf(value);
      const known = identity.column === "homepage_url"
        ? Object.values(companies).find(c => c.homepage && (hostOf(c.homepage) === host || host.endsWith(`.${hostOf(c.homepage)}`)))
        : undefined;
      if (known) return { company: known };
      const key = `web:${identity.match}`;
      if (adhoc.has(key)) return { company: adhoc.get(key)! };
      if (!register) return {};
      if (!identity.canAdd) return { note: `${value}: no company in Harper's directory has this site, and a page address does not add one; name the company's own site or LinkedIn company page` };
      adhoc.set(key, { key, id: id("a"), name: identity.name, description: "", homepage: identity.column === "homepage_url" ? `https://${host}` : undefined, facts: { hiring: { openRoles: 0 } } });
      return { company: adhoc.get(key)!, note: `${value}: added to Harper's company directory as "${identity.name}"` };
    };
    const optionForCompany = (company: Row, angle: string) => {
      const listed = companies[company.key] ? companyOptionOf(company.key) : undefined;
      if (listed) return listed;
      const key = `${company.key}:company`;
      if (!optionByKey.has(key)) {
        // Named outside this persona's frozen pool: judged with little fit to this person.
        const option = { key, kind: "company", company: company.key, adhocCompany: companies[company.key] ? undefined : company, score: companies[company.key] ? 35 : 40, routes: [angle], adhoc: true };
        optionByKey.set(key, option);
      }
      return optionByKey.get(key)!;
    };
    const resolveCompanyRefs = (pool: Pool | undefined, refs: unknown[], register: boolean) => {
      const found: Row[] = [], notes: string[] = [], registered: string[] = [];
      for (const ref of refs ?? []) {
        const value = String(ref ?? "").trim();
        if (!value) continue;
        if (typeof ref === "number" || /^\d+$/.test(value)) {
          if (!pool) throw new Error("Option numbers belong to a matching; open or name the matching first.");
          const entry = [...pool.entries.values()].find(e => e.number === Number(value));
          if (!entry) throw new Error(`No option [${value}] in this matching.`);
          found.push(companyOf(optionByKey.get(entry.key)!));
        } else if (/^[0-9a-f-]{36}$/i.test(value)) {
          const company = companyById.get(value) ?? [...adhoc.values()].find(c => c.id === value);
          if (company) found.push(company); else notes.push(`${value}: not a known company ID`);
        } else if (looksLikeUrl(value)) {
          const resolved = registerUrl(value, register);
          if (!resolved.company) { notes.push(resolved.note ?? `${value}: not in Harper's company directory`); continue; }
          found.push(resolved.company);
          if (resolved.note) { notes.push(resolved.note); registered.push(resolved.company.id); }
        } else {
          const { matches, partial } = findByName(value);
          if (!matches.length) notes.push(`${value}: not in Harper's company directory; name its official website or LinkedIn page to add it`);
          else { found.push(...matches); if (partial) notes.push(`${value}: no exact name; compared ${matches.map(m => m.name).join(", ")}`); }
        }
      }
      return { companies: [...new Map(found.map(c => [c.id, c])).values()], notes, registered };
    };

    // ── pools and searches ──
    const poolFor = (matchingId: string | undefined) => {
      if (!matchingId) return undefined;
      const pool = pools.get(matchingId);
      if (!pool) throw new Error(`Matching ${matchingId} is unavailable.`);
      return pool;
    };
    const published = (option: Row) => state.published.some(p => p.key === option.key);
    const orderOf = (pool: Pool) => [...pool.entries.values()].sort((a, b) => b.score - a.score || a.number - b.number);
    const routesText = (pool: Pool) => {
      const routes = new Map<string, Row>();
      for (const run of pool.runs) for (const angle of run.ledger.angles) {
        const r = routes.get(angle) ?? { searches: 0, best: null, latest: null };
        r.searches++;
        const found = run.ledger.bestNewByAngle?.[angle] ?? null;
        r.latest = { search: run.ledger.search, rank: found?.rank ?? null };
        if (found && (!r.best || found.rank <= r.best.rank)) r.best = { search: run.ledger.search, rank: found.rank };
        routes.set(angle, r);
      }
      return formatRouteHistory(routes as any);
    };
    const renderRun = (run: Row, cursor?: string) => {
      const pool = run.matchingId ? pools.get(run.matchingId) : undefined;
      const visible = run.items.filter((item: Row) => !published(optionByKey.get(item.key)!))
        .sort((a: Row, b: Row) => optionByKey.get(b.key)!.score - optionByKey.get(a.key)!.score);
      const start = cursor ? Math.max(0, visible.findIndex((item: Row) => item.evaluationId === cursor) + 1) : 0;
      const page = visible.slice(start, start + PAGE);
      const next = start + PAGE < visible.length ? page.at(-1)!.evaluationId : null;
      const numberOf = (companyId: string) => pool ? [...pool.entries.values()].find(e => optionByKey.get(e.key)!.kind === "company" && companyOf(optionByKey.get(e.key)!).id === companyId)?.number : undefined;
      const hidden = run.items.length - visible.length;
      const lines = page.map((item: Row) => line(optionByKey.get(item.key)!, pool?.entries.get(item.key), pool ? item.fresh : undefined, item.angles));
      return [
        run.ledger ? formatLedger(run.ledger) : `${visible.length} evaluated.`,
        pool ? routesText(pool) : "",
        ...run.notes,
        run.namedCompanyIds.length ? formatCompanyFill({ ready: run.namedCompanyIds }, numberOf) : "",
        hidden > 0 ? `Already recommended to this person and not listed: ${hidden}.` : "",
        "",
        ...lines,
        "",
        page.length ? `Showing ${page.length} of ${visible.length} by weighted score (${WEIGHTS}).${next ? ` Next: cursor ${next}.` : ""}` : "No options to list.",
        `Search run ${run.id}.`,
        "Team numbers come from Harper's career records as of the date shown.",
      ].filter((text, index, all) => text !== "" || (index > 0 && all[index - 1] !== "")).join("\n");
    };
    const search = (input: Row) => {
      const action = input.action ?? (input.runId ? "read" : "search");
      if (action !== "search") {
        if (!input.runId) throw new Error(`${action} requires the runId returned by search_opportunities.`);
        const run = runs.get(input.runId);
        if (!run) return { runId: input.runId, status: "not_found", modelOutput: `No search ${input.runId} is available to this user.` };
        if (action === "cancel") return { runId: run.id, status: "completed", modelOutput: `Search ${run.id} has already completed; nothing to cancel.` };
        return { runId: run.id, matchingId: run.matchingId, status: "completed", evaluationCount: run.items.length, modelOutput: renderRun(run, input.cursor) };
      }
      if (input.runId) throw new Error("Use read or resume with an existing runId.");
      const poolMatchingId = input.matchingId ?? state.researchMatchingId;
      const pool = poolFor(poolMatchingId);
      const notes: string[] = [];
      const found = new Map<string, Set<string>>();
      const add = (option: Row, angle: string) => found.set(option.key, new Set([...(found.get(option.key) ?? []), angle]));
      if (input.postings) {
        const plan = input.postings;
        const countries = plan.countries && typeof plan.countries === "object" ? plan.countries : {};
        const keys = Object.keys(countries).map(k => k.toUpperCase());
        if (!plan.roleTitles?.length || !keys.length) throw new Error("Invalid search plan: plan must have required property 'roleTitles' and 'countries'. The retrieval plan requires roleTitles and countries keyed by ISO country code.");
        let atCompanies: Set<string> | undefined;
        if (plan.at?.length) { const resolved = resolveCompanyRefs(pool, plan.at, false); notes.push(...resolved.notes); atCompanies = new Set(resolved.companies.map(c => c.key)); }
        for (const option of options.filter(o => o.kind === "posting")) {
          if (!keys.includes(option.country)) continue;
          const conditions = countries[option.country] ?? countries[option.country.toLowerCase()] ?? {};
          if ((plan.remoteOnly || conditions.remoteOnly) && !option.remote) continue;
          if (plan.includeRemote === false && option.remote) continue;
          if (option.contract && !plan.includeContract) continue;
          if (atCompanies && !atCompanies.has(option.company)) continue;
          add(option, "postings");
        }
      }
      for (const ref of input.roleIds ?? []) {
        const option = optionByRoleId.get(String(ref));
        if (option) add(option, "roles"); else notes.push(`Role ${ref} is unavailable.`);
      }
      const companiesInput = input.companies ?? {};
      if (companiesInput.about) {
        const places: string[] = (companiesInput.places ?? []).map((p: string) => p.toLowerCase());
        const [min, max] = ({ startup: [null, 50], scaleup: [51, 1000], large: [1001, null] } as Record<string, (number | null)[]>)[companiesInput.size ?? ""] ?? [null, null];
        for (const option of options.filter(o => o.kind === "company" && o.routes.includes("about"))) {
          const company = companyOf(option);
          const place = String(company.place ?? "").toLowerCase();
          if (places.length && place && !places.some(p => p.includes(place) || place.includes(p.split(",")[0].trim()))) continue;
          const size = company.facts?.profile?.size?.start ?? null;
          if (size != null && ((min != null && size < min) || (max != null && size > max))) continue;
          add(option, "about");
        }
      }
      if (companiesInput.like?.length) {
        const seeds = resolveCompanyRefs(pool, companiesInput.like, false);
        notes.push(...seeds.notes);
        const seedKeys = new Set(seeds.companies.map(c => c.key));
        for (const option of options.filter(o => o.kind === "company" && o.routes.includes("like") && !seedKeys.has(o.company))) add(option, "like");
      }
      const namedCompanyIds: string[] = [];
      if (input.named?.length) {
        const named = resolveCompanyRefs(pool, input.named, true);
        notes.push(...named.notes);
        // Same count line as search_opportunities (matching/tools.ts).
        if (named.companies.length) notes.push(`Named companies: ${named.companies.length}; already in Harper's company directory: ${named.companies.length - named.registered.length}; added now: ${named.registered.length}.`);
        for (const company of named.companies) { add(optionForCompany(company, "named"), "named"); namedCompanyIds.push(company.id); }
      }
      if (!input.postings && !input.roleIds?.length && !found.size)
        throw new Error(`${notes.join("; ") || "Nothing to evaluate"}. A search needs postings, companies, named companies or roleIds.`);
      const run: Row = { id: id("e"), matchingId: pool ? poolMatchingId : undefined, notes, namedCompanyIds, createdAt: new Date().toISOString(),
        items: [...found].map(([key, angles]) => ({ key, angles: [...angles], evaluationId: id("f") }))
          .sort((a, b) => optionByKey.get(b.key)!.score - optionByKey.get(a.key)!.score) };
      if (pool) {
        const known = new Set(pool.entries.keys());
        for (const item of run.items) {
          const option = optionByKey.get(item.key)!;
          item.fresh = !known.has(item.key);
          const entry = pool.entries.get(item.key);
          if (entry) entry.angles = [...new Set([...entry.angles, ...item.angles])];
          else pool.entries.set(item.key, { key: item.key, number: pool.next++, score: option.score, firstRunId: run.id, angles: item.angles });
        }
        const order = orderOf(pool);
        const bestNew = (keys: Set<string>) => { const i = order.findIndex(e => keys.has(e.key)); return i < 0 ? null : { number: order[i].number, rank: i + 1, of: order.length }; };
        const freshItems = run.items.filter((item: Row) => item.fresh);
        const angles = [...new Set<string>(run.items.flatMap((item: Row) => item.angles))];
        pool.runs.push(run);
        run.ledger = {
          search: pool.runs.length, evaluated: run.items.length,
          postings: run.items.filter((item: Row) => optionByKey.get(item.key)!.kind === "posting").length,
          companies: run.items.filter((item: Row) => optionByKey.get(item.key)!.kind === "company").length,
          fresh: freshItems.length,
          freshPostings: freshItems.filter((item: Row) => optionByKey.get(item.key)!.kind === "posting").length,
          freshCompanies: freshItems.filter((item: Row) => optionByKey.get(item.key)!.kind === "company").length,
          bestNew: bestNew(new Set(freshItems.map((item: Row) => item.key))),
          bestNewByAngle: Object.fromEntries(angles.flatMap(angle => { const best = bestNew(new Set(freshItems.filter((item: Row) => item.angles.includes(angle)).map((item: Row) => item.key))); return best ? [[angle, best]] : []; })),
          angles,
        };
      }
      runs.set(run.id, run);
      const visible = run.items.filter((item: Row) => !published(optionByKey.get(item.key)!)).length;
      return { runId: run.id, matchingId: run.matchingId, status: "completed", evaluationCount: visible, ...(run.ledger ? { ledger: run.ledger } : {}), modelOutput: renderRun(run) };
    };

    // ── matchings and publication ──
    const membershipRows = (matchingId?: string) => state.published.filter(p => !matchingId || p.matchingId === matchingId).map(p => {
      const option = optionByKey.get(p.key)!;
      return { recommendation_id: p.recommendationId, role_id: option.roleId ?? null, company_workspace_id: option.kind === "company" ? companyOf(option).id : null,
        role: option.kind === "posting" ? { name: option.title } : null, company: { company_name: companyOf(option).name }, archived_at: null,
        recommendation: { feedback: null, saved_stage: null }, explanation: p.explanation ?? "" };
    });
    const matchingResult = (value: Row) => formatCareerMatchingResult(value, "ko");
    const upsertMatching = (input: Row) => {
      if (input.action === "create") {
        const matching = { id: id("d"), title: input.title ?? "새 탐색", description: input.description ?? "", criteria: input.criteria ?? { brief: briefs }, revision: 1, archived_at: null };
        pools.set(matching.id, { matching, entries: new Map(), next: 1, runs: [], listRevision: 0 });
        const result = { matching, listRevision: "0" };
        return { ...result, modelOutput: matchingResult(result) };
      }
      const pool = poolFor(input.matchingId);
      if (!pool) throw new Error("matchingId is required.");
      Object.assign(pool.matching, { ...(input.title ? { title: input.title } : {}), ...(input.description ? { description: input.description } : {}), revision: pool.matching.revision + 1,
        archived_at: input.action === "archive" ? new Date().toISOString() : input.action === "restore" ? null : pool.matching.archived_at });
      const result = { matching: pool.matching, listRevision: String(pool.listRevision) };
      return { ...result, modelOutput: matchingResult(result) };
    };
    const readMatching = (input: Row) => {
      const pool = poolFor(input.matchingId)!;
      if (input.section === "pool") {
        const order = orderOf(pool);
        const offset = Math.max(0, Number.parseInt(input.cursor ?? "0", 10) || 0), limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
        const lines = order.slice(offset, offset + limit).map(entry => {
          const option = optionByKey.get(entry.key)!;
          const text = line(option, entry, undefined, entry.angles);
          return published(option) ? text.replace(/\n|$/, " · recommended$&") : text;
        });
        const next = offset + limit < order.length ? offset + limit : null;
        return { matchingId: input.matchingId, modelOutput: [`Options of matching ${input.matchingId}: ${order.length}, highest weighted score first.`, "", ...lines, "",
          next != null ? `Next: cursor ${next}.` : "", "Team numbers come from Harper's career records as of the date shown."].filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n") };
      }
      if (input.section === "history") return { matchingId: input.matchingId, modelOutput: pool.runs.length
        ? pool.runs.map(run => `- search ${run.id}: ${run.items.length} evaluated; ${formatLlmDateTime(run.createdAt)}`).join("\n") : "No search, page-read or research receipts in this matching yet." };
      const companiesCount = [...pool.entries.values()].filter(e => optionByKey.get(e.key)!.kind === "company").length;
      const recommended = state.published.filter(p => pool.entries.has(p.key)).length;
      const value = {
        matching: pool.matching, listRevision: String(pool.listRevision), currentBrief: briefs, memberships: membershipRows(input.matchingId),
        runs: pool.runs.map(run => ({ id: run.id, status: "completed", created_at: run.createdAt, evaluation_ids: run.items.map((i: Row) => i.evaluationId),
          candidate_role_ids: run.items.filter((i: Row) => optionByKey.get(i.key)!.kind === "posting").map((i: Row) => optionByKey.get(i.key)!.roleId),
          candidate_company_workspace_ids: run.items.filter((i: Row) => optionByKey.get(i.key)!.kind === "company").map((i: Row) => companyOf(optionByKey.get(i.key)!).id), request: {} })),
        evaluations: [], evaluationsOmitted: true, evaluationCursor: null,
        poolSummary: pool.entries.size ? [`Options evaluated for this matching: ${pool.entries.size} (postings ${pool.entries.size - companiesCount} · companies ${companiesCount}) · recommended ${recommended} · reactions 0. Read them with section=pool.`, routesText(pool)].filter(Boolean).join("\n") : undefined,
        workNote: formatMatchingWorkNote({ matchingId: input.matchingId, matchingTitle: pool.matching.title, latest: null, others: [] }), workNoteMatchingId: input.matchingId,
      };
      return { ...value, modelOutput: matchingResult(value) };
    };
    const upsertOpportunities = (input: Row) => {
      if (input.action === "read") return { modelOutput: "No opportunity reference to read in this request." };
      if (input.action === "set_stage") return { stageUpdates: [], modelOutput: (input.items ?? []).map((item: Row) => `Recommendation ${item.recommendationId ?? item.roleId}: stage unchanged; nothing saved yet.`).join("\n") };
      if (!["add", "replace", "archive", "restore", "reset"].includes(input.action)) throw new Error(`Unsupported action ${input.action}.`);
      const target = input.matchingId ?? (input.action === "add" && !input.allLists ? state.researchMatchingId : undefined);
      const pool = target ? poolFor(target) : undefined;
      const ids: string[] = [];
      for (const item of input.items ?? []) {
        let option: Row | undefined;
        if (typeof item.candidate === "number") {
          const numbersPool = poolFor(input.matchingId ?? state.researchMatchingId);
          if (!numbersPool) throw new Error("Option numbers belong to a matching; open or name the matching first.");
          const entry = [...numbersPool.entries.values()].find(e => e.number === item.candidate);
          if (!entry) throw new Error(`No option [${item.candidate}] in this matching.`);
          option = optionByKey.get(entry.key);
        } else if (item.roleId) {
          option = optionByRoleId.get(item.roleId);
          if (!option) throw new Error(`Role ${item.roleId} is unavailable for this recommendation.`);
        } else if (item.companyWorkspaceId) {
          const company = companyById.get(item.companyWorkspaceId) ?? [...adhoc.values()].find(c => c.id === item.companyWorkspaceId);
          if (!company) throw new Error(`Company ${item.companyWorkspaceId} is unavailable for this recommendation.`);
          option = optionForCompany(company, "named");
        } else if (item.recommendationId) {
          const existing = state.published.find(p => p.recommendationId === item.recommendationId);
          if (!existing) throw new Error(`Recommendation ${item.recommendationId} is unavailable.`);
          if (input.action === "archive") { existing.archived = true; ids.push(existing.recommendationId); continue; }
          Object.assign(existing, { explanation: item.explanation ?? existing.explanation, rank: item.rank ?? existing.rank });
          ids.push(existing.recommendationId); continue;
        }
        if (!option) throw new Error("Every item needs candidate, recommendationId, roleId or companyWorkspaceId.");
        const existing = state.published.find(p => p.key === option!.key);
        if (existing) { Object.assign(existing, { explanation: item.explanation ?? existing.explanation, rank: item.rank ?? existing.rank }); ids.push(existing.recommendationId); continue; }
        if (input.action === "archive") continue;
        const recommendationId = id("9");
        state.published.push({ recommendationId, key: option.key, explanation: item.explanation ?? "", rank: item.rank ?? null, matchingId: target ?? null, input: item });
        ids.push(recommendationId);
      }
      if (pool) pool.listRevision++;
      const fresh = state.published.filter(p => ids.includes(p.recommendationId)).map(p => optionByKey.get(p.key)!);
      const pay = fresh.filter(o => o.kind === "posting" && o.pay).flatMap(o => {
        const fact = payFact({ salary_min: o.pay.min, salary_max: o.pay.max, salary_currency: o.pay.currency, salary_period: o.pay.period, salary_is_predicted: false });
        return fact ? [`- ${o.title} @ ${companyOf(o).name}: ${fact}`] : [];
      });
      const overviews = [...new Map(fresh.map(o => [companyOf(o).id, companyOf(o)])).values()]
        .filter(company => !state.companiesRead.has(company.id) && (state.companiesRead.add(company.id), true))
        .map(company => formatCompanyProjection(projectionOf(company) as any));
      const companyOverviews = ["add", "replace"].includes(input.action) ? [pay.length ? ["Pay published by the employer:", ...pay].join("\n") : "",
        overviews.length ? `Employer overviews not yet shown in this request:\n${overviews.join("\n\n")}` : ""].filter(Boolean).join("\n") : "";
      const receipt: Row = { action: input.action, matchingId: target ?? null, allLists: Boolean(input.allLists), recommendationIds: ids,
        listRevision: String(pool?.listRevision ?? state.published.length), ...(companyOverviews ? { companyOverviews } : {}),
        ...(["add", "replace"].includes(input.action) && tally.block()[0]?.text ? { searchWork: tally.block()[0].text } : {}) };
      return { ...receipt, modelOutput: matchingResult(receipt) };
    };

    // ── companies, roles, web ──
    const readCompanies = (input: Row) => {
      const pool = state.researchMatchingId ? pools.get(state.researchMatchingId) : undefined;
      const resolved = resolveCompanyRefs(pool, input.companies ?? [], true);
      const list = resolved.companies.slice(0, 10);
      if (resolved.companies.length > 10) resolved.notes.push(`Read the first 10 of ${resolved.companies.length}; ask again for the rest.`);
      if (!list.length) return { companies: [], modelOutput: [...resolved.notes, "No company to read."].join("\n") };
      const since = requestTime.getTime() - 90 * 86400000;
      const blocks = list.map(company => {
        const option = companies[company.key] ? (companyOptionOf(company.key) ?? optionByKey.get(`${company.key}:company`) ?? { key: `${company.key}:company`, kind: "company", company: company.key, score: 0, routes: [] }) : optionForCompany(company, "named");
        const entry = pool ? [...pool.entries.values()].find(e => e.key === option.key) : undefined;
        const facts = formatCompanyFacts(factsFor(option) as any, { now: requestTime });
        const labels = projectionOf(company).labels;
        const topics = input.topics?.length ? [
          ...(input.topics.includes("summary") && company.overview ? [`— summary: ${clip(company.overview, 1500)} (sources: 1)`] : []),
          ...(input.topics.some((t: string) => /hiring|signal|신호/i.test(t)) ? (company.facts?.signals?.items ?? []).map((item: Row) => `— hiring signal: ${item.date} — ${item.content} (sources: 1)`) : []),
        ] : [];
        const recent = input.check ? fixture.web.filter((page: Row) => Date.parse(page.publishedDate) >= since
          && (norm(page.title).includes(norm(company.name)) || page.keywords.some((k: string) => norm(k) === norm(company.name))))
          .map((page: Row) => `${page.publishedDate} "${clip(page.title, 90)}" (${page.url})`) : [];
        return [`${entry ? `[${entry.number}] ` : ""}${company.name} · company ${company.id}`,
          company.overview ? `  ${clip(company.overview.split(/\n\s*\n/, 1)[0], 600)}` : company.description ? `  ${clip(company.description, 300)}` : "",
          facts ? `  ${facts}` : "", labels.length ? `  Research topics: ${labels.map(l => l.label).join(", ")}` : "",
          ...topics.map((t: string) => `  ${t}`), recent.length ? `  Recent public posts (90 days): ${recent.slice(0, 5).join(" · ")}` : input.check ? "  Recent public posts (90 days): none found" : "",
          company.homepage ? `  Site: ${company.homepage}` : ""].filter(Boolean).join("\n");
      });
      return { companies: list.map(c => ({ companyWorkspaceId: c.id, name: c.name })),
        modelOutput: [...resolved.notes, ...blocks, "Team numbers come from Harper's career records as of the date shown."].join("\n\n") };
    };
    const roleContext = (input: Row) => {
      const pool = state.researchMatchingId ? pools.get(state.researchMatchingId) : undefined;
      const roles = (input.roleIds ?? []).map((ref: unknown) => {
        let option: Row | undefined;
        if (typeof ref === "number" || /^\d+$/.test(String(ref))) {
          const entry = pool ? [...pool.entries.values()].find(e => e.number === Number(ref)) : undefined;
          option = entry ? optionByKey.get(entry.key) : undefined;
        } else option = optionByRoleId.get(String(ref));
        if (!option || option.kind !== "posting") return { roleId: String(ref), found: false };
        const company = companyOf(option);
        const size = company.facts?.profile?.size;
        return { roleId: option.roleId, found: true,
          role: { name: option.title, sourceType: "external", status: "active", locationText: option.location, workMode: option.jd.workMode, type: option.jd.type,
            seniorityLevel: option.jd.seniority, salaryRange: option.pay ? payText(option.pay).replace(/^pay /, "") : null, externalJdUrl: option.jd.url,
            postedAt: option.postedAt ? `${option.postedAt}T00:00:00Z` : null, summary: input.jd === "skip" ? null : option.jd.summary },
          companyDb: { name: company.name, shortDescription: company.description, hqLocation: company.facts?.profile?.location ?? null, employeeCountRange: size ? { start: size.start, end: size.end } : null } };
      });
      return { roles, modelOutput: formatRoleContextForModel(roles) || "No roles requested." };
    };
    const webSearch = (input: Row) => {
      const terms = String(input.query ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);
      const scored = fixture.web.map((page: Row) => {
        const hay = `${page.title} ${page.highlights.join(" ")} ${page.keywords.join(" ")}`.toLowerCase();
        const score = terms.reduce((n, t) => n + (page.keywords.some((k: string) => k.includes(t) || (t.length >= 3 && t.includes(k))) ? 2 : hay.includes(t) ? 1 : 0), 0);
        return { page, score };
      }).filter((r: Row) => r.score >= 2).sort((a: Row, b: Row) => b.score - a.score).slice(0, Math.min(Number(input.maxResults ?? 10) || 10, 6));
      const results = scored.map((r: Row, index: number) => ({ rank: index + 1, title: r.page.title, url: r.page.url, publishedDate: `${r.page.publishedDate}T00:00:00Z`, highlights: r.page.highlights,
        resourceRef: { id: String(4000 + fixture.web.indexOf(r.page)), revision: `obs-${4000 + fixture.web.indexOf(r.page)}` } }));
      return { ok: true, query: input.query, resultCount: results.length, results,
        modelOutput: ["Results from the provider's searchable web index, not a complete market or social feed. Publication dates and source completeness may be unavailable.",
          `Query: ${input.query}; results: ${results.length}`,
          ...results.map((r: Row, i: number) => [`${i + 1}. ${r.title}\n${r.url}`, `Public source reference: kind=web_resource; id=${r.resourceRef.id}; revision=${r.resourceRef.revision}.`,
            `Published: ${formatLlmDateTime(r.publishedDate)}${formatLlmElapsed(r.publishedDate, requestTime) ? ` (${formatLlmElapsed(r.publishedDate, requestTime)})` : ""}`, ...r.highlights].join("\n"))].join("\n\n") };
    };
    // Official posting pages, company sites and careers pages are readable like the public web.
    const sitePages = (): Row[] => {
      const all = Object.values(companies);
      const postingPages = options.filter(o => o.kind === "posting" && o.jd?.url).map(o => ({ url: o.jd.url, title: `${o.title} — ${companyOf(o).name}`,
        markdown: [`# ${o.title}`, `${companyOf(o).name}`, `위치: ${o.location}`, `근무 형태: ${o.jd.workMode}`, `고용 형태: ${o.jd.type}`, `경력 수준: ${o.jd.seniority}`,
          `연봉: ${o.pay ? payText(o.pay).replace(/^pay /, "") : "공개하지 않음"}`, `게시일: ${o.postedAt}`, "", o.jd.summary, "", "지원은 이 페이지의 지원하기 버튼으로 받습니다."].join("\n") }));
      const homePages = all.filter(c => c.homepage).map(c => ({ url: c.homepage, title: c.name,
        markdown: [`# ${c.name}`, "", c.overview ?? c.description, "", `채용: ${c.facts?.hiring?.careersUrl ?? `${c.homepage}/careers`}`].join("\n") }));
      const careerPages = all.filter(c => c.homepage).map(c => {
        const open = options.filter(o => o.kind === "posting" && o.company === c.key);
        return { url: c.facts?.hiring?.careersUrl ?? `${c.homepage}/careers`, title: `${c.name} — Careers`,
          markdown: [`# ${c.name} 채용`, "", open.length ? open.map(o => `- ${o.title} (${o.location}) ${o.jd?.url ?? ""}`).join("\n")
            : c.facts?.hiring?.openRoles ? `열린 공고 ${c.facts.hiring.openRoles}개` : "지금 열린 공고가 없습니다."].join("\n") };
      });
      return [...fixture.pages, ...fixture.web, ...postingPages, ...careerPages, ...homePages];
    };
    const openUrl = (input: Row) => {
      const urls: string[] = Array.isArray(input.url) ? input.url : [input.url];
      const known = sitePages();
      const pages = urls.map(url => {
        const page = known.find((p: Row) => p.url.replace(/\/$/, "") === String(url).trim().replace(/\/$/, ""));
        if (!page) return { ok: false, url, error: "HTTP 404", text: `URL: ${url}\nRead failed: The page returned HTTP 404.` };
        return { ok: true, url, text: [`URL: ${page.url}`, `Title: ${page.title}`, `Source: page reader; read ${formatLlmDateTime(requestTime)} (Asia/Seoul).`,
          `Content truncated: false; source characters: ${page.markdown.length}.`, "Offset 0; next offset none.", page.markdown].join("\n") };
      });
      return { ok: pages.some(p => p.ok), status: pages.every(p => p.ok) ? "completed" : pages.some(p => p.ok) ? "partial" : "failed",
        pages: pages.map(({ text, ...p }) => p), modelOutput: pages.map(p => p.text).join("\n\n") };
    };
    const contextText = () => renderTalentContextPrompt({ allBriefs: briefs, briefs, memories, memorySelection: "all", memoryTruncated: false } as any);
    const writeContext = (input: Row) => {
      const saved: string[] = [];
      for (const change of input.changes ?? []) {
        const list = change.collection === "memory" ? memories : briefs;
        if (change.op === "add") { const ref = Math.max(0, ...briefs.map(b => b.ref), ...memories.map(m => m.ref)) + 1; list.push({ ref, label: change.label ?? "기타", content: change.content }); saved.push(`added [${ref}]`); }
        else if (change.op === "update") { const row = [...briefs, ...memories].find(r => r.ref === Number(change.ref ?? change.id)); if (row) { Object.assign(row, { ...(change.content ? { content: change.content } : {}), ...(change.label ? { label: change.label } : {}) }); saved.push(`updated [${row.ref}]`); } }
        else if (change.op === "delete") saved.push(`deleted [${change.ref ?? change.id}]`);
      }
      return { ok: true, modelOutput: `Saved changes: ${saved.join(", ") || "none"}.\n${contextText()}` };
    };

    // In-memory notes with the production note formats (notes/tools.ts).
    const notes = new Map<string, Row>();
    const noteSummary = (note: Row) => ({ ...note, matchingTitle: note.matchingId ? pools.get(note.matchingId)?.matching.title ?? null : null });
    const upsertNote = (input: Row) => {
      const now = new Date().toISOString();
      if (input.action === "create") {
        if (!input.kind || !input.title || typeof input.content !== "string") throw new Error("create needs kind, title and content.");
        const note = { id: id("7"), kind: input.kind, title: input.title, content: input.content, revision: 1, createdAt: now, updatedAt: now,
          matchingId: input.matchingId ?? null, companyWorkspaceId: null, companyName: null };
        notes.set(note.id, note);
        return { ok: true, noteId: note.id, revision: 1, matchingId: note.matchingId,
          modelOutput: [`Note ${note.id} created · revision 1.`, formatNoteLine(noteSummary(note) as any).replace(/^- /, "")].join("\n") };
      }
      const note = notes.get(String(input.noteId));
      if (!note) throw new Error(`Note ${input.noteId} is unavailable.`);
      if (input.action === "delete") { notes.delete(note.id); return { ok: true, noteId: note.id, deleted: true, modelOutput: `Note ${note.id} deleted.` }; }
      if (typeof input.content === "string") {
        if (input.expectedRevision !== note.revision) throw new Error(`Note ${note.id} is at revision ${note.revision}; read it and retry with that expectedRevision.`);
        note.content = input.content;
      }
      if (typeof input.append === "string") note.content = `${note.content}\n${input.append}`;
      if (input.replace?.old) {
        if (!note.content.includes(input.replace.old)) throw new Error("The passage to replace does not appear in the note.");
        note.content = note.content.replace(input.replace.old, input.replace.new ?? "");
      }
      if (input.title) note.title = input.title;
      if (input.matchingId) note.matchingId = input.matchingId;
      note.revision++; note.updatedAt = now;
      return { ok: true, noteId: note.id, revision: note.revision, matchingId: note.matchingId,
        modelOutput: [`Note ${note.id} updated · revision ${note.revision}.`, formatNoteLine(noteSummary(note) as any).replace(/^- /, "")].join("\n") };
    };
    const readNotes = (input: Row) => {
      if (input.noteId) {
        const note = notes.get(String(input.noteId));
        if (!note) throw new Error(`Note ${input.noteId} is unavailable.`);
        return { ok: true, noteId: note.id, revision: note.revision, modelOutput: formatNoteBody(noteSummary(note) as any) };
      }
      const list = [...notes.values()].filter(note => (!input.matchingId || note.matchingId === input.matchingId) && (!input.kind || note.kind === input.kind)
        && (!input.query || `${note.title}\n${note.content}`.includes(String(input.query)))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { ok: true, total: list.length, modelOutput: list.length
        ? [`${list.length} notes match, most recently edited first.`, ...list.map(note => formatNoteLine(noteSummary(note) as any))].join("\n") : "No notes match." };
    };

    const executors: Record<string, (input: Row) => Row> = {
      read_notes: readNotes,
      upsert_note: upsertNote,
      read_talent_context: () => ({ modelOutput: contextText() }),
      write_talent_context: writeContext,
      list_matchings: () => { const value = { matchings: [...pools.values()].map(p => ({ ...p.matching, listRevision: String(p.listRevision) })), defaultListRevision: "0", allListsRevision: String(state.published.length) }; return { ...value, modelOutput: matchingResult(value) }; },
      upsert_matching: upsertMatching,
      read_matching: readMatching,
      search_opportunities: search,
      upsert_opportunities: upsertOpportunities,
      read_companies: readCompanies,
      get_role_context: roleContext,
      web_search: webSearch,
      open_url: openUrl,
      read_talent_activity_events: () => ({ modelOutput: `No earlier searches or activities recorded before this request. Onboarding completed ${formatLlmDateTime(args.onboardingCompletedAt)} (Asia/Seoul).` }),
      read_recommended_opportunities: () => ({ modelOutput: state.published.length
        ? state.published.map(p => `- recommendation ${p.recommendationId}; ${titleOf(optionByKey.get(p.key)!)}; feedback none; saved stage none`).join("\n")
        : "No existing recommendations or selected Harper-connected proposals; no further page." }),
      list_documents: () => ({ modelOutput: `Saved documents (all 1; primary resume first):\n- document_id ${scenario.id}-resume; ${scenario.talent.resume_file_name}; resume; primary` }),
      read_document: () => ({ modelOutput: `Document ${scenario.id}-resume (${scenario.talent.resume_file_name}), extracted text:\n${scenario.talent.resume_text}` }),
      list_profiles: () => ({ modelOutput: `Profiles (all 1):\n- profile ${scenario.id}-profile, revision 1; 기본 프로필; default` }),
      read_profile: () => ({ modelOutput: `Profile ${scenario.id}-profile, revision 1 (default).\n${args.profileText}` }),
      follow_company: (input) => ({ modelOutput: (input.companies ?? []).map((c: Row) => `Followed ${c.company_name ?? c.company_workspace_id ?? "company"}; follow ${id("7")}; revision 1. Scheduled Career checks will include it.`).join("\n") || "No company given." }),
      list_schedules: () => ({ modelOutput: "Saved schedules (all 0)." }),
      upsert_schedule: (input) => ({ modelOutput: `Saved schedule ${id("8")}; revision 1; ${input.action ?? "create"}; ${input.title ?? "Career work"}; next ${input.next_run_at ?? input.nextRunAt ?? "as requested"}.` }),
      manage_action_items: (input) => ({ ok: true, id: id("6"), modelOutput: `Action item saved (${input.operation ?? "create"}).` }),
      suggest_form: (input) => { const formId = id("5"); return { ok: true, formId, modelOutput: `Form ${formId} saved, revision 1 (${input.action ?? "create"}). Display it with a standalone [[form:${formId}]].` }; },
      update_talent_profile: () => ({ ok: true, modelOutput: "Profile change saved as revision 2." }),
      upsert_company: (input) => ({ ok: true, modelOutput: `Saved company research ${id("4")} (${input.label ?? input.entries?.length ?? 1}).` }),
      update_setting: (input) => ({ ok: true, modelOutput: `Setting updated: ${input.action ?? "unchanged"}.` }),
      read_company_connections: () => ({ modelOutput: "No company connections or introduction correspondence for this user." }),
      read_agent_messages: () => ({ modelOutput: "No agent correspondence for this user." }),
      get_internal_roles: () => ({ modelOutput: "No public Harper-connected posting matches this request." }),
      manage_work: (input) => ({ ok: true, modelOutput: ["list", "read"].includes(String(input.action ?? "list"))
        ? "Unfinished responsibilities for this user: none. End of list." : `Work ${id("3")} recorded (${input.action}); revision 1.` }),
      read_talent_schedules: () => ({ modelOutput: "Appointments (times Asia/Seoul; these are actual meetings, not agent work reservations):\n\nNo appointments found in this scope.\n\nEnd of this appointment scope." }),
      save_job_posting: (input) => {
        const lines = (input.postings ?? []).map((posting: Row) => {
          const option = options.find(o => o.jd?.url && o.jd.url === posting.url);
          if (!option) return { ok: false, url: posting.url, error: "The page could not be read as a job posting." };
          const recommendationId = posting.mode === "index" ? null : id("9");
          if (recommendationId) state.published.push({ recommendationId, key: option.key, explanation: posting.fields?.reason ?? "", rank: null, matchingId: state.researchMatchingId ?? null, input: posting, via: "save_job_posting" });
          return { ok: true, url: posting.url, roleId: option.roleId, recommendationId, mode: posting.mode ?? "save" };
        });
        return { results: lines, modelOutput: lines.map((r: Row) => r.ok ? `Saved ${r.url}: roleId ${r.roleId}${r.recommendationId ? `; recommendation ${r.recommendationId}` : ""}; mode ${r.mode}.` : `Failed ${r.url}: ${r.error}`).join("\n") };
      },
    };

    return {
      state, calls, unknownTools, invalidInputs, notes,
      talentContextText: contextText,
      recordInvalid(name: string, input: Row, error: string) { invalidInputs.push({ name, input, error }); calls.push({ name, input, output: `Invalid input: ${error}`, error }); },
      async execute(name: string, input: Row) {
        const executor = executors[name];
        if (!executor) { unknownTools.push(name); calls.push({ name, input, output: "", error: `No synthetic executor for ${name}` }); throw new Error(`No synthetic executor for ${name}`); }
        try {
          const result = executor(input);
          calls.push({ name, input, output: result.modelOutput });
          return result;
        } catch (error) {
          calls.push({ name, input, output: "", error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      },
      /** The production observer: search-work tally and the matching this request works on. */
      observe(name: string, result: unknown, input: Row) {
        tally.add(name, result, input);
        const matchingId = observedMatchingId(name, result);
        if (matchingId) state.researchMatchingId = matchingId;
      },
      publishedForReview(labels: Row) {
        return state.published.filter(p => !p.archived).map(p => {
          const option = optionByKey.get(p.key)!;
          const group = ["strong", "acceptable", "unfit"].find(g => labels?.[g]?.[p.key]);
          return { key: p.key, title: titleOf(option), explanation: p.explanation, rank: p.rank, via: p.via ?? "upsert_opportunities",
            gold: group, goldReason: group ? labels[group][p.key] : option.adhoc ? "not in this persona's frozen pool" : undefined };
        });
      },
    };
  };
}

main().catch(error => { console.error(error); process.exitCode = 1; });
