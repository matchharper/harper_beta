import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  sendHarperSlackThreadReply,
  sendHarperWorkspaceSlackMessage,
} from "@/lib/org/slackHarper";

/** Read durable contacts on demand; never persist an intermediate model judgment. */
export async function loadCompanyContactEventContext(args: {
  relayId: string;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin() as any;
  const { data: relay, error } = await admin
    .from("company_talent_relays")
    .select(
      "id, recommendation_id, company_talent_request_id, source_talent_message_id, relay_content, document_id, created_at, deliveries:contact_queue(type,status,sent_at)"
    )
    .eq("id", args.relayId)
    .single();
  if (error) throw error;
  if (
    !relay.deliveries?.some(
      (item: any) =>
        item.type === "company_contact_company_delivery" &&
        item.status === "sent" &&
        item.sent_at
    )
  ) {
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
    "id, request_context, delivery_body, created_at, source:company_messages!company_talent_requests_source_company_message_id_fkey(content,role,message_type,company_user_id), deliveries:contact_queue(type,status,sent_at)";
  const [
    contacts,
    previousRelays,
    sourceMessage,
    addressedContact,
    subsequentRelays,
  ] = await Promise.all([
    admin
      .from("company_talent_requests")
      .select(contactFields)
      .eq("recommendation_id", relay.recommendation_id)
      .lte("created_at", relay.created_at)
      .order("created_at", { ascending: false })
      .limit(4),
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
      ? admin
          .from("company_talent_requests")
          .select(contactFields)
          .eq("id", relay.company_talent_request_id)
          .eq("recommendation_id", relay.recommendation_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("company_talent_relays")
      .select("id,relay_content,document_id,created_at")
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
    ).sort((a: any, b: any) =>
      String(a.created_at).localeCompare(String(b.created_at))
    ),
    precedingCandidateContacts: (previousRelays.data ?? []).reverse(),
    subsequentCandidateContacts: (subsequentRelays.data ?? []).reverse(),
  };
}

/** Terminal messages are reused by the ordinary job runner on retry. */
export async function deliverCompanyContactEventMessages(args: {
  jobId: string;
  messageIds: Array<number | null>;
  roleId: string | null;
  slackThreadId: string | null;
  workspaceId: string;
}) {
  const ids = args.messageIds.filter((id): id is number => id !== null);
  if (!ids.length) return;
  const admin = getSupabaseAdmin() as any;
  const { data, error } = await admin
    .from("company_messages")
    .select("id,content,metadata")
    .in("id", ids)
    .eq("company_workspace_id", args.workspaceId)
    .contains("metadata", { webActionJobId: args.jobId })
    .order("id");
  if (error) throw error;
  for (const message of data ?? []) {
    if (message.metadata?.contactEventSlackDelivered === true) continue;
    const common = {
      idempotencyKey: `candidate-contact-turn:${args.jobId}:${message.id}`,
      text: message.content,
      workspaceId: args.workspaceId,
    };
    if (args.slackThreadId) {
      await sendHarperSlackThreadReply({
        ...common,
        threadId: args.slackThreadId,
      });
    } else {
      await sendHarperWorkspaceSlackMessage({
        ...common,
        roleId: args.roleId,
        recordConversationMessage: false,
      });
    }
    const result = await admin
      .from("company_messages")
      .update({
        metadata: { ...message.metadata, contactEventSlackDelivered: true },
      })
      .eq("id", message.id);
    if (result.error) throw result.error;
  }
}
