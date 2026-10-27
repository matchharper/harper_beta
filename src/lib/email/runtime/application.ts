import { createHash } from "node:crypto";
import { executeTalentTool, TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";
import { sessionOperation, saveSession, type SessionRecord } from "@/lib/career/simulation/sessionStore";
import { simulationSessionContext, mutateSimulationSession, sessionMutationSchema, endSimulationSession } from "@/lib/career/simulation/session";
import { executeApplicationPreparationTool, respondToApplicationQuestion } from "@/lib/career/simulation/toolExecution";
import { pendingApplicationBatch } from "@/lib/career/simulation/applicationInput";
import { startApplicationBrowser, resumeApplicationBrowser, runApplicationBrowser } from "@/lib/career/simulation/applicationBrowserServer";
import { applicationExecutionFacts } from "@/lib/career/simulation/applicationExecution";
import { stringifyLlmDateTimes } from "@/lib/llm/promptDateTime";
import { executeApplicationSimulation } from "@/lib/career/simulation/server";
import { stopApplicationBrowser } from "@/lib/career/simulation/agentsApi";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { documentFingerprint } from "@/lib/career/simulation/resumeAttachment";
import { assertEmailLease, updateEmailJob, readRow } from "./store";
import { asObject, EmailContinuationPending, EmailPermanentError, type EmailJobContext } from "./types";
import { EMAIL_ASSISTANT_MODEL } from "./model";
import { isOpsEmailTest } from "./opsTest";

export const emailApplicationStore = (ctx: EmailJobContext) => ({ admin: ctx.admin, userId: ctx.talentId, conversationId: ctx.conversationId });
export async function loadEmailApplication(ctx: EmailJobContext) {
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  const id = asObject(job.metadata).applicationMessageId;
  const store = emailApplicationStore(ctx);
  const active = await sessionOperation({ ...store, operation: "read", ...(typeof id === "number" ? { messageId: id } : {}) });
  if (active || typeof id === "number") return active;
  // Default RPC reads only active work. A later email still needs the actual
  // completed receipt/file, rather than relying on old assistant prose.
  const { data, error } = await ctx.admin.from("talent_simulate_application")
    .select("message_id").eq("user_id", ctx.talentId)
    .eq("conversation_id", ctx.conversationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? sessionOperation({ ...store, operation: "read", messageId: Number(data.message_id) }) : null;
}
async function linkApplication(ctx: EmailJobContext, id: number) {
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, { metadata: { ...asObject(job.metadata), applicationMessageId: id, applicationStartedAt: asObject(job.metadata).applicationStartedAt ?? new Date().toISOString() } });
}

// A trace of the actual browser execution owned by this inbound job. This is
// retained across queue continuations; it is not a model's conversation plan.
async function linkApplicationBrowser(ctx: EmailJobContext, runId: string) {
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
    metadata: { ...asObject(job.metadata), applicationBrowserRunId: runId },
  });
}

// The same durable inbound job is retried; no synthetic inbound or second email.
export async function continueEmailApplication(ctx: EmailJobContext) {
  const record = await loadEmailApplication(ctx);
  if (!record || record.state.status !== "active") return record;
  // Never continue or stop a real website execution from a test conversation.
  if (isOpsEmailTest(ctx.job) && record.state.browser)
    throw new EmailPermanentError("Ops email tests cannot operate an application browser");
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  // A new inbound message must be interpreted before continuing earlier work.
  if (asObject(job.metadata).applicationMessageId !== record.messageId) return record;
  await assertCurrentApplicationSource(ctx);
  const started = Date.parse(asObject(job.metadata).applicationStartedAt ?? job.created_at);
  if (Date.now() - started > 40 * 60_000) {
    await stopApplicationBrowser(record.state.browser);
    const ended = { ...endSimulationSession(record.state, "failed"), closingSummary: "Application processing exceeded its time limit. Use the saved work and report what remains unverified." };
    return saveSession(emailApplicationStore(ctx), record, ended, `email-deadline:${ctx.job.id}`);
  }
  const request = record.state.activity?.preparationRequest;
  if (request && record.state.analysisStatus !== "completed") {
    const result = await executeApplicationSimulation({
      ...emailApplicationStore(ctx), role: request.role, roleName: record.state.roleName,
      roleRef: record.state.roleRef, documentId: record.state.documentId ?? undefined,
      requestKey: request.requestKey, emailSourceMessageId: record.state.activity!.sourceMessageId,
      resumeMessageId: record.messageId, locale: record.state.locale,
      textChatModel: EMAIL_ASSISTANT_MODEL,
    });
    if (!result.ok) {
      const latest = await loadEmailApplication(ctx);
      if (!latest || latest.state.status !== "active") return latest;
      return saveSession(emailApplicationStore(ctx), latest, {
        ...endSimulationSession(latest.state, "failed"),
        closingSummary: "reason" in result ? result.reason : "Application preparation could not complete.",
      }, `email-preparation-unavailable:${ctx.job.id}`);
    }
    throw new EmailContinuationPending("Application preparation checkpoint saved");
  }
  if (record.state.browser && ["queued", "running"].includes(record.state.browser.status)) {
    await linkApplicationBrowser(ctx, record.state.browser.id);
    await runApplicationBrowser(emailApplicationStore(ctx), record.messageId);
    throw new EmailContinuationPending("Application browser checkpoint saved");
  }
  return record;
}

export async function emailApplicationContext(ctx: EmailJobContext, record: SessionRecord | null) {
  if (!record) return "No application record in this conversation.";
  const s = record.state;
  const documentId = s.preparation?.workingResume?.documentId ?? s.documentId;
  const document = documentId ? await fetchTalentDocument({ ...emailApplicationStore(ctx), documentId }) : null;
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  const context = simulationSessionContext(s);
  // Once the file is saved, the current document and approved changes are the
  // useful default context. Past ignored proposals remain in ordinary history;
  // do not inject them again as a receipt for the final reply.
  if (s.preparation?.finalDocumentId && !pendingApplicationBatch(s)) {
    context.questionBatches = [];
    context.actions = context.actions.filter(a => a.status === "completed");
    if (context.preparation) context.preparation.responses = {};
  }
  return stringifyLlmDateTimes({
    ...context,
    currentReply: { sourceMessageId: ctx.sourceMessage.id, startedAt: job.created_at,
      applicationBrowserRunId: asObject(job.metadata).applicationBrowserRunId ?? null },
    application: s.browser ? {
      ...applicationExecutionFacts(s),
      runId: s.browser.id, sourceMessageId: s.browser.sourceMessageId,
      status: s.browser.status, result: s.browser.result,
      documentId: s.browser.documentId, documentFingerprint: s.browser.documentHash,
      startedAt: s.browser.startedAt, updatedAt: s.browser.updatedAt,
    } : undefined,
    closingSummary: s.closingSummary,
    sourceDocument: document ? { documentId: document.id, revision: document.revision,
      fullText: document.extracted_text, structuredContent: document.structured_content,
      fileName: document.file_name, mimeType: document.content_type,
      updatedAt: document.updated_at,
      fingerprint: documentFingerprint(document),
      hasUploadFile: Boolean(document.storage_path),
      canExportPdf: document.origin_type === GENERATED_RESUME_ORIGIN,
      documentUrl: new URL(getCareerDocumentHref(document.id), getConfiguredPublicSiteUrl()).href } : null,
    pendingBatch: pendingApplicationBatch(s),
    // These facts resume work on the actual source message; not fresh consent.
    continuation: { analysisStatus: s.analysisStatus, browser: s.browser ? {
      ...applicationExecutionFacts(s),
      status: s.browser.status, result: s.browser.result,
      documentId: s.browser.documentId, purpose: s.browser.purpose,
      startedAt: s.browser.startedAt, updatedAt: s.browser.updatedAt,
    } : undefined },
  });
}

export async function executeEmailApplicationTool(ctx: EmailJobContext, name: string, input: Record<string, unknown>) {
  const store = emailApplicationStore(ctx);
  if (["simulate_application", "manage_application_suggestions", "ready_for_role", "apply_for_role", "manage_simulation_session"].includes(name)) await assertCurrentApplicationSource(ctx);
  if (name === TALENT_TOOL_NAMES.SIMULATE_APPLICATION) {
    const setting = await readRow(ctx.admin, "talent_setting", ctx.talentId, "user_id");
    const result = await executeTalentTool({ name, input, channel: "chat", logging: false,
      context: { ...store, applicationChannel: "email", userMessageId: ctx.sourceMessage.id,
        textChatModel: EMAIL_ASSISTANT_MODEL,
        responseLocale: setting?.preferred_locale ?? setting?.setting_locale ?? null,
        suppressCommonAssistantInstruction: true } });
    const record = await sessionOperation({ ...store, operation: "read" });
    if (record) await linkApplication(ctx, record.messageId);
    if (!record?.state.activity?.preparationRequest) return result;
    return { ...(result as object), awaitingUserInput: true,
      assistantInstruction: "Preparation is running durably. The runtime will resume and send the prepared proposal; this is not a request for user input." };
  }
  if (name === TALENT_TOOL_NAMES.GENERATE_RESUME) {
    const active = await loadEmailApplication(ctx);
    if (active?.state.status === "active") return { ok: false, reason: "Use ready_for_role to save the active application's resume and preserve its source." };
  }
  if (!["manage_application_suggestions", "ready_for_role", "apply_for_role", "manage_simulation_session"].includes(name)) return undefined;
  if (name === "manage_simulation_session" && ["list", "resume"].includes(String(input.action))) {
    const { manageSavedApplications } = await import("@/lib/career/simulation/savedApplications");
    const result = await manageSavedApplications(store, input, `email:${ctx.sourceMessage.id}`);
    if (input.action !== "resume" || !result.ok) return result;
    const restored = await sessionOperation({ ...store, operation: "read" });
    if (restored) await linkApplication(ctx, restored.messageId);
    return { ...result, applicationContext: restored ? await emailApplicationContext(ctx, restored) : undefined,
      assistantInstruction: "Continue the restored preparation from its saved answers in this email. Explain any pending review using the email channel contract; there is no composer. Resuming does not submit or restart a website browser." };
  }
  let record: SessionRecord | null = await loadEmailApplication(ctx);
  if (!record || record.state.status !== "active") return { ok: false, reason: "No active application" };
  if (isOpsEmailTest(ctx.job) && record.state.browser)
    return { ok: false, reason: "Ops email tests cannot change or resume an application browser." };
  await linkApplication(ctx, record.messageId);
  if (record.state.activity?.channel !== "email") {
    record = await saveSession(store, record, { ...record.state, activity: { ...record.state.activity!, channel: "email" } }, `email-channel:${ctx.sourceMessage.id}`);
  }
  const execution = await executeApplicationPreparationTool({ store, record, name, input, messageId: Number(ctx.sourceMessage.id) });
  let result: Record<string, unknown>;
  if (execution) {
    record = execution.record;
    result = { ...execution.result };
    if (typeof result.documentId === "string") result.documentLink = new URL(getCareerDocumentHref(result.documentId), getConfiguredPublicSiteUrl()).href;
  } else if (name === "apply_for_role") {
    const started = await startApplicationBrowser(store, record, input, Number(ctx.sourceMessage.id));
    record = started;
    if (started.execution.applicationInProgress) await linkApplicationBrowser(ctx, record.state.browser!.id);
    result = started.execution;
  } else if (input.action === "respond") {
    record = await respondToApplicationQuestion(store, record, input, Number(ctx.sourceMessage.id));
    const batch = record.state.activity?.batches.find(b => b.browser && b.status === "submitted" && b.continuation === "pending");
    if (batch) record = await resumeApplicationBrowser(store, record, batch.id);
    result = { ok: true, awaitingUserInput: Boolean(record.state.browser && ["queued", "running"].includes(record.state.browser.status)) };
  } else {
    const mutation = sessionMutationSchema.parse(input);
    if (record.state.browser && ["queued", "running"].includes(record.state.browser.status) && !["end", "request_switch", "cancel_switch"].includes(mutation.action))
      throw new Error("Stop the application browser before changing its source facts");
    if (mutation.action === "end") await stopApplicationBrowser(record.state.browser);
    record = await saveSession(store, record, mutateSimulationSession(record.state, mutation, Number(ctx.sourceMessage.id)),
      `email-session:${ctx.sourceMessage.id}:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`);
    result = { ok: true, sessionStatus: record.state.status };
  }
  return { ...result, applicationContext: await emailApplicationContext(ctx, record),
    assistantInstruction: "Use the current applicationContext and email channel contract. Continue authorized work; if a review is pending, explain it in the email and wait for a natural reply. No composer or cards exist in email." };
}

export async function assertEmailApplicationReadyToReply(ctx: EmailJobContext) {
  const record = await loadEmailApplication(ctx);
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  if (record) await assertCurrentApplicationSource(ctx);
  // The newest reply takes ownership after the LLM has interpreted it.
  // Otherwise an informational reply could strand the superseded job.
  if (record?.state.status === "active" && asObject(job.metadata).applicationMessageId !== record.messageId)
    await linkApplication(ctx, record.messageId);
  if (record?.state.status === "active" && (record.state.activity?.preparationRequest ||
      (record.state.browser && ["queued", "running"].includes(record.state.browser.status))))
    throw new EmailContinuationPending("Application is continuing before its email reply");
  return record;
}

async function assertCurrentApplicationSource(ctx: EmailJobContext) {
  const { data, error } = await ctx.admin.from("talent_messages").select("id")
    .eq("user_id", ctx.talentId).eq("conversation_id", ctx.conversationId)
    .eq("role", "user").order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || Number(data.id) !== Number(ctx.sourceMessage.id))
    throw new EmailPermanentError("application_source_superseded");
}
