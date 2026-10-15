import "server-only";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { isHarperSlackAudienceAllowed, sendHarperWorkspaceSlackMessage, reconcileHarperSlackMessage } from "../slackHarper";
import { loadSlackOrgLinkTargets } from "../slackOrgLinkTargets.server";
import { renderSlackOrgLinks } from "../slackTalentLinks";
import { markdownToSlackMrkdwn } from "../slackTalentReviewView";
import { buildHarperSlackChoiceBlocks } from "../slackChoiceButtons";

/** Replays a committed batch, never reruns the authoring LLM. */
export async function deliverCompanyMessageBatch(args: {
  batchId: string; workspaceId: string; assertCanStart?: () => Promise<void>;
}, dependencies = { admin: getSupabaseAdmin, allowed: isHarperSlackAudienceAllowed, send: sendHarperWorkspaceSlackMessage,
  links: loadSlackOrgLinkTargets, reconcile: reconcileHarperSlackMessage }) {
  const admin: any = dependencies.admin();
  const { data: messages, error } = await admin.from("company_messages").select("*")
    .eq("company_workspace_id", args.workspaceId)
    .contains("metadata", { companyMessageBatch: { batchId: args.batchId } }).order("id");
  if (error) throw error;
  if (!messages?.length) throw new Error("Committed company message batch is missing");
  // A partial batch is one conversation delivery, not a new unsolicited turn.
  if (!messages.some((m: any) => m.metadata.companyMessageReceipt)) await args.assertCanStart?.();
  const byId = new Map<number, any>(messages.map((m: any) => [Number(m.id), m]));
  for (const message of messages) {
    const part = message.metadata.companyMessageBatch;
    const { data: channel, error: channelError } = await admin.from("company_slack_channels")
      .select("id,slack_channel_id,is_enabled").eq("id", part.channelDbId)
      .eq("company_workspace_id", args.workspaceId).maybeSingle();
    if (channelError) throw channelError;
    if (!channel?.is_enabled || !await dependencies.allowed({ workspaceId: args.workspaceId,
      channelId: channel.slack_channel_id, roleId: message.role_id })) throw new Error("Company message audience is no longer allowed");
    if (message.metadata.companyMessageReceipt) continue;
    let threadTs: string | undefined;
    let expectedThreadId: string | undefined;
    if (part.replyToMessageId) {
      const parent = byId.get(Number(part.replyToMessageId));
      const receipt = parent?.metadata.companyMessageReceipt;
      if (!receipt) throw new Error("Parent message has no persisted receipt");
      expectedThreadId = receipt.threadId;
    } else if (part.threadRef) expectedThreadId = part.threadRef;
    if (expectedThreadId) {
      const { data: thread, error: threadError } = await admin.from("company_slack_threads")
        .select("slack_thread_ts,role_id").eq("id", expectedThreadId).eq("channel_id", channel.id).single();
      if (threadError) throw threadError;
      if ((thread.role_id ?? null) !== (message.role_id ?? null)) throw new Error("Company message thread Role changed");
      threadTs = thread.slack_thread_ts;
    }
    const idempotencyKey = `company-message:${args.batchId}:${message.id}`;
    // Rendering is read-only. Finish it before marking a potentially sent attempt,
    // otherwise a failed lookup would be mistaken for an uncertain Slack delivery.
    const targets = await dependencies.links({ admin, workspaceId: args.workspaceId,
      preferredRoleId: message.role_id, message: message.content });
    const text = markdownToSlackMrkdwn(renderSlackOrgLinks({ message: message.content,
      workspaceId: args.workspaceId, ...targets }));
    const { data: attempt, error: attemptError } = await admin.rpc("begin_company_message_delivery_v1", {
      p_message_id: message.id, p_batch_id: args.batchId,
    });
    if (attemptError) throw attemptError;
    if (attempt?.recoveryRequired) {
      const receipt = await dependencies.reconcile({ workspaceId: args.workspaceId, channelDbId: channel.id,
        channelId: channel.slack_channel_id, roleId: message.role_id, idempotencyKey,
        attemptedAt: attempt.attemptedAt, threadTs });
      const { error: recoveryError } = await admin.rpc("record_company_message_receipt_v1", {
        p_message_id: message.id, p_batch_id: args.batchId, p_receipt: receipt,
      });
      if (recoveryError) throw recoveryError;
      message.metadata.companyMessageReceipt = receipt;
      continue;
    }
    const delivered = await dependencies.send({ workspaceId: args.workspaceId, channelId: channel.slack_channel_id,
      roleId: message.role_id, text, blocks: buildHarperSlackChoiceBlocks({ text, choices: [], sourceJobId: args.batchId }),
      threadTs, idempotencyKey, recordConversationMessage: false,
      enforceAudiencePermission: true, requireAllDeliveries: true, unfurlLinks: false,
      onPosted: async receipt => {
        // The RPC merges this one receipt; parallel/old metadata cannot erase it.
        const { error: receiptError } = await admin.rpc("record_company_message_receipt_v1", {
          p_message_id: message.id, p_batch_id: args.batchId, p_receipt: receipt,
        });
        if (receiptError) throw receiptError;
        message.metadata.companyMessageReceipt = receipt;
      },
    });
    if (!delivered || !message.metadata.companyMessageReceipt) throw new Error("No confirmed company message receipt");
  }
  return messages.map((m: any) => ({ id: Number(m.id), ...m.metadata.companyMessageReceipt }));
}
