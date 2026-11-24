/**
 * Harper's first message to a person who signed up through /career/onboarding and has not
 * written to Harper (docs/evaluation/career-first-message).
 *
 * entry cases run the turn that follows signup (`conversation_completed`, reply in chat).
 * scheduled cases run a later scheduled Career check while the person is still silent, including
 * a person who created an account but left before finishing the signup form (signupFinished=false).
 * Both use the production prompt plan, capability runtime, preload selection, tool schemas
 * and the model production uses for that turn. Tool results come from the frozen market of
 * career-first-recommendation v1. No DB, queue, email or other external effect; network is
 * limited to model providers.
 *
 *   NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server \
 *     pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerFirstMessage.ts \
 *     [--repeat 1] [--only id,id] [--label name] [--concurrency 5] [--render-prompt id]
 */
import { config } from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import Ajv from "ajv";
import { worldFactory } from "./evalCareerFirstRecommendation";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
process.umask(0o077);

const TASK = "docs/evaluation/career-first-message";
const option = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
type Row = Record<string, any>;

async function main() {
  const fixture = JSON.parse(readFileSync(`${TASK}/cases-v1.json`, "utf8"));
  const market = JSON.parse(readFileSync(`docs/evaluation/${fixture.market}`, "utf8"));
  const baseOf = new Map<string, Row>(market.cases.map((c: Row) => [c.id, c]));

  const { resolveCareerChatTools } = await import("@/lib/career/llmTools");
  const { resolveCareerTextChatModel } = await import("@/lib/career/textChatModelConfig");
  const { CareerCapabilityRuntime } = await import("@/lib/career/capabilities/runtime");
  const { getCareerCapabilityMode } = await import("@/lib/career/capabilities/registry");
  const { selectCareerPreloads } = await import("@/lib/career/capabilities/decisions");
  const { runCareerChatAssistant } = await import("@/lib/career/llm");
  const { renderCareerBackgroundInvocation } = await import("@/lib/career/background/prompt");
  const { CAREER_BACKGROUND_PRELOAD, getScheduledCareerModelOptions } = await import("@/lib/career/background/scheduledModel");
  const { formatTalentMessageContentForLlmPrompt, formatTalentConversationReferencesForLlm } = await import("@/lib/career/opportunityFeedbackNote");
  const { buildTalentProfileContext } = await import("@/lib/talentOnboarding/profileStore");
  const { renderTalentContextPrompt } = await import("@/lib/talentOnboarding/talentContexts");
  const { formatTalentSchedules } = await import("@/lib/career/meetings/server");
  const { formatNoteIndex } = await import("@/lib/career/notes/format");
  const { formatLlmDateTime } = await import("@/lib/llm/promptDateTime");
  const { listCoverage } = await import("@/lib/career/listCoverage");
  const { stripTalentOnboardingCompletionMarker } = await import("@/lib/talentOnboarding/completion");
  const createWorld = await worldFactory();

  const chatModel = resolveCareerTextChatModel(undefined);
  const scheduledModel = getScheduledCareerModelOptions();
  const capabilityMode = getCareerCapabilityMode();
  const requestTime = new Date();
  const shift = requestTime.getTime() - Date.parse(fixture.requestTime);
  const shifted = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
  const only = option("--only", "").split(",").filter(Boolean);
  const cases: Row[] = fixture.cases.filter((c: Row) => !only.length || only.includes(c.id));
  for (const id of only) assert.ok(cases.some(c => c.id === id), `Unknown case ${id}`);

  /** A signup-page person: the base profile without its onboarding interview, Brief or Memory. */
  const scenarioOf = (spec: Row): Row => {
    const base = spec.base ? baseOf.get(spec.base) : undefined;
    if (spec.base) assert.ok(base, `Unknown base ${spec.base}`);
    return {
      id: spec.id, talent: spec.talent ?? base!.talent, experiences: spec.experiences ?? base!.experiences,
      educations: spec.educations ?? base!.educations, extras: spec.extras ?? base!.extras,
      options: spec.options ?? base!.options, brief: [], memories: [], onboarding: [],
      setting: { blocked_companies: [], ...spec.setting },
    };
  };

  const prepare = (spec: Row) => {
    const scenario = scenarioOf(spec);
    const scheduled = spec.kind === "scheduled";
    const selected = resolveCareerChatTools({ channel: "chat", background: scheduled, isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false });
    const tools = selected.tools.filter(tool => tool.function.name !== "upsert_plan");
    const toolNames = tools.map(tool => tool.function.name);
    const profileRow = { name: scenario.talent.name, headline: scenario.talent.headline, location: scenario.talent.location, bio: scenario.talent.bio,
      resume_file_name: scenario.talent.resume_file_name, resume_text: scenario.talent.resume_text, resume_links: [], current_location: scenario.talent.location };
    const structuredProfile = {
      talentUser: profileRow,
      talentExperiences: scenario.experiences.map((row: Row, i: number) => ({ id: `${spec.id}-exp-${i + 1}`, months: null, memo: null, ...row })),
      talentEducations: scenario.educations.map((row: Row, i: number) => ({ id: `${spec.id}-edu-${i + 1}`, memo: null, ...row })),
      talentExtras: scenario.extras.map((row: Row, i: number) => ({ id: `${spec.id}-extra-${i + 1}`, memo: null, ...row })),
    };
    const signupFinished = spec.signupFinished !== false;
    const setting = { ...scenario.setting, preferred_locale: "ko", is_onboarding_done: signupFinished, status: "active", get_external_recommendation: true };
    const structuredProfileText = buildTalentProfileContext({ profile: profileRow as any, structuredProfile: structuredProfile as any, setting: setting as any, includeResumeText: true, maxResumeChars: 3000 });
    const talentContextSection = renderTalentContextPrompt({ allBriefs: [], briefs: [], memories: [], memorySelection: "all", memoryTruncated: false } as any);
    const signedUpAt = shifted(spec.signedUpAt ?? fixture.signedUpAt);
    // The signup receipt is the only message (none when signup was left unfinished);
    // a scheduled case can also have Harper's unanswered first message.
    const history: Row[] = [
      ...(spec.receipt ? [{ id: 1, role: "user", content: spec.receipt, message_type: "profile_submit", created_at: signedUpAt, payload: null }] : []),
      ...(spec.earlierAssistantMessage ? [{ id: 2, role: "assistant", content: spec.earlierAssistantMessage.content, message_type: "chat",
        created_at: shifted(spec.earlierAssistantMessage.at), payload: null }] : []),
    ];
    const llmMessages = history.map((row: Row) => ({ role: row.role as "user" | "assistant",
      content: formatTalentMessageContentForLlmPrompt(row as any, { includeCreatedAt: true, preferredLocale: "ko", timeZone: "Asia/Seoul" }) }))
      .filter((row: Row) => row.content.trim());
    const run = scheduled
      ? { id: `run-${spec.id}`, talent_id: spec.id, conversation_id: spec.id, status: "handed_off", trigger: "career_schedule_due", created_at: requestTime.toISOString(),
          trigger_payload: { sourceEvents: [{ sourceKind: "schedule", sourceId: spec.schedule.id, revision: spec.schedule.revision,
            occurredAt: requestTime.toISOString(), instruction: spec.schedule.instruction, summary: `Reservation ${spec.schedule.title} is due.` }] } }
      : { id: `run-${spec.id}`, talent_id: spec.id, conversation_id: spec.id, status: "handed_off", trigger: "conversation_completed", trigger_payload: {}, created_at: signedUpAt };
    const proactiveContext = [
      renderCareerBackgroundInvocation(run as any),
      formatTalentSchedules({ schedules: [] }),
      `Sent email history (${listCoverage(0, false)}):\n`,
    ].filter(Boolean).join("\n\n");
    const references = formatTalentConversationReferencesForLlm(history as any, { preferredLocale: "ko", timeZone: "Asia/Seoul" });
    const until = new Date(requestTime.getTime() + 3 * 86400000);
    const hasResume = Boolean(scenario.talent.resume_text);
    const resourceIndex = [
      "Harper-connected proposals already selected for this candidate, not yet published: 0. Times: Asia/Seoul.\nread_recommended_opportunities reads recommendations and selected unpublished proposals; get_role_context reads details. This index does not measure all-role evaluation coverage or create new selections.",
      `Upcoming 72 hours, ${formatLlmDateTime(requestTime)} through ${formatLlmDateTime(until)}:\n${formatTalentSchedules({ schedules: [] })}`,
      `Active matchings (${listCoverage(0, false)}):\nActive searches (${listCoverage(0, false)}):`,
      ["Saved Career work (times: Asia/Seoul):",
        scheduled ? `Saved schedules (${listCoverage(1, false)}):\n- Schedule ${spec.schedule.id}; revision ${spec.schedule.revision}; active; ${spec.schedule.title}; external discovery`
          : `Saved schedules (${listCoverage(0, false)}):`,
        `Company follows (${listCoverage(0, false)}):`].join("\n"),
      formatNoteIndex({ notes: [], total: 0 }),
      hasResume ? `Saved documents (${listCoverage(1, false)}; primary resume first; read_document for content):\n- document_id ${spec.id}-resume; ${scenario.talent.resume_file_name}; resume; primary`
        : `Saved documents (${listCoverage(0, false)}):`,
      `Profiles (${listCoverage(1, false)}):\n- profile ${spec.id}-profile, revision 1; 기본 프로필; default`,
      `Unresolved forms in this conversation (${listCoverage(0, false)}):`,
    ].join("\n");
    const resources = ["Unfinished work / suspended replies in this conversation: none.", resourceIndex].join("\n\n");
    const promptArgs: Row = {
      isMobile: false, careerCoachingActivity: null, conversationMode: "default", activeInternalFitHoldQuestion: null,
      channel: "chat", backgroundInvocation: scheduled, scheduledWork: scheduled || undefined,
      includePostOnboardingConversationGuide: !scheduled,
      companyTalentRequestText: null, talentContextSection,
      currentPreferences: { engagementTypes: scenario.setting.engagement_types, getExternalRecommendation: true, periodicIntervalDays: null,
        preferredLocale: "ko", profileVisibility: scenario.setting.profile_visibility, recommendationBatchSize: null, talentSettingStatus: "active" },
      gmailCapability: "not_connected", userChatTurnCount: 0,
      isConversationCompletedOpportunityRunActive: !scheduled, isOnboardingDone: true, signupFinished, officialJobSignupIntentPrompt: null,
      opportunityStatus: signupFinished ? { onboardingCompletedAt: signedUpAt } : null,
      pendingOpportunityFeedbackContext: "", postOnboardingContext: spec.entryOpportunity ? { entryOpportunity: spec.entryOpportunity } : null,
      profile: profileRow,
      runtimeInstruction: [[proactiveContext, references].filter(Boolean).join("\n\n"), resources].filter(Boolean).join("\n\n"),
      recentActivitySummaries: [], recentRecommendedOpportunitiesText: "", structuredProfileText,
      requestTime, timeZone: "Asia/Seoul", toolNames, actionItems: [],
    };
    return { scenario, scheduled, tools, toolNames, stopAfterToolNames: selected.stopAfterToolNames, promptArgs, llmMessages, proactiveContext, talentContextSection, structuredProfileText };
  };

  /** Tools this frozen market does not model: the entry posting and outbound contact. */
  const extraExecutors = (spec: Row, sent: Row[]) => {
    const entry = spec.entryOpportunity;
    const roleText = entry ? `Role ${entry.verifiedActiveRoleId} (Harper-connected, active; public posting ${entry.postingPath}; updated ${formatLlmDateTime(entry.postingUpdatedAt)}).\nCandidate history with this role: none.\n${entry.postingDetails}` : "";
    const deliver = (input: Row) => {
      sent.push(input);
      return { modelOutput: `Delivered ${input.channel ?? "email"} message ${randomUUID()}; receipt sent.` };
    };
    return {
      ...(entry ? {
        get_role_context: (input: Row) => JSON.stringify(input).includes(entry.verifiedActiveRoleId) ? { modelOutput: roleText } : undefined,
        get_internal_roles: () => ({ modelOutput: `Matched public Harper posting:\n${roleText}` }),
      } : {}),
      ...(spec.schedule ? { read_schedule: () => ({ modelOutput: `Schedule ${spec.schedule.id}; revision ${spec.schedule.revision}; active; ${spec.schedule.title}; external discovery; every 3 days.\nInstruction: ${spec.schedule.instruction}` }) } : {}),
      contact_user: deliver,
      deliver_career_email: (input: Row) => deliver({ channel: "email", ...input }),
    } as Record<string, (input: Row) => { modelOutput: string } | undefined>;
  };

  const renderOnly = option("--render-prompt", "");
  if (renderOnly) {
    const spec = cases.find(c => c.id === renderOnly);
    assert.ok(spec, `Unknown case ${renderOnly}`);
    const prepared = prepare(spec);
    const runtime = new CareerCapabilityRuntime({ mode: capabilityMode, eligibleTools: prepared.tools, promptArgs: () => prepared.promptArgs as any,
      selection: prepared.scheduled ? CAREER_BACKGROUND_PRELOAD : { capabilityIds: [], handbookIds: [], status: "selected", elapsedMs: 0 } });
    const step = runtime.resolveStep(false);
    console.log(step.systemBlocks.map(block => `<<${block.key}>>\n${block.text}`).join("\n\n"));
    console.log("\n<<messages>>\n" + prepared.llmMessages.map((m: Row) => `${m.role}: ${m.content}`).join("\n"));
    console.log("\n<<tools>>\n" + step.tools.map(tool => tool.function.name).join(", "));
    return;
  }

  const repeat = Number(option("--repeat", "1")); assert.ok(Number.isInteger(repeat) && repeat > 0);
  const concurrency = Number(option("--concurrency", "5")); assert.ok(Number.isInteger(concurrency) && concurrency > 0);
  const label = option("--label", "run"); assert.match(label, /^[\w.-]+$/);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
  const dir = `${TASK}/runs/${runId}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}`, typeof value === "string" ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
  save("manifest.json", { runId, label, cases: cases.map(c => c.id), repeat, chatModel, scheduledModel, capabilityMode, requestTime: requestTime.toISOString() });

  const scope = new AsyncLocalStorage<{ caseId: string; iteration: number }>();
  const normalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const level of ["log", "info", "warn", "error"] as const)
    console[level] = (...args: unknown[]) => appendFileSync(`${dir}/runtime.log`, JSON.stringify({ ...scope.getStore(), level, values: args.map(String) }) + "\n", { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  const blocked: Row[] = [];
  let requestIndex = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const allowed = (url.hostname === "api.openai.com" && ["/v1/responses", "/v1/chat/completions", "/v1/decisions"].includes(url.pathname))
      || (url.hostname === "api.anthropic.com" && url.pathname === "/v1/messages");
    if (!allowed) { blocked.push({ ...scope.getStore(), host: url.hostname, path: url.pathname }); throw new Error("Evaluation blocks non-provider network"); }
    save(`request-${String(++requestIndex).padStart(3, "0")}.json`, { ...scope.getStore(), body: JSON.parse(String(init?.body ?? "{}")) });
    return originalFetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(240_000)]) });
  };

  const jobs = cases.flatMap(spec => Array.from({ length: repeat }, (_, i) => ({ spec, iteration: i + 1 })));
  const results: Row[] = [];
  const runJob = ({ spec, iteration }: { spec: Row; iteration: number }) => scope.run({ caseId: spec.id, iteration }, async () => {
    const began = Date.now();
    const prepared = prepare(spec);
    const signal = AbortSignal.timeout(600_000);
    const world = createWorld({ fixture: market, scenario: prepared.scenario, requestTime, onboardingCompletedAt: shifted(fixture.signedUpAt),
      talentContextSection: prepared.talentContextSection, profileText: prepared.structuredProfileText });
    const sent: Row[] = [];
    const extra = extraExecutors(spec, sent);
    const ajv = new Ajv({ strict: false, allowUnionTypes: true, validateFormats: false });
    const validators = new Map(prepared.tools.map(tool => [tool.function.name, ajv.compile(tool.function.parameters)]));
    const selection = prepared.scheduled ? CAREER_BACKGROUND_PRELOAD : await selectCareerPreloads({ eligibleNames: new Set(prepared.toolNames), eligibleTools: prepared.tools,
      input: { messages: prepared.llmMessages, currentContext: ["Gmail: not_connected.", prepared.proactiveContext].join("\n\n") },
      activeHandbooks: [], signal, background: false });
    const runtime = new CareerCapabilityRuntime({
      mode: capabilityMode, eligibleTools: prepared.tools, promptArgs: () => prepared.promptArgs as any,
      replyId: `${spec.id}-${iteration}`, handbooks: [], selection, abortSignal: signal,
      refreshAfterTool: async (name, result, input) => { world.observe(name, result, input ?? {}); },
    });
    const first = runtime.resolveStep(false);
    const model = prepared.scheduled
      ? { primaryModel: scheduledModel.assistantModel, anthropicEffort: scheduledModel.assistantAnthropicEffort, openAIResponsesReasoningEffort: scheduledModel.assistantOpenAIResponsesReasoningEffort }
      : { primaryModel: chatModel.model, openAIResponsesReasoningEffort: chatModel.openAIResponsesReasoningEffort, chatCompletionReasoningEffort: chatModel.chatCompletionReasoningEffort };
    let reply = "", error: string | undefined;
    try {
      reply = await runCareerChatAssistant({
        toolRuntime: runtime, ...model, responseLocale: "ko", messages: prepared.llmMessages,
        tools: first.tools, systemBlocks: first.systemBlocks, stopAfterToolNames: prepared.stopAfterToolNames, isOnboardingActive: false,
        abortSignal: signal, usageLabel: "career:background-agent",
        executeTool: async call => {
          const validate = validators.get(call.name);
          if (validate && !validate(call.input)) { world.recordInvalid(call.name, call.input, ajv.errorsText(validate.errors)); throw new Error(`Invalid ${call.name} input: ${ajv.errorsText(validate.errors)}`); }
          const handled = extra[call.name]?.(call.input);
          if (handled) { world.calls.push({ name: call.name, input: call.input, output: handled.modelOutput }); return handled; }
          return world.execute(call.name, call.input);
        },
      } as any);
    } catch (cause) { error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause); }
    const result = {
      caseId: spec.id, iteration, summary: spec.summary, kind: spec.kind, model: model.primaryModel, selection, elapsedMs: Date.now() - began, error,
      reply: stripTalentOnboardingCompletionMarker(String(reply ?? "")).trim(), sent,
      calls: world.calls.map((c: Row) => ({ name: c.name, input: c.input, error: c.error })), unknownTools: world.unknownTools,
    };
    save(`${spec.id}-${iteration}.json`, result);
    results.push(result);
    normalConsole.log(JSON.stringify({ caseId: spec.id, iteration, elapsedMs: result.elapsedMs, tools: result.calls.map((c: Row) => c.name), sent: sent.length, error }));
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
    save("blocked-network.json", blocked);
  }
  results.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.iteration - b.iteration);
  save("review.md", [`# ${runId}`, "", ...results.map(reviewMarkdown)].join("\n\n---\n\n"));
  normalConsole.log(`Saved ${results.length} results to ${dir}/review.md; blocked network ${blocked.length}`);
}

function reviewMarkdown(result: Row) {
  const quote = (text: string) => text.split("\n").map(line => `> ${line}`).join("\n");
  return [
    `## ${result.caseId} · ${result.iteration}`,
    `${result.summary} · ${result.kind} · ${result.model} · ${(result.elapsedMs / 1000).toFixed(0)}s · preload ${JSON.stringify(result.selection.capabilityIds)}`,
    result.error ? `**error** ${result.error}` : "",
    `tools: ${result.calls.map((c: Row) => c.name + (c.error ? "(error)" : "")).join(" → ") || "none"}`,
    ...result.sent.map((m: Row) => `### Sent ${m.channel ?? "email"}${m.subject ? `: ${m.subject}` : ""}\n\n${quote(String(m.body ?? m.text ?? JSON.stringify(m)))}`),
    "### Final text",
    quote(result.reply || "(empty)"),
  ].filter(Boolean).join("\n\n");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
