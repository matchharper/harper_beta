import "server-only";
import { readOpsCompatibleContacts } from "@/lib/companyTalentRequests/readOpsCompatible";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  sendHarperSlackThreadReply,
  sendHarperWorkspaceSlackMessage,
} from "@/lib/org/slackHarper";
import { loadSlackOrgLinkTargets } from "@/lib/org/slackOrgLinkTargets.server";
import { renderSlackOrgLinks } from "@/lib/org/slackTalentLinks";
import { getOrgPublicSiteUrl } from "@/lib/org/slackMessages";
import { markdownToSlackMrkdwn } from "../slackTalentReviewView";
import { insertOrgAgentMessage } from "./store";

/** Read durable contacts on demand; never persist an intermediate model judgment. */
export async function loadCompanyContactEventContext(args: {
  relayId: string;
  workspaceId: string;
  allowPendingDelivery?: boolean;
}) {
  const admin = getSupabaseAdmin() as any;
  const { data: relay, error } = await admin
    .from("company_talent_relays")
    .select(
      "id, recommendation_id, company_talent_request_id, source_talent_message_id, relay_content, document_id, created_at, deliveries:contact_queue(type,status,sent_at,payload)"
    )
    .eq("id", args.relayId)
    .single();
  if (error) throw error;
  const delivery = relay.deliveries?.find((item: any) => item.type === "company_contact_company_delivery");
  const deliveryCompleted = delivery?.status === "sent" && Boolean(delivery.sent_at);
  if (!deliveryCompleted && !(args.allowPendingDelivery && delivery && ["queued", "processing", "failed"].includes(delivery.status))) {
    throw new Error("Candidate contact has not been delivered");
  }
  const { data: recommendation, error: recommendationError } = await admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, role_id, talent_id, role:company_roles!inner(company_workspace_id,name,information)"
    )
    .eq("id", relay.recommendation_id)
    .single();
  if (recommendationError) throw recommendationError;
  const role = Array.isArray(recommendation.role)
    ? recommendation.role[0]
    : recommendation.role;
  if (role?.company_workspace_id !== args.workspaceId)
    throw new Error("Candidate contact workspace mismatch");
  if (
    role.information?.testOnly === true &&
    !role.information?.testTalentIds?.includes(recommendation.talent_id)
  ) {
    throw new Error("Test-only candidate contact is not allowed");
  }
  const contactFields =
    "id, request_context, delivery_body, created_at, source:company_messages!company_talent_requests_source_company_message_id_fkey(content,role,message_type,company_user_id,conversation_id,slack_thread_id,metadata), deliveries:contact_queue(type,status,sent_at)";
  const [
    contacts,
    previousRelays,
    sourceMessage,
    addressedContact,
    subsequentRelays,
  ] = await Promise.all([
    readOpsCompatibleContacts((hasOpsColumn) => {
      let query = admin
        .from("company_talent_requests")
        .select(contactFields);
      if (hasOpsColumn) query = query.eq("ops_only", false);
      return query
        .eq("recommendation_id", relay.recommendation_id)
        .lte("created_at", relay.created_at)
        .order("created_at", { ascending: false })
        .limit(4);
    }),
    admin
      .from("company_talent_relays")
      .select(
        "id, relay_content, document_id, created_at, deliveries:contact_queue(type,status,sent_at)"
      )
      .eq("recommendation_id", relay.recommendation_id)
      .lt("created_at", relay.created_at)
      .order("created_at", { ascending: false })
      .limit(4),
    admin
      .from("talent_messages")
      .select("id")
      .eq("id", relay.source_talent_message_id)
      .eq("user_id", recommendation.talent_id)
      .eq("role", "user")
      .single(),
    relay.company_talent_request_id
      ? readOpsCompatibleContacts((hasOpsColumn) => {
          let query = admin
            .from("company_talent_requests")
            .select(contactFields);
          if (hasOpsColumn) query = query.eq("ops_only", false);
          return query
            .eq("id", relay.company_talent_request_id)
            .eq("recommendation_id", relay.recommendation_id)
            .single();
        })
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("company_talent_relays")
      .select("id,relay_content,document_id,created_at,deliveries:contact_queue(type,status,sent_at)")
      .eq("recommendation_id", relay.recommendation_id)
      .gt("source_talent_message_id", relay.source_talent_message_id)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  for (const result of [
    contacts,
    previousRelays,
    sourceMessage,
    addressedContact,
    subsequentRelays,
  ])
    if (result.error) throw result.error;
  return {
    deliveryCompleted,
    originalDeliveryBody: String(delivery?.payload?.delivery?.body ?? relay.relay_content),
    candidate_contact_ref: {
      relayId: relay.id,
      recommendationId: relay.recommendation_id,
      requestId: relay.company_talent_request_id,
      roleId: recommendation.role_id,
      talentId: recommendation.talent_id,
    },
    roleName: role.name,
    currentContact: {
      content: relay.relay_content,
      documentId: relay.document_id,
      createdAt: relay.created_at,
    },
    precedingCompanyContacts: Array.from(
      new Map(
        [
          ...(contacts.data ?? []),
          ...(addressedContact.data ? [addressedContact.data] : []),
        ].map((contact: any) => [contact.id, contact])
      ).values()
    )
      .sort((a: any, b: any) =>
        String(a.created_at).localeCompare(String(b.created_at))
      )
      .map((contact: any) => {
        const source = Array.isArray(contact.source)
          ? contact.source[0]
          : contact.source;
        const { metadata, ...sourceFacts } = source ?? {};
        const plan = metadata?.approvedRoleMove;
        return {
          ...contact,
          source: sourceFacts,
          ...(plan
            ? {
                approvedRoleMove: {
                  sourceRoleId: plan.sourceRoleId,
                  targetRoleId: plan.targetRoleId,
                  sourceRoleName: plan.sourceRoleName,
                  targetRoleName: plan.targetRoleName,
                  talentId: plan.talentId,
                  targetStageId: plan.targetStageId,
                  condition:
                    "Move only if this candidate agrees to the proposed Role change.",
                  outcome: metadata.roleMoveOutcome?.status ?? null,
                },
              }
            : {}),
        };
      }),
    precedingCandidateContacts: (previousRelays.data ?? []).filter(isAuthorizedCompanyRelay).reverse(),
    subsequentCandidateContacts: (subsequentRelays.data ?? []).filter(isAuthorizedCompanyRelay).reverse(),
  };
}

function isAuthorizedCompanyRelay(relay: { deliveries?: Array<{ type: string; status: string; sent_at?: string | null }> }) {
  return relay.deliveries?.some(delivery => delivery.type === "company_contact_company_delivery"
    && (delivery.status === "sent" && Boolean(delivery.sent_at)
      || ["queued", "processing", "failed"].includes(delivery.status)));
}

/** Prepare the same durable company turn before the first candidate delivery. */
export async function enqueueCompanyContactEvent(relayId: string, workspaceId: string) {
  const admin = getSupabaseAdmin() as any;
  const context = await loadCompanyContactEventContext({ relayId, workspaceId, allowPendingDelivery: true });
  const contacts = context.precedingCompanyContacts as any[];
  const request = contacts.find(item => item.id === context.candidate_contact_ref.requestId) ?? contacts.at(-1);
  const source = Array.isArray(request?.source) ? request.source[0] : request?.source;
  let actorId = source?.company_user_id;
  if (!actorId) {
    const { data, error } = await admin.from("company_user_workspace").select("company_user_id")
      .eq("company_workspace_id", workspaceId).in("authority", ["owner", "admin"])
      .order("created_at").limit(1).maybeSingle();
    if (error) throw error;
    actorId = data?.company_user_id;
  }
  if (!actorId) throw new Error("Company contact actor missing");
  const { data, error } = await admin.auth.admin.getUserById(actorId);
  if (error) throw error;
  if (!data.user) throw new Error("Company contact actor missing");
  const { enqueueOrgAgentWebActionTurn } = await import("./webActionTurn");
  return enqueueOrgAgentWebActionTurn({
    workspaceId, roleId: context.candidate_contact_ref.roleId, user: data.user,
    conversationId: source?.conversation_id,
    actionName: "candidate_contact_received",
    actionContext: {
      relayId, recommendationId: context.candidate_contact_ref.recommendationId,
      relatedRoleId: context.candidate_contact_ref.roleId,
      slackThreadId: context.candidate_contact_ref.requestId ? source?.slack_thread_id ?? null : null,
      contactPendingDelivery: !context.deliveryCompleted,
    },
    idempotencyKey: `candidate-contact:${relayId}`, dispatch: false,
  });
}

/** Terminal messages are reused by the ordinary job runner on retry. */
export async function deliverCompanyContactEventMessages(args: {
  jobId: string;
  messageIds: Array<number | null>;
  roleId: string | null;
  slackThreadId: string | null;
  workspaceId: string;
  pendingRelayId?: string;
  candidateIds?: string[];
}) {
  const ids = args.messageIds.filter((id): id is number => id !== null);
  if (!ids.length) {
    if (args.pendingRelayId) throw new Error("Candidate contact has no persisted company presentation");
    return;
  }
  const admin = getSupabaseAdmin() as any;
  const { data, error } = await admin
    .from("company_messages")
    .select("id,content,metadata,role_id,model")
    .in("id", ids)
    .eq("company_workspace_id", args.workspaceId)
    .contains("metadata", { webActionJobId: args.jobId })
    .order("id");
  if (error) throw error;
  if (new Set((data ?? []).map((message: { id: number }) => message.id)).size !== new Set(ids).size) {
    throw new Error("Company event presentation is missing or belongs to another event");
  }
  if (args.pendingRelayId) await loadCompanyContactEventContext({
    relayId: args.pendingRelayId, workspaceId: args.workspaceId, allowPendingDelivery: true,
  });
  let slackMessageTs: string | null = null;
  let slackBotUserId: string | null = null;
  for (const message of data ?? []) {
    if (args.roleId && message.role_id !== args.roleId) {
      // A response started in a private workspace conversation must also reach
      // the Role's shared log. Preserve the same authored body; no new LLM call.
      const { data: existing, error: mirrorError } = await admin.from("company_messages")
        .select("id").eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
        .contains("metadata", { companyEventSourceMessageId: message.id }).maybeSingle();
      if (mirrorError) throw mirrorError;
      if (!existing) {
        const { data: conversation, error: conversationError } = await admin.from("company_conversations")
          .select("id,company_workspace_id,role_id,metadata").eq("company_workspace_id", args.workspaceId)
          .eq("role_id", args.roleId).single();
        if (conversationError) throw conversationError;
        const { agentTurn: _turn, ...metadata } = message.metadata;
        await insertOrgAgentMessage({ admin, conversation, content: message.content, role: "assistant",
          roleId: args.roleId, model: message.model, messageType: args.slackThreadId ? "slack" : "chat",
          slackThreadId: args.slackThreadId,
          metadata: { ...metadata, companyEventSourceMessageId: message.id },
        });
      }
    }
    if (message.metadata?.contactEventSlackDelivered === true) {
      slackMessageTs = message.metadata.contactEventSlackMessageTs ?? slackMessageTs;
      slackBotUserId = message.metadata.contactEventSlackBotUserId ?? slackBotUserId;
      continue;
    }
    let targets;
    try {
      targets = await loadSlackOrgLinkTargets({
        admin,
        message: message.content,
        preferredRoleId: args.roleId,
        workspaceId: args.workspaceId,
      });
    } catch (error) {
      console.warn("[org-agent/contact-event:org-links]", error);
      targets = { roleTargets: [], talentTargets: [] };
    }
    const slackText = renderSlackOrgLinks({
      message: markdownToSlackMrkdwn(message.content),
      publicSiteUrl: getOrgPublicSiteUrl(),
      ...targets,
      workspaceId: args.workspaceId,
    });
    const common = {
      idempotencyKey: `candidate-contact-turn:${args.jobId}:${message.id}`,
      text: slackText,
      workspaceId: args.workspaceId,
      enforceAudiencePermission: true,
    };
    const postedReceipts = { ...message.metadata?.contactEventSlackPosts };
    let receiptWrite: Promise<void> = Promise.resolve();
    const saveReceipts = (receipts: Record<string, unknown>, physical?: Record<string, unknown>) => {
      Object.assign(postedReceipts, receipts);
      // Workspace destinations may finish concurrently. Serialize persistence
      // so an older receipt snapshot cannot overwrite a newer one.
      receiptWrite = receiptWrite.catch(() => {}).then(async () => {
        const { error: receiptError } = await admin.from("company_messages").update({
          ...physical,
          metadata: { ...message.metadata, contactEventSlackPosts: { ...postedReceipts },
            contactEventSlackThreadIds: Array.from(new Set(Object.values(postedReceipts).map((receipt: any) => receipt.threadId).filter(Boolean))) },
        }).eq("id", message.id).eq("company_workspace_id", args.workspaceId);
        if (receiptError) throw receiptError;
      });
      return receiptWrite;
    };
    let delivered = false;
    if (args.slackThreadId) {
      const previous = postedReceipts.thread;
      const posted = previous?.slackMessageTs ? previous : await sendHarperSlackThreadReply({
        ...common,
        threadId: args.slackThreadId,
        roleId: args.roleId,
      });
      slackMessageTs = posted.slackMessageTs;
      slackBotUserId = posted.botUserId;
      delivered = Boolean(posted);
      await saveReceipts({ thread: posted }, {
        slack_message_ts: slackMessageTs, slack_user_id: slackBotUserId,
      });
    } else if (args.candidateIds?.length) {
      const { loadSlackCandidateCards, sendSlackCandidateResult } = await import("../slackCandidateWorkObject.server");
      const { getOrgWorkspaceLocale } = await import("../workspaceLocale.server");
      const candidateIds = Array.from(new Set(args.candidateIds));
      const candidates = await loadSlackCandidateCards({ candidateIds, roleId: args.roleId, workspaceId: args.workspaceId });
      if (candidates.length !== candidateIds.length) {
        throw new Error("Company event candidate presentation scope changed");
      }
      delivered = await sendSlackCandidateResult({
        ...common, roleId: args.roleId, candidates, receipts: postedReceipts,
        locale: await getOrgWorkspaceLocale(args.workspaceId, admin),
        recordConversationMessage: false,
        messageMetadata: { source: "company_agent_result" },
        onReceipt: receipts => saveReceipts(receipts),
      });
    } else {
      delivered = await sendHarperWorkspaceSlackMessage({
        ...common,
        roleId: args.roleId,
        recordConversationMessage: false,
        requireAllDeliveries: true,
        postedReceipts,
        onPosted: receipt => {
          slackMessageTs = receipt.slackMessageTs;
          return saveReceipts({ [receipt.channelId]: receipt });
        },
        ...(message.metadata?.companyUpdatePresentation?.blocks ? {
          blocks: [
            ...(message.metadata.companyUpdateReply ? [{ type: "section", text: { type: "mrkdwn", text: markdownToSlackMrkdwn(message.metadata.companyUpdateReply) } }] : []),
            ...message.metadata.companyUpdatePresentation.blocks,
          ],
        } : {}),
      });
    }
    const result = await admin
      .from("company_messages")
      .update({
        metadata: { ...message.metadata, contactEventSlackPosts: postedReceipts,
          contactEventSlackThreadIds: Array.from(new Set(Object.values(postedReceipts).map((receipt: any) => receipt.threadId).filter(Boolean))),
          contactEventSlackDelivered: delivered, contactEventSlackStatus: delivered ? "sent" : "not_configured", contactEventSlackMessageTs: slackMessageTs, contactEventSlackBotUserId: slackBotUserId },
      })
      .eq("id", message.id);
    if (result.error) throw result.error;
  }
  if (args.pendingRelayId) {
    const { error } = await admin.rpc("finalize_company_talent_relay_delivery_v1", {
      p_relay_id: args.pendingRelayId,
      p_slack_bot_user_id: slackBotUserId,
      p_slack_message_ts: slackMessageTs,
    });
    if (error) throw error;
  }
}
