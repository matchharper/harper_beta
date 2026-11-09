import { parseReadTalentIds } from "../src/lib/org/agent/readTalentInput";
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { formatIntroductionContext } from "../src/lib/agentContacts/introductionContext";
import { companyAgentEventPrompt } from "../src/lib/agentContacts/contracts";
import { companyAgentServiceTools, formatCompanyAgentServiceScope, withCompanyAgentScope } from "../src/lib/agentContacts/companyScope";
import { formatRoleNotificationDestinations } from "../src/lib/org/roleNotificationDestinations";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://evaluation.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
const task = "docs/evaluation/career-internal-introduction";
const dataset = process.argv[2] ?? "v1";
if (!["v1", "v2", "v3", "v4", "v5"].includes(dataset)) throw Error("Unknown registered company fixture version");
const fixture = JSON.parse(
  readFileSync(`${task}/company-agent-${dataset}.json`, "utf8")
);
const frozen = JSON.parse(
  readFileSync(`${task}/company-agent-manifest-${dataset}.json`, "utf8")
);
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex < 0 ? [] : process.argv[onlyIndex + 1].split(",");
assert.ok(only.every(id => fixture.cases.some((scenario: any) => scenario.id === id)), "Unknown company case ID");
const cases = fixture.cases.filter((scenario: any) => !only.length || only.includes(scenario.id));
const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
assert.equal(
  hash(readFileSync(`${task}/company-agent-${dataset}.json`)),
  frozen.inputHash
);
const dir = `${task}/runs/company-${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  if (
    !["api.openai.com", "api.anthropic.com", "openrouter.ai"].includes(
      url.hostname
    )
  )
    throw new Error(`Evaluation blocks non-provider request: ${url.hostname}`);
  return originalFetch(input, {
    ...init,
    signal: AbortSignal.any([
      ...(init?.signal ? [init.signal] : []),
      AbortSignal.timeout(120_000),
    ]),
  });
};

async function main() {
  const { formatOrgAgentCurrentRoleContext } = await import("../src/lib/org/agent/context");
  const { runOrgAgentToolLoop, runOrgAgentCompletion } =
    await import("../src/lib/org/agent/chat");
  const { resolveOrgAgentModel } =
    await import("../src/lib/org/agent/modelConfig");
  const model = resolveOrgAgentModel(undefined).model;
  const sourcePaths = [
    "scripts/evalCompanyAgentCorrespondence.ts",
    "src/lib/org/agent/chat.ts",
    "src/lib/org/agent/context.ts",
    "src/lib/org/teamAccess.ts",
    "src/lib/org/agent/prompts.ts",
    "src/lib/org/agent/serviceKnowledgePrompt.ts",
    "src/lib/org/agent/tools.ts",
    "src/lib/org/agent/capabilities/policies.ts",
    "src/lib/org/agent/capabilities/registry.ts",
    "src/lib/org/agent/capabilities/resolver.ts",
    "src/lib/org/agent/promptFormat.ts",
    "src/lib/agentContacts/contracts.ts",
    "src/lib/agentContacts/introductionContext.ts",
    "src/lib/agentContacts/introductionContext.server.ts",
    "src/lib/agentContacts/read.ts",
    "src/lib/agentContacts/companyReceiver.server.ts",
    "src/lib/agentContacts/companyTools.ts",
    "src/lib/org/agent/companyMessageDelivery.server.ts",
    "src/lib/agentContacts/companyScope.ts",
    "src/lib/agentContacts/companyToolDefinitions.ts",
    "src/lib/agentContacts/guidance.ts",
    "src/lib/agentContacts/toolContracts.ts",
    "src/lib/org/roleNotificationDestinations.ts",
  ];
  save("manifest", {
    dataset: `company-agent-${dataset}`,
    selected: cases.map((scenario: any) => scenario.id),
    model,
    createdAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: true,
    hashes: Object.fromEntries(
      sourcePaths.map((p) => [p, hash(readFileSync(p))])
    ),
    fixtureHash: frozen.inputHash,
    timeoutMs: 240_000,
    boundary:
      "Actual company loop, prompt, schemas and formatters; synthetic context and effects; provider network only.",
  });
  const results = [];
  for (const scenario of cases) {
    const startedAt = performance.now();
    const calls: any[] = [],
      completions: any[] = [];
    const context = {
      accessText: formatCompanyAgentServiceScope({ roleId: fixture.roleId }),
      companyText: scenario.companyContext ?? fixture.companyContext,
      workspace: {
        workspaceId: fixture.workspaceId,
        companyName: "노바클라우드",
        pitch: "클라우드 주문 서비스",
        companyDescription: "합성 평가 회사",
      },
      roles: [
        { roleId: fixture.roleId, name: "플랫폼 엔지니어", status: scenario.roleStatus ?? "paused",
          updatedAt: fixture.requestTime ?? "2026-11-03T06:00:00Z",
          description: scenario.roleContext ?? "공개 JD: Kubernetes, Terraform, SLO와 온콜 운영.",
          request: fixture.privateCompanyContext, criteria: [] },
      ],
      rolesText: scenario.roleContext ?? `Role ${fixture.roleId}: 플랫폼 엔지니어. 공개 JD: Kubernetes, Terraform, SLO와 온콜 운영. 회사 내부 검토: ${fixture.privateCompanyContext}`,
      completeRoleRequestIds: [],
      recentRecommendationsText: scenario.existingPresentation
        ? (scenario.existingNotification === false ? "The candidate profile is already published to the Role inbox. The team has not been notified of the new candidate response." : "This exact introduction is already published to the Role inbox and was notified to the team.")
        : "No presentation yet for this introduction.",
      recentContactsText: scenario.history,
      conversationMessages: [],
      conversationText: "-",
      summariesText: "-",
      contextNotesText: scenario.notificationSettings
        ? formatRoleNotificationDestinations({ roleId: fixture.roleId, ...scenario.notificationSettings })
        : scenario.audienceContext ?? "Only company chat is approved for this Role. Email and Slack are disabled.",
      defaultLongTextObservations: [],
      inProgressRoleCreationsText: "-",
      pendingUpdateText: "-",
      recentToolContextText: "-",
    } as any;
    const relationship = scenario.origin ? formatIntroductionContext({ rootId: fixture.rootId, talentId: fixture.talentId, roleId: fixture.roleId, recommendationId: fixture.recommendationId, candidateName: "김서윤", origin: scenario.origin, ...(scenario.candidateInitiatedOpportunity ? { candidateInitiatedOpportunity: true } : {}) }) + "\n" : "";
    context.rolesText += "\n\n" + formatOrgAgentCurrentRoleContext(context, fixture.roleId);
    const event = relationship + `Incoming message ${fixture.messageId}; introduction ${fixture.rootId}; Role ${fixture.roleId}.\nCandidate 김서윤; shared material profile: ${scenario.sharedProfile ?? "Platform Engineer, Kubernetes 운영 6년, Terraform, SLO와 온콜 runbook 직접 작성."} Candidate approved this profile for this introduction.\n${scenario.incoming}`;
    let failure: string | undefined;
    try {
      const result = await runOrgAgentToolLoop(
        {
          admin: withCompanyAgentScope({}, { kind: "company_event", workspaceId: fixture.workspaceId, roleId: fixture.roleId, jobId: fixture.jobId, leaseOwner: "evaluation", assertCurrent: async () => {} }) as any,
          user: { id: fixture.jobId } as any,
          actorId: fixture.jobId,
          actorLabel: "Harper company agent",
          conversation: {
            id: fixture.conversationId,
            company_workspace_id: fixture.workspaceId,
            role_id: fixture.roleId,
          } as any,
          context,
          currentUserMessageId: 1,
          model,
          responseLocale: "ko",
          allowSilentCompletion: true,
          throwOnToolExecutionError: true,
          harperInitiated: true,
          capabilityMode: "progressive",
          initialCapabilities: ["agent_correspondence"],
          allowedToolNames: companyAgentServiceTools(),
          source: "chat",
          readAudience: "company_safe",
          scopeKey: "synthetic-agent-event",
          slackThreadId: null,
          mentions: [],
          signal: AbortSignal.timeout(240_000),
          userMessage: companyAgentEventPrompt(event),
        },
        {
          requestTime: new Date(fixture.requestTime ?? "2026-11-03T06:00:00Z"),
          complete: async (args) => {
            const entry: any = { input: args, startedMs: Math.round(performance.now() - startedAt) };
            completions.push(entry);
            save(`${scenario.id}-completions`, completions);
            const result = await runOrgAgentCompletion({
              ...args,
              candidateEmailWorkspaceId: undefined,
            });
            entry.output = result;
            entry.finishedMs = Math.round(performance.now() - startedAt);
            save(`${scenario.id}-completions`, completions);
            return result;
          },
          executeTool: async (args) => {
            const input = args.input as any;
            calls.push({ name: args.name, input, atMs: Math.round(performance.now() - startedAt) });
            let modelOutput: string;
            if (args.name === "read_agent_messages") modelOutput = event;
            else if (args.name === "read_role")
              modelOutput =
                context.rolesText +
                "\n" + context.contextNotesText;
            else if (args.name === "read_conversation_history")
              modelOutput = scenario.history;
            else if (args.name === "read_talent") {
              assert.deepEqual(parseReadTalentIds(input), [fixture.talentId]);
              // Production accepts an omitted roleId and still enforces the
              // service principal's Role. This fixture has one accessible Role.
              if (input.roleId != null) assert.equal(input.roleId, fixture.roleId);
              modelOutput = `Shared candidate profile: ${scenario.sharedProfile ?? "Platform Engineer, Kubernetes 운영 6년, Terraform, SLO와 온콜 runbook 직접 작성."}\n${scenario.history}`;
            }
            else if (args.name === "get_more_data")
              modelOutput = context.recentRecommendationsText;
            else if (args.name === "publish_role_recommendations") {
              assert.equal(input.introductionRootId, fixture.rootId);
              assert.ok(input.presentation);
              modelOutput =
                "Candidate presentation saved in the Role inbox; no human notification or company connection decision.";
            } else if (args.name === "contact_user") {
              assert.ok((scenario.companyChannels ?? ["chat"]).includes(input.channel));
              assert.ok(input.body);
              const slackEnabled = scenario.notificationSettings?.channels.some((channel: any) => channel.enabled);
              modelOutput = input.channel === "email"
                ? "Message delivered to the approved company email audience in the isolated fixture. Readership unknown."
                : slackEnabled || input.channel === "slack"
                  ? "Message saved in the company's Role chat and automatically delivered to its configured, approved Slack notification channels in the isolated fixture. Readership unknown."
                  : "Message saved in the company's Role chat. No Slack or email alert was sent in the isolated fixture. Readership unknown.";
            } else if (args.name === "contact_talent") {
              assert.equal(input.action, "send_to_agent");
              assert.ok(input.introductionRootId || input.replyToMessageId);
              if (input.introductionRootId) assert.equal(input.introductionRootId, fixture.rootId);
              if (input.replyToMessageId) assert.equal(input.replyToMessageId, fixture.messageId);
              modelOutput =
                "Accepted by candidate agent inbox. No direct human delivery.";
            } else if (args.name === "manage_agent_schedule")
              modelOutput = input.action === "list" || input.action === "read"
                ? scenario.scheduleContext ?? "No saved company-agent schedules."
                : "Future work saved in the isolated fixture. No delivery occurred.";
            else throw new Error(`Unsupported effect ${args.name}`);
            args.state.toolResults.push({
              callId: args.callId,
              name: args.name,
              status: "success",
              summary: modelOutput,
            });
            calls.at(-1).result = { modelOutput };
            return { modelOutput };
          },
        }
      );
      save(`${scenario.id}-result`, {
        calls,
        reply: result.reply,
        usage: result.usage,
        semanticReview: "pending",
      });
      for (const tool of scenario.requiredTools ?? [])
        assert.ok(
          calls.some((c) => c.name === tool),
          `Missing ${tool}`
        );
      for (const tool of scenario.forbiddenTools ?? [])
        assert.ok(!calls.some((c) => c.name === tool), `Unexpected ${tool}`);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    results.push({ id: scenario.id, failure, calls });
    save("results", results);
    console.log(
      JSON.stringify({
        caseId: scenario.id,
        tools: calls.map((c) => c.name),
        failure,
      })
    );
  }
  save("summary", {
    cases: results.length,
    structuralPass: results.filter((r) => !r.failure).length,
    semanticReview: "pending",
  });
  console.log(`Artifacts: ${dir}`);
  if (results.some((r) => r.failure)) process.exitCode = 1;
}
main()
  .finally(() => {
    globalThis.fetch = originalFetch;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
