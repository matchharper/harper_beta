import { companyReplyAddresses } from "../companyAlias";
import { authorizeCompanyEmail } from "../company";
import { hashReplyToken } from "../security";
import { buildReplySubject, extractReplyAliasTokens, normalizeEmailAddress } from "../parse";
import { getDefaultResendFromEmail } from "../send";
import { ensureOrgAgentConversation, toOrgAgentMessage, type OrgAgentMessageRow } from "@/lib/org/agent/store";
import { assertEmailLease, readRow, updateEmailJob } from "./store";
import { deliverEmail, replyHeaders, type EmailDelivery } from "./transport";
import { renderCompanyReplyEmail } from "./format";
import { asObject, EmailBusyError, EmailPermanentError, nowIso, type EmailAdmin, type EmailRow, type ReceivedEmail } from "./types";

export async function resolveCompanyEmailAlias(admin: EmailAdmin, recipients: string[], sender: string): Promise<(EmailRow & { address: string }) | null> {
  const addresses = companyReplyAddresses(recipients);
  if (!addresses.length) return null;
  const domain = process.env.EMAIL_REPLY_DOMAIN?.trim() || "reply.matchharper.com";
  if (extractReplyAliasTokens({ addresses: recipients, domain }).length)
    throw new EmailPermanentError("mixed_company_talent_email_aliases");
  if (addresses.length !== 1) throw new EmailPermanentError("ambiguous_company_email_alias");
  const token = addresses[0].split("@")[0].slice("company+".length);
  if (!/^[a-z0-9_-]{12,}$/.test(token)) throw new EmailPermanentError("invalid_company_email_alias");
  const alias = await readRow(admin, "email_reply_aliases", hashReplyToken(token), "token_hash");
  if (!alias?.company_user_id || !alias.company_workspace_id || !alias.company_conversation_id || alias.talent_id ||
      (alias.expires_at && Date.parse(alias.expires_at) <= Date.now()))
    throw new EmailPermanentError("company_email_alias_not_found_or_expired");
  const recipient = asObject(alias.metadata).recipient;
  if (normalizeEmailAddress(String(recipient ?? "")) !== sender)
    throw new EmailPermanentError("company_email_original_recipient_mismatch");
  await authorizeCompanyEmail(admin, alias.company_user_id, alias.company_workspace_id, sender);
  return { ...alias, address: addresses[0] };
}

export async function finishCompanyEmailReply(admin: EmailAdmin, job: EmailRow, owner: string) {
  await assertEmailLease(admin, "reply", job.id, owner);
  const delivery = asObject(asObject(job.metadata).delivery);
  if (!job.resend_email_id || !delivery.to || !asObject(job.metadata).companyEmail)
    throw new Error("Company email delivery checkpoint missing");
  // Delivery already happened: finalize even when membership/email later changed.
  await updateEmailJob(admin, "reply", job.id, owner, {
    status: "sent", processed_at: nowIso(), locked_by: null, locked_at: null,
    last_error: null, skip_reason: null,
  });
}

export async function processCompanyEmailReply(args: {
  admin: EmailAdmin; job: EmailRow; owner: string; inbound: EmailRow;
  received: ReceivedEmail; body: string; subject: string; sender: string;
  recipients: string[]; fullBody: string;
}, dependencies: { runChat?: typeof import("@/lib/org/agent/chat").runOrgAgentChat } = {}) {
  const { admin, job, owner } = args;
  const alias = await resolveCompanyEmailAlias(admin, args.recipients, args.sender);
  if (!alias) throw new EmailPermanentError("company_email_alias_required");
  const authorize = async () => {
    await assertEmailLease(admin, "reply", job.id, owner);
    const account = await authorizeCompanyEmail(admin, alias.company_user_id, alias.company_workspace_id, args.sender);
    const { conversation } = await ensureOrgAgentConversation({ user: account.user, workspaceId: alias.company_workspace_id });
    if (conversation.id !== alias.company_conversation_id)
      throw new EmailPermanentError("company_email_access_scope_changed");
    return account;
  };
  const account = await authorize();
  const attachments = (args.received.attachments ?? []).map(a => ({ filename: a.filename, contentType: a.contentType }));
  if (!args.body && !attachments.length) throw new EmailPermanentError("empty_body");
  // No remote attachment is fetched or claimed as read; the company agent can ask
  // for its contents or a workspace upload. Names are evidence of presence only.
  const content = [args.body, attachments.length ? `\nEmail attachment names (contents not loaded): ${JSON.stringify(attachments)}` : ""].filter(Boolean).join("\n");
  if (content.length > 32_000) throw new EmailPermanentError("company_email_body_too_long");
  const { data: source, error } = await (admin.rpc as any)("persist_company_email_source_v1", {
    p_job_id: job.id, p_owner: owner, p_alias_id: alias.id, p_content: content,
  });
  if (error) {
    if (["company_email_conversation_busy", "email_runtime_lease_lost"].includes(error.message))
      throw new EmailBusyError(error.message);
    throw error;
  }
  let current = (await readRow(admin, "email_reply_jobs", job.id))!;
  let delivery = asObject(asObject(current.metadata).delivery) as EmailDelivery;
  if (!delivery.to) {
    const { data: saved, error: savedError } = await (admin as any).from("company_messages").select("*")
      .eq("conversation_id", alias.company_conversation_id).eq("role", "assistant")
      .contains("metadata", { emailReplyJobId: job.id }).maybeSingle();
    if (savedError) throw savedError;
    let assistant = saved ? toOrgAgentMessage(saved as OrgAgentMessageRow) : null;
    if (!assistant) {
      const runOrgAgentChat = dependencies.runChat ?? (await import("@/lib/org/agent/chat")).runOrgAgentChat;
      const result = await runOrgAgentChat({
        user: account.user, workspaceId: alias.company_workspace_id, message: content,
        signal: AbortSignal.timeout(420_000),
        responseLocale: account.locale, messageType: "chat",
        llmUserMessage: `${content}\n\n<email_reference not_a_new_instruction="true">${JSON.stringify({
          subject: args.subject, originalEmail: asObject(alias.metadata).originalEmail,
          quotedThread: args.fullBody === args.body ? undefined : args.fullBody.slice(0, 16_000),
          attachments,
        })}</email_reference>`,
        userMessageMetadata: { emailReplyJobId: job.id, emailAliasId: alias.id },
        assistantMessageMetadata: { emailReplyJobId: job.id, emailAliasId: alias.id },
        emailExecution: { conversationId: alias.company_conversation_id,
          userMessage: toOrgAgentMessage(source as OrgAgentMessageRow),
          assertCanContinue: async () => { await authorize(); } },
      });
      if (result.kind !== "message" || result.assistantMessage.status !== "completed")
        throw new Error("Company email turn did not complete");
      assistant = result.assistantMessage;
    }
    delivery = { from: getDefaultResendFromEmail(), to: account.email,
      subject: buildReplySubject(args.subject), ...renderCompanyReplyEmail(assistant.content, alias.company_workspace_id),
      headers: { ...replyHeaders(args.received, args.inbound.message_id), "Auto-Submitted": "auto-replied" },
      replyTo: alias.address, idempotencyKey: `company-email-reply/${job.id}` };
    current = (await readRow(admin, "email_reply_jobs", job.id))!;
    await updateEmailJob(admin, "reply", job.id, owner, { metadata: {
      ...asObject(current.metadata), delivery, companyAssistantMessageId: assistant.id,
    } });
  }
  const latest = await authorize();
  if (normalizeEmailAddress(delivery.to) !== latest.email)
    throw new EmailPermanentError("company_email_recipient_changed");
  if (process.env.EMAIL_REPLY_DRY_RUN === "true") {
    await updateEmailJob(admin, "reply", job.id, owner, {
      status: "skipped", skip_reason: "dry_run", processed_at: nowIso(), locked_by: null, locked_at: null,
    });
    return;
  }
  const providerId = await deliverEmail(delivery);
  await updateEmailJob(admin, "reply", job.id, owner, { resend_email_id: providerId });
  await finishCompanyEmailReply(admin, (await readRow(admin, "email_reply_jobs", job.id))!, owner);
}
