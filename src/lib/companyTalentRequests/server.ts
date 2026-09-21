import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { buildOrgHref } from "@/lib/org/routes";
import { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";
import {
  companyTalentRequestBlocksNewContact,
  companyTalentRequestCandidateEmailWasSent,
  humanizeCompanyTalentRequestStatus,
  normalizeCompanyTalentRelayDeliveryStatus,
} from "@/lib/companyTalentRequests/status";
import type { CompanyTalentRelayDeliveryStatus } from "@/lib/companyTalentRequests/status";
import { resolveCompanyLogoUrl } from "@/lib/imageUrl";

export { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";
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

export const COMPANY_TALENT_REQUEST_BLOCKING_STATUSES = [
  "draft",
  "queued",
  "failed",
] as const;

export type CompanyTalentRequestRow = {
  approved_at: string | null;
  id: string;
  company_workspace_id: string;
  contact_kind: "contact" | "question" | "resume";
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
    const awaitsCandidateResponse = row.contact_kind !== "contact";
    return (
      candidateEmailSent &&
      !hasResponse &&
      companyRequestRoleIsOpen(row) &&
      awaitsCandidateResponse
    );
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

async function assertCompanyIntroRequestIsNotPending(args: {
  admin: UntypedAdmin;
  talentId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin
    .from("company_intro_candidates")
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("talent_id", args.talentId)
    .in("status", ["ready", "awaiting_talent", "connecting"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) throw new Error("company_intro_action_forbidden");
}

export async function createCompanyTalentContactDraft(args: {
  admin: UntypedAdmin;
  body: string;
  contactKind: "contact" | "question" | "resume";
  id: string;
  expectsDocument: boolean;
  intent?: "candidate_reengagement" | "ordinary";
  recommendationId: string;
  requestContext: string;
  resumeStage?: string | null;
  roleId: string;
  sourceCompanyMessageId: number;
  subject: string;
  talentId: string;
  workspaceId: string;
}) {
  if (args.expectsDocument !== (args.contactKind === "resume")) {
    throw new Error("company_talent_contact_kind_document_mismatch");
  }
  await assertCompanyIntroRequestIsNotPending(args);
  const context = assertSafeProfessionalQuestion(args.requestContext);
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .insert({
      company_workspace_id: args.workspaceId,
      contact_kind: args.contactKind,
      delivery_body: args.body.trim(),
      delivery_subject: normalizedText(args.subject, 180),
      draft_revision: 1,
      expects_document: args.expectsDocument,
      id: args.id,
      intent: args.intent ?? "ordinary",
      recommendation_id: args.recommendationId,
      request_context: context,
      resume_stage: args.resumeStage ?? null,
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
  expectedRevision: number;
  requestContext: string;
  requestId: string;
  subject: string;
  workspaceId: string;
}) {
  const context = assertSafeProfessionalQuestion(args.requestContext);
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .update({
      delivery_body: args.body.trim(),
      delivery_subject: normalizedText(args.subject, 180),
      draft_revision: args.expectedRevision + 1,
      request_context: context,
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

export async function enqueueCompanyTalentRequest(args: {
  admin: UntypedAdmin;
  deliveryMode?: "standard" | "immediate";
  expectsDocument: boolean;
  recommendationId: string;
  requestContext: string;
  roleId: string;
  sourceCompanyMessageId: number;
  talentId: string;
  workspaceId: string;
}) {
  const context = assertSafeProfessionalQuestion(args.requestContext);
  const { data, error } = await args.admin.rpc(
    "enqueue_company_talent_request_v1",
    {
      p_expects_document: args.expectsDocument,
      p_delivery_mode: args.deliveryMode ?? "standard",
      p_recommendation_id: args.recommendationId,
      p_request_context: context,
      p_role_id: args.roleId,
      p_source_company_message_id: args.sourceCompanyMessageId,
      p_talent_id: args.talentId,
      p_workspace_id: args.workspaceId,
    }
  );
  if (error) throw error;
  const request = data as CompanyTalentRequestRow;
  const { data: delivery, error: deliveryError } = await args.admin
    .from("contact_queue")
    .select("scheduled_at")
    .eq("company_talent_request_id", request.id)
    .eq("type", "company_request_candidate_delivery")
    .maybeSingle();
  if (deliveryError) throw deliveryError;
  const candidateDeliveryScheduledAt = normalizedText(
    delivery?.scheduled_at,
    100
  );
  if (!candidateDeliveryScheduledAt) {
    throw new Error("Candidate delivery schedule was not created");
  }
  return {
    ...request,
    candidateDeliveryScheduledAt,
  } as EnqueuedCompanyTalentRequest;
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
    .in("workflow_status", statuses)
    .order("created_at", { ascending: false })
    .limit(args.requestId ? 1 : 30);
  if (args.requestId) query = query.eq("id", args.requestId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (
    Array.isArray(data) ? data : []
  ) as CompanyTalentRequestReadRow[];
  return (
    rows.find((row) =>
      companyRequestStillActive(row, args.awaitingTalentOnly === true)
    ) ?? null
  );
}

export async function fetchActiveCompanyTalentRequests(args: {
  admin: UntypedAdmin;
  awaitingTalentOnly?: boolean;
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
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .select(
      "id, company_workspace_id, contact_kind, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, talent_source_message_id, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, intent, resume_stage, response_disposition, deliveries:contact_queue(sent_at, status, type), role:company_roles!inner(name, status, is_expired, expires_at), workspace:company_workspace!inner(company_name, logo_url, company_db:company_db(logo))"
    )
    .eq("talent_id", args.talentId)
    .in("workflow_status", statuses)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 3, 90));
  if (error) throw error;
  return ((Array.isArray(data) ? data : []) as CompanyTalentRequestReadRow[])
    .filter((row) =>
      companyRequestStillActive(row, args.awaitingTalentOnly === true)
    )
    .slice(0, limit);
}

export type RelayableCompanyTalentContact = {
  answered: boolean;
  companyName: string;
  contactKind: "contact" | "question" | "resume";
  contactedAt: string;
  latestRelayAt: string | null;
  latestRelayStatus: CompanyTalentRelayDeliveryStatus | null;
  requestContext: string;
  requestId: string;
  roleName: string;
};

export async function fetchRelayableCompanyTalentContacts(args: {
  admin: UntypedAdmin;
  limit?: number;
  query?: string | null;
  talentId: string;
}) {
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 30))
      : 20;
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .select(
      "id, contact_kind, expects_document, request_context, created_at, updated_at, talent_source_message_id, document_id, deliveries:contact_queue!inner(sent_at, status, type), relays:company_talent_relays(id,created_at,deliveries:contact_queue(type,status,sent_at,updated_at)), role:company_roles!inner(name,information), workspace:company_workspace!inner(company_name)"
    )
    .eq("talent_id", args.talentId)
    .eq("deliveries.type", "company_request_candidate_delivery")
    .eq("deliveries.status", "sent")
    .not("deliveries.sent_at", "is", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false, referencedTable: "relays" })
    .limit(1, { referencedTable: "relays" })
    .limit(Math.min(limit * 5, 150));
  if (error) throw error;

  const query = normalizedText(args.query, 200).toLocaleLowerCase();
  return (Array.isArray(data) ? data : [])
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
    .map((row: any): RelayableCompanyTalentContact => {
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      const workspace = Array.isArray(row.workspace)
        ? row.workspace[0]
        : row.workspace;
      const latestRelay = Array.isArray(row.relays) ? row.relays[0] : null;
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
      const contactKind = ["contact", "question", "resume"].includes(
        row.contact_kind
      )
        ? row.contact_kind
        : row.expects_document
          ? "resume"
          : "question";
      return {
        answered: Boolean(row.talent_source_message_id || row.document_id),
        companyName:
          normalizedText(workspace?.company_name, 160) || "채용 회사",
        contactKind,
        contactedAt:
          normalizedText(row.deliveries?.[0]?.sent_at, 100) ||
          normalizedText(row.created_at, 100),
        latestRelayAt: latestRelay
          ? normalizedText(latestRelay.created_at, 100) || null
          : null,
        latestRelayStatus: latestRelay
          ? normalizeCompanyTalentRelayDeliveryStatus(
              latestRelayDelivery?.status
            )
          : null,
        requestContext: normalizedText(row.request_context, 800),
        requestId: normalizedText(row.id, 120),
        roleName: normalizedText(role?.name, 160) || "해당 역할",
      };
    })
    .filter((contact: RelayableCompanyTalentContact) => {
      if (!query) return true;
      return [
        contact.companyName,
        contact.roleName,
        contact.requestContext,
      ].some((value) => value.toLocaleLowerCase().includes(query));
    })
    .slice(0, limit);
}

export function formatRelayableCompanyTalentContacts(
  contacts: RelayableCompanyTalentContact[]
) {
  if (contacts.length === 0) {
    return "전달 가능한 회사 연락 내역이 없습니다.";
  }
  return [
    `전달 가능한 회사 연락 ${contacts.length}건`,
    ...contacts.map((contact, index) => {
      const status = contact.answered
        ? "이전에 답변 또는 전달함"
        : "아직 답변하지 않음";
      const kind =
        contact.contactKind === "resume"
          ? "이력서 요청"
          : contact.contactKind === "contact"
            ? "연락"
            : "질문";
      const latestRelay = contact.latestRelayStatus
        ? `${contact.latestRelayStatus} · ${contact.latestRelayAt || "시점 미상"}`
        : "없음";
      return [
        `${index + 1}. ${contact.companyName} · ${contact.roleName}`,
        `   연락 ID: ${contact.requestId}`,
        `   종류/상태: ${kind} · ${status}`,
        `   연락 시점: ${contact.contactedAt || "-"}`,
        `   최근 후보자→회사 relay: ${latestRelay}`,
        `   내용: ${normalizedText(contact.requestContext, 300) || "-"}`,
      ].join("\n");
    }),
  ].join("\n");
}

export async function fetchBlockingCompanyTalentRequestForWorkspace(args: {
  admin: UntypedAdmin;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .select(
      "id, role_id, contact_kind, expects_document, request_context, workflow_status, expires_at, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, talent_source_message_id, document_id, role:company_roles!inner(name), deliveries:contact_queue(scheduled_at, sent_at, status, last_error, payload, type)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .eq("talent_id", args.talentId)
    .in("workflow_status", [...COMPANY_TALENT_REQUEST_BLOCKING_STATUSES])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as Array<
    CompanyTalentRequestRow & {
      deliveries?: Array<{
        scheduled_at?: string | null;
        sent_at?: string | null;
        status?: string | null;
        last_error?: string | null;
        payload?: unknown;
        type?: string | null;
      }> | null;
      role?: { name?: string | null } | null;
      talent_source_message_id?: number | null;
    }
  >;
  const row = rows.find((candidate) => {
    const candidateDelivery = candidate.deliveries?.find(
      (item) => item.type === "company_request_candidate_delivery"
    );
    return companyTalentRequestBlocksNewContact({
      candidate_delivery_status: candidateDelivery?.status,
      candidate_sent_at: candidateDelivery?.sent_at,
      expires_at: candidate.expires_at,
      has_candidate_response: Boolean(
        candidate.talent_source_message_id || candidate.document_id
      ),
      workflow_status: candidate.workflow_status,
    });
  });
  if (!row) return null;
  const candidateDelivery = row.deliveries?.find(
    (item) => item.type === "company_request_candidate_delivery"
  );
  const companyDelivery = row.deliveries?.find(
    (item) => item.type === "company_request_company_delivery"
  );
  const deliveryStatus = normalizedText(candidateDelivery?.status, 80);
  const candidateDeliveryPayload =
    candidateDelivery?.payload &&
    typeof candidateDelivery.payload === "object" &&
    !Array.isArray(candidateDelivery.payload)
      ? (candidateDelivery.payload as Record<string, unknown>)
      : {};
  const cancellation =
    candidateDeliveryPayload.cancellation &&
    typeof candidateDeliveryPayload.cancellation === "object" &&
    !Array.isArray(candidateDeliveryPayload.cancellation)
      ? (candidateDeliveryPayload.cancellation as Record<string, unknown>)
      : {};
  return {
    blocksNewRequest: true,
    cancelable:
      row.workflow_status === "draft" ||
      (["queued", "failed"].includes(deliveryStatus) &&
        ["queued", "failed"].includes(row.workflow_status)),
    draftBody: row.delivery_body,
    draftRevision: row.draft_revision,
    draftSubject: row.delivery_subject,
    label:
      row.contact_kind === "contact"
        ? "회사 연락"
        : row.expects_document
          ? "이력서 요청"
          : "회사 질문 확인",
    requestId: row.id,
    roleId: row.role_id,
    roleName: normalizedText(row.role?.name, 160) || null,
    scheduledAt: normalizedText(candidateDelivery?.scheduled_at, 100) || null,
    status: humanizeCompanyTalentRequestStatus({
      ...row,
      candidate_cancellation_source: normalizedText(cancellation.source, 80),
      candidate_delivery_error: normalizedText(
        candidateDelivery?.last_error,
        120
      ),
      candidate_delivery_status: deliveryStatus,
      candidate_sent_at: candidateDelivery?.sent_at,
      company_delivery_status: normalizedText(companyDelivery?.status, 80),
      company_sent_at: companyDelivery?.sent_at,
      has_candidate_response: Boolean(row.talent_source_message_id),
    }),
    topic: normalizedText(row.request_context, 800),
  };
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
  relayContent: string;
  requestId: string;
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
  const { data, error } = await args.admin.rpc(
    "create_company_talent_relay_v1",
    {
      p_relay_content: relayContent,
      p_request_id: args.requestId,
      p_source_message_id: args.sourceMessageId,
      p_talent_id: args.talentId,
    }
  );
  if (error) throw error;
  const result = data as {
    contentMismatch?: boolean;
    firstResponse?: boolean;
    id: string;
    idempotent: boolean;
    requestId: string;
    status: string;
  };
  console.info("[company-talent-relay] accepted", {
    contentMismatch: Boolean(result.contentMismatch),
    idempotent: Boolean(result.idempotent),
    relayId: result.id,
    requestId: result.requestId,
  });
  return result;
}

export async function recordCompanyTalentResponse(args: {
  admin: UntypedAdmin;
  disposition?: "negative" | "other" | "positive" | null;
  requestId: string;
  sourceMessageId: number;
  talentId: string;
}) {
  const request = await fetchActiveCompanyTalentRequest({
    admin: args.admin,
    awaitingTalentOnly: true,
    requestId: args.requestId,
    talentId: args.talentId,
  });
  if (!request) {
    throw new Error("Active company request not found");
  }
  if (request.intent === "candidate_reengagement" && !args.disposition) {
    throw new Error("candidate_reengagement_disposition_required");
  }
  if (request.intent !== "candidate_reengagement" && args.disposition) {
    throw new Error("ordinary_company_request_disposition_not_allowed");
  }
  const evidence = await candidateAuthoredMessage({
    admin: args.admin,
    messageId: args.sourceMessageId,
    talentId: args.talentId,
  });
  if (request.intent !== "candidate_reengagement") {
    const relay = await createCompanyTalentRelay({
      admin: args.admin,
      relayContent: evidence,
      requestId: args.requestId,
      sourceMessageId: args.sourceMessageId,
      talentId: args.talentId,
    });
    return {
      ...request,
      positionActive: null,
      relayId: relay.id,
      talent_source_message_id: args.sourceMessageId,
      workflow_status: "relay_queued",
    };
  }
  const { data, error } = await args.admin.rpc(
    "record_company_talent_response_v2",
    {
      p_disposition: args.disposition ?? null,
      p_request_id: args.requestId,
      p_source_message_id: args.sourceMessageId,
      p_talent_id: args.talentId,
    }
  );
  if (error) throw error;
  let positionActive: boolean | null = null;
  if (
    request.intent === "candidate_reengagement" &&
    args.disposition === "positive"
  ) {
    const { data: recommendation, error: recommendationError } =
      await args.admin
        .from("talent_opportunity_recommendation")
        .select("saved_stage")
        .eq("id", request.recommendation_id)
        .eq("talent_id", request.talent_id)
        .eq("role_id", request.role_id)
        .maybeSingle();
    if (recommendationError) throw recommendationError;
    positionActive =
      normalizedText(recommendation?.saved_stage, 40).toLowerCase() ===
      "accepted";
  }
  return {
    ...(data as CompanyTalentRequestRow),
    positionActive,
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
