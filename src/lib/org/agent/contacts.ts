import type { User } from "@supabase/supabase-js";
import { summarizeCompanyTalentRequestStatus } from "@/lib/companyTalentRequests/status";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";

export const ORG_AGENT_CONTACT_KINDS = [
  "contact",
  "interview_request",
  "connection_intro",
  "notice",
] as const;

export type OrgAgentContactKind = (typeof ORG_AGENT_CONTACT_KINDS)[number];
export type OrgAgentContactDateBasis = "created" | "sent" | "updated";

type ContactActor = {
  email: string | null;
  name: string;
  type: "candidate" | "company_user" | "harper";
};

type CompanyUserRecord = {
  email?: string | null;
  name?: string | null;
  user_id?: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function one(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) {
    const item = value[0];
    return item && typeof item === "object" ? item : null;
  }
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : null;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function emailList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  return Array.from(
    new Set(
      values
        .map((item) => text(item).toLowerCase())
        .filter(
          (item) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item) &&
            !/^intro\+[a-z0-9_-]{12,}@/i.test(item)
        )
    )
  );
}

function contactRef(kind: OrgAgentContactKind, sourceId: unknown) {
  return `${kind}:${text(sourceId)}`;
}

export function parseOrgAgentContactRef(value: unknown) {
  const normalized = text(value);
  const match = normalized.match(
    /^(contact|interview_request|connection_intro|notice):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  );
  if (!match) return null;
  return {
    kind: match[1].toLowerCase() as OrgAgentContactKind,
    sourceId: match[2].toLowerCase(),
  };
}

function companyUserActor(
  user: CompanyUserRecord | null | undefined,
  fallback?: { email?: unknown; name?: unknown }
): ContactActor {
  const email = text(user?.email ?? fallback?.email).toLowerCase() || null;
  const name = text(user?.name ?? fallback?.name) || email || "회사 담당자";
  return { email, name, type: "company_user" };
}

function candidateActor(candidate: Record<string, any> | null): ContactActor {
  const email = text(candidate?.email).toLowerCase() || null;
  return {
    email,
    name: text(candidate?.name) || email || "후보자",
    type: "candidate",
  };
}

const HARPER_ACTOR: ContactActor = {
  email: null,
  name: "Harper",
  type: "harper",
};

function latestDelivery(row: Record<string, any>, type: string) {
  const deliveries = Array.isArray(row.deliveries) ? row.deliveries : [];
  return (
    deliveries
      .filter((item) => text(item?.type) === type)
      .sort((left, right) =>
        text(right?.updated_at).localeCompare(text(left?.updated_at))
      )[0] ?? null
  );
}

function contactState(row: Record<string, any>) {
  return summarizeCompanyTalentRequestStatus({
    candidate_cancellation_source: text(row.candidate_cancellation_source),
    candidate_delivery_error: text(row.candidate_delivery_error),
    candidate_delivery_status: text(row.delivery_status),
    candidate_sent_at: text(row.sent_at),
    company_delivery_status: text(row.relay_status),
    company_sent_at: text(row.relay_sent_at),
    expires_at: text(row.expires_at),
    expects_document: Boolean(row.expects_document),
    has_candidate_response: Boolean(row.has_response),
    role_is_open:
      typeof row.role_is_open === "boolean" ? row.role_is_open : null,
    workflow_status: text(row.workflow_status),
  }).status;
}

function interviewState(row: Record<string, any>) {
  const sent =
    Boolean(text(row.sent_at)) || text(row.delivery_status) === "sent";
  if (sent && text(row.confirmed_start_at)) {
    return "후보자에게 일정 선택 요청을 보냄 · 미팅 시간이 확정됨";
  }
  if (sent && Boolean(row.has_response)) {
    return "후보자에게 일정 선택 요청을 보냄 · 후보자가 가능한 시간을 선택함";
  }
  if (sent) {
    return "후보자에게 일정 선택 요청을 보냄 · 후보자의 시간 선택을 기다리는 중";
  }
  if (text(row.delivery_status) === "processing") {
    return "후보자에게 일정 선택 요청을 보내는 중 · 아직 발송 완료 전";
  }
  if (text(row.delivery_status) === "queued") {
    return "후보자에게 일정 선택 요청을 보낼 예정 · 아직 발송하지 않음";
  }
  if (text(row.delivery_status) === "failed") {
    return "후보자에게 일정 선택 요청을 보내지 못함";
  }
  if (
    text(row.delivery_status) === "cancelled" ||
    text(row.workflow_status) === "cancelled"
  ) {
    return "일정 선택 요청을 취소함 · 후보자에게 발송하지 않음";
  }
  return "일정 요청을 준비 중 · 후보자에게 아직 발송하지 않음";
}

function connectionIntroState(row: Record<string, any>) {
  if (text(row.delivery_status) === "sent" || text(row.sent_at)) {
    return row.has_response
      ? "후보자와 회사 담당자에게 소개 이메일을 보냄 · 답장이 도착함"
      : "후보자와 회사 담당자에게 소개 이메일을 보냄";
  }
  if (["queued", "processing"].includes(text(row.delivery_status))) {
    return "소개 이메일을 보낼 예정 · 아직 발송 완료 전";
  }
  if (text(row.delivery_status) === "failed") {
    return "소개 이메일을 보내지 못함";
  }
  return "소개 이메일의 발송 상태를 확인하지 못함";
}

function stateForKind(kind: OrgAgentContactKind, row: Record<string, any>) {
  if (kind === "contact") return contactState(row);
  if (kind === "interview_request") return interviewState(row);
  if (kind === "connection_intro") return connectionIntroState(row);
  return text(row.sent_at) || text(row.delivery_status) === "sent"
    ? "후보자에게 안내 이메일을 보냄"
    : "후보자 안내 이메일의 발송 상태를 확인하지 못함";
}

export async function listOrgAgentContacts(args: {
  admin: OrgAgentAdminClient;
  after?: string | null;
  before?: string | null;
  dateBasis?: OrgAgentContactDateBasis;
  kind?: OrgAgentContactKind | null;
  limit?: number;
  offset?: number;
  query?: string | null;
  roleId?: string | null;
  talentId?: string | null;
  user: User;
  workspaceId: string;
}) {
  await assertOrgWorkspacePermission({
    admin: args.admin,
    permission: "view",
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 100);
  const offset = Math.min(Math.max(Math.trunc(args.offset ?? 0), 0), 10_000);
  const dateBasis = args.dateBasis ?? "updated";
  const { data, error } = await (args.admin.rpc as any)(
    "list_company_contact_index_v1",
    {
      p_after: text(args.after) || null,
      p_before: text(args.before) || null,
      p_company_workspace_id: args.workspaceId,
      p_date_basis: dateBasis,
      p_kind: args.kind ?? null,
      p_limit: limit + 1,
      p_offset: offset,
      p_query: text(args.query) || null,
      p_role_id: text(args.roleId) || null,
      p_talent_id: text(args.talentId) || null,
    }
  );
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, any>>;
  const page = rows.slice(0, limit);
  return {
    dateBasis,
    hasMore: rows.length > limit,
    items: page.map((row) => {
      const kind = text(row.kind) as OrgAgentContactKind;
      return {
        activityAt: text(row.activity_at) || null,
        candidateName: text(row.talent_name) || "후보자",
        contactRef: contactRef(kind, row.source_id),
        initiatedBy:
          text(row.company_user_name) ||
          text(row.company_user_email) ||
          "회사 담당자",
        kind,
        roleId: text(row.role_id),
        roleName: text(row.role_name) || "이름 없는 Role",
        state: stateForKind(kind, row),
        talentId: text(row.talent_id),
      };
    }),
    limit,
    offset,
  };
}

async function fetchCompanyUsersById(args: {
  admin: OrgAgentAdminClient;
  userIds: string[];
}) {
  const userIds = Array.from(new Set(args.userIds.map(text).filter(Boolean)));
  if (userIds.length === 0) return new Map<string, CompanyUserRecord>();
  const { data, error } = await (args.admin.from("company_users" as any) as any)
    .select("user_id,name,email")
    .in("user_id", userIds);
  if (error) throw error;
  return new Map(
    ((data ?? []) as CompanyUserRecord[]).map((row) => [text(row.user_id), row])
  );
}

async function readCandidateContacts(args: {
  admin: OrgAgentAdminClient;
  ids: string[];
  workspaceId: string;
}) {
  if (args.ids.length === 0) return [];
  const { data, error } = await (
    args.admin.from("company_talent_requests" as any) as any
  )
    .select(
      "id,role_id,talent_id,expects_document,request_context,workflow_status,expires_at,created_at,updated_at,approved_at,delivery_subject,delivery_body,talent_source_message_id,document_id,source_message:company_messages!company_talent_requests_source_company_message_id_fkey(company_user_id),role:company_roles!inner(name,status,is_expired,expires_at),talent:talent_users!inner(name,email),deliveries:contact_queue(type,status,scheduled_at,sent_at,cancelled_at,updated_at,last_error,payload)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .is("talent.deleted_at", null)
    .in("id", args.ids);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, any>>;
  const companyUserIds = rows.map((row) =>
    text(one(row.source_message)?.company_user_id)
  );
  const responseMessageIds = rows.map((row) =>
    text(row.talent_source_message_id)
  );
  const responseDocumentIds = rows.map((row) => text(row.document_id));
  const [companyUsers, responseMessagesResult, responseDocumentsResult] =
    await Promise.all([
      fetchCompanyUsersById({ admin: args.admin, userIds: companyUserIds }),
      responseMessageIds.some(Boolean)
        ? (args.admin.from("talent_messages" as any) as any)
            .select("id,content,created_at")
            .in("id", responseMessageIds.filter(Boolean))
        : Promise.resolve({ data: [], error: null }),
      responseDocumentIds.some(Boolean)
        ? (args.admin.from("talent_documents" as any) as any)
            .select("id,file_name,created_at")
            .in("id", responseDocumentIds.filter(Boolean))
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (responseMessagesResult.error) throw responseMessagesResult.error;
  if (responseDocumentsResult.error) throw responseDocumentsResult.error;
  const responseMessageById = new Map<string, Record<string, any>>(
    (responseMessagesResult.data ?? []).map((row: any) => [text(row.id), row])
  );
  const responseDocumentById = new Map<string, Record<string, any>>(
    (responseDocumentsResult.data ?? []).map((row: any) => [text(row.id), row])
  );
  return rows.map((row) => {
    const candidate = one(row.talent);
    const role = one(row.role);
    const candidateDelivery = latestDelivery(
      row,
      "company_request_candidate_delivery"
    );
    const companyDelivery = latestDelivery(
      row,
      "company_request_company_delivery"
    );
    const companyUserId = text(one(row.source_message)?.company_user_id);
    const responseMessage = responseMessageById.get(
      text(row.talent_source_message_id)
    );
    const responseDocument = responseDocumentById.get(text(row.document_id));
    const cancellation = record(
      record(candidateDelivery?.payload).cancellation
    );
    const roleExpiresAt = Date.parse(text(role?.expires_at));
    const roleIsOpen =
      !["ended", "deleted"].includes(text(role?.status)) &&
      role?.is_expired !== true &&
      (!Number.isFinite(roleExpiresAt) || roleExpiresAt > Date.now());
    const stateRow = {
      ...row,
      candidate_cancellation_source: text(cancellation.source),
      candidate_delivery_error: text(candidateDelivery?.last_error),
      delivery_status: candidateDelivery?.status,
      has_response: Boolean(responseMessage || responseDocument),
      relay_sent_at: companyDelivery?.sent_at,
      relay_status: companyDelivery?.status,
      role_is_open: roleIsOpen,
      sent_at: candidateDelivery?.sent_at,
    };
    return {
      candidate: candidateActor(candidate),
      candidateResponse:
        responseMessage || responseDocument
          ? {
              attachmentName: text(responseDocument?.file_name) || null,
              body: text(responseMessage?.content) || null,
              receivedAt:
                text(responseMessage?.created_at) ||
                text(responseDocument?.created_at) ||
                null,
              recipient: HARPER_ACTOR,
              sender: candidateActor(candidate),
            }
          : null,
      contactRef: contactRef("contact", row.id),
      kind: "contact" as const,
      message: {
        body: text(row.delivery_body) || null,
        deliveryState: summarizeCompanyTalentRequestStatus({
          candidate_cancellation_source: text(cancellation.source),
          candidate_delivery_error: text(candidateDelivery?.last_error),
          candidate_delivery_status: text(candidateDelivery?.status),
          candidate_sent_at: text(candidateDelivery?.sent_at),
          expires_at: text(row.expires_at),
          has_candidate_response: Boolean(responseMessage || responseDocument),
          role_is_open: roleIsOpen,
          workflow_status: text(row.workflow_status),
        }).candidateEmail,
        recipient: candidateActor(candidate),
        scheduledAt: text(candidateDelivery?.scheduled_at) || null,
        sender: companyUserActor(companyUsers.get(companyUserId)),
        sentAt: text(candidateDelivery?.sent_at) || null,
        subject: text(row.delivery_subject) || null,
      },
      request: text(row.request_context) || null,
      role: {
        name: text(role?.name) || "이름 없는 Role",
        roleId: text(row.role_id),
      },
      state: contactState(stateRow),
      talentId: text(row.talent_id),
    };
  });
}

async function readInterviewRequests(args: {
  admin: OrgAgentAdminClient;
  ids: string[];
  workspaceId: string;
}) {
  if (args.ids.length === 0) return [];
  const { data, error } = await (
    args.admin.from("meeting_schedules" as any) as any
  )
    .select(
      "id,role_id,talent_id,organizer_company_user_id,status,title,duration_minutes,active_round_id,confirmed_start_at,confirmed_end_at,updated_at,role:company_roles!inner(name),talent:talent_users!inner(name,email)"
    )
    .eq("company_workspace_id", args.workspaceId)
    .is("talent.deleted_at", null)
    .in("id", args.ids);
  if (error) throw error;
  const schedules = (data ?? []) as Array<Record<string, any>>;
  const roundIds = schedules
    .map((row) => text(row.active_round_id))
    .filter(Boolean);
  const [roundResult, companyUsers] = await Promise.all([
    roundIds.length
      ? (args.admin.from("meeting_schedule_rounds" as any) as any)
          .select(
            "id,schedule_id,status,meeting_config_snapshot,invitation_snapshot,selection_snapshot,submitted_at,delivery_queue_id,updated_at"
          )
          .in("id", roundIds)
      : Promise.resolve({ data: [], error: null }),
    fetchCompanyUsersById({
      admin: args.admin,
      userIds: schedules.map((row) => text(row.organizer_company_user_id)),
    }),
  ]);
  if (roundResult.error) throw roundResult.error;
  const roundById = new Map<string, Record<string, any>>(
    (roundResult.data ?? []).map((row: any) => [text(row.id), row])
  );
  const deliveryIds = Array.from(
    new Set(
      (roundResult.data ?? [])
        .map((row: any) => text(row.delivery_queue_id))
        .filter(Boolean)
    )
  );
  const deliveryResult = deliveryIds.length
    ? await (args.admin.from("contact_queue" as any) as any)
        .select("id,status,scheduled_at,sent_at,cancelled_at,payload")
        .in("id", deliveryIds)
    : { data: [], error: null };
  if (deliveryResult.error) throw deliveryResult.error;
  const deliveryById = new Map<string, Record<string, any>>(
    (deliveryResult.data ?? []).map((row: any) => [text(row.id), row])
  );
  return schedules.map((schedule) => {
    const round = roundById.get(text(schedule.active_round_id));
    const delivery = deliveryById.get(text(round?.delivery_queue_id));
    const payload = record(delivery?.payload);
    const snapshot = record(round?.invitation_snapshot);
    const snapshotEmail = record(snapshot.email);
    const config = record(round?.meeting_config_snapshot);
    const candidate = one(schedule.talent);
    const organizerId = text(schedule.organizer_company_user_id);
    const stateRow = {
      confirmed_start_at: schedule.confirmed_start_at,
      delivery_status: delivery?.status,
      has_response: Boolean(round?.submitted_at),
      sent_at: delivery?.sent_at,
      workflow_status: schedule.status,
    };
    return {
      candidate: candidateActor(candidate),
      contactRef: contactRef("interview_request", schedule.id),
      kind: "interview_request" as const,
      meeting: {
        confirmedEndAt: text(schedule.confirmed_end_at) || null,
        confirmedStartAt: text(schedule.confirmed_start_at) || null,
        durationMinutes: Number(schedule.duration_minutes ?? 0) || null,
        purpose: text(config.meetingPurpose) || null,
        stageName: text(config.processStageName) || null,
        title: text(schedule.title) || null,
      },
      message: {
        body: text(payload.body) || text(snapshotEmail.body) || null,
        deliveryState: interviewState(stateRow),
        recipient: candidateActor(candidate),
        scheduledAt: text(delivery?.scheduled_at) || null,
        sender: companyUserActor(companyUsers.get(organizerId)),
        sentAt: text(delivery?.sent_at) || null,
        subject: text(payload.subject) || text(snapshotEmail.subject) || null,
      },
      responseReceivedAt: text(round?.submitted_at) || null,
      role: {
        name: text(one(schedule.role)?.name) || "이름 없는 Role",
        roleId: text(schedule.role_id),
      },
      state: interviewState(stateRow),
      talentId: text(schedule.talent_id),
    };
  });
}

async function fetchWorkspaceCompanyUsers(args: {
  admin: OrgAgentAdminClient;
  extraUserIds?: string[];
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id")
    .eq("company_workspace_id", args.workspaceId);
  if (error) throw error;
  return fetchCompanyUsersById({
    admin: args.admin,
    userIds: [
      ...(data ?? []).map((row: any) => text(row.company_user_id)),
      ...(args.extraUserIds ?? []),
    ],
  });
}

function actorForEmail(args: {
  candidate: ContactActor;
  companyUserByEmail: Map<string, CompanyUserRecord>;
  email: string;
}) {
  const email = text(args.email).toLowerCase();
  if (email && email === args.candidate.email) return args.candidate;
  const companyUser = args.companyUserByEmail.get(email);
  if (companyUser) return companyUserActor(companyUser);
  return {
    email: email || null,
    name: email || "받는 사람",
    type: "company_user" as const,
  };
}

async function readConnectionIntros(args: {
  admin: OrgAgentAdminClient;
  ids: string[];
  workspaceId: string;
}) {
  if (args.ids.length === 0) return [];
  const { data, error } = await (
    args.admin.from("career_email_messages" as any) as any
  )
    .select(
      "id,talent_id,created_by,direction,mail_type,status,subject,body_text,from_email,to_email,occurred_at,metadata"
    )
    .eq("direction", "outbound")
    .in("id", args.ids);
  if (error) throw error;
  const messages = ((data ?? []) as Array<Record<string, any>>).filter(
    (row) => {
      const metadata = record(row.metadata);
      return (
        text(row.mail_type) === "org_intro" ||
        text(metadata.intendedMailType) === "org_intro"
      );
    }
  );
  const recommendationIds = Array.from(
    new Set(
      messages
        .map((row) => text(record(row.metadata).recommendationId))
        .filter(Boolean)
    )
  );
  if (recommendationIds.length === 0) return [];
  const recommendationResult = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id,role_id,talent_id")
    .in("id", recommendationIds);
  if (recommendationResult.error) throw recommendationResult.error;
  const recommendations = (recommendationResult.data ?? []) as Array<
    Record<string, any>
  >;
  if (recommendations.length === 0) return [];
  const roleResult = await (args.admin.from("company_roles" as any) as any)
    .select("role_id,name")
    .eq("company_workspace_id", args.workspaceId)
    .in(
      "role_id",
      recommendations.map((row) => text(row.role_id)).filter(Boolean)
    );
  if (roleResult.error) throw roleResult.error;
  const roleById = new Map<string, Record<string, any>>(
    (roleResult.data ?? []).map((row: any) => [text(row.role_id), row])
  );
  const recommendationById = new Map<string, Record<string, any>>(
    recommendations
      .filter((row) => roleById.has(text(row.role_id)))
      .map((row) => [text(row.id), row])
  );
  const scopedMessages = messages.filter((row) => {
    const recommendation = recommendationById.get(
      text(record(row.metadata).recommendationId)
    );
    return (
      recommendation && text(recommendation.talent_id) === text(row.talent_id)
    );
  });
  const talentIds = Array.from(
    new Set(scopedMessages.map((row) => text(row.talent_id)).filter(Boolean))
  );
  const [talentResult, companyUsers, replyResult] = await Promise.all([
    talentIds.length
      ? (args.admin.from("talent_users" as any) as any)
          .select("user_id,name,email")
          .in("user_id", talentIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    fetchWorkspaceCompanyUsers({
      admin: args.admin,
      extraUserIds: scopedMessages.map(
        (row) =>
          text(row.created_by) || text(record(row.metadata).companyUserId)
      ),
      workspaceId: args.workspaceId,
    }),
    talentIds.length
      ? (args.admin.from("career_email_messages" as any) as any)
          .select(
            "id,talent_id,direction,mail_type,status,subject,body_text,from_email,to_email,occurred_at,metadata"
          )
          .eq("direction", "inbound")
          .eq("mail_type", "org_intro_reply")
          .eq("status", "received")
          .in("metadata->>recommendationId", recommendationIds)
          .in("talent_id", talentIds)
          .order("occurred_at", { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (talentResult.error) throw talentResult.error;
  if (replyResult.error) throw replyResult.error;
  const talentById = new Map(
    (talentResult.data ?? []).map((row: any) => [text(row.user_id), row])
  );
  const companyUserByEmail = new Map(
    Array.from(companyUsers.values()).flatMap((row) => {
      const email = text(row.email).toLowerCase();
      return email ? [[email, row] as const] : [];
    })
  );
  const replies = (replyResult.data ?? []) as Array<Record<string, any>>;
  return scopedMessages
    .filter((message) => talentById.has(text(message.talent_id)))
    .map((message) => {
      const metadata = record(message.metadata);
      const recommendationId = text(metadata.recommendationId);
      const recommendation = recommendationById.get(recommendationId)!;
      const role = roleById.get(text(recommendation.role_id));
      const candidate = candidateActor(
        talentById.get(text(message.talent_id)) ?? null
      );
      const companyUserId =
        text(message.created_by) || text(metadata.companyUserId);
      const sender = companyUserActor(companyUsers.get(companyUserId), {
        name: metadata.companyUserName,
      });
      const recipientEmails = emailList(metadata.recipients).length
        ? emailList(metadata.recipients)
        : emailList(message.to_email);
      const matchingReplies = replies.filter(
        (reply) =>
          text(record(reply.metadata).recommendationId) === recommendationId
      );
      return {
        candidate,
        contactRef: contactRef("connection_intro", message.id),
        kind: "connection_intro" as const,
        message: {
          body: text(message.body_text) || null,
          deliveryState:
            text(message.status) === "sent"
              ? "발송됨"
              : ["queued", "processing"].includes(text(message.status))
                ? "발송 예정"
                : "발송 상태 확인 필요",
          recipient: recipientEmails.map((email) =>
            actorForEmail({ candidate, companyUserByEmail, email })
          ),
          scheduledAt: null,
          sender,
          sentAt:
            text(message.status) === "sent" ? text(message.occurred_at) : null,
          subject: text(message.subject) || null,
        },
        replies: matchingReplies.map((reply) => {
          const replySender = actorForEmail({
            candidate,
            companyUserByEmail,
            email: text(reply.from_email),
          });
          const replyMetadata = record(reply.metadata);
          const replyRecipientEmails = emailList([
            ...emailList(replyMetadata.toAddresses),
            ...emailList(replyMetadata.ccAddresses),
          ]);
          const recipients = (
            replyRecipientEmails.length
              ? replyRecipientEmails
              : emailList(reply.to_email)
          ).map((email) =>
            actorForEmail({ candidate, companyUserByEmail, email })
          );
          return {
            body: text(reply.body_text) || null,
            receivedAt: text(reply.occurred_at) || null,
            recipient: recipients,
            sender: replySender,
            subject: text(reply.subject) || null,
          };
        }),
        role: {
          name: text(role?.name) || "이름 없는 Role",
          roleId: text(recommendation.role_id),
        },
        state: connectionIntroState({
          delivery_status: message.status,
          has_response: matchingReplies.length > 0,
          sent_at: text(message.status) === "sent" ? message.occurred_at : null,
        }),
        talentId: text(message.talent_id),
      };
    });
}

async function readNotices(args: {
  admin: OrgAgentAdminClient;
  ids: string[];
  workspaceId: string;
}) {
  if (args.ids.length === 0) return [];
  const { data, error } = await (
    args.admin.from("career_email_messages" as any) as any
  )
    .select(
      "id,talent_id,mail_type,status,subject,body_text,to_email,occurred_at,metadata"
    )
    .eq("direction", "outbound")
    .eq("status", "sent")
    .in("mail_type", [
      "internal_connection_confirmed",
      "internal_candidate_role_changed",
    ])
    .in("id", args.ids);
  if (error) throw error;
  const messages = (data ?? []) as Array<Record<string, any>>;
  const recommendationIds = Array.from(
    new Set(
      messages
        .map((row) => text(record(row.metadata).recommendationId))
        .filter(Boolean)
    )
  );
  if (recommendationIds.length === 0) return [];
  const recommendationResult = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select("id,role_id,talent_id")
    .in("id", recommendationIds);
  if (recommendationResult.error) throw recommendationResult.error;
  const recommendations = (recommendationResult.data ?? []) as Array<
    Record<string, any>
  >;
  const roleIds = Array.from(
    new Set(recommendations.map((row) => text(row.role_id)).filter(Boolean))
  );
  if (roleIds.length === 0) return [];
  const roleResult = await (args.admin.from("company_roles" as any) as any)
    .select("role_id,name")
    .eq("company_workspace_id", args.workspaceId)
    .in("role_id", roleIds);
  if (roleResult.error) throw roleResult.error;
  const roleById = new Map<string, Record<string, any>>(
    (roleResult.data ?? []).map((row: any) => [text(row.role_id), row])
  );
  const recommendationById = new Map<string, Record<string, any>>(
    recommendations
      .filter((row) => roleById.has(text(row.role_id)))
      .map((row) => [text(row.id), row])
  );
  const scopedMessages = messages.filter((message) => {
    const recommendation = recommendationById.get(
      text(record(message.metadata).recommendationId)
    );
    return (
      recommendation &&
      text(recommendation.talent_id) === text(message.talent_id)
    );
  });
  const talentIds = Array.from(
    new Set(scopedMessages.map((row) => text(row.talent_id)).filter(Boolean))
  );
  const transferIds = Array.from(
    new Set(
      scopedMessages
        .filter(
          (row) => text(row.mail_type) === "internal_candidate_role_changed"
        )
        .map((row) => text(record(row.metadata).transferId))
        .filter(Boolean)
    )
  );
  const [talentResult, progressResult] = await Promise.all([
    talentIds.length
      ? (args.admin.from("talent_users" as any) as any)
          .select("user_id,name,email")
          .in("user_id", talentIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    transferIds.length
      ? (args.admin.from("talent_progress" as any) as any)
          .select("company_user_id,role_id,talent_id,metadata")
          .eq("kind", "org_candidate_role_move")
          .in("metadata->>transferId", transferIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (talentResult.error) throw talentResult.error;
  if (progressResult.error) throw progressResult.error;
  const talentById = new Map<string, Record<string, any>>(
    (talentResult.data ?? []).map((row: any) => [text(row.user_id), row])
  );
  const progressRows = (progressResult.data ?? []) as Array<
    Record<string, any>
  >;
  const companyUsers = await fetchCompanyUsersById({
    admin: args.admin,
    userIds: progressRows.map((row) => text(row.company_user_id)),
  });
  return scopedMessages.flatMap((message) => {
    const candidate = talentById.get(text(message.talent_id));
    if (!candidate) return [];
    const metadata = record(message.metadata);
    const recommendation = recommendationById.get(
      text(metadata.recommendationId)
    );
    if (!recommendation) return [];
    const role = roleById.get(text(recommendation.role_id));
    const roleChanged =
      text(message.mail_type) === "internal_candidate_role_changed";
    const progress = roleChanged
      ? progressRows.find(
          (row) =>
            text(record(row.metadata).transferId) ===
              text(metadata.transferId) &&
            text(row.role_id) === text(recommendation.role_id) &&
            text(row.talent_id) === text(message.talent_id)
        )
      : null;
    return [
      {
        candidate: candidateActor(candidate),
        contactRef: contactRef("notice", message.id),
        kind: "notice" as const,
        message: {
          body: text(message.body_text) || null,
          deliveryState: "발송됨",
          recipient: candidateActor(candidate),
          scheduledAt: null,
          sender: roleChanged
            ? companyUserActor(
                companyUsers.get(text(progress?.company_user_id))
              )
            : HARPER_ACTOR,
          sentAt: text(message.occurred_at) || null,
          subject: text(message.subject) || null,
        },
        role: {
          name: text(role?.name) || "이름 없는 Role",
          roleId: text(recommendation.role_id),
        },
        state: roleChanged
          ? "후보자에게 역할 변경 안내 이메일을 보냄"
          : "후보자에게 회사 연결 안내 이메일을 보냄",
        talentId: text(message.talent_id),
      },
    ];
  });
}

export async function readOrgAgentContacts(args: {
  admin: OrgAgentAdminClient;
  contactRefs: string[];
  user: User;
  workspaceId: string;
}) {
  await assertOrgWorkspacePermission({
    admin: args.admin,
    permission: "view",
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const parsed = args.contactRefs.map((value) => ({
    parsed: parseOrgAgentContactRef(value),
    value: text(value),
  }));
  if (parsed.some((item) => !item.parsed)) {
    throw new OrgHttpError(400, "연락 참조 형식을 확인해 주세요.");
  }
  const ids = (kind: OrgAgentContactKind) =>
    parsed.flatMap((item) =>
      item.parsed?.kind === kind ? [item.parsed.sourceId] : []
    );
  const [contacts, interviews, intros, notices] = await Promise.all([
    readCandidateContacts({
      admin: args.admin,
      ids: ids("contact"),
      workspaceId: args.workspaceId,
    }),
    readInterviewRequests({
      admin: args.admin,
      ids: ids("interview_request"),
      workspaceId: args.workspaceId,
    }),
    readConnectionIntros({
      admin: args.admin,
      ids: ids("connection_intro"),
      workspaceId: args.workspaceId,
    }),
    readNotices({
      admin: args.admin,
      ids: ids("notice"),
      workspaceId: args.workspaceId,
    }),
  ]);
  const resultByRef = new Map(
    [...contacts, ...interviews, ...intros, ...notices].map((item) => [
      item.contactRef,
      item,
    ])
  );
  const normalizedRefs = parsed.map((item) =>
    contactRef(item.parsed!.kind, item.parsed!.sourceId)
  );
  return {
    items: normalizedRefs.flatMap((ref) => {
      const item = resultByRef.get(ref);
      return item ? [item] : [];
    }),
    notFound: args.contactRefs.filter(
      (_, index) => !resultByRef.has(normalizedRefs[index])
    ),
    requestedCount: args.contactRefs.length,
  };
}
