import { createHash, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  findGmailMessageByRfcId,
  getGmailMessage,
  getGtmOutreachGmailConfig,
  listGmailHistory,
  listInboxMessageIds,
  parseGmailMessage,
  sendGtmOutreachEmail,
  startGmailWatch,
} from "@/lib/contentsEngine/gmail";
import { notifyGtmOutreachReply } from "@/lib/contentsEngine/slack";

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

function isRetryableGmailFailure(error: unknown) {
  const message = errorMessage(error);
  return !(
    /is required|does not match configured Gmail sender/i.test(message) ||
    /Gmail API (400|401|403):/i.test(message)
  );
}

async function markSent(args: {
  dispatchId: string;
  messageId: string;
  threadId: string;
}) {
  return rpcData<OutreachDispatch>(
    await adminClient().rpc("gtm_outreach_worker_mark_sent", {
      p_dispatch_id: args.dispatchId,
      p_provider_message_id: args.messageId,
      p_provider_thread_id: args.threadId,
      p_sent_at: new Date().toISOString(),
    })
  );
}

async function markFailed(dispatchId: string, error: unknown) {
  return rpcData<OutreachDispatch>(
    await adminClient().rpc("gtm_outreach_worker_mark_failed", {
      p_dispatch_id: dispatchId,
      p_error: errorMessage(error),
      p_retryable: isRetryableGmailFailure(error),
    })
  );
}

async function deliverClaimedDispatch(dispatch: OutreachDispatch) {
  try {
    const existing = await findGmailMessageByRfcId(dispatch.rfc_message_id);
    const sent =
      existing ??
      (await sendGtmOutreachEmail({
        body: dispatch.body,
        from: dispatch.sender_email,
        messageId: dispatch.rfc_message_id,
        subject: dispatch.subject,
        to: dispatch.recipient_email,
      }));
    await markSent({
      dispatchId: dispatch.id,
      messageId: sent.id,
      threadId: sent.threadId,
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
  dispatch_ref?: number | string;
  from_email?: string;
  inserted?: boolean;
  matched?: boolean;
  notify_needed?: boolean;
  received_at?: string;
  subject?: string;
};

async function ingestReplyMessage(messageId: string) {
  const config = getGtmOutreachGmailConfig();
  const mailbox = config.mailbox;
  const message = await getGmailMessage(messageId);
  if (!message.labelIds?.includes("INBOX")) return { matched: false };
  const parsed = parseGmailMessage(message);
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
  const slack = await notifyGtmOutreachReply({
    activityId: result.activity_id,
    activityRef: result.activity_ref ?? "",
    body: result.body ?? parsed.body,
    creatorName: result.creator_name ?? "Unknown creator",
    creatorRef: result.creator_ref ?? "",
    dispatchRef: result.dispatch_ref ?? "",
    fromEmail: result.from_email ?? parsed.fromEmail,
    receivedAt: result.received_at ?? parsed.receivedAt,
    subject: result.subject ?? parsed.subject,
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
    matched: results.filter((result) => result.matched).length,
    processed: messageIds.length,
  };
}
