/** Synthetic Role-authoring/notification check. No production DB or external delivery. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import { config } from "dotenv";

const root = process.cwd();
const task = path.join(root, "docs/evaluation/company-side-conversational-qa");
const runId = process.argv[2];
const dataset = process.argv[3] ?? "notification-consent-v1";
const selectedIds = process.argv[4]?.split(",");
const view = process.argv[5];
if (view !== undefined && view !== "role_details" && view !== "role_setup") throw Error("Invalid Role editing view");
if (!/^[a-zA-Z0-9_.-]+$/.test(dataset)) throw Error("Invalid dataset name");
if (!runId || !/^[a-zA-Z0-9_.-]+$/.test(runId)) throw Error("Provide a fresh run ID");
const dir = path.join(task, "runs", runId);
mkdirSync(dir, { mode: 0o700 });
const save = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const rawInput = readFileSync(path.join(task, `${dataset}.json`), "utf8");
const frozen = JSON.parse(readFileSync(path.join(task, dataset.replace(/-(v\d+)$/, "-manifest-$1") + ".json"), "utf8"));
assert.equal(hash(rawInput), frozen.inputSha256);
assert.equal(hash(readFileSync(path.join(task, dataset.replace(/-(v\d+)$/, "-gold-$1") + ".md"), "utf8")), frozen.goldSha256);
const spec = JSON.parse(rawInput);
const cases = selectedIds ? spec.cases.filter((item: any) => selectedIds.includes(item.id)) : spec.cases;
if (selectedIds) assert.equal(cases.length, new Set(selectedIds).size, "Unknown or duplicate case ID");
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-only";
const originalFetch = globalThis.fetch;
let providerHost: string | null = null;
globalThis.fetch = async (input: any, init?: any) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  if (url.hostname !== providerHost) throw Error(`Network blocked: ${url.hostname}`);
  return originalFetch(input, { ...init, signal: AbortSignal.timeout(120_000) });
};

async function main() {
  const llm = await import("../src/lib/llm/llm");
  const config = await import("../src/lib/org/agent/modelConfig");
  const prompt = await import("../src/lib/org/agent/roleCreationPrompt");
  const { getRoleCreationTools } = await import("../src/lib/org/agent/roleCreationTools");
  const { getRoleCreationMissingFields, summarizeRoleCreationNotificationSettings } = await import("../src/lib/org/agent/roleCreationState");
  const { parseOrgRoleCriteria, hasCompleteOrgRoleCriteria } = await import("../src/lib/org/roleCriteria");
  const { applyRoleTextEdits } = await import("../src/lib/org/agent/roleTextEdits");
  const { validateCompanyCompletion } = await import("../src/lib/org/agent/completionContract");
  const model = view === "role_setup" ? config.ORG_AGENT_GEMINI_FLASH_MODEL : config.DEFAULT_ORG_AGENT_MODEL;
  const provider = llm.getLlmChatProviderForModel(model);
  providerHost = { openai: "api.openai.com", openrouter: "openrouter.ai", anthropic: "api.anthropic.com" }[provider];
  const reasoning = view === "role_setup" ? "low" : config.getOrgAgentReasoningEffort(model);
  const tools = getRoleCreationTools(view).filter(t => t.function.name !== "confirm_pending_role_creation");
  const sourceFiles = ["roleCreationChat.ts", "roleCreationState.ts", "roleCreationTools.ts", "roleCreationPrompt.ts", "modelConfig.ts", "uxWritingPrompt.ts", "serviceKnowledgePrompt.ts", "hiringBriefAuthoringPrompt.ts"];
  save("manifest.json", { ...frozen, runId, view, selectedIds: cases.map((item: any) => item.id), createdAt: new Date().toISOString(), model, provider, reasoning, outputTokenLimit: null, toolCallLimit: null, temperature: config.ORG_AGENT_TEMPERATURE, timeoutMs: 120000,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: true, sources: Object.fromEntries([...sourceFiles.map(f => [f, hash(readFileSync(path.join(root, "src/lib/org/agent", f), "utf8"))]),
      ["roleCriteria.ts", hash(readFileSync(path.join(root, "src/lib/org/roleCriteria.ts"), "utf8"))],
      ["roleTextEdits.ts", hash(readFileSync(path.join(root, "src/lib/org/agent/roleTextEdits.ts"), "utf8"))]]), runnerHash: hash(readFileSync(__filename, "utf8")) });
  let failed = false;
  for (const item of cases) {
    const state = structuredClone(spec.state);
    for (const [key, value] of Object.entries(item.stateOverrides ?? {})) Object.assign((state as any)[key], value);
    const system = prompt.buildRoleCreationSystemPrompt({ view, surface: item.surface, responseLocale: item.responseLocale ?? "ko", editingRegisteredRole: state.role.status !== "draft" });
    const context = prompt.buildRoleCreationUserPrompt({ view, responseLocale: item.responseLocale ?? "ko", state, history: item.history, attachments: [], mentions: [], userMessage: item.message, includeConversation: false });
    const messages: any[] = [{ role: "system", content: system }, { role: "user", content: context }, ...item.history, { role: "user", content: item.message }];
    const trace: any[] = [];
    const effects: any[] = [];
    const roleEdits: any[] = [];
    let confirmationRequests = 0;
    let final = "";
    try {
      while (true) {
        const completion = await llm.createChatCompletionWithFallback({ model, debugLabel: `eval/${dataset}`,
          buildRequest: () => ({ messages, tools, tool_choice: "auto", parallel_tool_calls: false, temperature: config.ORG_AGENT_TEMPERATURE }),
          validateResponse: validateCompanyCompletion, chatCompletionReasoning: { reasoningEffort: reasoning }, openAIResponses: { reasoningEffort: reasoning } });
        const response: any = completion.response;
        trace.push(response);
        const message = response.choices?.[0]?.message;
        if (!message) throw Error("No completion message");
        messages.push(message);
        if (!message.tool_calls?.length) { final = message.content ?? ""; break; }
        for (const call of message.tool_calls) {
          const input = JSON.parse(call.function.arguments);
          let result: any;
          if (call.function.name === "update_role_draft") {
            const savedInput = applyRoleTextEdits({ description: state.role.description, request: state.role.request }, input);
            for (const key of ["name", "description", "request", "locationText", "workMode", "employmentTypes", "salaryRange", "externalJdUrl", "memory"]) {
              if (Object.hasOwn(savedInput, key)) state.role[key] = savedInput[key];
            }
            if (Object.hasOwn(input, "criteria")) state.role.criteria = parseOrgRoleCriteria(input.criteria);
            roleEdits.push(input);
            result = { ok: true, savedFields: Object.fromEntries(Object.keys(savedInput).map(k => [k, state.role[k]])),
              ...(!view ? { ...(state.role.status === "draft" ? { missingFields: getRoleCreationMissingFields(state) } : { registeredRole: true }), notificationSettings: summarizeRoleCreationNotificationSettings(state) } : {}) };
          } else if (call.function.name === "read_other_roles") {
            result = { roles: item.otherRoles ?? spec.otherRoles ?? [] };
          } else if (call.function.name === "set_role_notification") {
            const previousSelection = JSON.stringify({ channelIds: state.metadata.confirmedSlackChannelIds, assigneeUserId: state.metadata.confirmedAssigneeUserId });
            assert.ok(input.channelIds !== undefined || input.assigneeUserId !== undefined);
            if (input.channelIds !== undefined) {
              assert.ok(input.channelIds.length > 0 && input.channelIds.every((id: string) => state.channels.some((c: any) => c.channelId === id)));
              state.metadata.confirmedSlackChannelIds = input.channelIds;
            }
            if (input.assigneeUserId !== undefined) {
              assert.ok(state.members.some((m: any) => m.userId === input.assigneeUserId));
              state.metadata.confirmedAssigneeUserId = input.assigneeUserId;
              state.assigneeUserIds = [input.assigneeUserId];
            }
            const currentSelection = JSON.stringify({ channelIds: state.metadata.confirmedSlackChannelIds, assigneeUserId: state.metadata.confirmedAssigneeUserId });
            if (currentSelection !== previousSelection) effects.push(input);
            result = { ok: true, missingFields: getRoleCreationMissingFields(state), notificationSettings: summarizeRoleCreationNotificationSettings(state) };
          } else if (call.function.name === "request_role_creation_confirmation") {
            const missingFields = getRoleCreationMissingFields(state);
            if (missingFields.length) result = { ok: false, error: "role_creation_not_ready", missingFields };
            else { confirmationRequests++; result = { ok: true, presentationRequired: true, status: "confirmation_pending", roleName: state.role.name }; }
          } else if (call.function.name === "web_search") {
            result = { results: item.searchResults ?? [] };
          } else if (call.function.name === "open_url") {
            result = item.pages?.[input.url] ?? { error: "Source unavailable" };
          } else {
            throw Error("Unsupported synthetic effect; no change made");
          }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      assert.ok(final, "Missing final response");
      if (item.expectedSelection === null) assert.equal(effects.length, 0);
      else if (item.expectedSelection !== undefined) {
        assert.equal(effects.length, 1);
        assert.deepEqual(effects[0], item.expectedSelection);
      }
      if (item.expectedCriteria === "authored") assert.ok(state.role.criteria.length > 0 && hasCompleteOrgRoleCriteria(state.role.criteria), "Expected LLM-authored criteria in this evaluation; not a runtime completion gate");
      if (item.expectedCriteria === "preserved") assert.deepEqual(state.role.criteria, spec.state.role.criteria);
      if (item.expectedConfirmationRequests !== undefined) assert.equal(confirmationRequests, item.expectedConfirmationRequests);
      for (const [key, value] of Object.entries(item.expectedRoleFields ?? {})) assert.deepEqual(state.role[key], value);
      save(`${item.id}.json`, { messages, trace, effects, roleEdits, state, confirmationRequests, final, structuralPass: true, semanticReview: "pending", promptHash: hash(system + context) });
      console.log(JSON.stringify({ id: item.id, effects, criteria: state.role.criteria, confirmationRequests, final }));
    } catch (error) {
      failed = true;
      save(`${item.id}.json`, { messages, trace, effects, roleEdits, state, confirmationRequests, final, error: String(error), structuralPass: false });
      console.log(JSON.stringify({ id: item.id, error: String(error), effects, final }));
    }
  }
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
