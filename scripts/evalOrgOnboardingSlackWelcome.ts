/** Frozen synthetic welcome cases. Reuses production facts, prompt, model and rendering; never contacts Slack or a DB. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import type { User } from "@supabase/supabase-js";
import type { OrgLocale } from "../src/i18n/org/locale";
import type { OrgRole } from "../src/lib/org/server";
import type { CalendarIntegrationRow } from "../src/lib/integrations/googleCalendarStore";

const task = path.resolve("docs/evaluation/company-side-background-result-writing");
const runId = process.argv[2];
if (!runId || !/^[a-zA-Z0-9_.-]+$/.test(runId)) throw Error("Provide a fresh run ID");
const dir = path.join(task, "runs", runId);
mkdirSync(dir, { mode: 0o700 });
chmodSync(dir, 0o700);
const save = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const version = process.argv[3] ?? "v1";
if (!["v1", "v2"].includes(version)) throw Error("Unknown welcome dataset");
const input = readFileSync(path.join(task, `member-welcome-${version}.json`), "utf8");
const gold = readFileSync(path.join(task, `member-welcome-gold-${version}.md`), "utf8");
const frozen = JSON.parse(readFileSync(path.join(task, `member-welcome-manifest-${version}.json`), "utf8"));
assert.equal(hash(input), frozen.inputSha256);
assert.equal(hash(gold), frozen.goldSha256);
config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-only";
process.env.NEXT_PUBLIC_SITE_URL = "https://example.invalid";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  if (url.hostname !== "openrouter.ai") throw Error(`Network blocked: ${url.hostname}`);
  return originalFetch(input, { ...init, signal: AbortSignal.timeout(90_000) });
};

async function main() {
  const { sendOrgOnboardingSlackWelcome } = await import("../src/lib/org/onboardingSlack.server");
  const { runOrgAgentToolLoop } = await import("../src/lib/org/agent/chat");
  const { buildCompanyUpdatePrompt, deliverCompanyUpdateSlackThread } = await import("../src/lib/org/agent/companyUpdate");
  const { getSlackOrgAgentModel, getOrgAgentReasoningEffort, ORG_AGENT_TEMPERATURE } = await import("../src/lib/org/agent/modelConfig");
  const model = getSlackOrgAgentModel();
  const sourceFiles = ["src/lib/org/onboardingSlack.server.ts", "src/lib/org/agent/companyUpdate.server.ts", "src/lib/org/agent/companyUpdate.ts", "src/lib/org/agent/backgroundResultPrompt.ts", "src/lib/org/agent/tools.ts", "src/lib/org/agent/capabilities/registry.ts", "src/lib/org/agent/capabilities/policies.ts", "src/lib/org/agent/chat.ts", "src/lib/org/agent/prompts.ts", "src/lib/org/agent/uxWritingPrompt.ts", "src/lib/org/agent/serviceKnowledgePrompt.ts", "src/lib/org/agent/modelConfig.ts"];
  save("manifest.json", { ...frozen, runId, createdAt: new Date().toISOString(), model, provider: "OpenRouter", reasoning: getOrgAgentReasoningEffort(model), temperature: ORG_AGENT_TEMPERATURE,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: true,
    sources: Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(file, "utf8"))])), runnerSha256: hash(readFileSync(__filename, "utf8")), timeoutMs: 90000,
  });
  const spec = JSON.parse(input) as { companyName: string; cases: Array<{ id: string; locale: OrgLocale; name: string; jobTitle: string; calendarStatus: string | null; roles: OrgRole[]; allowedRoleIds: string[]; notifications?: Record<string, Awaited<ReturnType<typeof import("../src/lib/org/agent/roleNotificationContext").readRoleNotificationContext>>> }> };
  const results = await Promise.all(spec.cases.map(async item => {
    const startedAt = Date.now();
    const output: Record<string, unknown> = { id: item.id };
    const delivered: Array<Record<string, unknown>> = [];
    const slackUrl = await sendOrgOnboardingSlackWelcome({
      user: { id: "synthetic-teammate", email: "teammate@example.invalid" } as User,
      workspaceId: "synthetic-workspace", completedAt: "2026-10-15T00:00:00Z",
      member: { name: item.name, role: item.jobTitle }, roles: item.roles, responseLocale: item.locale,
    }, {
      findChannel: async () => ({ channelId: "C_SYNTHETIC", channelName: "hiring", slackUserId: "U_SYNTHETIC", teamId: "T_SYNTHETIC" }),
      readRoleSettings: async request => item.notifications?.[request.roleId] ?? ({ assigneeUserIds: [], availableAssignees: [], channels: [], confirmedAssigneeUserId: null, confirmedChannelIds: [] }),
      readCalendar: async () => item.calendarStatus ? { status: item.calendarStatus } as CalendarIntegrationRow : null,
      canShareRole: async request => item.allowedRoleIds.includes(request.roleId ?? ""),
      deliver: async notice => {
        output.notice = notice;
        const context = { companyName: spec.companyName, purpose: notice.purpose, facts: notice.facts, recentConversation: [] };
        try {
          const calls: unknown[] = [];
          const batches: unknown[] = [];
          const { parseCompanyMessages } = await import("../src/lib/org/agent/companyMessaging");
          const composed = await runOrgAgentToolLoop({
            admin: new Proxy({}, { get() { throw Error("Synthetic preview cannot access DB"); } }) as any,
            user: { id: "synthetic-teammate" } as User, actorId: "synthetic-teammate", actorLabel: item.name,
            conversation: { id: "synthetic-conversation", company_workspace_id: "synthetic-workspace", role_id: null } as any,
            currentUserMessageId: 1, mentions: [], model, responseLocale: item.locale,
            capabilityMode: "progressive", source: "slack", readAudience: "company_safe", scopeKey: "slack:synthetic-thread",
            slackThreadId: "synthetic-thread", companyMessageAudience: { channelDbId: "synthetic-channel", channelId: "C_SYNTHETIC" },
            userLabel: "authenticated product event", userMessage: buildCompanyUpdatePrompt(context),
            context: {
              workspace: { companyName: spec.companyName, workspaceId: "synthetic-workspace" },
              companyText: `company=${spec.companyName}`, roles: item.roles.filter(r => item.allowedRoleIds.includes(r.roleId)),
              rolesText: JSON.stringify(notice.facts.hiringRoles), completeRoleRequestIds: [],
              recentRecommendationsText: "Not loaded", recentContactsText: "Not loaded", summariesText: "-",
              conversationMessages: [], conversationText: "scope=current_thread thread_id=synthetic-thread; Harper has already mentioned this teammate here.",
              conversationHistoryInfo: { hasMore: false, threadId: "synthetic-thread", returnedItems: 0 },
              contextNotesText: "Synthetic preview; role index is partial. No hiring or candidate-contact action requested.",
              defaultLongTextObservations: [], pendingUpdateText: "-", recentToolContextText: "-", inProgressRoleCreationsText: "-",
            } as any,
          }, { executeTool: async request => {
            calls.push({ name: request.name, input: request.input });
            if (request.name === "send_company_message") {
              const parts = parseCompanyMessages(typeof request.input === "string" ? JSON.parse(request.input) : request.input);
              batches.push(...parts);
              request.state.companyMessageBatch = { batchId: "synthetic-batch", messageIds: parts.map((_, i) => i + 2) };
              return { status: "committed", ...request.state.companyMessageBatch };
            }
            if (["read_role", "get_more_data", "read_conversation_history", "get_talents", "list_contacts", "read_talent"].includes(request.name))
              return { status: "unavailable", reason: "No additional synthetic facts captured; use supplied verified event facts." };
            throw Error(`No authorized synthetic action: ${request.name}`);
          } });
          output.toolCalls = calls;
          output.toolResults = composed.state.toolResults;
          output.batches = batches;
          if (batches.length) composed.reply = batches.map((p: any) => p.text).join("\n\n");
          output.model = composed.model;
          output.reply = composed.reply;
          await deliverCompanyUpdateSlackThread({ channelId: notice.slackDelivery.channelId, eventKey: notice.eventKey, mentionSlackUserId: notice.slackDelivery.mentionSlackUserId, text: composed.reply }, async message => {
            delivered.push(message);
            return { slackMessageTs: `100.${delivered.length}`, threadId: "synthetic-thread" };
          });
          output.renderedMessages = delivered;
          return { slackUrl: "https://example.invalid/slack-thread", threadId: "synthetic-thread" };
        } catch (error) {
          output.error = error instanceof Error ? error.message : String(error);
          throw error;
        }
      },
    });
    output.durationMs = Date.now() - startedAt;
    output.generated = Boolean(slackUrl && output.reply);
    save(`${item.id}.json`, output);
    console.log(JSON.stringify({ id: item.id, generated: output.generated, durationMs: output.durationMs }));
    return output.generated;
  }));
  if (results.some(result => !result)) process.exitCode = 1;
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
