import { createHash, timingSafeEqual } from "node:crypto";
import { stripQuotedEmailText } from "@/lib/email/parse";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  getGmailMessage,
  getGtmOutreachGmailConfig,
  isGmailNotFoundError,
  listGmailHistory,
  listInboxMessageIds,
  parseGmailMessage,
  startGmailWatch,
} from "@/lib/contentsEngine/gmail";
import { sendGtmOutreachEmailWithResend } from "@/lib/contentsEngine/resend";
import {
  classifyOutreachReply,
  unclassifiedOutreachReplyTriage,
} from "@/lib/contentsEngine/replyTriage";
import {
  notifyGtmOutreachDeliveryFailure,
  notifyGtmOutreachReply,
} from "@/lib/contentsEngine/slack";

type UntypedAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from: (table: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<any>;
};

export type OutreachDispatch = {
  attempt_count: number;
  body: string;
  id: string;
  recipient_email: string;
  rfc_message_id: string;
  sender_email: string;
  subject: string;
};

function adminClient() {
  return getSupabaseAdmin() as UntypedAdmin;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function rpcData<T>(result: { data?: T; error?: { message?: string } | null }) {
  if (result.error) {
    throw new Error(result.error.message ?? "Supabase RPC failed");
  }
  return result.data as T;
}

export async function verifyGtmOutreachWriteToken(token: string) {
  const digest = createHash("sha256").update(token).digest("hex");
  const { data, error } = await adminClient()
    .from("gtm_access_tokens")
    .select("id, can_write, expires_at, revoked_at")
    .eq("token_hash", digest)
    .maybeSingle();
  if (
    error ||
    !data ||
    data.can_write !== true ||
    data.revoked_at ||
    Date.parse(data.expires_at) <= Date.now()
  ) {
    return false;
  }
  return true;
}

export function verifyCronSecret(authorization: string | null) {
  const configured = process.env.CRON_SECRET?.trim();
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!configured || !provided) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isRetryableResendFailure(error: unknown) {
  const message = errorMessage(error);
  return !(
    /RESEND_API_KEY is required|Resend did not return/i.test(message) ||
    /Failed to (send|retrieve) email: HTTP (400|401|403|404|422):/i.test(
      message
    )
  );
}

async function markSent(args: {
  dispatchId: string;
  messageId: string;
  rfcMessageId: string;
}) {
  return rpcData<OutreachDispatch>(
    await adminClient().rpc("gtm_outreach_worker_mark_sent", {
      p_dispatch_id: args.dispatchId,
      p_provider_message_id: args.messageId,
      p_provider_thread_id: args.rfcMessageId,
      p_sent_at: new Date().toISOString(),
    })
  );
}

async function markFailed(dispatchId: string, error: unknown) {
  return rpcData<OutreachDispatch>(
    await adminClient().rpc("gtm_outreach_worker_mark_failed", {
      p_dispatch_id: dispatchId,
      p_error: errorMessage(error),
      p_retryable: isRetryableResendFailure(error),
    })
  );
}

async function deliverClaimedDispatch(dispatch: OutreachDispatch) {
  try {
    const sent = await sendGtmOutreachEmailWithResend({
      body: dispatch.body,
      dispatchId: dispatch.id,
      subject: dispatch.subject,
      to: dispatch.recipient_email,
    });
    await markSent({
      dispatchId: dispatch.id,
      messageId: sent.emailId,
      rfcMessageId: sent.messageId,
    });
    return { dispatchId: dispatch.id, ok: true } as const;
  } catch (error) {
    await markFailed(dispatch.id, error);
    return {
      dispatchId: dispatch.id,
      error: errorMessage(error),
      ok: false,
    } as const;
  }
}

export async function dispatchApprovedOutreach(args: {
  dispatchId?: string | null;
  limit?: number;
}) {
  const claims = rpcData<OutreachDispatch[]>(
    await adminClient().rpc("gtm_outreach_worker_claim", {
      p_dispatch_id: args.dispatchId ?? null,
      p_limit: Math.min(Math.max(args.limit ?? 10, 1), 50),
    })
  );
  const results = [];
  for (const dispatch of claims ?? []) {
    results.push(await deliverClaimedDispatch(dispatch));
  }
  return results;
}

type MailboxRow = {
  email: string;
  history_id: string | null;
  watch_expiration: string | null;
};

async function getMailboxState(mailbox: string) {
  const { data, error } = await adminClient()
    .from("gtm_outreach_mailboxes")
    .select("email, history_id, watch_expiration")
    .eq("email", mailbox)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to read Gmail cursor");
  return (data ?? null) as MailboxRow | null;
}

async function saveMailboxState(args: {
  error?: string | null;
  historyId?: string | null;
  mailbox: string;
  watchExpiration?: string | null;
}) {
  const payload: Record<string, unknown> = {
    email: args.mailbox,
    last_error: args.error ?? null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (args.historyId !== undefined) payload.history_id = args.historyId;
  if (args.watchExpiration !== undefined) {
    payload.watch_expiration = args.watchExpiration;
  }
  const { error } = await adminClient()
    .from("gtm_outreach_mailboxes")
    .upsert(payload, { onConflict: "email" });
  if (error) throw new Error(error.message ?? "Failed to save Gmail cursor");
}

export async function renewGtmOutreachGmailWatch() {
  const mailbox = getGtmOutreachGmailConfig().mailbox;
  const topicName = process.env.GTM_OUTREACH_GMAIL_PUBSUB_TOPIC?.trim();
  if (!topicName) throw new Error("GTM_OUTREACH_GMAIL_PUBSUB_TOPIC is required");
  const state = await getMailboxState(mailbox);
  const watch = await startGmailWatch(topicName);
  const expirationMs = Number(watch.expiration);
  const watchExpiration = Number.isFinite(expirationMs)
    ? new Date(expirationMs).toISOString()
    : null;
  await saveMailboxState({
    error: null,
    // Renewing a watch returns Gmail's current cursor. Keep the previously
    // processed cursor so replies that arrived before renewal are still read.
    historyId: state?.history_id ?? watch.historyId,
    mailbox,
    watchExpiration,
  });
  return { ...watch, mailbox, watchExpiration };
}

type ReplyIngestResult = {
  activity_id?: string;
  activity_ref?: number | string;
  body?: string;
  creator_name?: string;
  creator_ref?: number | string;
  dispatch_id?: string;
  dispatch_ref?: number | string;
  from_email?: string;
  inserted?: boolean;
  matched?: boolean;
  notify_needed?: boolean;
  outbound_body?: string;
  outbound_subject?: string;
  primary_handle?: string | null;
  received_at?: string;
  selection_reason?: string;
  subject?: string;
};

type ReplyTriageRecord = {
  candidate_content_id?: string | null;
  candidate_content_ref?: number | string | null;
  publication_verification_required?: boolean;
  triage_activity_id?: string;
};

type DeliveryFailureIngestResult = {
  activity_id?: string;
  creator_name?: string;
  creator_ref?: number | string;
  diagnostic_code?: string | null;
  dispatch_ref?: number | string;
  inserted?: boolean;
  matched?: boolean;
  notify_needed?: boolean;
  permanent?: boolean;
  recipient_email?: string;
  status?: string | null;
  subject?: string;
};

async function getOutreachDispatchSentAt(dispatchId: string | undefined) {
  if (!dispatchId) return null;
  const { data, error } = await adminClient()
    .from("gtm_outreach_dispatches")
    .select("sent_at")
    .eq("id", dispatchId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to read outreach sent time");
  }
  return typeof data?.sent_at === "string" ? data.sent_at : null;
}

async function ingestReplyMessage(messageId: string) {
  const config = getGtmOutreachGmailConfig();
  const mailbox = config.mailbox;
  let message;
  try {
    message = await getGmailMessage(messageId);
  } catch (error) {
    // Gmail can remove a message after it appears in a history or INBOX page.
    // That stale ID must not block later replies from being collected and sent
    // to Slack.
    if (isGmailNotFoundError(error)) {
      console.warn("[contents-engine/gmail] skipped missing message", {
        mailbox,
        messageId,
      });
      return { matched: false, skipped: true };
    }
    throw error;
  }
  if (!message.labelIds?.includes("INBOX")) return { matched: false };
  const parsed = parseGmailMessage(message);
  if (parsed.deliveryFailure) {
    const result = rpcData<DeliveryFailureIngestResult>(
      await adminClient().rpc("gtm_outreach_ingest_gmail_delivery_failure", {
        p_diagnostic_code: parsed.deliveryFailure.diagnosticCode,
        p_final_recipient: parsed.deliveryFailure.finalRecipient,
        p_in_reply_to: parsed.inReplyTo,
        p_mailbox: config.fromEmail,
        p_message_id: parsed.messageId,
        p_received_at: parsed.receivedAt,
        p_references: parsed.references,
        p_rfc_message_id: parsed.rfcMessageId,
        p_status: parsed.deliveryFailure.status,
        p_thread_id: parsed.threadId,
      })
    );
    if (result.matched && result.notify_needed && result.activity_id) {
      const slack = await notifyGtmOutreachDeliveryFailure({
        activityId: result.activity_id,
        creatorName: result.creator_name ?? "Unknown creator",
        creatorRef: result.creator_ref ?? "",
        diagnosticCode: result.diagnostic_code,
        dispatchRef: result.dispatch_ref ?? "",
        permanent: result.permanent === true,
        recipientEmail:
          result.recipient_email ??
          parsed.deliveryFailure.finalRecipient ??
          "unknown",
        status: result.status,
        subject: result.subject ?? parsed.subject,
      });
      rpcData(
        await adminClient().rpc(
          "gtm_outreach_record_activity_slack_notification",
          {
            p_activity_id: result.activity_id,
            p_channel_id: slack.channel,
            p_slack_ts: slack.ts,
          }
        )
      );
    }
    return result;
  }
  if (
    !parsed.fromEmail ||
    parsed.fromEmail === mailbox ||
    parsed.fromEmail === config.fromEmail
  ) {
    return { matched: false };
  }
  const result = rpcData<ReplyIngestResult>(
    await adminClient().rpc("gtm_outreach_ingest_gmail_reply", {
      p_body: parsed.body,
      p_from_email: parsed.fromEmail,
      p_in_reply_to: parsed.inReplyTo,
      p_mailbox: config.fromEmail,
      p_message_id: parsed.messageId,
      p_received_at: parsed.receivedAt,
      p_references: parsed.references,
      p_rfc_message_id: parsed.rfcMessageId,
      p_subject: parsed.subject,
      p_thread_id: parsed.threadId,
      p_to_email: parsed.toEmail,
    })
  );
  if (!result.matched || !result.notify_needed || !result.activity_id) {
    return result;
  }
  const newestReplyBody = stripQuotedEmailText(result.body ?? parsed.body);
  const outboundSentAt = await getOutreachDispatchSentAt(result.dispatch_id);
  let triage;
  try {
    triage = await classifyOutreachReply({
      creatorName: result.creator_name ?? "Unknown creator",
      fromEmail: result.from_email ?? parsed.fromEmail,
      outboundBody: result.outbound_body ?? "",
      outboundSubject: result.outbound_subject ?? "",
      replyBody: newestReplyBody,
      replySubject: result.subject ?? parsed.subject,
      selectionReason: result.selection_reason ?? "",
    });
  } catch (error) {
    triage = unclassifiedOutreachReplyTriage(error);
  }
  const triageRecord = rpcData<ReplyTriageRecord>(
    await adminClient().rpc("gtm_outreach_record_reply_triage", {
      p_mentioned_urls: triage.mentionedUrls,
      p_model: triage.model,
      p_reply_activity_id: result.activity_id,
      p_summary: triage.summary,
      p_type: triage.type,
    })
  );
  const slack = await notifyGtmOutreachReply({
    activityId: result.activity_id,
    activityRef: result.activity_ref ?? "",
    body: newestReplyBody,
    creatorName: result.creator_name ?? "Unknown creator",
    creatorRef: result.creator_ref ?? "",
    dispatchRef: result.dispatch_ref ?? "",
    fromEmail: result.from_email ?? parsed.fromEmail,
    outboundSentAt,
    outboundSubject: result.outbound_subject ?? "",
    primaryHandle: result.primary_handle,
    receivedAt: result.received_at ?? parsed.receivedAt,
    subject: result.subject ?? parsed.subject,
    triageSummary: triage.summary,
    triageType: triage.type,
  });
  rpcData(
    await adminClient().rpc("gtm_outreach_record_slack_notification", {
      p_channel_id: slack.channel,
      p_reply_activity_id: result.activity_id,
      p_slack_ts: slack.ts,
    })
  );
  return { ...result, ...triageRecord, triage_type: triage.type };
}

export async function syncGtmOutreachGmailHistory(notificationHistoryId: string) {
  const mailbox = getGtmOutreachGmailConfig().mailbox;
  const state = await getMailboxState(mailbox);
  let messageIds: string[] = [];
  let latestHistoryId = notificationHistoryId;
  try {
    if (state?.history_id) {
      const history = await listGmailHistory(state.history_id);
      messageIds = history.messageIds;
      latestHistoryId = history.latestHistoryId || notificationHistoryId;
    } else {
      messageIds = await listInboxMessageIds();
    }
  } catch (error) {
    if (!isGmailNotFoundError(error)) throw error;
    messageIds = await listInboxMessageIds();
  }

  const results = [];
  try {
    for (const messageId of messageIds) {
      results.push(await ingestReplyMessage(messageId));
    }
    await saveMailboxState({
      error: null,
      historyId: latestHistoryId,
      mailbox,
    });
  } catch (error) {
    await saveMailboxState({
      error: errorMessage(error),
      historyId: state?.history_id,
      mailbox,
    });
    throw error;
  }
  return {
    matched: results.filter((result) => result.matched).length,
    processed: messageIds.length,
  };
}
