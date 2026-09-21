import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  getGmailMessage,
  getGmailHistoryId,
  getGtmOutreachGmailConfig,
  listGmailHistory,
  listInboxMessageIds,
  parseGmailMessage,
  startGmailWatch,
} from "@/lib/contentsEngine/gmail";
import { sendGtmOutreachEmailWithResend } from "@/lib/contentsEngine/resend";
import {
  notifyGtmOutreachReply,
  notifyGtmOutreachDeliveryFailure,
} from "@/lib/contentsEngine/slack";
import { stripQuotedEmailText } from "@/lib/email/parse";
import type { OutreachReplyTriage } from "./replyTriageContract";
import { getResendEmail } from "@/lib/email/send";

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
  in_reply_to?: string | null;
  email_references?: string | null;
};

function adminClient() {
  return getSupabaseAdmin() as UntypedAdmin;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error ?? "Unknown error");
}

function rpcData<T>(result: { data?: T; error?: { message?: string } | null }) {
  if (result.error) {
    throw new Error(result.error.message ?? "Supabase RPC failed");
  }
  return result.data as T;
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
    /Failed to (send|retrieve) email: HTTP (400|401|403|404|409|422)(?::|\s)/i.test(
      message
    )
  );
}

async function markSent(args: {
  dispatchId: string;
  messageId: string;
  rfcMessageId: string | null;
}) {
  return rpcData<OutreachDispatch>(
    await adminClient().rpc("gtm_outreach_worker_record_delivery", {
      p_dispatch_id: args.dispatchId,
      p_provider: "resend",
      p_provider_message_id: args.messageId,
      p_rfc_message_id: args.rfcMessageId,
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
      inReplyTo: dispatch.in_reply_to,
      references: dispatch.email_references,
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
  if (!topicName)
    throw new Error("GTM_OUTREACH_GMAIL_PUBSUB_TOPIC is required");
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
  creator_id?: string;
  creator_ref?: number | string;
  dispatch_id?: string;
  dispatch_ref?: number | string;
  from_email?: string;
  inserted?: boolean;
  matched?: boolean;
  notify_needed?: boolean;
  received_at?: string;
  subject?: string;
};

type DeliveryFailureIngestResult = {
  activity_id?: string;
  creator_id?: string;
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

async function ingestReplyMessage(messageId: string) {
  const config = getGtmOutreachGmailConfig();
  const mailbox = config.mailbox;
  const message = await getGmailMessage(messageId);
  // Archiving a reply before push processing must not make it disappear.
  if (
    message.labelIds?.some((label) =>
      ["SENT", "DRAFT", "SPAM", "TRASH"].includes(label)
    )
  )
    return { matched: false };
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
        creatorId: result.creator_id,
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
  return result;
}

async function notifyReply(result: ReplyIngestResult) {
  if (!result.activity_id) throw new Error("Reply activity ID is required");
  // Keep the deployed reply interpretation and downstream publication checks.
  // Retrying Slack reuses the durable interpretation instead of rerunning it.
  const [dispatchResult, triageResult] = await Promise.all([
    adminClient()
      .from("gtm_outreach_dispatches")
      .select("subject,body,selection_reason,sent_at,creator_id")
      .eq("id", result.dispatch_id)
      .single(),
    adminClient()
      .from("gtm_activities")
      .select("payload")
      .eq("kind", "reply_triaged")
      .eq("provider", "contents_engine")
      .eq("connection_ref", "reply_triage")
      .eq("external_id", result.activity_id)
      .maybeSingle(),
  ]);
  const dispatch = rpcData<Record<string, string>>(dispatchResult);
  const existing = rpcData<{
    payload: { type: OutreachReplyTriage["type"]; summary: string };
  } | null>(triageResult);
  const newestReplyBody = stripQuotedEmailText(result.body ?? "");
  let triage: Pick<OutreachReplyTriage, "type" | "summary">;
  if (existing) triage = existing.payload;
  else {
    const { classifyOutreachReply, unclassifiedOutreachReplyTriage } =
      await import("./replyTriage");
    let classified: OutreachReplyTriage;
    try {
      classified = await classifyOutreachReply({
        creatorName: result.creator_name ?? "Unknown creator",
        fromEmail: result.from_email ?? "",
        outboundBody: dispatch.body,
        outboundSubject: dispatch.subject,
        replyBody: newestReplyBody,
        replySubject: result.subject ?? "",
        selectionReason: dispatch.selection_reason ?? "",
      });
    } catch (error) {
      classified = unclassifiedOutreachReplyTriage(error);
    }
    rpcData(
      await adminClient().rpc("gtm_outreach_record_reply_triage", {
        p_reply_activity_id: result.activity_id,
        p_type: classified.type,
        p_summary: classified.summary,
        p_mentioned_urls: classified.mentionedUrls,
        p_model: classified.model,
      })
    );
    triage = classified;
  }
  const slack = await notifyGtmOutreachReply({
    activityId: result.activity_id,
    activityRef: result.activity_ref ?? "",
    body: newestReplyBody,
    creatorName: result.creator_name ?? "Unknown creator",
    creatorId: result.creator_id ?? dispatch.creator_id,
    creatorRef: result.creator_ref ?? "",
    dispatchRef: result.dispatch_ref ?? "",
    fromEmail: result.from_email ?? "",
    receivedAt: result.received_at ?? "",
    subject: result.subject ?? "",
    outboundSentAt: dispatch.sent_at,
    outboundSubject: dispatch.subject,
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
  return result;
}

export async function retryGtmReplyNotifications() {
  const mailbox = process.env.GTM_OUTREACH_GMAIL_USER?.trim().toLowerCase();
  if (!mailbox) throw new Error("GTM_OUTREACH_GMAIL_USER is required");
  const leaseId = crypto.randomUUID();
  const claim = rpcData<{ claimed: boolean; replies: ReplyIngestResult[] }>(
    await adminClient().rpc("gtm_outreach_claim_notifications", {
      p_mailbox: mailbox,
      p_lease_id: leaseId,
    })
  );
  const results: { id?: string; ok: boolean; error?: string }[] = [];
  if (!claim.claimed) return results;
  try {
    for (const reply of claim.replies) {
      try {
        await notifyReply(reply);
        results.push({ id: reply.activity_id, ok: true });
      } catch (error) {
        results.push({
          id: reply.activity_id,
          ok: false,
          error: errorMessage(error),
        });
      }
    }
  } finally {
    rpcData(
      await adminClient().rpc("gtm_outreach_release_notifications", {
        p_mailbox: mailbox,
        p_lease_id: leaseId,
        p_error:
          results
            .filter((item) => !item.ok)
            .map((item) => item.error)
            .join("; ") || null,
      })
    );
  }
  return results;
}

export async function reconcileGtmResendMessageIds() {
  const admin = adminClient();
  const { data, error } = await admin
    .from("gtm_outreach_dispatches")
    .select("id,provider_message_id,sent_at")
    .eq("provider", "resend")
    .is("provider_rfc_message_id", null)
    .is("archived_at", null)
    .in("status", ["sent", "replied"])
    .limit(30);
  if (error) throw new Error(error.message);
  let resolved = 0;
  for (const dispatch of data ?? []) {
    const email = await getResendEmail(dispatch.provider_message_id);
    // Gmail replies refer to Resend's actual RFC Message-ID. Advancing the
    // Gmail history cursor while that identity is unavailable can permanently
    // skip an otherwise valid reply, so make the sync retry later instead.
    if (!email.message_id?.trim()) {
      throw new Error(
        `Resend Message-ID is not ready for dispatch ${dispatch.id}`
      );
    }
    rpcData(
      await admin.rpc("gtm_outreach_worker_record_delivery", {
        p_dispatch_id: dispatch.id,
        p_provider: "resend",
        p_provider_message_id: dispatch.provider_message_id,
        p_rfc_message_id: email.message_id,
        p_sent_at: dispatch.sent_at,
      })
    );
    resolved++;
  }
  return resolved;
}

export async function syncGtmOutreachGmailHistory(notificationHistoryId = "") {
  // Every entry point (Pub/Sub, cron, and the Ops button) must establish the
  // provider identity before it is allowed to advance Gmail's durable cursor.
  await reconcileGtmResendMessageIds();
  const mailbox = getGtmOutreachGmailConfig().mailbox;
  const state = await getMailboxState(mailbox);
  let messageIds: string[] = [];
  let latestHistoryId = notificationHistoryId || (await getGmailHistoryId());
  try {
    if (state?.history_id) {
      const history = await listGmailHistory(state.history_id);
      messageIds = history.messageIds;
      latestHistoryId = history.latestHistoryId || latestHistoryId;
    } else {
      messageIds = await listInboxMessageIds();
    }
  } catch (error) {
    if (!/Gmail API 404:/i.test(errorMessage(error))) throw error;
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
    notifications: await retryGtmReplyNotifications(),
    matched: results.filter((result) => result.matched).length,
    processed: messageIds.length,
  };
}
