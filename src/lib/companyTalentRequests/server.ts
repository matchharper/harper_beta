import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { buildOrgHref } from "@/lib/org/routes";
import { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";

export { assertSafeProfessionalQuestion } from "@/lib/companyTalentRequests/policy";
export { serializeTalentPendingRequest } from "@/lib/companyTalentRequests/presentation";

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

export const COMPANY_TALENT_REQUEST_BLOCKING_STATUSES = [
  "draft",
  ...COMPANY_TALENT_REQUEST_ACTIVE_STATUSES,
  "failed",
] as const;

export type CompanyTalentRequestRow = {
  approved_at: string | null;
  id: string;
  company_workspace_id: string;
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
};

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

export type CompanyTalentContactDraftContext = {
  body: string;
  candidateName: string;
  contactId: string;
  expiresAt: string;
  kind: "question" | "resume";
  requestContext: string;
  revision: number;
  roleId: string;
  roleName: string;
  subject: string;
  talentId: string;
};

function normalizedText(value: unknown, maxLength = 800) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function createCompanyTalentContactDraft(args: {
  admin: UntypedAdmin;
  body: string;
  id: string;
  expectsDocument: boolean;
  recommendationId: string;
  requestContext: string;
  roleId: string;
  sourceCompanyMessageId: number;
  subject: string;
  talentId: string;
  workspaceId: string;
}) {
  const context = assertSafeProfessionalQuestion(args.requestContext);
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .insert({
      company_workspace_id: args.workspaceId,
      delivery_body: args.body.trim(),
      delivery_subject: normalizedText(args.subject, 180),
      draft_revision: 1,
      expects_document: args.expectsDocument,
      id: args.id,
      recommendation_id: args.recommendationId,
      request_context: context,
      role_id: args.roleId,
      source_company_message_id: args.sourceCompanyMessageId,
      talent_id: args.talentId,
      workflow_status: "draft",
    })
    .select(
      "id, company_workspace_id, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision"
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
      "id, company_workspace_id, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, role:company_roles(name), talent:talent_users(name, email)"
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
      "id, company_workspace_id, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision"
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

export async function fetchCompanyTalentContactDraftsForScope(args: {
  admin: UntypedAdmin;
  conversationId: string;
  slackThreadId?: string | null;
  workspaceId: string;
}): Promise<CompanyTalentContactDraftContext[]> {
  let query = args.admin
    .from("company_talent_requests")
    .select(
      "id, role_id, talent_id, expects_document, request_context, delivery_subject, delivery_body, draft_revision, expires_at, created_at, role:company_roles(name), talent:talent_users(name), source_message:company_messages!company_talent_requests_source_company_message_id_fkey!inner(conversation_id, slack_thread_id)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("workflow_status", "draft")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  query = args.slackThreadId
    ? query.eq("source_message.slack_thread_id", args.slackThreadId)
    : query.eq("source_message.conversation_id", args.conversationId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((value: any) => ({
    body: String(value.delivery_body ?? ""),
    candidateName: normalizedText(value.talent?.name, 160) || "후보자",
    contactId: String(value.id ?? ""),
    expiresAt: String(value.expires_at ?? ""),
    kind: value.expects_document ? "resume" : "question",
    requestContext: normalizedText(value.request_context, 800),
    revision: Number(value.draft_revision ?? 0),
    roleId: String(value.role_id ?? ""),
    roleName: normalizedText(value.role?.name, 160) || "이름 없는 Role",
    subject: normalizedText(value.delivery_subject, 180),
    talentId: String(value.talent_id ?? ""),
  }));
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
    ? ["awaiting_talent"]
    : [...COMPANY_TALENT_REQUEST_ACTIVE_STATUSES];
  let query = args.admin
    .from("company_talent_requests")
    .select(
      "id, company_workspace_id, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, role:company_roles!inner(name), workspace:company_workspace!inner(company_name)"
    )
    .eq("talent_id", args.talentId)
    .in("workflow_status", statuses)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (args.requestId) query = query.eq("id", args.requestId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as
    | (CompanyTalentRequestRow & {
        role?: { name?: string | null } | null;
        workspace?: { company_name?: string | null } | null;
      })
    | null;
}

export async function fetchActiveCompanyTalentRequests(args: {
  admin: UntypedAdmin;
  awaitingTalentOnly?: boolean;
  limit?: number;
  talentId: string;
}) {
  const statuses = args.awaitingTalentOnly
    ? ["awaiting_talent"]
    : [...COMPANY_TALENT_REQUEST_ACTIVE_STATUSES];
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 30))
      : 20;
  const { data, error } = await args.admin
    .from("company_talent_requests")
    .select(
      "id, company_workspace_id, role_id, recommendation_id, talent_id, expects_document, request_context, workflow_status, expires_at, document_id, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, role:company_roles!inner(name), workspace:company_workspace!inner(company_name)"
    )
    .eq("talent_id", args.talentId)
    .in("workflow_status", statuses)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Array<
    CompanyTalentRequestRow & {
      role?: { name?: string | null } | null;
      workspace?: { company_name?: string | null } | null;
    }
  >;
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
      "id, role_id, expects_document, request_context, workflow_status, expires_at, created_at, updated_at, approved_at, delivery_subject, delivery_body, draft_revision, role:company_roles!inner(name), deliveries:contact_queue(scheduled_at, sent_at, status, type)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.roleId)
    .eq("talent_id", args.talentId)
    .in("workflow_status", [...COMPANY_TALENT_REQUEST_BLOCKING_STATUSES])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as CompanyTalentRequestRow & {
    deliveries?: Array<{
      scheduled_at?: string | null;
      sent_at?: string | null;
      status?: string | null;
      type?: string | null;
    }> | null;
    role?: { name?: string | null } | null;
  };
  const delivery = row.deliveries?.find(
    (item) => item.type === "company_request_candidate_delivery"
  );
  const deliveryStatus = normalizedText(delivery?.status, 80);
  return {
    blocksNewRequest: true,
    cancelable:
      row.workflow_status === "draft" ||
      (["queued", "failed"].includes(deliveryStatus) &&
        ["queued", "failed"].includes(row.workflow_status)),
    draftBody: row.delivery_body,
    draftRevision: row.draft_revision,
    draftSubject: row.delivery_subject,
    label: row.expects_document ? "이력서 요청" : "회사 질문 확인",
    requestId: row.id,
    roleId: row.role_id,
    roleName: normalizedText(row.role?.name, 160) || null,
    scheduledAt: normalizedText(delivery?.scheduled_at, 100) || null,
    status: humanizeCompanyTalentRequestStatus({
      ...row,
      delivery_status: deliveryStatus,
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
      exp: Math.floor(Date.now() / 1000) + (args.ttlSeconds ?? 14 * 86400),
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

export async function recordCompanyTalentResponse(args: {
  admin: UntypedAdmin;
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
  await candidateAuthoredMessage({
    admin: args.admin,
    messageId: args.sourceMessageId,
    talentId: args.talentId,
  });
  const { data, error } = await args.admin.rpc(
    "record_company_talent_response_v1",
    {
      p_request_id: args.requestId,
      p_source_message_id: args.sourceMessageId,
      p_talent_id: args.talentId,
    }
  );
  if (error) throw error;
  return data as CompanyTalentRequestRow;
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

export function humanizeCompanyTalentRequestStatus(row: {
  delivery_status?: string | null;
  expires_at?: string | null;
  expects_document?: boolean | null;
  workflow_status?: string | null;
}) {
  const status = row.workflow_status;
  if (row.delivery_status === "cancelled") return "발송 취소";
  if (row.delivery_status === "processing") return "발송 중";
  if (row.delivery_status === "failed") return "발송 실패·재시도 필요";
  const expiresAt = Date.parse(String(row.expires_at ?? ""));
  if (
    Number.isFinite(expiresAt) &&
    expiresAt <= Date.now() &&
    [
      "queued",
      "awaiting_talent",
      "relay_queued",
      "review_required",
      "closed",
    ].includes(String(status ?? ""))
  ) {
    return "요청 만료";
  }
  if (status === "queued") return "전달 준비 중";
  if (status === "draft") return "발송 문구 확인 중";
  if (status === "failed") return "발송 실패·재시도 필요";
  if (status === "awaiting_talent")
    return row.expects_document ? "연락 완료·자료 대기" : "연락 완료·답변 대기";
  if (status === "relay_queued") return "답변 수신·전달 준비 중";
  if (status === "review_required") return "답변 수신·전달 보류";
  if (status === "delivered") return "회사 전달 완료";
  return "종료";
}
