import { config } from "dotenv";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import Ajv from "ajv";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-agent-autonomy";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const option = (name: string, fallback: string) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };

async function main() {
  const dataset = option("--dataset", "v1"); assert.match(dataset, /^v\d+$/);
  const fixture = JSON.parse(readFileSync(`${task}/cases-${dataset}.json`, "utf8"));
  const frozen = JSON.parse(readFileSync(`${task}/manifest-${dataset}.json`, "utf8"));
  for (const [name, digest] of Object.entries(frozen.hashes)) assert.equal(hash(readFileSync(`${task}/${name}`)), digest);
  const revision = option("--guidance-revision", "");
  const guidance = revision ? await (await import("./evaluation/careerAutonomyGuidance")).loadCareerAutonomyGuidance(revision) : undefined;
  const { createCareerAutonomyFixture } = await import("./evaluation/careerAutonomyFixture");
  const { resolveCareerChatTools } = await import("@/lib/career/llmTools");
  const { resolveCareerTextChatModel } = await import("@/lib/career/textChatModelConfig");
  const { CareerCapabilityRuntime } = await import("@/lib/career/capabilities/runtime");
  const { selectCareerPreloads } = await import("@/lib/career/capabilities/decisions");
  const { runCareerChatAssistant } = await import("@/lib/career/llm");
  const model = resolveCareerTextChatModel(undefined);
  const originalFetch = globalThis.fetch;
  if (process.argv.includes("--validate-only")) {
    globalThis.fetch = async () => { throw new Error("Fixture validation has no network access"); };
    try {
      for (const scenario of fixture.cases) {
        const sandbox = createCareerAutonomyFixture(scenario, fixture.requestTime);
        await sandbox.execute({ name: "list_documents", input: {} });
        for (const doc of scenario.documents) await sandbox.execute({ name: "read_document", input: { document_id: doc.id } });
        for (const doc of scenario.documents.filter((doc: any) => doc.row?.origin_type === "harper_authored_document")) {
          await sandbox.execute({ name: "upsert_document", input: { action: "update", document_id: doc.id, expected_revision: doc.row.revision, edits: [{ old_text: doc.text, new_text: `${doc.text}\nFixture edit.` }] } });
          await sandbox.execute({ name: "read_document", input: { document_id: doc.id } });
        }
        const created: any = await sandbox.execute({ name: "upsert_document", input: { action: "create", type: "markdown", title: "Fixture storage check", markdown: "Original source text." } });
        await sandbox.execute({ name: "read_document", input: { document_id: created.documentId } });
        const resume: any = await sandbox.execute({ name: "upsert_document", input: { action: "create", type: "resume", title: "Fixture resume check", content: { language: "ko", basics: { name: scenario.profile.name ?? "Fixture" } }, source_document_ids: scenario.documents.map((doc: any) => doc.id) } });
        await sandbox.execute({ name: "read_document", input: { document_id: resume.documentId, format: "structured" } });
      }
      console.log(`Validated ${fixture.cases.length} frozen cases; production document read/write fixtures passed.`);
      if (guidance) {
        const selected = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false });
        assert.equal(selected.tools.find(tool => tool.function.name === "write_talent_context")!.function.description, guidance.memoryDescription);
        const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: selected.tools, adaptPromptBlocks: guidance.adaptPromptBlocks,
          selection: { capabilityIds: [], handbookIds: ["resume", "application", "opportunity_search"], status: "selected", elapsedMs: 0 },
          promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: "Fixture profile", talentContextSection: "", currentPreferences: { preferredLocale: "ko" } }) });
        const step = runtime.resolveStep(false);
        assert.equal(step.systemBlocks.find(block => block.key === "career_main")!.text, guidance.mainText);
        const { findCareerHandbook } = await import("@/lib/career/handbooks/registry");
        for (const id of ["resume", "application", "opportunity_search"]) assert.equal(step.systemBlocks.find(block => block.key === `handbook:${id}`)!.text, `## Handbook: ${id}\n${findCareerHandbook(id)!.body}`);
        console.log(`Source replay verified: ${guidance.commit}; main, handbook bodies/catalog and Memory tool description.`);
      }
    } finally { globalThis.fetch = originalFetch; }
    return;
  }
  const repeat = Number(option("--repeat", "2")); assert.ok(Number.isInteger(repeat) && repeat > 0);
  const only = option("--only", "").split(",").filter(Boolean);
  const cases = fixture.cases.filter((c: any) => !only.length || only.includes(c.id)); assert.ok(cases.length);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${option("--label", "run")}`;
  const dir = `${task}/runs/${runId}`; mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
  const normalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const scope = new AsyncLocalStorage<{ caseId: string; iteration: number }>();
  for (const level of ["log", "info", "warn", "error"] as const) console[level] = (...args: any[]) => appendFileSync(`${dir}/runtime.log`, JSON.stringify({ ...scope.getStore(), level, values: args }) + "\n", { mode: 0o600 });
  const requests: any[] = [], blocked: any[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const current = scope.getStore();
    if (url.hostname !== "api.openai.com" || !["/v1/responses", "/v1/chat/completions", "/v1/decisions"].includes(url.pathname)) {
      blocked.push({ ...current, host: url.hostname, path: url.pathname }); throw new Error("Evaluation blocks non-provider network");
    }
    assert.ok(current); const body = JSON.parse(String(init?.body));
    if (url.pathname !== "/v1/decisions") assert.equal(body.model, model.model, "Model/fallback must remain fixed");
    const index = requests.length + 1, started = Date.now();
    const record: any = { ...current, index, path: url.pathname, model: body.model, requestHash: hash(JSON.stringify(body)) };
    requests.push(record); save(`request-${index}`, body);
    try {
      const response = await originalFetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(150_000)]) });
      const text = await response.clone().text(); record.elapsedMs = Date.now() - started; record.status = response.status;
      try { record.usage = JSON.parse(text).usage; } catch { /* Preserve raw response below. */ }
      save(`response-${index}`, { status: response.status, body: text }); return response;
    } catch (error) { record.error = error instanceof Error ? error.message : String(error); throw error; }
    finally { save("requests", requests); }
  };
  const sourcePaths = ["scripts/evalCareerAgentAutonomy.ts", "scripts/evaluation/careerAutonomyFixture.ts", "src/lib/career/prompts/mainPrompt2.ts", "src/lib/career/prompts/mainPrompts.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/prompts/conversationSections.ts", "src/lib/career/llmTools.ts", "src/lib/career/llm.ts", "src/lib/talentOnboarding/llm.ts", "src/lib/llm/toolDescriptions.ts", "src/lib/talentOnboarding/tools.ts", "src/lib/documents/authoring.ts", "src/lib/resumes/service.ts", "src/lib/career/textChatModelConfig.ts", ...["capabilities", "handbooks"].flatMap(folder => readdirSync(`src/lib/career/${folder}`).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => `src/lib/career/${folder}/${name}`))];
  sourcePaths.push("scripts/evaluation/careerAutonomyGuidance.ts");
  save("sources", Object.fromEntries(sourcePaths.map(path => [path, readFileSync(path, "utf8")])));
  if (guidance) save("replayed-guidance", guidance);
  save("manifest", { runId, datasetVersion: dataset, model, repeat, fixtureHashes: frozen.hashes, selected: cases.map((c: any) => c.id),
    guidanceRevision: guidance?.commit, replayedSourceHashes: guidance && Object.fromEntries(Object.entries(guidance.sources).map(([file, body]) => [file, hash(body)])),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sources: Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))])),
    sourceDiff: execFileSync("git", ["diff", "--", "src"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }),
    turnTimeoutMs: 360_000, providerTimeoutMs: 150_000, concurrency: 2,
    boundary: "Live production Career LLM and Decisions; actual schemas/runtime; frozen tool source evidence; production document authoring with memory persistence; no real external actions." });
  const jobs = cases.flatMap((scenario: any) => Array.from({ length: repeat }, (_, i) => ({ scenario, iteration: i + 1 })));
  const results: any[] = []; let cursor = 0;
  const runCase = async ({ scenario, iteration }: any) => scope.run({ caseId: scenario.id, iteration }, async () => {
    const began = Date.now(), sandbox = createCareerAutonomyFixture(scenario, fixture.requestTime);
    const signal = AbortSignal.timeout(360_000);
    const selected = resolveCareerChatTools({ channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: scenario.gmail });
    const messages = [{ role: "user" as const, content: scenario.message }];
    const preloads = await selectCareerPreloads({ eligibleNames: new Set(selected.toolNames), input: { messages, currentContext: `Gmail: ${scenario.gmail ? "available" : "not_connected"}.\n${sandbox.referencesText()}` }, signal });
    const runtime = new CareerCapabilityRuntime({ mode: "progressive", eligibleTools: selected.tools, selection: preloads, abortSignal: signal, adaptPromptBlocks: guidance?.adaptPromptBlocks,
      promptArgs: () => ({ channel: "chat", isOnboardingDone: true, profile: null, structuredProfileText: sandbox.profileText(),
        talentContextSection: sandbox.contextText(), runtimeInstruction: sandbox.referencesText(), gmailCapability: scenario.gmail ? "available" : "not_connected",
        currentPreferences: { preferredLocale: "ko", talentSettingStatus: "active", profileVisibility: "private" }, requestTime: new Date(fixture.requestTime), timeZone: "Asia/Seoul" }) });
    const first = runtime.resolveStep(false), intermediate: string[] = [];
    const ajv = new Ajv({ strict: false, allowUnionTypes: true, validateFormats: false });
    const validators = new Map(selected.tools.map(tool => [tool.function.name, ajv.compile(tool.function.parameters)]));
    let reply = "", error: string | undefined;
    try {
      reply = await runCareerChatAssistant({ primaryModel: model.model, openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort,
        responseLocale: "ko", messages, tools: first.tools, systemBlocks: first.systemBlocks, toolRuntime: runtime, stopAfterToolNames: selected.stopAfterToolNames,
        abortSignal: signal, usageLabel: `eval/career-agent-autonomy/${scenario.id}`,
        onAssistantMessage: text => { intermediate.push(text); },
        executeTool: async call => { const validate = validators.get(call.name); assert.ok(validate); if (!validate(call.input)) throw new Error(ajv.errorsText(validate.errors)); return sandbox.execute(call); } });
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    const result = { caseId: scenario.id, iteration, elapsedMs: Date.now() - began, preloads, intermediate, reply, error,
      calls: sandbox.calls, state: sandbox.state(), runtime: runtime.completedRecord() };
    save(`${scenario.id}-${iteration}`, result); results.push(result); save("results", results);
    normalConsole.log(JSON.stringify({ caseId: scenario.id, iteration, elapsedMs: result.elapsedMs, tools: sandbox.calls.map(c => c.name), error }));
  });
  normalConsole.log(`Run directory: ${dir}`);
  try { await Promise.all(Array.from({ length: 2 }, async () => { while (cursor < jobs.length) await runCase(jobs[cursor++]); })); }
  finally { globalThis.fetch = originalFetch; Object.assign(console, normalConsole); save("requests", requests); save("blocked-network", blocked); }
  normalConsole.log(`Saved ${results.length} results: ${dir}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
