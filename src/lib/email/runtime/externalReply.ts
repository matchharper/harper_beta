import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import { OPENROUTER_GLM_53_FLASH_MODEL } from "@/lib/llm/modelConfig";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import { hashReplyToken } from "@/lib/email/security";
import { enqueueCompanyUpdate } from "@/lib/org/agent/companyUpdate.server";
import {
  buildExternalReplyMessages,
  externalCandidateReplyAddresses,
  externalReplyNoticeFacts,
  externalReplyToken,
  normalizeExternalReplyClassification,
  statusAfterReply,
  suppressAfterReply,
  type ExternalReplyType,
} from "@/lib/org/agent/externalInvite";
import { externalEmailHash, sendConnectLinkReply } from "@/lib/org/agent/externalInvite.server";
import { externalSourcingEnabledFor } from "@/lib/org/agent/externalSourcing";
import { updateEmailJob } from "./store";
import { replyHeaders } from "./transport";
import { EmailPermanentError, nowIso, type EmailAdmin, type EmailRow, type ReceivedEmail } from "./types";

type ExternalReplyContext = {
  admin: EmailAdmin; job: EmailRow; owner: string; inbound: EmailRow; received: ReceivedEmail;
  body: string; subject: string; sender: string; recipients: string[];
};

function messageText(response: unknown) {
  const choices = (response as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return Array.isArray(content)
    ? content.map((item: { text?: unknown }) => String(item?.text ?? "")).join("").trim()
    : "";
}

function parseObject(value: string) {
  const parsed: unknown = JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Reply classification must be a JSON object");
  return parsed as Record<string, unknown>;
}

/** Isolated classification: the reply is untrusted text and only a type and a short summary leave this call. */
export async function classifyExternalReply(input: Parameters<typeof buildExternalReplyMessages>[0]) {
  const label = "org/external-invite-reply:classify";
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: null,
    buildRequest: () => ({ max_tokens: 300, messages: buildExternalReplyMessages(input),
      response_format: { type: "json_object" }, temperature: 0 }),
    chatCompletionReasoning: { reasoningEffort: "low" },
    debugLabel: label,
    fallbackModel: null,
    model: OPENROUTER_GLM_53_FLASH_MODEL,
    validateResponse: (candidate) => { normalizeExternalReplyClassification(parseObject(messageText(candidate))); },
  });
  logLlmTokenUsage({ label, meta: { task: "external_invite_reply_classification" }, model, response });
  return normalizeExternalReplyClassification(parseObject(messageText(response)));
}

async function skip(ctx: ExternalReplyContext, reason: string) {
  await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
    status: "skipped", skip_reason: reason, processed_at: nowIso(), locked_at: null, locked_by: null,
  });
}

/**
 * A reply to an external invitation (candidate+<token>@reply domain). Recorded, classified in isolation,
 * and handed to the company conversation as facts. Harper's only answer is one fixed reply with the
 * person's connect link to an interested reply; it never writes anything else to the person.
 * Each step is idempotent so a retried job never records or announces a reply twice.
 */
export async function processExternalCandidateReply(ctx: ExternalReplyContext,
  dependencies: { classify?: typeof classifyExternalReply; notify?: typeof enqueueCompanyUpdate;
    sendLinkReply?: typeof sendConnectLinkReply } = {}) {
  const addresses = externalCandidateReplyAddresses(ctx.recipients);
  if (addresses.length !== 1) throw new EmailPermanentError(addresses.length ? "ambiguous_external_reply_alias" : "external_reply_alias_required");
  const token = externalReplyToken(addresses[0]);
  if (!token) throw new EmailPermanentError("invalid_external_reply_alias");
  const admin = ctx.admin;
  const { data: request, error } = await admin.from("external_intro_requests")
    .select("id,status,recipient_email,external_candidate_id,company_workspace_id,role_id,result,accept_token_hash")
    .eq("reply_token_hash", hashReplyToken(token)).maybeSingle();
  if (error) throw error;
  if (!request) return skip(ctx, "external_reply_alias_not_found");
  if (!ctx.body) return skip(ctx, "empty_body");

  const fromInvitedAddress = Boolean(request.recipient_email) && request.recipient_email === ctx.sender;
  const { error: insertError } = await admin.from("external_candidate_replies").upsert({
    external_intro_request_id: request.id, email_reply_job_id: ctx.job.id, from_email: ctx.sender,
    from_invited_address: fromInvitedAddress, subject: ctx.subject.slice(0, 500), body_text: ctx.body.slice(0, 20_000),
  }, { onConflict: "email_reply_job_id", ignoreDuplicates: true });
  if (insertError) throw insertError;
  const { data: reply, error: replyError } = await admin.from("external_candidate_replies")
    .select("id,reply_type,summary,created_at").eq("email_reply_job_id", ctx.job.id).single();
  if (replyError) throw replyError;

  let type = (reply.reply_type ?? "") as ExternalReplyType | "unclassified" | "";
  let summary = reply.summary ?? "";
  if (!type) {
    const delivery = (request.result && typeof request.result === "object" && !Array.isArray(request.result)
      ? (request.result as { delivery?: { subject?: string } }).delivery : undefined) ?? {};
    const role = await admin.from("company_roles").select("name").eq("role_id", request.role_id).maybeSingle();
    try {
      const classified = await (dependencies.classify ?? classifyExternalReply)({
        replyBody: ctx.body, replySubject: ctx.subject, inviteSubject: String(delivery.subject ?? ""), roleName: role.data?.name ?? "",
      });
      type = classified.type;
      summary = classified.summary;
    } catch (classifyError) {
      console.warn("[external-reply] classification failed", { jobId: ctx.job.id, error: String(classifyError).slice(0, 300) });
      type = "unclassified";
      summary = "The reply could not be read automatically, so its content is unknown.";
    }
    const { error: saveError } = await admin.from("external_candidate_replies")
      .update({ reply_type: type, summary, classified_at: nowIso() }).eq("id", reply.id);
    if (saveError) throw saveError;
  }

  // Only the invited address can close the request or opt out an address.
  if (fromInvitedAddress && suppressAfterReply(type) && request.recipient_email) {
    const { error: suppressError } = await admin.from("external_contact_suppressions").upsert({
      email_hash: externalEmailHash(request.recipient_email), reason: type, external_intro_request_id: request.id,
    }, { onConflict: "email_hash", ignoreDuplicates: true });
    if (suppressError) throw suppressError;
  }
  const nextStatus = fromInvitedAddress ? statusAfterReply(type) : "replied";
  if (["accepted", "connecting", "connected"].includes(request.status)) {
    // Already connected (or connecting) by the person's own confirmation: the reply is kept, the state stays.
    const { error: statusError } = await admin.from("external_intro_requests").update({
      reply_type: type, last_reply_at: reply.created_at, updated_at: nowIso(),
    }).eq("id", request.id);
    if (statusError) throw statusError;
  } else if (!["declined", "unsubscribed"].includes(request.status) || nextStatus !== "replied") {
    const { error: statusError } = await admin.from("external_intro_requests").update({
      status: nextStatus, reply_type: type, last_reply_at: reply.created_at, updated_at: nowIso(),
    }).eq("id", request.id);
    if (statusError) throw statusError;
  }

  const [candidate, role] = await Promise.all([
    admin.from("external_candidates").select("name,linkedin_url,company_decision").eq("id", request.external_candidate_id).maybeSingle(),
    admin.from("company_roles").select("name").eq("role_id", request.role_id).maybeSingle(),
  ]);
  // The company passed on this person, or the feature is off for the workspace: the reply is kept, the company is not told.
  const skipReason = candidate.data?.company_decision === "passed" ? "company_passed"
    : externalSourcingEnabledFor(request.company_workspace_id) ? null : "not_enabled";
  if (skipReason) {
    const { error: noticeError } = await admin.from("external_candidate_replies")
      .update({ company_notice: { status: "skipped", reason: skipReason } }).eq("id", reply.id);
    if (noticeError) throw noticeError;
    return skip(ctx, "external_candidate_reply_recorded");
  }
  // An interested answer from the invited address gets the connect link once; a failure here only means
  // the company is told that no link reply went out.
  let harperSentConnectLink = false;
  if (fromInvitedAddress && type === "interested") {
    try {
      const outcome = await (dependencies.sendLinkReply ?? sendConnectLinkReply)({
        admin, requestId: request.id, headers: replyHeaders(ctx.received, ""),
      });
      harperSentConnectLink = outcome === "sent" || outcome === "already_sent";
    } catch (linkError) {
      console.error("[external-reply] connect link reply failed", { requestId: request.id, error: String(linkError).slice(0, 300) });
    }
  }
  const { jobId } = await (dependencies.notify ?? enqueueCompanyUpdate)({
    workspaceId: request.company_workspace_id, roleId: request.role_id, eventKey: `external_reply:${reply.id}`,
    purpose: "Tell the company, in its hiring conversation, how the external person it asked to meet answered Harper's invitation and what happens next. Propose a next step only when one is real.",
    facts: externalReplyNoticeFacts({
      replyId: reply.id, roleName: role.data?.name ?? "", receivedAt: reply.created_at, type: type || "unclassified", summary,
      fromInvitedAddress, person: { ref: request.external_candidate_id, name: candidate.data?.name ?? null,
        linkedinUrl: candidate.data?.linkedin_url ?? null },
      connectLinkSent: Boolean(request.accept_token_hash), harperSentConnectLink,
    }),
  });
  const { error: noticeError } = await admin.from("external_candidate_replies")
    .update({ company_notice: { status: "sent", jobId, deliveredAt: nowIso() } }).eq("id", reply.id);
  if (noticeError) throw noticeError;
  await skip(ctx, "external_candidate_reply_recorded");
}
