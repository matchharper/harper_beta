import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { buildOrgHref } from "@/lib/org/routes";
import { validateCompanyContactContext } from "@/lib/companyTalentRequests/policy";
import {
  companyTalentRequestCandidateEmailWasSent,
  humanizeCompanyTalentRequestStatus,
  normalizeCompanyTalentRelayDeliveryStatus,
} from "@/lib/companyTalentRequests/status";
import type { CompanyTalentRelayDeliveryStatus } from "@/lib/companyTalentRequests/status";
import { resolveCompanyLogoUrl } from "@/lib/imageUrl";

export { validateCompanyContactContext } from "@/lib/companyTalentRequests/policy";
export { serializeTalentPendingRequest } from "@/lib/companyTalentRequests/presentation";
export { humanizeCompanyTalentRequestStatus } from "@/lib/companyTalentRequests/status";

type UntypedAdmin = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<any>;
};

export const COMPANY_TALENT_REQUEST_ACTIVE_STATUSES = [
  "queued",
  "awaiting_talent",
  "relay_queued",
  "review_required",
] as const;

export const COMPANY_TALENT_REQUEST_TRACKED_STATUSES = [
  "draft",
  ...COMPANY_TALENT_REQUEST_ACTIVE_STATUSES,
  "failed",
] as const;

export type CompanyTalentRequestRow = {
  approved_at: string | null;
  id: string;
  company_workspace_id: string;
  contact_kind: "contact" | "question" | "resume";
  contact_purpose: "request" | "deliver";
  delivery_body: string | null;
  delivery_subject: string | null;
  role_id: string;
  recommendation_id: string;
  talent_id: string;
  updated_at: string;
  expects_document: boolean;
  request_context: string;
  workflow_status: string;
  expires_at: string;
  document_id: string | null;
  draft_revision: number;
  created_at: string;
  intent: "candidate_reengagement" | "ordinary";
  in_reply_to_company_talent_relay_id?: string | null;
  response_disposition: "negative" | "other" | "positive" | null;
  resume_stage: string | null;
  talent_source_message_id?: number | null;
};

type CompanyTalentRequestReadRow = CompanyTalentRequestRow & {
  deliveries?: Array<{
    sent_at?: string | null;
    status?: string | null;
    type?: string | null;
  }> | null;
  role?: {
    expires_at?: string | null;
    is_expired?: boolean | null;
    name?: string | null;
    status?: string | null;
  } | null;
  workspace?: {
    company_db?: { logo?: string | null } | null;
    company_name?: string | null;
    logo_url?: string | null;
  } | null;
};

export function getCompanyTalentRequestLogoUrl(
  request: Pick<CompanyTalentRequestReadRow, "workspace">
) {
  return resolveCompanyLogoUrl({
    companyDbLogoUrl: request.workspace?.company_db?.logo,
    workspaceLogoUrl: request.workspace?.logo_url,
  });
}

function companyRequestRoleIsOpen(row: CompanyTalentRequestReadRow) {
  const status = normalizedText(row.role?.status, 80).toLowerCase();
  return (
    !["ended", "deleted"].includes(status) && row.role?.is_expired !== true
  );
}

function companyRequestStillActive(
  row: CompanyTalentRequestReadRow,
  awaitingTalentOnly: boolean
) {
  const hasResponse = Boolean(row.talent_source_message_id || row.document_id);
  const candidateDelivery = row.deliveries?.find(
    (delivery) => delivery.type === "company_request_candidate_delivery"
  );
  const candidateEmailSent = companyTalentRequestCandidateEmailWasSent({
    candidate_delivery_status: candidateDelivery?.status,
    candidate_sent_at: candidateDelivery?.sent_at,
    has_candidate_response: hasResponse,
    workflow_status: row.workflow_status,
  });
  if (awaitingTalentOnly) {
    return candidateEmailSent && !hasResponse && companyRequestRoleIsOpen(row);
  }
  const expiresAt = Date.parse(String(row.expires_at ?? ""));
  return candidateEmailSent
    ? companyRequestRoleIsOpen(row)
    : !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

export type EnqueuedCompanyTalentRequest = CompanyTalentRequestRow & {
  candidateDeliveryScheduledAt: string;
};

export type CompanyTalentRequestCancellationResult = {
  cancelledAt: string | null;
  idempotent: boolean;
  requestId: string;
  status: "cancelled";
};

export type CompanyTalentRequestChangeResult =
  | CompanyTalentRequestCancellationResult
  | {
      idempotent: boolean;
      requestId: string;
      scheduledAt: string;
      status: "immediate";
    };

export type CompanyTalentContactDraft = CompanyTalentRequestRow & {
  candidateName?: string | null;
  roleName?: string | null;
};

function normalizedText(value: unknown, maxLength = 800) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizedRelayContent(value: unknown, maxLength = 5_000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function fetchRequestedIntroContactTarget(args: {
  admin: UntypedAdmin;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin
    .from("company_intro_candidates")
    .select("recommendation_id, candidate_sent_at, status")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .eq("talent_id", args.talentId)
    .eq("status", "awaiting_talent")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.recommendation_id || !data.candidate_sent_at) return null;
  const eligible = await args.admin.rpc("company_talent_pair_is_contactable_v1", {
    p_workspace_id: args.workspaceId, p_role_id: args.roleId,
    p_talent_id: args.talentId, p_recommendation_id: data.recommendation_id,
  });
  if (eligible.error) throw eligible.error;
  if (eligible.data !== true) return null;
  const talent = await args.admin.from("talent_users").select("email")
    .eq("user_id", args.talentId).maybeSingle();
  if (talent.error) throw talent.error;
  // Executor-only address: never returned by read_talent before sharing consent.
  return { recommendationId: String(data.recommendation_id), email: talent.data?.email ?? null };
}

export async function createCompanyTalentContactDraft(args: {
  admin: UntypedAdmin;
  body: string;
  contactPurpose: "request" | "deliver";
  id: string;
  recommendationId: string;
  requestContext: string;
  roleId: string;
  sourceCompanyMessageId: number;
  subject: string;
  talentId: string;
  workspaceId: string;
}) {
  const eligibility = await args.admin.rpc("company_talent_pair_is_contactable_v1", {
    p_workspace_id: args.workspaceId, p_role_id: args.roleId,
    p_talent_id: args.talentId, p_recommendation_id: args.recommendationId,
  });
  if (eligibility.error) throw eligibility.error;
  if (eligibility.data !== true) throw new Error("company_talent_request_target_not_active");
  const context = validateCompanyContactContext(args.requestContext);
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .insert({
      company_workspace_id: args.workspaceId,
      contact_kind: "contact",
      contact_purpose: args.contactPurpose,
      delivery_body: args.body.trim(),
      delivery_subject: normalizedText(args.subject, 180),
      draft_revision: 1,
      expects_document: false,
      id: args.id,
      intent: "ordinary",
      recommendation_id: args.recommendationId,
      request_context: context,
      resume_stage: null,
      role_id: args.roleId,
      source_company_message_id: args.sourceCompanyMessageId,
      talent_id: args.talentId,
      workflow_status: "draft",
    })
    .select(
      "id, company_workspace_id, contact_kind, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, intent, resume_stage, response_disposition"
    )
    .single();
  if (error) throw error;
  return data as CompanyTalentRequestRow;
}

export async function fetchCompanyTalentContact(args: {
  admin: UntypedAdmin;
  requestId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .select(
      "id, company_workspace_id, contact_kind, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, intent, resume_stage, response_disposition, role:company_roles(name), talent:talent_users(name, email)"
    )
    .eq("id", args.requestId)
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as CompanyTalentRequestRow & {
    role?: { name?: string | null } | null;
    talent?: { email?: string | null; name?: string | null } | null;
  };
  return {
    ...row,
    candidateName: normalizedText(row.talent?.name, 160) || null,
    roleName: normalizedText(row.role?.name, 160) || null,
    talentEmail: normalizedText(row.talent?.email, 320) || null,
  };
}

export async function reviseCompanyTalentContactDraft(args: {
  admin: UntypedAdmin;
  body: string;
  contactPurpose?: "request" | "deliver";
  expectedRevision: number;
  requestContext: string;
  requestId: string;
  subject: string;
  workspaceId: string;
}) {
  const context = validateCompanyContactContext(args.requestContext);
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .update({
      delivery_body: args.body.trim(),
      delivery_subject: normalizedText(args.subject, 180),
      draft_revision: args.expectedRevision + 1,
      request_context: context,
      ...(args.contactPurpose ? { contact_purpose: args.contactPurpose } : {}),
    })
    .eq("id", args.requestId)
    .eq("company_workspace_id", args.workspaceId)
    .eq("workflow_status", "draft")
    .eq("draft_revision", args.expectedRevision)
    .gt("expires_at", new Date().toISOString())
    .select(
      "id, company_workspace_id, contact_kind, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, intent, resume_stage, response_disposition"
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("company_talent_request_draft_stale");
  return data as CompanyTalentRequestRow;
}

export async function scheduleCompanyTalentContact(args: {
  admin: UntypedAdmin;
  deliveryMode: "standard" | "immediate";
  expectedRevision: number;
  requestId: string;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin.rpc(
    "schedule_company_talent_request_v1",
    {
      p_delivery_mode: args.deliveryMode,
      p_expected_revision: args.expectedRevision,
      p_request_id: args.requestId,
      p_role_id: args.roleId,
      p_talent_id: args.talentId,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  return data as {
    requestId: string;
    revision: number;
    scheduledAt: string;
    status: "immediate" | "queued";
  };
}

export async function cancelCompanyTalentRequest(args: {
  admin: UntypedAdmin;
  requestId: string;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin.rpc(
    "cancel_company_talent_request_v1",
    {
      p_request_id: args.requestId,
      p_role_id: args.roleId,
      p_talent_id: args.talentId,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  return data as CompanyTalentRequestCancellationResult;
}

export async function changeCompanyTalentRequest(args: {
  action: "cancel" | "immediate";
  admin: UntypedAdmin;
  requestId: string;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin.rpc(
    "change_company_talent_request_v1",
    {
      p_action: args.action,
      p_request_id: args.requestId,
      p_role_id: args.roleId,
      p_talent_id: args.talentId,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  return data as CompanyTalentRequestChangeResult;
}

export async function fetchActiveCompanyTalentRequest(args: {
  admin: UntypedAdmin;
  awaitingTalentOnly?: boolean;
  requestOnly?: boolean;
  requestId?: string | null;
  talentId: string;
}) {
  const statuses = args.awaitingTalentOnly
    ? ["awaiting_talent", "closed"]
    : [...COMPANY_TALENT_REQUEST_ACTIVE_STATUSES];
  let query = args.admin
    .from("company_talent_requests")
    .select(
      "id, company_workspace_id, contact_kind, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, talent_source_message_id, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, intent, resume_stage, response_disposition, deliveries:contact_queue(sent_at, status, type), role:company_roles!inner(name, status, is_expired, expires_at), workspace:company_workspace!inner(company_name, logo_url, company_db:company_db(logo))"
    )
    .eq("talent_id", args.talentId)
    .order("created_at", { ascending: false })
    .limit(args.requestId ? 1 : 30);
  if (!args.requestId) query = query.in("workflow_status", statuses);
  if (args.requestOnly) query = query.eq("contact_purpose", "request");
  if (args.requestId) query = query.eq("id", args.requestId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (
    Array.isArray(data) ? data : []
  ) as CompanyTalentRequestReadRow[];
  const candidates =
    args.awaitingTalentOnly && !args.requestId
      ? await companyContactsSinceLastCandidateContact(args.admin, rows)
      : rows;
  return (
    candidates.find((row) =>
      args.requestId
        ? row.deliveries?.some(
            (delivery) =>
              delivery.type === "company_request_candidate_delivery" &&
              delivery.status === "sent" &&
              Boolean(delivery.sent_at)
          )
        : companyRequestStillActive(row, args.awaitingTalentOnly === true)
    ) ?? null
  );
}

export async function fetchActiveCompanyTalentRequests(args: {
  admin: UntypedAdmin;
  awaitingTalentOnly?: boolean;
  requestOnly?: boolean;
  limit?: number;
  talentId: string;
}) {
  const statuses = args.awaitingTalentOnly
    ? ["awaiting_talent", "closed"]
    : [...COMPANY_TALENT_REQUEST_ACTIVE_STATUSES];
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 30))
      : 20;
  let query = args.admin
    .from("company_talent_requests")
    .select(
      "id, company_workspace_id, contact_kind, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, talent_source_message_id, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, intent, resume_stage, response_disposition, deliveries:contact_queue(sent_at, status, type), role:company_roles!inner(name, status, is_expired, expires_at), workspace:company_workspace!inner(company_name, logo_url, company_db:company_db(logo))"
    )
    .eq("talent_id", args.talentId)
    .in("workflow_status", statuses)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 3, 90));
  if (args.requestOnly) query = query.eq("contact_purpose", "request");
  const { data, error } = await query;
  if (error) throw error;
  const rows = (
    Array.isArray(data) ? data : []
  ) as CompanyTalentRequestReadRow[];
  const candidates = args.awaitingTalentOnly
    ? await companyContactsSinceLastCandidateContact(args.admin, rows)
    : rows;
  return candidates
    .filter((row) =>
      companyRequestStillActive(row, args.awaitingTalentOnly === true)
    )
    .slice(0, limit);
}

// A reminder is a chronological inbox view, not a claim that a particular
// question was semantically answered. No requestId or answer classifier needed.
async function companyContactsSinceLastCandidateContact(
  admin: UntypedAdmin,
  contacts: CompanyTalentRequestReadRow[]
) {
  if (!contacts.length) return contacts;
  const { data, error } = await admin
    .from("company_talent_relays")
    .select("recommendation_id,created_at")
    .in("recommendation_id", [
      ...new Set(contacts.map((contact) => contact.recommendation_id)),
    ])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return contacts.filter((contact) => {
    const sentAt = contact.deliveries?.find(
      (delivery) => delivery.type === "company_request_candidate_delivery"
    )?.sent_at;
    return (
      !sentAt ||
      !(data ?? []).some(
        (relay: any) =>
          relay.recommendation_id === contact.recommendation_id &&
          relay.created_at >= sentAt
      )
    );
  });
}

export type RelayableCompanyTalentConnection = {
  companyName: string;
  connectionId: string;
  establishedAt: string;
  latestCompanyContactAt: string | null;
  latestRelayAt: string | null;
  latestRelayStatus: CompanyTalentRelayDeliveryStatus | null;
  origin: "company_contact" | "company_request_intro" | "harper_recommendation";
  recommendationId: string;
  roleName: string;
  positionState: string;
  recentContacts: Array<{
    direction: "company_to_talent" | "talent_to_company";
    at: string;
    content: string;
    // null is a verified no-document relay; undefined means not supplied.
    documentId?: string | null;
  }>;
};

export async function fetchRelayableCompanyTalentConnections(args: {
  admin: UntypedAdmin;
  limit?: number;
  query?: string | null;
  talentId: string;
}) {
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 30))
      : 20;
  const { data: recommendations, error: recommendationError } = await args.admin
    .from("talent_opportunity_recommendation")
    .select(
      "id, role_id, saved_stage, processed_stage, opportunity_type, feedback, feedback_at, created_at, role:company_roles!inner(name, status, is_expired, information, company_workspace_id, workspace:company_workspace!inner(company_name))"
    )
    .eq("talent_id", args.talentId)
    .or("feedback.eq.like,opportunity_type.eq.intro_request")
    .in("opportunity_type", ["internal_recommendation", "intro_request"])
    .order("feedback_at", { ascending: false })
    .limit(Math.min(limit * 8, 240));
  if (recommendationError) throw recommendationError;

  const recommendationRows = Array.isArray(recommendations)
    ? (recommendations as any[])
    : [];
  const recommendationIds = recommendationRows
    .map((row) => normalizedText(row.id, 120))
    .filter(Boolean);
  const roleIds = Array.from(
    new Set(
      recommendationRows
        .map((row) => normalizedText(row.role_id, 120))
        .filter(Boolean)
    )
  );
  if (recommendationIds.length === 0 || roleIds.length === 0) return [];

  const [tagResult, introResult, requestResult, relayResult, progressResult] =
    await Promise.all([
      args.admin
        .from("talent_opportunity_tag")
        .select("opportunity_id, tag, updated_at")
        .eq("talent_id", args.talentId)
        .in("opportunity_id", roleIds)
        .order("updated_at", { ascending: false }),
      args.admin
        .from("company_intro_candidates")
        .select(
          "recommendation_id, status, candidate_sent_at, requested_at, talent_decision_at, connected_at, updated_at"
        )
        .eq("talent_id", args.talentId)
        .in("recommendation_id", recommendationIds)
        .in("status", ["awaiting_talent", "connecting", "connected"]),
      args.admin
        .from("company_talent_requests")
        .select(
          "id, recommendation_id, delivery_body, created_at, deliveries:contact_queue(sent_at,status,type)"
        )
        .eq("talent_id", args.talentId)
        .in("recommendation_id", recommendationIds)
        .order("created_at", { ascending: false }),
      args.admin
        .from("company_talent_relays")
        .select(
          "id, recommendation_id, relay_content, document_id, created_at, deliveries:contact_queue(type,status,sent_at,updated_at)"
        )
        .in("recommendation_id", recommendationIds)
        .order("created_at", { ascending: false }),
      args.admin
        .from("talent_progress")
        .select("recommendation_id, created_at, metadata")
        .eq("talent_id", args.talentId)
        .eq("kind", "org_stage_change")
        .in("recommendation_id", recommendationIds)
        .order("created_at", { ascending: false }),
    ]);
  if (tagResult.error) throw tagResult.error;
  if (introResult.error) throw introResult.error;
  if (requestResult.error) throw requestResult.error;
  if (relayResult.error) throw relayResult.error;
  if (progressResult.error) throw progressResult.error;

  const latestCompanyVisibleTagByRoleId = new Map<string, any>();
  for (const row of Array.isArray(tagResult.data) ? tagResult.data : []) {
    const roleId = normalizedText((row as any).opportunity_id, 120);
    if (!roleId || latestCompanyVisibleTagByRoleId.has(roleId)) continue;
    const tag = normalizedText((row as any).tag, 160);
    if (
      ["내부:연결대기", "내부:연결됨", "내부:최종오퍼"].includes(tag) ||
      tag.startsWith("내부단계:")
    ) {
      latestCompanyVisibleTagByRoleId.set(roleId, row);
    }
  }

  const introByRecommendationId = new Map<string, any>();
  for (const row of Array.isArray(introResult.data) ? introResult.data : []) {
    const recommendationId = normalizedText(
      (row as any).recommendation_id,
      120
    );
    if (recommendationId && !introByRecommendationId.has(recommendationId)) {
      introByRecommendationId.set(recommendationId, row);
    }
  }

  const sentRequestsByRecommendationId = new Map<string, any[]>();
  for (const row of Array.isArray(requestResult.data)
    ? requestResult.data
    : []) {
    const recommendationId = normalizedText(
      (row as any).recommendation_id,
      120
    );
    const sentDelivery = Array.isArray((row as any).deliveries)
      ? (row as any).deliveries.find(
          (delivery: any) =>
            delivery?.type === "company_request_candidate_delivery" &&
            delivery?.status === "sent" &&
            delivery?.sent_at
        )
      : null;
    if (!recommendationId || !sentDelivery) continue;
    const rows = sentRequestsByRecommendationId.get(recommendationId) ?? [];
    rows.push({ ...row, sentAt: sentDelivery.sent_at });
    sentRequestsByRecommendationId.set(recommendationId, rows);
  }

  const relaysByRecommendationId = new Map<string, any[]>();
  for (const row of Array.isArray(relayResult.data) ? relayResult.data : []) {
    const recommendationId = normalizedText(
      (row as any).recommendation_id,
      120
    );
    if (!recommendationId) continue;
    const rows = relaysByRecommendationId.get(recommendationId) ?? [];
    rows.push(row);
    relaysByRecommendationId.set(recommendationId, rows);
  }

  const companySharedAtByRecommendationId = new Map<string, string>();
  for (const row of Array.isArray(progressResult.data)
    ? progressResult.data
    : []) {
    const recommendationId = normalizedText(
      (row as any).recommendation_id,
      120
    );
    const metadata =
      (row as any).metadata && typeof (row as any).metadata === "object"
        ? (row as any).metadata
        : {};
    const stage = normalizedText(metadata.stage, 160);
    const isCompanyVisibleStage =
      ["pending_connection", "connected", "final_offer"].includes(stage) ||
      stage.startsWith("custom:");
    if (
      recommendationId &&
      isCompanyVisibleStage &&
      !companySharedAtByRecommendationId.has(recommendationId)
    ) {
      companySharedAtByRecommendationId.set(
        recommendationId,
        normalizedText((row as any).created_at, 100)
      );
    }
  }

  const query = normalizedText(args.query, 200).toLocaleLowerCase();
  return recommendationRows
    .filter((row: any) => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      const information =
        role?.information && typeof role.information === "object"
          ? role.information
          : {};
      return (
        information.testOnly !== true ||
        (Array.isArray(information.testTalentIds) &&
          information.testTalentIds.includes(args.talentId))
      );
    })
    .map((row: any): RelayableCompanyTalentConnection | null => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      const workspace = Array.isArray(role?.workspace)
        ? role.workspace[0]
        : role?.workspace;
      const recommendationId = normalizedText(row.id, 120);
      const roleId = normalizedText(row.role_id, 120);
      const intro = introByRecommendationId.get(recommendationId) ?? null;
      const companyVisibleTag =
        latestCompanyVisibleTagByRoleId.get(roleId) ?? null;
      const sentRequests =
        sentRequestsByRecommendationId.get(recommendationId) ?? [];
      // Correspondence does not imply acceptance. The RPC rechecks at write.
      if (row.feedback !== "like" && !(
        intro?.status === "awaiting_talent" && intro.candidate_sent_at &&
        sentRequests.length > 0 && !["ended", "deleted"].includes(role?.status) && !role?.is_expired
      )) return null;
      const companySharedAt =
        companySharedAtByRecommendationId.get(recommendationId) ?? null;
      if (
        !intro &&
        !companyVisibleTag &&
        !companySharedAt &&
        sentRequests.length === 0
      )
        return null;
      const latestRelay =
        (relaysByRecommendationId.get(recommendationId) ?? [])[0] ?? null;
      const latestRelayDelivery = Array.isArray(latestRelay?.deliveries)
        ? [...latestRelay.deliveries]
            .filter((delivery: any) =>
              [
                "company_contact_company_delivery",
                "company_request_company_delivery",
              ].includes(normalizedText(delivery?.type, 120))
            )
            .sort((left: any, right: any) =>
              normalizedText(right?.updated_at, 100).localeCompare(
                normalizedText(left?.updated_at, 100)
              )
            )[0]
        : null;
      const latestCompanyContactAt = sentRequests
        .map((request) => normalizedText(request.sentAt, 100))
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left))[0];
      const origin =
        normalizedText(row.opportunity_type, 80) === "intro_request"
          ? "company_request_intro"
          : companyVisibleTag || companySharedAt
            ? "harper_recommendation"
            : "company_contact";
      const establishedAt =
        normalizedText(intro?.connected_at, 100) ||
        normalizedText(intro?.talent_decision_at, 100) ||
        normalizedText(companyVisibleTag?.updated_at, 100) ||
        companySharedAt ||
        latestCompanyContactAt ||
        normalizedText(row.feedback_at, 100) ||
        normalizedText(row.created_at, 100);
      return {
        companyName:
          normalizedText(workspace?.company_name, 160) || "채용 회사",
        connectionId: `recommendation:${recommendationId}`,
        establishedAt,
        latestCompanyContactAt: latestCompanyContactAt || null,
        latestRelayAt: latestRelay
          ? normalizedText(latestRelay.created_at, 100) || null
          : null,
        latestRelayStatus: latestRelay
          ? normalizeCompanyTalentRelayDeliveryStatus(
              latestRelayDelivery?.status
            )
          : null,
        origin,
        recommendationId,
        roleName: normalizedText(role?.name, 160) || "해당 역할",
        positionState:
          row.saved_stage === "closed"
            ? "closed"
            : normalizedText(row.processed_stage, 100),
        recentContacts: [
          ...sentRequests.map((contact: any) => ({
            direction: "company_to_talent" as const,
            at: contact.sentAt,
            content: String(contact.delivery_body ?? "").slice(0, 1200),
          })),
          ...(relaysByRecommendationId.get(recommendationId) ?? []).map(
            (contact: any) => ({
              direction: "talent_to_company" as const,
              at: contact.created_at,
              content: String(contact.relay_content ?? "").slice(0, 1200),
              documentId: contact.document_id === null
                ? null : normalizedText(contact.document_id, 120) || undefined,
            })
          ),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 4)
          .reverse(),
      };
    })
    .filter(
      (
        connection: RelayableCompanyTalentConnection | null
      ): connection is RelayableCompanyTalentConnection => Boolean(connection)
    )
    .filter((connection) => {
      if (!query) return true;
      const searchable =
        `${connection.companyName} ${connection.roleName}`.toLocaleLowerCase();
      return query.split(/\s+/).every((term) => searchable.includes(term));
    })
    .slice(0, limit);
}

export function formatRelayableCompanyTalentConnections(
  connections: RelayableCompanyTalentConnection[]
) {
  if (connections.length === 0) {
    return "Harper를 통해 상호 연결된 회사와 역할을 찾지 못했습니다.";
  }
  return [
    `전달 가능한 상호 연결 ${connections.length}건`,
    ...connections.map((connection, index) => {
      const latestRelay = connection.latestRelayStatus
        ? `${connection.latestRelayStatus} · ${connection.latestRelayAt || "시점 미상"}`
        : "없음";
      return [
        `${index + 1}. ${connection.companyName} · ${connection.roleName}`,
        `   연결 ID: ${connection.connectionId}`,
        `   현재 포지션 상태: ${connection.positionState}`,
        `   연결 경로: ${connection.origin}`,
        `   상호 연결 확인 시점: ${connection.establishedAt || "-"}`,
        `   최근 회사→후보자 연락: ${connection.latestCompanyContactAt || "없음"}`,
        `   최근 후보자→회사 relay: ${latestRelay}`,
        ...connection.recentContacts.map(
          (contact) =>
            `   ${contact.at} ${contact.direction}: ${contact.content}${
              contact.direction === "talent_to_company" && contact.documentId !== undefined
                ? contact.documentId
                  ? ` (이 연락에 공유된 이력서 ID: ${contact.documentId})`
                  : " (이 연락에 공유된 이력서 없음)"
                : ""
            }`
        ),
      ].join("\n");
    }),
  ].join("\n");
}

function tokenSecret() {
  const secret =
    process.env.COMPANY_TALENT_REQUEST_TOKEN_SECRET ||
    process.env.EMAIL_REPLY_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new Error("Company talent request token secret is missing");
  return secret;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createCompanyTalentResumeUploadToken(args: {
  requestId: string;
  talentId: string;
  ttlSeconds?: number;
}) {
  const payload = base64Url(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + (args.ttlSeconds ?? 90 * 86400),
      requestId: args.requestId,
      talentId: args.talentId,
      version: 1,
    })
  );
  const signature = createHmac("sha256", tokenSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyCompanyTalentResumeUploadToken(value: unknown) {
  const token = String(value ?? "").trim();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", tokenSecret()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (
      parsed?.version !== 1 ||
      typeof parsed.requestId !== "string" ||
      typeof parsed.talentId !== "string" ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return parsed as {
      exp: number;
      requestId: string;
      talentId: string;
      version: 1;
    };
  } catch {
    return null;
  }
}

export async function finalizeRequestedResumeUpload(args: {
  admin: UntypedAdmin;
  contentType: string | null;
  conversationId: string;
  extractedText?: string | null;
  fileName: string;
  requestId: string;
  sizeBytes: number;
  storagePath: string;
  talentId: string;
}) {
  const { data, error } = await args.admin.rpc(
    "finalize_talent_resume_upload_v1",
    {
      p_content_type: args.contentType,
      p_conversation_id: args.conversationId,
      p_extracted_text: args.extractedText ?? null,
      p_file_name: normalizedText(args.fileName, 300),
      p_request_id: args.requestId,
      p_size_bytes: args.sizeBytes,
      p_storage_path: args.storagePath,
      p_talent_id: args.talentId,
    }
  );
  if (error) throw error;
  return data as {
    documentId: string;
    relayId?: string;
    idempotent: boolean;
    messageId: number;
    requestId: string;
  };
}

export async function finalizeEmailedCompanyTalentResumeRelay(args: {
  admin: UntypedAdmin;
  contentType: string | null;
  extractedText?: string | null;
  fileName: string;
  relayContent?: string | null;
  requestId: string;
  sizeBytes: number;
  sourceMessageId: number;
  storagePath: string;
  talentId: string;
}) {
  const { data, error } = await args.admin.rpc(
    "finalize_company_talent_resume_relay_v1",
    {
      p_content_type: args.contentType,
      p_extracted_text: args.extractedText ?? null,
      p_file_name: normalizedText(args.fileName, 300),
      p_relay_content: normalizedRelayContent(args.relayContent, 5_000) || null,
      p_request_id: args.requestId,
      p_size_bytes: args.sizeBytes,
      p_source_message_id: args.sourceMessageId,
      p_storage_path: args.storagePath,
      p_talent_id: args.talentId,
    }
  );
  if (error) throw error;
  return data as {
    documentId: string;
    idempotent: boolean;
    messageId: number;
    relayId: string;
    requestId: string;
  };
}

async function candidateAuthoredMessage(args: {
  admin: UntypedAdmin;
  messageId: number;
  talentId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_messages")
    .select("id, content, role, message_type")
    .eq("id", args.messageId)
    .eq("user_id", args.talentId)
    .eq("role", "user")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.message_type === "resume_upload_note") {
    throw new Error("Candidate-authored source message not found");
  }
  const evidence = normalizedText(data.content, 1_200);
  if (!evidence) throw new Error("Candidate answer is empty");
  return evidence;
}

export async function createCompanyTalentRelay(args: {
  admin: UntypedAdmin;
  connectionId?: string;
  documentId?: string;
  relayContent: string;
  requestId?: string;
  sourceMessageId: number;
  talentId: string;
}) {
  await candidateAuthoredMessage({
    admin: args.admin,
    messageId: args.sourceMessageId,
    talentId: args.talentId,
  });
  const relayContent = normalizedRelayContent(args.relayContent, 5_000);
  if (!relayContent) throw new Error("Company relay content is empty");
  const connectionId = normalizedText(args.connectionId, 180);
  let recommendationId = connectionId.startsWith("recommendation:")
    ? connectionId.slice("recommendation:".length)
    : "";
  if (!args.requestId && !recommendationId) {
    throw new Error("Company connection identifier is missing");
  }
  if (args.requestId) {
    const { data: contact, error } = await args.admin
      .from("company_talent_requests")
      .select("recommendation_id")
      .eq("id", args.requestId)
      .eq("talent_id", args.talentId)
      .maybeSingle();
    if (error) throw error;
    if (
      !contact ||
      (recommendationId && contact.recommendation_id !== recommendationId)
    ) {
      throw new Error("Company contact does not belong to this connection");
    }
    recommendationId = contact.recommendation_id;
  }
  const { data, error } = await args.admin.rpc(
    "create_company_talent_relay_v2",
    {
      p_document_id: args.documentId ?? null,
      p_recommendation_id: recommendationId,
      p_relay_content: relayContent,
      p_request_id: args.requestId ?? null,
      p_source_message_id: args.sourceMessageId,
      p_talent_id: args.talentId,
    }
  );
  if (error) throw error;
  const result = data as {
    connectionId?: string;
    contentMismatch?: boolean;
    firstResponse?: boolean;
    id: string;
    idempotent: boolean;
    recommendationId?: string;
    requestId?: string | null;
    status: string;
  };
  console.info("[company-talent-relay] accepted", {
    contentMismatch: Boolean(result.contentMismatch),
    connectionId: result.connectionId,
    idempotent: Boolean(result.idempotent),
    relayId: result.id,
    requestId: result.requestId ?? null,
  });
  const { deliverCompanyTalentRelay } = await import("./delivery");
  await deliverCompanyTalentRelay({
    admin: args.admin as any,
    relayId: result.id,
  });
  return { ...result, status: "sent" };
}

export async function fetchTalentCompanyContactContext(args: {
  admin: UntypedAdmin;
  talentId: string;
}) {
  const connections = await fetchRelayableCompanyTalentConnections({
    ...args,
    limit: 10,
  });
  if (!connections.length) return null;
  return [
    "[Company connections and recent contacts — private context]",
    "This is a contact history index, NOT an unanswered-question list. Follow the user's current message; do not assume they mean the latest company contact or a closed Role. Use read_company_connections for more detail or another connection. Never reveal IDs.",
    "Use contact_company with the exact connectionId and only candidate-authorized content. The company agent interprets replies against earlier contacts after delivery; you do not need to match a requestId or classify an answer. Do not infer company decisions.",
    formatRelayableCompanyTalentConnections(
      connections.map((connection) => ({
        ...connection,
        recentContacts: connection.recentContacts.slice(-2).map((contact) => ({
          ...contact,
          content: contact.content.slice(0, 400),
        })),
      }))
    ),
  ].join("\n");
}

export async function fetchCompanyTalentRelayReplyTarget(args: {
  admin: UntypedAdmin;
  relayId: string;
  workspaceId: string;
}) {
  const { data: relay, error: relayError } = await args.admin
    .from("company_talent_relays")
    .select("id, recommendation_id")
    .eq("id", args.relayId)
    .maybeSingle();
  if (relayError) throw relayError;
  if (!relay) return null;

  const { data: recommendation, error: recommendationError } = await args.admin
    .from("talent_opportunity_recommendation")
    .select("id, role_id, talent_id")
    .eq("id", relay.recommendation_id)
    .maybeSingle();
  if (recommendationError) throw recommendationError;
  if (!recommendation) return null;

  const [
    { data: role, error: roleError },
    { data: talent, error: talentError },
  ] = await Promise.all([
    args.admin
      .from("company_roles")
      .select("role_id, name, company_workspace_id, information")
      .eq("role_id", recommendation.role_id)
      .eq("company_workspace_id", args.workspaceId)
      .maybeSingle(),
    args.admin
      .from("talent_users")
      .select("user_id, name, email")
      .eq("user_id", recommendation.talent_id)
      .maybeSingle(),
  ]);
  if (roleError) throw roleError;
  if (talentError) throw talentError;
  if (!role || !talent) return null;

  const information =
    role.information && typeof role.information === "object"
      ? role.information
      : {};
  if (
    information.testOnly === true &&
    (!Array.isArray(information.testTalentIds) ||
      !information.testTalentIds.includes(recommendation.talent_id))
  ) {
    return null;
  }

  return {
    candidateEmail: normalizedText(talent.email, 320) || null,
    candidateName: normalizedText(talent.name, 160) || "후보자분",
    recommendationId: normalizedText(recommendation.id, 120),
    relayId: normalizedText(relay.id, 120),
    roleId: normalizedText(role.role_id, 120),
    roleName: normalizedText(role.name, 160) || "해당 역할",
    talentId: normalizedText(talent.user_id, 120),
  };
}

// Look up the durable result before regenerating copy or treating a retry as a
// competing request. The database remains the atomic authority for races.
export async function fetchCompanyTalentContactBySource(args: {
  admin: UntypedAdmin; workspaceId: string; roleId: string; talentId: string;
  sourceCompanyMessageId: number;
}) {
  const { data, error } = await args.admin.from("company_talent_requests")
    .select("id, workflow_status, delivery_body, deliveries:contact_queue(type, status, scheduled_at)")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .eq("talent_id", args.talentId)
    .eq("source_company_message_id", args.sourceCompanyMessageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const delivery = data.deliveries?.find((item: { type: string }) => item.type === "company_request_candidate_delivery");
  return {
    requestId: String(data.id), status: delivery?.status ?? data.workflow_status,
    scheduledAt: delivery?.scheduled_at ?? null, body: data.delivery_body,
    idempotent: true as const,
  };
}

export async function sendCompanyTalentContact(args: {
  admin: UntypedAdmin; id: string; workspaceId: string; roleId: string; talentId: string;
  contactPurpose: "request" | "deliver";
  recommendationId: string; sourceCompanyMessageId: number;
  subject: string; body: string; requestContext: string;
}) {
  const { data, error } = await args.admin.rpc("send_company_talent_contact_v2", {
    p_request_id: args.id, p_workspace_id: args.workspaceId, p_role_id: args.roleId,
    p_talent_id: args.talentId, p_recommendation_id: args.recommendationId,
    p_source_company_message_id: args.sourceCompanyMessageId,
    p_subject: args.subject, p_body: args.body, p_request_context: validateCompanyContactContext(args.requestContext),
    p_contact_purpose: args.contactPurpose,
  });
  if (error) throw error;
  return data as { requestId: string; status: string; scheduledAt: string | null; idempotent: boolean };
}

export async function sendCompanyTalentRelayReply(args: {
  admin: UntypedAdmin;
  body: string;
  contactPurpose: "request" | "deliver";
  relayId: string;
  requestContext: string;
  sourceCompanyMessageId: number;
  subject: string;
  workspaceId: string;
}) {
  const requestContext = normalizedText(args.requestContext, 800);
  const body = args.body.trim();
  const subject = normalizedText(args.subject, 180);
  if (!body || !subject || !requestContext) {
    throw new Error("Company relay reply copy is empty");
  }
  const { data, error } = await args.admin.rpc(
    "send_company_talent_relay_reply_v2",
    {
      p_body: body,
      p_relay_id: args.relayId,
      p_request_context: requestContext,
      p_source_company_message_id: args.sourceCompanyMessageId,
      p_subject: subject,
      p_contact_purpose: args.contactPurpose,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  return data as {
    idempotent: boolean;
    relayId: string;
    requestId: string;
    scheduledAt: string;
    status: "queued" | string;
  };
}

export function buildCompanyTalentProfileHref(args: {
  recommendationId: string;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  return buildOrgHref({
    detail: {
      recommendationId: args.recommendationId,
      roleId: args.roleId,
      talentId: args.talentId,
      workspaceId: args.workspaceId,
    },
    page: "role",
    roleId: args.roleId,
    tab: "pipeline",
    view: "pipeline",
  });
}
