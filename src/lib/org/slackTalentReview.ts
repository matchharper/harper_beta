import type { Json } from "@/types/database.types";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type {
  SlackTalentReviewCandidate,
  SlackTalentReviewCandidateRef,
  SlackTalentReviewExtra,
} from "@/lib/org/slackTalentReviewView";
import { orderedSlackTalentReviewCandidates } from "@/lib/org/slackTalentReviewSource";
import {
  findHarperSlackWorkspaceMember,
  type HarperSlackWorkspaceMember,
} from "@/lib/org/slackMemberAccess";
import { resolveTalentLocation } from "@/lib/talentLocation";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

export type SlackTalentReviewSource = {
  candidates: SlackTalentReviewCandidateRef[];
  sourceMessageId: number;
  workspaceId: string;
};

export type SlackTalentReviewMember = Pick<
  HarperSlackWorkspaceMember,
  "canManageCandidates" | "companyUserId" | "email"
>;

export type SlackTalentReviewDecisionMember = {
  email: string;
  name: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullable(value: unknown) {
  return clean(value) || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function sourceFromQuery(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("검토할 Slack 메시지를 찾지 못했습니다.");
  const candidates = orderedSlackTalentReviewCandidates(
    row.mentions,
    row.metadata
  );
  if (candidates.length === 0) {
    throw new Error("이 메시지에는 검토할 후보자가 없습니다.");
  }
  return {
    candidates,
    sourceMessageId: Number(row.id),
    workspaceId: clean(row.company_workspace_id),
  } satisfies SlackTalentReviewSource;
}

export async function loadSlackTalentReviewSourceByMessage(args: {
  messageTs: string;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  return sourceFromQuery(
    (admin.from("company_messages" as any) as any)
      .select("id, company_workspace_id, mentions, metadata")
      .eq("company_workspace_id", args.workspaceId)
      .eq("message_type", "slack")
      .eq("role", "assistant")
      .eq("slack_message_ts", args.messageTs)
      .order("id", { ascending: false })
      .limit(1)
  );
}

export async function loadSlackTalentReviewSourceById(args: {
  sourceMessageId: number;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  return sourceFromQuery(
    (admin.from("company_messages" as any) as any)
      .select("id, company_workspace_id, mentions, metadata")
      .eq("company_workspace_id", args.workspaceId)
      .eq("message_type", "slack")
      .eq("role", "assistant")
      .eq("id", args.sourceMessageId)
      .limit(1)
  );
}

export async function listSlackTalentReviewDecisionMembers(
  workspaceId: string
): Promise<SlackTalentReviewDecisionMember[]> {
  const admin = getSupabaseAdmin();
  const { data: membershipData, error: membershipError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id")
    .eq("company_workspace_id", workspaceId);
  if (membershipError) throw membershipError;
  const companyUserIds = Array.from(
    new Set(
      (membershipData ?? [])
        .map((row: { company_user_id?: unknown }) => clean(row.company_user_id))
        .filter(Boolean)
    )
  );
  if (companyUserIds.length === 0) return [];
  const { data, error } = await (admin.from("company_users" as any) as any)
    .select("email, name")
    .in("user_id", companyUserIds);
  if (error) throw error;
  const members: SlackTalentReviewDecisionMember[] = (data ?? []).flatMap(
    (row: { email?: unknown; name?: unknown }) => {
      const email = clean(row.email).toLowerCase();
      return email ? [{ email, name: nullable(row.name) }] : [];
    }
  );
  return members.sort((left, right) => left.email.localeCompare(right.email));
}

export async function findSlackTalentReviewMember(args: {
  email: string;
  workspaceId: string;
}): Promise<SlackTalentReviewMember | null> {
  return findHarperSlackWorkspaceMember(args);
}

function extraItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = record(value);
  const listKeys = [
    "talent_extras",
    "talentExtras",
    "extras",
    "items",
    "publications",
    "projects",
    "activities",
  ];
  for (const key of listKeys) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  if (
    "title" in row ||
    "name" in row ||
    "description" in row ||
    "memo" in row
  ) {
    return [row];
  }
  return Object.values(row).flatMap((item) =>
    Array.isArray(item)
      ? item
      : Object.keys(record(item)).length > 0
        ? [item]
        : []
  );
}

function profileExtras(rows: Array<{ content?: unknown }>) {
  return rows.flatMap((row): SlackTalentReviewExtra[] =>
    extraItems(row.content).flatMap((item): SlackTalentReviewExtra[] => {
      const value = record(item);
      const title = nullable(value.title ?? value.name);
      const description = nullable(value.description);
      const date = nullable(value.date);
      const memo = nullable(value.memo);
      if (!title && !description && !memo) return [];
      return [{ date, description, memo, title }];
    })
  );
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

export async function loadSlackTalentReviewCandidate(args: {
  candidate: SlackTalentReviewCandidateRef;
  workspaceId: string;
}): Promise<SlackTalentReviewCandidate> {
  const admin = getSupabaseAdmin();
  const { data: role, error: roleError } = await (
    admin.from("company_roles" as any) as any
  )
    .select("role_id, name")
    .eq("company_workspace_id", args.workspaceId)
    .eq("role_id", args.candidate.roleId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new Error("후보자의 Role을 찾지 못했습니다.");

  const [
    talentResult,
    recommendationResult,
    experiencesResult,
    educationsResult,
    extrasResult,
    documentsResult,
    fitResult,
  ] = await Promise.all([
    (admin.from("talent_users" as any) as any)
      .select(
        "user_id, email, name, profile_picture, bio, location, current_location, resume_file_name, resume_storage_path, resume_links"
      )
      .eq("user_id", args.candidate.talentId)
      .maybeSingle(),
    (() => {
      let query = (
        admin.from("talent_opportunity_recommendation" as any) as any
      )
        .select("id")
        .eq("talent_id", args.candidate.talentId)
        .eq("role_id", args.candidate.roleId);
      query = args.candidate.recommendationId
        ? query.eq("id", args.candidate.recommendationId)
        : query.order("recommended_at", { ascending: false }).limit(1);
      return query.maybeSingle();
    })(),
    (admin.from("talent_experiences" as any) as any)
      .select(
        "company_logo, company_location, company_name, description, employment_type, end_date, memo, role, start_date"
      )
      .eq("talent_id", args.candidate.talentId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    (admin.from("talent_educations" as any) as any)
      .select("degree, description, end_date, field, memo, school, start_date")
      .eq("talent_id", args.candidate.talentId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    (admin.from("talent_extras" as any) as any)
      .select("content")
      .eq("talent_id", args.candidate.talentId),
    (admin.from("talent_documents" as any) as any)
      .select("file_name, is_primary, is_public, kind")
      .eq("talent_id", args.candidate.talentId)
      .in("kind", ["resume", "document"])
      .order("created_at", { ascending: false }),
    (admin.from("talent_opportunity_fit" as any) as any)
      .select("reason")
      .eq("talent_id", args.candidate.talentId)
      .eq("opportunity_id", args.candidate.roleId)
      .order("last_evaluated_at", { ascending: false })
      .limit(1),
  ]);
  for (const result of [
    talentResult,
    recommendationResult,
    experiencesResult,
    educationsResult,
    extrasResult,
    documentsResult,
    fitResult,
  ]) {
    if (result.error) throw result.error;
  }
  const talent = talentResult.data as Record<string, unknown> | null;
  if (!talent) throw new Error("후보자 정보를 찾지 못했습니다.");
  const recommendationId = clean(recommendationResult.data?.id);
  if (!recommendationId) {
    throw new Error("후보자의 연결 추천 기록을 찾지 못했습니다.");
  }
  const documentRows = (documentsResult.data ?? []) as Array<{
    file_name?: unknown;
    is_primary?: unknown;
    is_public?: unknown;
    kind?: unknown;
  }>;
  const primaryResume = documentRows.find(
    (item) => clean(item.kind) === "resume" && item.is_primary === true
  );
  const visibleResumeName =
    primaryResume?.is_public === true
      ? nullable(primaryResume.file_name)
      : primaryResume
        ? null
        : nullable(talent.resume_file_name);
  const documentNames = documentRows.flatMap((item) =>
    clean(item.kind) === "document" && item.is_public === true
      ? [clean(item.file_name)].filter(Boolean)
      : []
  );
  if (visibleResumeName) documentNames.unshift(visibleResumeName);

  return {
    bio: nullable(talent.bio),
    documents: Array.from(new Set(documentNames)),
    educations: (educationsResult.data ?? []).map((item: any) => ({
      degree: nullable(item.degree),
      description: nullable(item.description),
      endDate: nullable(item.end_date),
      field: nullable(item.field),
      memo: nullable(item.memo),
      school: nullable(item.school),
      startDate: nullable(item.start_date),
    })),
    email: nullable(talent.email),
    experiences: (experiencesResult.data ?? []).map((item: any) => ({
      companyLogo: nullable(item.company_logo),
      companyLocation: nullable(item.company_location),
      companyName: nullable(item.company_name),
      description: nullable(item.description),
      employmentType: nullable(item.employment_type),
      endDate: nullable(item.end_date),
      memo: nullable(item.memo),
      role: nullable(item.role),
      startDate: nullable(item.start_date),
    })),
    extras: profileExtras(extrasResult.data ?? []),
    location: resolveTalentLocation(talent),
    name: nullable(talent.name) || args.candidate.displayName,
    profilePicture: nullable(talent.profile_picture),
    reason: nullable(
      (fitResult.data?.[0] as { reason?: unknown } | undefined)?.reason
    ),
    recommendationId,
    registeredLinks: stringList(talent.resume_links),
    roleId: args.candidate.roleId,
    roleName: clean(role.name) || "Role",
    talentId: args.candidate.talentId,
    workspaceId: args.workspaceId,
  };
}

export async function logSlackTalentReviewView(args: {
  candidate: SlackTalentReviewCandidateRef;
  candidateIndex: number;
  member: SlackTalentReviewMember;
  slackChannelId: string | null;
  slackTeamId: string;
  slackUserId: string;
  sourceMessageId: number;
  workspaceId: string;
}) {
  const admin: AdminClient = getSupabaseAdmin();
  const { error } = await (admin.from("talent_progress" as any) as any).insert({
    company_user_id: args.member.companyUserId,
    kind: "org_slack_profile_view",
    metadata: {
      candidateIndex: args.candidateIndex,
      source: "slack_auto_intro_review",
      sourceCompanyMessageId: args.sourceMessageId,
      slackChannelId: args.slackChannelId,
      slackTeamId: args.slackTeamId,
      slackUserId: args.slackUserId,
      workspaceId: args.workspaceId,
    } as Json,
    recommendation_id: args.candidate.recommendationId,
    role_id: args.candidate.roleId,
    talent_id: args.candidate.talentId,
    text: "Slack에서 후보자 프로필을 열람했습니다.",
    user_id: args.member.email,
  });
  if (error) throw error;
}
