import { companyReplyAddresses } from "../companyAlias";
import { finishCompanyEmailReply, processCompanyEmailReply } from "./companyReply";
import { buildPreparationPrompt } from "@/lib/career/simulation/preparationPrompt";
import { continueEmailApplication, emailApplicationContext, assertEmailApplicationReadyToReply } from "./application";
import { runCareerChatTurn } from "@/lib/career/chatTurn";
import { emailAssistantModel } from "./model";
import { isOpsEmailTest, opsEmailTestInput } from "./opsTest";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  loadEmailReferenceContext,
} from "./context";
import {
  buildReplySubject,
  htmlToPlainText,
  normalizeAddressList,
  normalizeEmailAddress,
  stripQuotedEmailText,
} from "@/lib/email/parse";
import { getDefaultResendFromEmail } from "@/lib/email/send";
import { getCareerOnboardingChecklistCoverage } from "@/lib/talentOnboarding/calls";
import { buildOnboardingRuntimeStateSection } from "@/lib/career/prompts/conversationSections";
import { commitDeliveredProcessClosureNotices } from "@/lib/talentOnboarding/processClosureNotice";
import {
  getReceivedEmail,
  getReceivedAttachments,
  normalizeAttachments,
  automaticEmailReason,
  replyHeaders,
  deliverEmail,
  type EmailDelivery,
} from "./transport";
import { adaptEmailPromptBlocks } from "./prompt";
import {
  EMAIL_SHARED_TOOL_NAMES,
  emailToolSelection,
  executeEmailTool,
} from "./tools";
import { renderReplyEmail } from "./format";
import {
  processEmailFirstOnboarding,
  processSignupFollowup,
  signupFollowupContext,
} from "./onboarding";
import {
  emailAuditId,
  processIntroCapture,
  processReferralIntro,
  deliverSavedReferral,
} from "./special";
import {
  assertEmailLease,
  ensureEmailConversation,
  ensureReplyAlias,
  persistReplyMessage,
  readRow,
  recordEmailAudit,
  resolveEmailIdentity,
  updateEmailJob,
  updateRow,
} from "./store";
import {
  EmailPermanentError,
  asObject,
  nowIso,
  type EmailAdmin,
  type EmailJobContext,
  type EmailRow,
} from "./types";

export async function processEmailReply(
  admin: EmailAdmin,
  job: EmailRow,
  owner: string
) {
  const opsTest = opsEmailTestInput(job);
  if (!opsTest && job.resend_email_id && asObject(asObject(job.metadata).delivery).to) {
    if (asObject(job.metadata).companyEmail) await finishCompanyEmailReply(admin, job, owner);
    else await finishEmailReply(admin, job, owner);
    return;
  }
  if (
    job.kind === "referral_intro" &&
    Array.isArray(asObject(asObject(job.metadata).referralDeliveries).items)
  ) {
    await deliverSavedReferral(admin, job, owner);
    return;
  }
  const inbound = await readRow(
    admin,
    "email_inbound_events",
    job.inbound_event_id
  );
  if (!inbound) throw new EmailPermanentError("inbound_event_not_found");
  const metadata = asObject(job.metadata);
  const testEmail =
    opsTest ?? (job.kind === "referral_intro"
      ? asObject(asObject(metadata.referralIntro).email)
      : {});
  const received = Object.keys(testEmail).length
    ? { ...testEmail, attachments: normalizeAttachments(testEmail.attachments) }
    : await getReceivedEmail(inbound.provider_email_id);
  const sender = normalizeEmailAddress(
    String(received.from ?? inbound.from_email ?? "")
  );
  if (!sender) throw new EmailPermanentError("missing_sender");
  const automated = automaticEmailReason(received, getDefaultResendFromEmail());
  if (automated) throw new EmailPermanentError(automated);
  const fullBody =
    String(received.text ?? "").trim() ||
    htmlToPlainText(String(received.html ?? ""));
  const body = stripQuotedEmailText(fullBody);
  const subject = String(received.subject ?? inbound.subject ?? "");
  const recipients = [
    ...normalizeAddressList(received.to),
    ...normalizeAddressList(received.cc),
    ...normalizeAddressList(inbound.to_addresses),
    ...normalizeAddressList(inbound.cc_addresses),
  ];
  const special = {
    admin,
    job,
    owner,
    inbound,
    received,
    body,
    subject,
    sender,
    recipients,
  };
  if (companyReplyAddresses(recipients).length || metadata.companyEmail)
    return processCompanyEmailReply({ ...special, fullBody });
  if (job.kind === "org_intro_capture") return processIntroCapture(special);
  if (job.kind === "referral_intro") return processReferralIntro(special);
  const identity = opsTest ? {
    talentId: String(job.talent_id), conversationId: String(job.conversation_id),
    companyRequestId: null, alias: null, lead: null,
  } : await resolveEmailIdentity({
    admin,
    job,
    sender,
    recipients,
  });
  const profile = await readRow(
    admin,
    "talent_users",
    identity.talentId,
    "user_id"
  );
  if (!profile || profile.deleted_at)
    throw new EmailPermanentError("talent_account_deleted");
  const conversationId = await ensureEmailConversation(
    admin,
    identity.talentId,
    identity.conversationId
  );
  const replyAlias = opsTest ? "ops-test@reply.matchharper.com" : await ensureReplyAlias(
    admin,
    identity.talentId,
    conversationId,
    identity.alias ?? asObject(metadata.delivery).replyTo
  );
  let attachments = received.attachments ?? [];
  if (!Object.keys(testEmail).length && (!body || attachments.length > 0))
    attachments = await getReceivedAttachments(inbound.provider_email_id);
  if (!body && !attachments.length) throw new EmailPermanentError("empty_body");
  const attachmentText = attachments.length
    ? `\n\nEmail attachments:\n${attachments.map((a, index) => `${index + 1}. ${a.filename} (${a.contentType})`).join("\n")}`
    : "";
  const sourceMessage = await persistReplyMessage({
    admin,
    jobId: job.id,
    owner,
    talentId: identity.talentId,
    conversationId,
    role: "user",
    content: `${body}${attachmentText}`,
  });
  if (identity.companyRequestId) {
    const request = await readRow(admin, "company_talent_requests", identity.companyRequestId);
    if (request?.ops_only) {
      const { error } = await (admin.rpc as any)("bind_ops_candidate_reply_v1", {
        p_request_id: request.id, p_talent_id: identity.talentId, p_source_message_id: sourceMessage.id,
      });
      if (error) throw error;
    }
  }
  const ctx: EmailJobContext = {
    ...special,
    attachments,
    talentId: identity.talentId,
    conversationId,
    replyAlias,
    companyRequestId: identity.companyRequestId,
    sourceMessage,
    thread: fullBody === body ? "" : fullBody.slice(0, 16_000),
  };
  if (!opsTest) await recordEmailAudit(admin, {
    id: emailAuditId(job.id, "inbound"),
    talent_id: ctx.talentId,
    talent_message_id: sourceMessage.id,
    inbound_event_id: inbound.id,
    reply_job_id: job.id,
    direction: "inbound",
    mail_type: identity.companyRequestId
      ? "company_talent_request"
      : "inbound_reply",
    status: "received",
    from_email: sender,
    to_email: recipients.map(normalizeEmailAddress).find(Boolean),
    subject,
    body_text: body,
    metadata: {
      replyTo: replyAlias,
      ...(identity.companyRequestId
        ? { companyTalentRequestId: identity.companyRequestId }
        : {}),
      attachments,
    },
  });
  let current = await readRow(admin, "email_reply_jobs", job.id);
  if (!current?.assistant_message_id) {
    const application = await continueEmailApplication(ctx);
    const applicationContext = await emailApplicationContext(ctx, application);
    const references = await loadEmailReferenceContext(ctx);
    const signupBody =
      opsTest || identity.lead || references.internalConnectionReply
        ? null
        : await processSignupFollowup(ctx);
    const intake = identity.lead
      ? await processEmailFirstOnboarding(ctx, identity.lead)
      : signupBody
        ? { body: signupBody }
        : null;
    if (intake?.deferred) {
      await updateEmailJob(admin, "reply", job.id, owner, {
        status: "skipped",
        skip_reason: "email_onboarding_deferred",
        processed_at: nowIso(),
        locked_at: null,
        locked_by: null,
      });
      return;
    }
    if (intake?.body)
      await persistReplyMessage({
        admin,
        jobId: job.id,
        owner,
        talentId: ctx.talentId,
        conversationId,
        role: "assistant",
        content: intake.body,
      });
    else {
      const setting = await readRow(
        admin,
        "talent_setting",
        ctx.talentId,
        "user_id"
      );
      const onboarding = setting?.is_onboarding_done !== true;
      const coverage = onboarding
        ? await getCareerOnboardingChecklistCoverage({
            admin,
            conversationId,
            userId: ctx.talentId,
          })
        : null;
      const { data: history, error: historyError } = await (admin as any)
        .from("career_email_messages")
        .select("subject,body_text,occurred_at,mail_type")
        .eq("talent_id", ctx.talentId)
        .eq("direction", "outbound")
        .contains("metadata", { replyTo: replyAlias })
        .order("occurred_at", { ascending: false })
        .limit(3);
      if (historyError) throw historyError;
      const historyText = history.map((row: EmailRow) =>
        `- ${formatLlmDateTime(row.occurred_at)} | ${row.subject || "(no subject)"}\n${String(row.body_text ?? "").slice(0, 6000)}`
      ).join("\n\n");
      const extra = [
        references.text,
        "Current application context (authoritative over older conversation summaries):\n" + applicationContext,
        opsTest ? "Ops email test: treat the supplied input as the candidate's message and write to the candidate in the usual email voice. Reads, owned document changes and application preparation are real; email delivery, company contact, application submission and mutations that schedule future matching/contact are disabled. Describe only verified actions." : await signupFollowupContext(ctx),
        onboarding
          ? buildOnboardingRuntimeStateSection({
              checklistCoverage: coverage,
              checklistContext: profile,
            })
          : "",
        `Candidate-visible outbound emails for this alias (history, not new consent; times Asia/Seoul):\n${historyText || "None."}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const model = emailAssistantModel();
      await runCareerChatTurn({
        admin,
        conversationId,
        userId: ctx.talentId,
        userMessage: body,
        allowedToolNames: EMAIL_SHARED_TOOL_NAMES,
        suppressOnboarding: true,
        skipConversationWrites: true,
        assistantMessageType: "mail",
        usageLabel: "email-reply:career",
        assistantModel: model.primaryModel,
        assistantChatCompletionReasoningEffort:
          model.chatCompletionReasoningEffort,
        assistantOpenAIResponsesReasoningEffort:
          model.openAIResponsesReasoningEffort,
        adapter: {
          onboardingActive: onboarding,
          sourceMessage,
          adaptPromptBlocks: (blocks) =>
            adaptEmailPromptBlocks([
              ...blocks,
              ...(application?.state.status === "active" && application.state.analysisStatus === "completed"
                ? buildPreparationPrompt(application.state, ["ready_for_role"], "email") : []),
            ], ctx, extra),
          adaptTools: (selection) => emailToolSelection(selection, onboarding),
          executeTool: (args) => executeEmailTool(ctx, args),
          beforeAssistantFinalization: async () => { await assertEmailApplicationReadyToReply(ctx); },
          persistAssistant: async ({ content, notices }) => {
            await assertEmailApplicationReadyToReply(ctx);
            return persistReplyMessage({
              admin,
              jobId: job.id,
              owner,
              talentId: ctx.talentId,
              conversationId,
              role: "assistant",
              content,
              metadata: { pendingProcessClosureNotices: notices },
            });
          },
        },
      });
    }
    current = await readRow(admin, "email_reply_jobs", job.id);
  }
  const assistant = await readRow(
    admin,
    "talent_messages",
    String(current?.assistant_message_id)
  );
  if (
    !assistant ||
    assistant.user_id !== ctx.talentId ||
    assistant.conversation_id !== conversationId
  )
    throw new Error("Saved email response is not owned by this conversation");
  let delivery = asObject(
    asObject(current?.metadata).delivery
  ) as EmailDelivery;
  if (!delivery.to) {
    const replyTo =
      normalizeAddressList(received.reply_to)
        .map(normalizeEmailAddress)
        .find(Boolean) || sender;
    delivery = {
      from: getDefaultResendFromEmail(),
      to: replyTo,
      subject: buildReplySubject(subject),
      ...renderReplyEmail(assistant.content),
      headers: replyHeaders(received, inbound.message_id),
      replyTo: replyAlias,
      idempotencyKey: `email-reply/${job.id}`,
    };
    await updateEmailJob(admin, "reply", job.id, owner, {
      metadata: {
        ...asObject(current?.metadata),
        delivery,
        companyTalentRequestId: ctx.companyRequestId,
        mailType: ctx.companyRequestId
          ? "company_talent_request"
          : ctx.job.kind === "signup_followup_reply"
            ? "sign_up_followup_reply"
            : "auto_reply",
      },
    });
  }
  if (isOpsEmailTest(job) || process.env.EMAIL_REPLY_DRY_RUN === "true") {
    if (isOpsEmailTest(job))
      await updateRow(admin, "talent_conversations", conversationId, { updated_at: nowIso() });
    await updateEmailJob(admin, "reply", job.id, owner, {
      status: "skipped",
      skip_reason: isOpsEmailTest(job) ? "ops_email_test" : "dry_run",
      last_error: null,
      processed_at: nowIso(),
      locked_at: null,
      locked_by: null,
    });
    return;
  }
  await assertEmailLease(admin, "reply", job.id, owner);
  const providerId = current?.resend_email_id || (await deliverEmail(delivery));
  await updateEmailJob(admin, "reply", job.id, owner, {
    resend_email_id: providerId,
  });
  const saved = await readRow(admin, "email_reply_jobs", job.id);
  if (!saved) throw new Error("Email reply job disappeared after delivery");
  await finishEmailReply(admin, saved, owner);
}

async function finishEmailReply(
  admin: EmailAdmin,
  job: EmailRow,
  owner: string
) {
  await assertEmailLease(admin, "reply", job.id, owner);
  const metadata = asObject(job.metadata),
    delivery = asObject(metadata.delivery) as EmailDelivery;
  const assistant = await readRow(
    admin,
    "talent_messages",
    String(job.assistant_message_id)
  );
  if (
    !job.resend_email_id ||
    !delivery.to ||
    !assistant ||
    assistant.user_id !== job.talent_id ||
    assistant.conversation_id !== job.conversation_id
  )
    throw new Error("Delivered email has no owned saved response");
  await recordEmailAudit(admin, {
    id: emailAuditId(job.id, "outbound"),
    talent_id: job.talent_id,
    talent_message_id: assistant.id,
    reply_job_id: job.id,
    direction: "outbound",
    mail_type: metadata.mailType ?? "auto_reply",
    status: "sent",
    from_email: delivery.from,
    to_email: delivery.to,
    subject: delivery.subject,
    body_text: assistant.content,
    metadata: {
      replyTo: delivery.replyTo,
      resendEmailId: job.resend_email_id,
      ...(metadata.companyTalentRequestId
        ? { companyTalentRequestId: metadata.companyTalentRequestId }
        : {}),
    },
  });
  const notices = metadata.pendingProcessClosureNotices;
  if (Array.isArray(notices) && notices.length)
    await commitDeliveredProcessClosureNotices({
      admin,
      notices,
      talentId: job.talent_id,
    });
  await updateRow(admin, "talent_conversations", job.conversation_id, {
    updated_at: nowIso(),
  });
  await updateEmailJob(admin, "reply", job.id, owner, {
    status: "sent",
    processed_at: nowIso(),
    skip_reason: null,
    last_error: null,
    locked_at: null,
    locked_by: null,
  });
}
