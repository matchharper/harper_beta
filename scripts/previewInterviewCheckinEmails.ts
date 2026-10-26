/** Model-only preview: production prompt/provider helpers; no DB or mail access. */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("docs/evaluation/interview-checkin-email");
const runId = process.argv[2];
const version = process.argv[3] ?? "v1";
if (!runId || !/^[a-zA-Z0-9_.-]+$/.test(runId)) throw Error("Supply a fresh run ID");
if (!["v1", "v2", "v3", "v4", "v5", "v6"].includes(version)) throw Error("Unknown fixture version");
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const fixture = JSON.parse(readFileSync(path.join(root, `cases-${version}.json`), "utf8"));
const frozen = JSON.parse(readFileSync(path.join(root, `manifest-${version}.json`), "utf8"));
for (const [file, expected] of Object.entries(frozen.hashes)) {
  if (hash(readFileSync(path.join(root, file))) !== expected) throw Error(`Frozen file changed: ${file}`);
}
const value = (flag: string) => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
const requestedModel = value("--model");
if (requestedModel && requestedModel !== "gpt-6-luna") throw Error("Unsupported preview model override");
const contextFile = value("--context-file");
let privateContextHash: string | undefined;
if (contextFile) {
  const resolved = path.resolve(contextFile);
  if (!resolved.startsWith(path.join(root, "private") + path.sep)) throw Error("Reference context must remain in this task's ignored private directory");
  const bytes = readFileSync(resolved);
  const context = JSON.parse(bytes.toString("utf8"));
  privateContextHash = hash(bytes);
  for (const key of ["meeting", "shared", "locale", "cases"]) if (context[key] !== undefined) fixture[key] = context[key];
}
const caseId = value("--case");
if (caseId) {
  fixture.cases = fixture.cases.filter((item: any) => item.id === caseId);
  if (!fixture.cases.length) throw Error("Unknown case");
}
const dir = path.join(root, "runs", runId);
mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
mkdirSync(dir, { mode: 0o700 });
const save = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "preview-no-database";
process.env.RESEND_API_KEY = "preview-no-mail";
const realFetch = globalThis.fetch;
let providerRequests = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  if (!["api.anthropic.com", "api.openai.com", "openrouter.ai"].includes(url.hostname)) throw Error(`Preview network denied: ${url.hostname}`);
  providerRequests++;
  return realFetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(180_000) });
};
const schema = { type: "object", additionalProperties: false, required: ["subject", "body"], properties: { subject: { type: "string" }, body: { type: "string" } } };
const outputContract = "Return JSON only with subject and body string fields.";

async function main() {
  const { buildCareerConversationPromptPlan } = await import("../src/lib/career/prompts/conversationPlan");
  const { resolveCareerCapabilities } = await import("../src/lib/career/capabilities/resolver");
  const { adaptEmailPromptBlocks } = await import("../src/lib/email/runtime/prompt");
  const { resolveCareerTextChatModel } = await import("../src/lib/career/textChatModelConfig");
  const { runTalentAssistantCompletion } = await import("../src/lib/talentOnboarding/llm");
  const { buildCompanyUpdateEmailMessages } = await import("../src/lib/org/agent/companyUpdateEmail");
  const { runOrgAgentCompletion } = await import("../src/lib/org/agent/chat");
  const { resolveOrgAgentModel, getOrgAgentReasoningEffort } = await import("../src/lib/org/agent/modelConfig");
  const { model: talentPrimaryModel, ...talentReasoning } = resolveCareerTextChatModel(requestedModel ?? null);
  const talentModel = { primaryModel: talentPrimaryModel, ...talentReasoning };
  const { model: companyModel } = resolveOrgAgentModel(requestedModel);
  const sourceFiles = ["scripts/previewInterviewCheckinEmails.ts", "src/lib/career/textChatModelConfig.ts", "src/lib/career/capabilities/resolver.ts", "src/lib/career/prompts/conversationPlan.ts", "src/lib/career/prompts/rawPrompts.ts", "src/lib/email/runtime/prompt.ts", "src/lib/org/agent/companyUpdateEmail.ts", "src/lib/org/agent/companyUpdate.ts", "src/lib/org/agent/prompts.ts", "src/lib/org/agent/modelConfig.ts", "src/lib/org/agent/uxWritingPrompt.ts"];
  save("effective-input.json", fixture);
  save("manifest.json", { ...frozen, runId, createdAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: true, sourceHashes: Object.fromEntries(sourceFiles.map(f => [f, hash(readFileSync(f))])), talentModel, companyModel, companyReasoning: getOrgAgentReasoningEffort(companyModel), maxTokens: 16384, synthetic: !contextFile, privateContextHash, noDatabase: true, noSend: true });
  const outputs: any[] = [];
  for (const item of fixture.cases) {
    const caseContext = { ...fixture, ...item.context };
    const before = item.phase === "before";
    const now = new Date(item.currentTime ?? Date.parse(before ? caseContext.meeting.startAt : caseContext.meeting.endAt) + (before ? fixture.timingMinutes.beforeStart : fixture.timingMinutes.afterScheduledEnd) * 60_000).toISOString();
    // Give the writer the appointment and any actual feedback, not flags about
    // missing observations. Unknown attendance is not a missed interview.
    const { attendanceOrCompletionObserved: _observationFlag, ...meeting } = caseContext.meeting;
    const { feedbackRecorded: _feedbackFlag, ...caseFacts } = item.facts ?? {};
    const facts = { ...caseContext.shared, meeting, recipient: item.audience === "talent" ? caseContext.shared.candidate.name : caseContext.shared.interviewer.name,
      availableFollowup: fixture.availableFollowup?.[item.audience] ?? (item.audience === "company" ? "회사의 요청에 따라 후보자에게 다음 인터뷰의 시간 선택 요청을 보낼 수 있다." : "후보자의 요청에 따라 회사에 질문 또는 다음 대화 희망을 전달할 수 있다."), ...caseFacts };
    const purpose = fixture.purposes[item.phase];
    let messages: any[], raw: string, metadata: any;
    const started = Date.now();
    if (item.audience === "talent") {
      const { promptBlocks } = buildCareerConversationPromptPlan({ channel: "chat", profile: null, isOnboardingDone: true, includePostOnboardingConversationGuide: false, structuredProfileText: `${caseContext.shared.candidate.name}: ${caseContext.shared.candidate.background}`, talentContextSection: "", currentPreferences: { preferredLocale: caseContext.locale ?? "ko" }, capabilities: resolveCareerCapabilities({ eligibleTools: [], loaded: new Set(), mode: "progressive" }), timeZone: caseContext.meeting.timezone, requestTime: new Date(now) });
      const blocks = adaptEmailPromptBlocks(promptBlocks, { subject: "", thread: "", attachments: [] }, "", { mode: "outbound" });
      messages = [{ role: "system", content: blocks.map(b => b.text).join("\n\n") + "\n" + outputContract }, ...item.recentConversation, { role: "user", content: "Write the outbound email for this purpose and these current facts:\n" + JSON.stringify({ purpose, facts }) }];
      raw = await runTalentAssistantCompletion({ ...talentModel, ...(requestedModel ? { fallbackModel: talentPrimaryModel, anthropicOverloadFallbackModel: talentPrimaryModel } : {}), messages, maxTokens: 16384, temperature: 0.7, jsonSchema: { name: "interview_checkin_email", schema, strict: true }, abortSignal: AbortSignal.timeout(180_000), onUsage: value => { metadata = value; } });
    } else {
      messages = buildCompanyUpdateEmailMessages({ purpose, facts, locale: caseContext.locale ?? "ko", recentConversation: item.recentConversation, requestTime: new Date(now) });
      const result = await runOrgAgentCompletion({ model: companyModel, messages, allowTools: false, maxTokens: 16384, strictModel: true, reasoningEffort: getOrgAgentReasoningEffort(companyModel), signal: AbortSignal.timeout(180_000), responseFormat: { type: "json_schema", json_schema: { name: "interview_checkin_email", schema, strict: true } } });
      raw = String(result.response.choices?.[0]?.message?.content ?? "");
      metadata = { model: result.model, usage: result.response.usage };
    }
    save(`${item.id}-raw.json`, { raw, messages, metadata });
    if (requestedModel && metadata?.model !== requestedModel) throw Error(`Requested model was not used for ${item.id}`);
    const email = JSON.parse(raw);
    if (typeof email.subject !== "string" || !email.subject.trim() || typeof email.body !== "string" || !email.body.trim()) throw Error(`Missing email fields: ${item.id}`);
    const output = { id: item.id, audience: item.audience, phase: item.phase, currentTime: now, purpose, ...email, ...metadata, durationMs: Date.now() - started };
    save(`${item.id}.json`, output);
    outputs.push(output);
    console.log(JSON.stringify(output));
  }
  save("outputs.json", outputs);
  save("safety.json", { providerRequests, databaseAccess: 0, emailSent: 0, toolsExecuted: 0 });
  console.log(`Saved ${outputs.length} previews in ${dir}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
