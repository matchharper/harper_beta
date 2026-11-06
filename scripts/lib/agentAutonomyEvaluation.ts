import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { owner, role, rec, profile } from "./careerIntroductionTestStore";
import { runOrgAgentToolLoop, runOrgAgentCompletion } from "../../src/lib/org/agent/chat";
import { resolveOrgAgentModel } from "../../src/lib/org/agent/modelConfig";
import { companyAgentServiceTools, formatCompanyAgentServiceScope, withCompanyAgentScope } from "../../src/lib/agentContacts/companyScope";
import { companyAgentEventPrompt, formatAgentContacts, agentContactReceipt, companyPresentationReceipt, decodeMaterialSelection, type AgentContactMessage } from "../../src/lib/agentContacts/contracts";
import { formatIntroductionContext } from "../../src/lib/agentContacts/introductionContext";
import { formatProfileToolResult } from "../../src/lib/career/profiles/tools";
import { CareerCapabilityRuntime } from "../../src/lib/career/capabilities/runtime";
import { runCareerChatAssistant } from "../../src/lib/career/llm";
import { formatLlmDateTime } from "../../src/lib/llm/promptDateTime";
import { formatCareerEmailReceipt } from "../../src/lib/career/background/delivery";
import { resolveCareerChatTools } from "../../src/lib/career/llmTools";
import { formatTalentMessageContentForLlmPrompt } from "../../src/lib/career/opportunityFeedbackNote";
import { renderCareerBackgroundInvocation } from "../../src/lib/career/background/prompt";

// Paired original models; PostgreSQL profile/material tools are real. Agent inbox,
// company publication and human transports are captured, never sent externally.
export async function evaluateAgentExchange(args: any) {
  const { fixture, key, model, context, db, history, scope, save, pinned } = args;
  const backgroundTools = resolveCareerChatTools({ background: true, channel: "chat", isOnboardingDone: true, responseLocale: "ko", hasActiveGmailIntegration: false });
  assert.ok(backgroundTools.toolNames.includes("contact_user"));
  assert.ok(backgroundTools.toolNames.includes("deliver_career_email"));
  const companyModel = resolveOrgAgentModel(undefined).model;
  const rootId = "00000000-0000-4000-8000-000000000010";
  const workspaceId = "00000000-0000-4000-8000-000000000090";
  const conversationId = "00000000-0000-4000-8000-000000000091";
  const introduction = args.calls.find((c: any) => c.name === "contact_company" && c.input.acceptIntroduction === true && !c.error);
  assert.ok(introduction);
  const messages: AgentContactMessage[] = [], turns: any[] = [], calls: any[] = [], companyNotifications: any[] = [], candidateNotifications: any[] = [];
  let presentation: string | undefined;
  const presentationId = randomUUID();
  const companySchedules: any[] = [];
  const materials = new Map([[pinned.id, pinned]]);
  let currentMaterial = pinned;
  const append = (direction: "to_company" | "to_talent", body: string, replyTo?: string) => {
    const message = { id: messages.length ? randomUUID() : rootId, root_id: rootId, reply_to_id: replyTo ?? null,
      company_workspace_id: workspaceId, role_id: role, talent_id: owner, recommendation_id: rec,
      direction, body, material_id: currentMaterial.id, document_refs: [], source: {}, operation_key: randomUUID(),
      contract_version: "agent_contact_v1", receiver_job_id: null, receiver_kind: direction === "to_company" ? "company" : "career",
      created_at: new Date(new Date(fixture.requestTime).getTime() + 600_000 + messages.length * 60_000).toISOString(), cancelled_at: null, revision: 1 } satisfies AgentContactMessage;
    messages.push(message); return message;
  };
  append("to_company", introduction.input.relayContent);
  const correspondence = () => [formatIntroductionContext({ rootId, talentId: owner, roleId: role, recommendationId: rec,
    candidateName: args.scenario.profile.name, origin: { kind: "candidate_request", requestedAt: fixture.requestTime } }),
    formatAgentContacts(messages), ...[...materials.values()].flatMap(material => [`Shared material ${material.id}: snapshot at sharing.`,
      formatProfileToolResult("read_profile", { profileId: material.profile_id, revision: material.profile_revision, snapshot: material.profile_snapshot })]),
  ].join("\n\n");
  if (args.scenario.incomingCompanyQuestion) append("to_talent", args.scenario.incomingCompanyQuestion, rootId);
  let cursor = args.scenario.incomingCompanyQuestion ? 1 : 0;
  while (cursor < messages.length) {
    // Evaluation resource bound only. No extra product-time state or retry.
    assert.ok(cursor < 8, "Agent exchange did not settle within the evaluation budget");
    const incoming = messages[cursor++];
    const actor = incoming.direction === "to_company" ? "company" : "candidate";
    const turnCalls: any[] = [];
    const record = (name: string, input: any, result: any) => {
      const call = { actor, incomingId: incoming.id, name, input: structuredClone(input), result };
      calls.push(call); turnCalls.push(call); return result;
    };
    let reply;
    if (actor === "company") {
      const companyContext = {
        accessText: formatCompanyAgentServiceScope({roleId:role}),
        workspace: { workspaceId, companyName: fixture.role.company, pitch: "Enterprise B2B software", companyDescription: "Synthetic evaluation company" },
        companyText: "한국 시장에서 엔터프라이즈 B2B 소프트웨어 사업을 확장하고 있습니다.",
        roles: [{ roleId: role, name: fixture.role.name, status: "active" }],
        rolesText: `Role ${role}: ${fixture.role.name}. ${fixture.role.description}\nPrivate hiring context: ${fixture.role.private}`,
        completeRoleRequestIds: [], recentRecommendationsText: presentation ?? "No company presentation yet.",
        recentContactsText: companyNotifications.map(n => n.body).join("\n") || "No team notification for this introduction.",
        conversationMessages: [], conversationText: "-", summariesText: "-",
        contextNotesText: "Only company chat is approved; email and Slack are disabled.",
        defaultLongTextObservations: [], inProgressRoleCreationsText: "-", pendingUpdateText: "-", recentToolContextText: "-",
      } as any;
      const result = await scope.run({ caseId: key, turn: `company-${cursor}`, model: companyModel }, () => runOrgAgentToolLoop({
        admin: withCompanyAgentScope({}, { kind: "company_event", workspaceId, roleId: role, jobId: randomUUID(), leaseOwner: "evaluation", assertCurrent: async () => {} }) as any,
        user: { id: randomUUID() } as any, actorId: randomUUID(), actorLabel: "Harper company agent",
        conversation: { id: conversationId, company_workspace_id: workspaceId, role_id: role } as any,
        context: companyContext, currentUserMessageId: 1, model: companyModel, responseLocale: "ko",
        allowSilentCompletion: true, throwOnToolExecutionError: true, harperInitiated: true,
        capabilityMode: "progressive", initialCapabilities: ["agent_correspondence"], allowedToolNames: companyAgentServiceTools(),
        source: "chat", readAudience: "company_safe", scopeKey: key, slackThreadId: null, mentions: [],
        signal: AbortSignal.timeout(240_000), userMessage: companyAgentEventPrompt(`Current incoming message: ${incoming.id}\n${correspondence()}`),
      }, {
        requestTime: new Date(incoming.created_at),
        complete: completion => runOrgAgentCompletion({ ...completion, candidateEmailWorkspaceId: undefined }),
        executeTool: async tool => {
          const input = tool.input as any;
          let output: string;
          if (tool.name === "read_agent_messages") output = correspondence() + (presentation ? `\nCurrent presentation: ${presentation}` : "");
          else if (tool.name === "read_role") output = companyContext.rolesText;
          else if (tool.name === "read_conversation_history") output = companyContext.conversationText;
          else if (tool.name === "get_more_data") output = companyContext.recentRecommendationsText;
          else if (tool.name === "read_talent" || tool.name === "get_talents") output = correspondence();
          else if (tool.name === "contact_talent") {
            assert.equal(input.action, "send_to_agent");
            assert.ok(input.introductionRootId === rootId || messages.some(message => message.id === input.replyToMessageId && message.root_id === rootId));
            output = agentContactReceipt(append("to_talent", input.messageContent, incoming.id)).modelOutput;
          } else if (tool.name === "publish_role_recommendations") {
            assert.equal(input.introductionRootId, rootId); assert.equal(input.roleId, role);
            if (presentation && presentation !== input.presentation) assert.equal(input.expectedPresentation, presentation);
            const status = presentation === input.presentation ? "unchanged" : presentation ? "updated" : "saved";
            presentation = input.presentation; output = companyPresentationReceipt(status, presentationId).modelOutput;
          } else if (tool.name === "manage_agent_schedule") {
            assert.equal(input.roleId,role);
            if (input.action !== "list") {
              let existing = companySchedules.find(s=>input.scheduleId ? s.id===input.scheduleId : s.operationId===input.operationId);
              if (input.action === "create") {
                if (!existing) {existing={id:randomUUID(),revision:1,status:"active",...input};companySchedules.push(existing);}
              } else {
                assert.ok(existing);assert.equal(input.expectedRevision,existing.revision);
                Object.assign(existing,input,{revision:existing.revision+1,status:input.action==='cancel'?'cancelled':input.action==='pause'?'paused':'active'});
              }
            }
            output=companySchedules.map(s=>`Schedule ${s.id}; revision ${s.revision}; Role ${role}; ${s.status}\n${s.title}\n${s.instruction}\nNext: ${s.nextRunAt?formatLlmDateTime(s.nextRunAt):'none'}; timezone ${s.timezone??'Asia/Seoul'}`).join("\n\n")||"No company schedules.";
          } else if (tool.name === "contact_user") {
            assert.equal(input.channel, "chat"); companyNotifications.push({ ...input, incomingId: incoming.id });
            output = "Message saved in company Role chat. Readership unknown.";
          } else throw new Error(`Unconfigured evaluation effect: ${tool.name}`);
          const result = record(tool.name, input, { modelOutput: output });
          tool.state.toolResults.push({ callId: tool.callId, name: tool.name, status: "success", summary: output });
          return result;
        },
      }));
      reply = result.reply;
    } else {
      const current = await profile(db);
      let emailReceipt: any = null;
      let chatReceipt: any = null;
      const runId = randomUUID();
      const runtimeContext = [renderCareerBackgroundInvocation({ id: runId, trigger: "agent_contact_received", created_at: incoming.created_at,
        trigger_payload: { sourceEvents: [{ sourceKind: "agent_contact", sourceId: incoming.id, rootId, roleId: role }] } } as any),
        correspondence(), `Public Role ${role}: ${fixture.role.description}`].join("\n\n");
      const signal = AbortSignal.timeout(240_000);
      const runtime = new CareerCapabilityRuntime({ mode: "progressive", replyId: `${key}:receiver:${cursor}`, eligibleTools: backgroundTools.tools,
        preloads: ["schedules", "career_delivery", "company_contact"], abortSignal: signal,
        promptArgs: () => ({ channel: "chat", backgroundInvocation: true, isOnboardingDone: true, profile: null,
          structuredProfileText: formatProfileToolResult("read_profile", current), talentContextSection: fixture.candidateContext,
          runtimeInstruction: runtimeContext, requestTime: new Date(incoming.created_at), timeZone: "Asia/Seoul",
          currentPreferences: { preferredLocale: "ko", talentSettingStatus: "active", getInternalRecommendation: true, getExternalRecommendation: true } }),
      });
      const step = runtime.resolveStep(false);
      reply = await scope.run({ caseId: key, turn: `candidate-${cursor}`, model: model.model }, () => runCareerChatAssistant({
        primaryModel: model.model, chatCompletionReasoningEffort: model.chatCompletionReasoningEffort, openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort,
        responseLocale: "ko", messages: history.map((item: any) => ({role: item.role, content: formatTalentMessageContentForLlmPrompt(item, {includeCreatedAt: Boolean(item.created_at), preferredLocale: "ko", timeZone: "Asia/Seoul"})})).filter((item: any) => item.content.trim()), tools: step.tools, systemBlocks: step.systemBlocks, toolRuntime: runtime,
        abortSignal: signal, usageLabel: `eval/agent-autonomy/${key}/receiver`, executeTool: async ({ name, input }) => {
          if (name === "read_agent_messages") return record(name, input, { modelOutput: correspondence() });
          if (name === "contact_company") {
            assert.notEqual(input.acceptIntroduction, true);
            assert.ok(input.introductionRootId === rootId || input.replyToMessageId === incoming.id);
            if (input.selectionRef) {
              const pin = await db.query("select pin_agent_contact_material_v1($1,$2,$3,$4,$5) id", [owner,role,`receiver-share:${randomUUID()}`,
                decodeMaterialSelection(String(input.selectionRef)),{kind:"career",talentId:owner,conversationId:context().conversationId}]);
              currentMaterial = (await db.query("select * from talent_role_materials where id=$1", [pin.rows[0].id])).rows[0];
              materials.set(currentMaterial.id,currentMaterial);
            }
            return record(name, input, agentContactReceipt(append("to_company", String(input.relayContent), incoming.id)));
          }
          if (name === "contact_user" || name === "deliver_career_email") {
            // Capture the actual delivery contract; read/retry are not additional messages.
            if (name === "contact_user" && input.channel === "chat") {
              if (!chatReceipt) {
                chatReceipt = {id: randomUUID(), ...input}; candidateNotifications.push(chatReceipt);
                history.push({role:"assistant",content:input.body,created_at:incoming.created_at});
              }
              return record(name,input,{status:"saved",modelOutput:`Message ${chatReceipt.id} saved in the candidate's chat. Readership unknown.`});
            }
            assert.ok(name === "deliver_career_email" || input.channel === "email");
            const action = name === "contact_user" ? "deliver" : input.action ?? "deliver";
            if (action === "deliver" && !emailReceipt) {
              emailReceipt = {id:randomUUID(),status:"sent",sent_at:incoming.created_at,payload:{resendEmailId:"captured-evaluation-receipt",emailPayload:{subject:input.subject},bodyMarkdown:input.body}};
              candidateNotifications.push({channel:"email",subject:input.subject,body:input.body,incomingId:incoming.id});
              history.push({role:"assistant",content:input.body,created_at:incoming.created_at});
            }
            return record(name,input,{status:emailReceipt?.status ?? "not_prepared",modelOutput:formatCareerEmailReceipt(emailReceipt)});
          }
          return record(name, input, await args.executeTool({ name, input }));
        },
      }));
    }
    turns.push({ actor, incomingId: incoming.id, reply, calls: turnCalls });
    save(`${key}-agent-exchange`, { companyModel, candidateModel: model, fixtureCompanyQuestion: args.scenario.incomingCompanyQuestion ?? null, turns, messages, calls, presentation, companySchedules, companyNotifications, candidateNotifications });
  }
  return { companyModel, candidateModel: model, fixtureCompanyQuestion: args.scenario.incomingCompanyQuestion ?? null, turns, messages, calls, presentation, companySchedules, companyNotifications, candidateNotifications };
}
