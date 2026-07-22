import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { renderEmailBodyHtml } from "@/lib/email/bodyFormat";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import { getEmailDomain, INTERNAL_EMAIL_DOMAIN } from "@/lib/internalAccess";
import { buildOrgIntroEmailDraft } from "@/lib/org/introEmail";
import { buildOrgInviteEmail } from "@/lib/org/inviteEmail";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  notifyOrgCandidateAcceptedSlack,
  notifyOrgCandidateRejectedSlack,
  notifyOrgMemberJoinedSlack,
} from "@/lib/org/slack";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import type { Database, Json } from "@/types/database.types";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;
type CompanyUserRow = Database["public"]["Tables"]["company_users"]["Row"];
type CompanyWorkspaceRow =
  Database["public"]["Tables"]["company_workspace"]["Row"];
type CompanyUserWorkspaceRow =
  Database["public"]["Tables"]["company_user_workspace"]["Row"];
type CompanyWorkspaceInvitationRow =
  Database["public"]["Tables"]["company_workspace_invitations"]["Row"];
type CompanyRoleRow = Database["public"]["Tables"]["company_roles"]["Row"];
type RoleStageRow =
  Database["public"]["Tables"]["ops_matching_role_stages"]["Row"];
type TalentUserRow = Database["public"]["Tables"]["talent_users"]["Row"];
type TalentExperienceRow =
  Database["public"]["Tables"]["talent_experiences"]["Row"];
type TalentEducationRow =
  Database["public"]["Tables"]["talent_educations"]["Row"];
type TalentExtraRow = Database["public"]["Tables"]["talent_extras"]["Row"];
type TalentInsightRow = Database["public"]["Tables"]["talent_insights"]["Row"];
type RecommendationRow =
  Database["public"]["Tables"]["talent_opportunity_recommendation"]["Row"];
type TalentOpportunityTagRow =
  Database["public"]["Tables"]["talent_opportunity_tag"]["Row"];
type TalentProgressRow = Database["public"]["Tables"]["talent_progress"]["Row"];

export class OrgHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type OrgWorkspace = {
  companyDescription: string | null;
  companyName: string;
  logoUrl: string | null;
  pitch: string | null;
  request: string | null;
  updatedAt: string;
  workspaceId: string;
};

export type OrgRole = {
  description: string | null;
  employmentTypes: string[];
  externalJdUrl: string | null;
  locationText: string | null;
  name: string;
  request: string | null;
  roleId: string;
  status: string | null;
  updatedAt: string;
  workMode: string | null;
  workspaceId: string;
};

export type OrgMember = {
  email: string | null;
  joinedAt: string;
  name: string | null;
  profilePicture: string | null;
  role: string | null;
  userId: string;
};

export type OrgWorkspaceInvitation = {
  email: string;
  invitationId: string;
  invitedAt: string;
  lastSentAt: string;
  status: "pending";
};

export type OrgBootstrapResponse = {
  currentUser: OrgMember | null;
  invitations: OrgWorkspaceInvitation[];
  members: OrgMember[];
  ok: true;
  roles: OrgRole[];
  workspace: OrgWorkspace | null;
  workspaces: OrgWorkspace[];
};

export type OrgInvitePreviewResponse = {
  ok: true;
  workspace: Pick<OrgWorkspace, "companyName" | "logoUrl" | "workspaceId">;
};

export type OrgInviteDeliveryStatus =
  | "already_member"
  | "failed"
  | "invalid"
  | "sent";

export type OrgInviteDeliveryResult = {
  email: string;
  message: string;
  status: OrgInviteDeliveryStatus;
};

export type OrgInviteSendResponse = {
  ok: true;
  results: OrgInviteDeliveryResult[];
  workspaceId: string;
};

export type OrgWorkspaceLeaveResponse = {
  nextWorkspaceId: string | null;
  ok: true;
  workspaceId: string;
};

export type OrgBuiltInStageId =
  | "pending_connection"
  | "connected"
  | "final_offer"
  | "process_stopped";
export type OrgCustomStageId = `custom:${string}`;
export type OrgStageId = OrgBuiltInStageId | OrgCustomStageId;

export type OrgStage = {
  id: OrgStageId;
  label: string;
  roleId?: string;
  sortOrder: number;
};

export type OrgRoleReviewStage = {
  id: string;
  label: string;
  roleId: string;
  sortOrder: number;
  stage: OrgCustomStageId;
};

export type OrgRoleReviewStageCreateResponse = {
  ok: true;
  roleId: string;
  stage: OrgRoleReviewStage;
};

export type OrgRoleReviewStageUpdateResponse = OrgRoleReviewStageCreateResponse;

export type OrgRoleReviewStageDeleteResponse = {
  ok: true;
  roleId: string;
  stageId: string;
};

export type OrgBoardProfileLabel = {
  detail: string | null;
  label: string;
  period: string | null;
};

export type OrgBoardTalent = {
  email: string | null;
  headline: string | null;
  name: string | null;
  profilePicture: string | null;
  recentCompanies: OrgBoardProfileLabel[];
  recentSchools: OrgBoardProfileLabel[];
  userId: string;
};

export type OrgBoardItem = {
  createdAt: string;
  fitReasons: string[];
  fitSummary: string | null;
  recommendedAt: string;
  recommendationId: string;
  roleId: string;
  roleName: string | null;
  stage: OrgStageId;
  stageTag: string | null;
  talent: OrgBoardTalent;
  talentId: string;
  updatedAt: string;
};

export type OrgBoardResponse = {
  items: OrgBoardItem[];
  roleId: string | null;
  stages: OrgStage[];
  totalCount: number;
  workspaceId: string;
};

export type OrgFeedActor = {
  companyUserId: string;
  email: string | null;
  name: string | null;
  profilePicture: string | null;
  userId: string;
};

export type OrgFeedItem = {
  actor: OrgFeedActor | null;
  companyUserId: string | null;
  createdAt: string;
  id: string;
  kind: string;
  recommendationId: string | null;
  roleId: string;
  roleName: string | null;
  text: string;
};

export type OrgProfileExperience = {
  companyLocation: string | null;
  companyName: string | null;
  description: string | null;
  employmentType: string | null;
  endDate: string | null;
  role: string | null;
  startDate: string | null;
};

export type OrgProfileEducation = {
  degree: string | null;
  description: string | null;
  endDate: string | null;
  field: string | null;
  school: string | null;
  startDate: string | null;
  url: string | null;
};

export type OrgProfileExtra = {
  date: string | null;
  description: string | null;
  title: string | null;
};

export type OrgTalentDetailResponse = {
  feed: OrgFeedItem[];
  profile: {
    bio: string | null;
    educations: OrgProfileEducation[];
    experiences: OrgProfileExperience[];
    extras: OrgProfileExtra[];
    location: string | null;
    registeredLinks: string[];
  };
  profileMarkdown: string;
  recommendation: {
    fitReasons: string[];
    fitSummary: string | null;
    recommendedAt: string;
    recommendationId: string;
  };
  resume: {
    fileName: string | null;
    hasStorageFile: boolean;
    links: string[];
  };
  role: OrgRole;
  talent: {
    bio: string | null;
    email: string | null;
    headline: string | null;
    name: string | null;
    profilePicture: string | null;
    userId: string;
  };
};

export type OrgFeedCreateResponse = {
  ok: true;
};

export type OrgFeedMutationResponse = {
  ok: true;
};

export type OrgResumeAccessResponse = {
  ok: true;
  url: string;
};

export type OrgStopReason = "candidate" | "company";

export type OrgStageChangeOptions = {
  acceptReason?: string | null;
  introEmails?: string[] | null;
  stopNote?: string | null;
  stopReason?: OrgStopReason | null;
};

const CUSTOM_STAGE_ID_PREFIX = "custom:";
const CUSTOM_STAGE_TAG_PREFIX = "내부단계:";
const MAX_ORG_ROLE_STAGE_LABEL_LENGTH = 40;
const STAGE_TAG_BY_STAGE: Record<OrgBuiltInStageId, string> = {
  pending_connection: "내부:연결대기",
  connected: "내부:수락",
  final_offer: "내부:최종오퍼",
  process_stopped: "내부:프로세스중단",
};
const EXTRA_INTERNAL_STAGE_TAGS = [
  "내부:연결됨",
  "내부:아카이브",
  "내부:보류",
  "내부:추천",
  "내부:거절",
];
const STAGE_BY_TAG_KEY = new Map(
  Object.entries(STAGE_TAG_BY_STAGE).map(([stage, tag]) => [
    normalizeTagKey(tag),
    stage as OrgBuiltInStageId,
  ])
);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);
  return text || null;
}

function getJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeLooseEmailList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : [];
  return uniqueTexts(values.map((item) => normalizeText(item).toLowerCase()));
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeTagKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function uniqueTexts(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function getUserName(user: User) {
  return (
    normalizeNullableText(user.user_metadata?.full_name) ??
    normalizeNullableText(user.user_metadata?.name) ??
    normalizeNullableText(user.email) ??
    "Anonymous"
  );
}

function getUserEmail(user: User) {
  return normalizeText(user.email).toLowerCase() || null;
}

function hasOrgAllInternalWorkspaceAccess(user: User) {
  return getEmailDomain(getUserEmail(user)) === INTERNAL_EMAIL_DOMAIN;
}

function isOrgAllInternalWorkspaceAccessEmail(
  email: string | null | undefined
) {
  return getEmailDomain(email) === INTERNAL_EMAIL_DOMAIN;
}

function buildVirtualOrgMember(user: User): OrgMember {
  return {
    email: getUserEmail(user),
    joinedAt: new Date().toISOString(),
    name: getUserName(user),
    profilePicture:
      normalizeNullableText(user.user_metadata?.avatar_url) ?? null,
    role: "Harper",
    userId: user.id,
  };
}

const ORG_ROLE_STATUS_VALUES = [
  "top_priority",
  "active",
  "ended",
  "paused",
  "deleted",
] as const;
const ORG_ROLE_EMPLOYMENT_TYPE_VALUES = [
  "full_time",
  "part_time",
  "internship",
  "contract",
] as const;
const ORG_ROLE_WORK_MODE_VALUES = ["onsite", "hybrid", "remote"] as const;

function normalizeOrgRoleStatus(value: unknown) {
  const normalized = normalizeText(value);
  return ORG_ROLE_STATUS_VALUES.includes(
    normalized as (typeof ORG_ROLE_STATUS_VALUES)[number]
  )
    ? normalized
    : "active";
}

function normalizeOrgRoleEmploymentTypes(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return uniqueTexts(
    values.filter((item): item is string =>
      ORG_ROLE_EMPLOYMENT_TYPE_VALUES.includes(
        item as (typeof ORG_ROLE_EMPLOYMENT_TYPE_VALUES)[number]
      )
    )
  );
}

function normalizeOrgRoleWorkMode(value: unknown) {
  const normalized = normalizeText(value);
  return ORG_ROLE_WORK_MODE_VALUES.includes(
    normalized as (typeof ORG_ROLE_WORK_MODE_VALUES)[number]
  )
    ? normalized
    : null;
}

function toWorkspace(row: CompanyWorkspaceRow): OrgWorkspace {
  return {
    companyDescription: row.company_description ?? null,
    companyName: row.company_name,
    logoUrl: row.logo_url ?? null,
    pitch: row.pitch ?? null,
    request: row.request ?? null,
    updatedAt: row.updated_at,
    workspaceId: row.company_workspace_id,
  };
}

function toRole(row: CompanyRoleRow): OrgRole {
  return {
    description: row.description ?? null,
    employmentTypes: normalizeOrgRoleEmploymentTypes(row.type),
    externalJdUrl: row.external_jd_url ?? null,
    locationText: row.location_text ?? null,
    name: row.name,
    request: row.request ?? null,
    roleId: row.role_id,
    status: row.status ?? null,
    updatedAt: row.updated_at,
    workMode: row.work_mode ?? null,
    workspaceId: row.company_workspace_id,
  };
}

function toBoardTalent(
  row: TalentUserRow,
  profileLabels?: {
    recentCompanies?: OrgBoardProfileLabel[];
    recentSchools?: OrgBoardProfileLabel[];
  }
): OrgBoardTalent {
  return {
    email: row.email ?? null,
    headline: row.headline ?? null,
    name: row.name ?? null,
    profilePicture: row.profile_picture ?? null,
    recentCompanies: profileLabels?.recentCompanies ?? [],
    recentSchools: profileLabels?.recentSchools ?? [],
    userId: row.user_id,
  };
}

function getKstDateStart(value: string | null | undefined) {
  const date = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const start = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  return start;
}

function getDateRangeForKstDates(args: {
  fallbackDate?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}) {
  const fallbackStart = getKstDateStart(args.fallbackDate);
  let from = getKstDateStart(args.fromDate) ?? fallbackStart;
  let to = getKstDateStart(args.toDate) ?? fallbackStart ?? from;

  if (!from && !to) {
    return { endIso: null, startIso: null };
  }

  if (!from) from = to;
  if (!to) to = from;
  if (from && to && from.getTime() > to.getTime()) {
    [from, to] = [to, from];
  }

  const end = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;
  return {
    endIso: end?.toISOString() ?? null,
    startIso: from?.toISOString() ?? null,
  };
}

function formatYearMonth(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const monthMatch = normalized.match(/^(\d{4})-(\d{1,2})/);
  if (monthMatch) return `${monthMatch[1]}.${monthMatch[2].padStart(2, "0")}`;
  const yearMatch = normalized.match(/^(\d{4})/);
  if (yearMatch) return yearMatch[1] ?? null;
  return normalized;
}

function formatProfilePeriod(args: {
  endDate?: string | null;
  startDate?: string | null;
}) {
  const start = formatYearMonth(args.startDate);
  const end = formatYearMonth(args.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - 현재`;
  if (end) return `- ${end}`;
  return null;
}

function buildExperienceLabel(
  row: Pick<
    TalentExperienceRow,
    "company_name" | "end_date" | "role" | "start_date"
  >
): OrgBoardProfileLabel | null {
  const companyName = normalizeNullableText(row.company_name);
  const role = normalizeNullableText(row.role);
  const label = companyName ?? role ?? "";
  if (!label) return null;
  return {
    detail: role,
    label,
    period: formatProfilePeriod({
      endDate: row.end_date,
      startDate: row.start_date,
    }),
  };
}

function buildEducationLabel(
  row: Pick<
    TalentEducationRow,
    "degree" | "end_date" | "field" | "school" | "start_date"
  >
): OrgBoardProfileLabel | null {
  const school = normalizeNullableText(row.school);
  const detail = [row.degree, row.field]
    .map(normalizeNullableText)
    .filter(Boolean)
    .join(" · ");
  const label = school ?? detail;
  if (!label) return null;
  return {
    detail: detail || null,
    label,
    period: formatProfilePeriod({
      endDate: row.end_date,
      startDate: row.start_date,
    }),
  };
}

async function fetchBoardProfileLabels(args: {
  admin: SupabaseAdminClient;
  talentIds: string[];
}) {
  const recentCompanies = new Map<string, OrgBoardProfileLabel[]>();
  const recentSchools = new Map<string, OrgBoardProfileLabel[]>();
  if (args.talentIds.length === 0) return { recentCompanies, recentSchools };

  const [experienceResult, educationResult] = await Promise.all([
    (args.admin.from("talent_experiences" as any) as any)
      .select("talent_id, company_name, role, start_date, end_date")
      .in("talent_id", args.talentIds)
      .order("start_date", { ascending: false, nullsFirst: false }),
    (args.admin.from("talent_educations" as any) as any)
      .select("talent_id, school, degree, field, start_date, end_date")
      .in("talent_id", args.talentIds)
      .order("start_date", { ascending: false, nullsFirst: false }),
  ]);

  if (experienceResult.error) throw experienceResult.error;
  if (educationResult.error) throw educationResult.error;

  for (const row of (experienceResult.data ?? []) as TalentExperienceRow[]) {
    const label = buildExperienceLabel(row);
    if (!label) continue;
    const list = recentCompanies.get(row.talent_id) ?? [];
    list.push(label);
    recentCompanies.set(row.talent_id, list);
  }

  for (const row of (educationResult.data ?? []) as TalentEducationRow[]) {
    const label = buildEducationLabel(row);
    if (!label) continue;
    const list = recentSchools.get(row.talent_id) ?? [];
    list.push(label);
    recentSchools.set(row.talent_id, list);
  }

  return { recentCompanies, recentSchools };
}

function coerceJsonStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueTexts(
      value.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (typeof item === "number" || typeof item === "boolean") {
          return [String(item)];
        }
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return [
            record.reason,
            record.text,
            record.summary,
            record.label,
            record.title,
          ].flatMap((entry) =>
            typeof entry === "string" && entry.trim() ? [entry] : []
          );
        }
        return [];
      })
    );
  }

  if (value && typeof value === "object") {
    return uniqueTexts(
      Object.values(value as Record<string, unknown>).flatMap((item) =>
        typeof item === "string" && item.trim()
          ? [item]
          : coerceJsonStringList(item)
      )
    );
  }

  if (typeof value === "string") {
    try {
      return coerceJsonStringList(JSON.parse(value) as unknown);
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }

  return [];
}

function buildCustomStageId(stageId: string): OrgCustomStageId {
  return `${CUSTOM_STAGE_ID_PREFIX}${stageId}` as OrgCustomStageId;
}

function buildOrgRoleReviewStage(row: RoleStageRow): OrgRoleReviewStage {
  return {
    id: row.id,
    label: normalizeText(row.label),
    roleId: row.role_id,
    sortOrder: row.sort_order,
    stage: buildCustomStageId(row.id),
  };
}

function getCustomStageDbId(stage: OrgStageId) {
  return stage.startsWith(CUSTOM_STAGE_ID_PREFIX)
    ? normalizeText(stage.slice(CUSTOM_STAGE_ID_PREFIX.length))
    : "";
}

function buildCustomStageTag(stageId: string) {
  return `${CUSTOM_STAGE_TAG_PREFIX}${normalizeText(stageId).replace(/-/g, "").toLowerCase()}`;
}

function customTagKeyFromStageRow(row: RoleStageRow) {
  return normalizeTagKey(buildCustomStageTag(row.id));
}

function buildStageLabel(stage: OrgStageId, customStages: RoleStageRow[]) {
  if (stage === "pending_connection") return "연결 대기";
  if (stage === "connected") return "연결됨";
  if (stage === "final_offer") return "최종 오퍼";
  if (stage === "process_stopped") return "프로세스 중단";
  const stageId = getCustomStageDbId(stage);
  return customStages.find((item) => item.id === stageId)?.label ?? "단계";
}

function buildStageDestinationLabel(label: string) {
  if (label === "연결됨") return "연결됨으로";
  return `${label}로`;
}

function stageSortOrder(stage: OrgStageId, customStages: RoleStageRow[]) {
  if (stage === "pending_connection") return 0;
  if (stage === "connected") return 1;
  if (stage === "final_offer") return 10_000;
  if (stage === "process_stopped") return 10_001;
  const stageId = getCustomStageDbId(stage);
  const row = customStages.find((item) => item.id === stageId);
  return 100 + (row?.sort_order ?? 0);
}

function getVisibleOrgStage(args: {
  customStageByTagKey: ReadonlyMap<string, OrgCustomStageId>;
  tags: TalentOpportunityTagRow[];
}): { stage: OrgStageId; stageTag: string } | null {
  for (const tag of args.tags) {
    const tagKey = normalizeTagKey(tag.tag);
    const builtIn = STAGE_BY_TAG_KEY.get(tagKey);
    if (builtIn) return { stage: builtIn, stageTag: tag.tag };
    if (tagKey === normalizeTagKey("내부:연결됨")) {
      return { stage: "connected", stageTag: tag.tag };
    }

    const custom = args.customStageByTagKey.get(tagKey);
    if (custom) return { stage: custom, stageTag: tag.tag };

    if (
      tagKey === normalizeTagKey("내부:거절") ||
      tagKey === normalizeTagKey("내부:아카이브") ||
      tagKey === normalizeTagKey("내부:보류")
    ) {
      return null;
    }
  }

  return null;
}

function buildMember(
  membership: CompanyUserWorkspaceRow,
  user: CompanyUserRow | null
): OrgMember {
  return {
    email: user?.email ?? null,
    joinedAt: membership.created_at,
    name: user?.name ?? null,
    profilePicture: user?.profile_picture ?? null,
    role: membership.role ?? null,
    userId: membership.company_user_id,
  };
}

function sortRoles(rows: CompanyRoleRow[]) {
  return rows.sort((left, right) => {
    const leftStatus = normalizeText(left.status).toLowerCase();
    const rightStatus = normalizeText(right.status).toLowerCase();
    const leftActive = leftStatus === "active" || leftStatus === "open";
    const rightActive = rightStatus === "active" || rightStatus === "open";
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export async function upsertOrgCompanyUser(
  admin: SupabaseAdminClient,
  user: User
) {
  const { error } = await (admin.from("company_users" as any) as any).upsert(
    {
      email: user.email ?? null,
      is_authenticated: true,
      name: getUserName(user),
      profile_picture: user.user_metadata?.avatar_url ?? null,
      user_id: user.id,
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
}

async function fetchWorkspaceById(
  admin: SupabaseAdminClient,
  workspaceId: string
) {
  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, is_internal, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  return (data as CompanyWorkspaceRow | null) ?? null;
}

export async function fetchOrgInvitePreview(args: {
  workspaceId: string;
}): Promise<OrgInvitePreviewResponse> {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "orgId is required");

  const workspace = await fetchWorkspaceById(getSupabaseAdmin(), workspaceId);
  if (!workspace)
    throw new OrgHttpError(404, "초대받은 Workspace를 찾지 못했습니다.");

  return {
    ok: true,
    workspace: {
      companyName: workspace.company_name,
      logoUrl: workspace.logo_url ?? null,
      workspaceId: workspace.company_workspace_id,
    },
  };
}

async function fetchMembershipsForUser(
  admin: SupabaseAdminClient,
  userId: string
) {
  const { data, error } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select(
      "id, company_user_id, company_workspace_id, role, created_at, updated_at"
    )
    .eq("company_user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CompanyUserWorkspaceRow[];
}

async function ensureOrgMembership(args: {
  admin: SupabaseAdminClient;
  user: User;
  workspaceId: string;
}) {
  const workspace = await fetchWorkspaceById(args.admin, args.workspaceId);
  if (!workspace) {
    throw new OrgHttpError(404, "Workspace not found");
  }

  const { data: existing, error: existingError } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("id")
    .eq("company_user_id", args.user.id)
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    await markOrgInvitationAccepted({
      admin: args.admin,
      email: getUserEmail(args.user),
      workspaceId: args.workspaceId,
    });
    return workspace;
  }

  const { error } = await (
    args.admin.from("company_user_workspace" as any) as any
  ).insert({
    company_user_id: args.user.id,
    company_workspace_id: args.workspaceId,
    role: "member",
  });

  if (error) throw error;

  await markOrgInvitationAccepted({
    admin: args.admin,
    email: getUserEmail(args.user),
    workspaceId: args.workspaceId,
  });

  try {
    await notifyOrgMemberJoinedSlack({
      user: {
        email: getUserEmail(args.user),
        name: getUserName(args.user),
        userId: args.user.id,
      },
      workspace: {
        companyName: workspace.company_name,
        workspaceId: workspace.company_workspace_id,
      },
    });
  } catch (slackError) {
    console.error("[org/slack] member joined notify failed", slackError);
  }

  return workspace;
}

export async function assertOrgWorkspaceAccess(args: {
  admin: SupabaseAdminClient;
  user: User;
  workspaceId: string;
}) {
  if (hasOrgAllInternalWorkspaceAccess(args.user)) {
    const workspace = await fetchWorkspaceById(args.admin, args.workspaceId);
    if (!workspace) throw new OrgHttpError(404, "Workspace not found");
    if (!workspace.is_internal) {
      throw new OrgHttpError(403, "Workspace access denied");
    }
    return;
  }

  const { data, error } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("id")
    .eq("company_user_id", args.user.id)
    .eq("company_workspace_id", args.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new OrgHttpError(403, "Workspace access denied");
}

export async function leaveOrgWorkspace(args: {
  user: User;
  workspaceId: string;
}): Promise<OrgWorkspaceLeaveResponse> {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  if (hasOrgAllInternalWorkspaceAccess(args.user)) {
    throw new OrgHttpError(
      400,
      "내부 운영 계정은 Organization에서 탈퇴할 수 없습니다."
    );
  }

  const admin = getSupabaseAdmin();
  const { data: membership, error: membershipError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("id")
    .eq("company_user_id", args.user.id)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    throw new OrgHttpError(
      404,
      "이미 탈퇴했거나 참여 중인 Workspace가 아닙니다."
    );
  }

  const { error: deleteError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .delete()
    .eq("id", membership.id)
    .eq("company_user_id", args.user.id);
  if (deleteError) throw deleteError;

  const remainingMemberships = await fetchMembershipsForUser(
    admin,
    args.user.id
  );
  return {
    nextWorkspaceId: remainingMemberships[0]?.company_workspace_id ?? null,
    ok: true,
    workspaceId,
  };
}

async function fetchWorkspacesByIds(
  admin: SupabaseAdminClient,
  workspaceIds: string[]
) {
  if (workspaceIds.length === 0) return [];
  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, updated_at"
    )
    .in("company_workspace_id", workspaceIds);

  if (error) throw error;
  return (data ?? []) as CompanyWorkspaceRow[];
}

async function fetchAllInternalWorkspaces(admin: SupabaseAdminClient) {
  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, updated_at"
    )
    .eq("is_internal", true)
    .order("company_name", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CompanyWorkspaceRow[];
}

async function fetchOrgMembers(
  admin: SupabaseAdminClient,
  workspaceId: string
) {
  const { data: memberships, error } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select(
      "id, company_user_id, company_workspace_id, role, created_at, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  const membershipRows = (memberships ?? []) as CompanyUserWorkspaceRow[];
  const userIds = uniqueTexts(membershipRows.map((row) => row.company_user_id));
  const userById = new Map<string, CompanyUserRow>();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await (
      admin.from("company_users" as any) as any
    )
      .select("user_id, email, name, profile_picture, role")
      .in("user_id", userIds);

    if (usersError) throw usersError;
    for (const row of (users ?? []) as CompanyUserRow[]) {
      userById.set(row.user_id, row);
    }
  }

  return membershipRows
    .map((row) => buildMember(row, userById.get(row.company_user_id) ?? null))
    .filter((member) => !isOrgAllInternalWorkspaceAccessEmail(member.email));
}

async function markOrgInvitationAccepted(args: {
  admin: SupabaseAdminClient;
  email: string | null;
  workspaceId: string;
}) {
  const email = normalizeText(args.email).toLowerCase();
  if (!email) return;
  const now = new Date().toISOString();
  const { error } = await (
    args.admin.from("company_workspace_invitations") as any
  )
    .update({ accepted_at: now, updated_at: now })
    .eq("company_workspace_id", args.workspaceId)
    .eq("email", email)
    .is("accepted_at", null);

  if (error) throw error;
}

async function fetchOrgPendingInvitations(
  admin: SupabaseAdminClient,
  workspaceId: string,
  members: OrgMember[]
): Promise<OrgWorkspaceInvitation[]> {
  const { data, error } = await (
    admin.from("company_workspace_invitations") as any
  )
    .select(
      "invitation_id, company_workspace_id, email, invited_by_user_id, last_sent_at, accepted_at, created_at, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .is("accepted_at", null)
    .order("last_sent_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as CompanyWorkspaceInvitationRow[];
  const memberEmails = new Set(
    members
      .map((member) => normalizeText(member.email).toLowerCase())
      .filter(Boolean)
  );
  const acceptedRows = rows.filter((row) => memberEmails.has(row.email));

  if (acceptedRows.length > 0) {
    const now = new Date().toISOString();
    const { error: reconcileError } = await (
      admin.from("company_workspace_invitations") as any
    )
      .update({ accepted_at: now, updated_at: now })
      .in(
        "invitation_id",
        acceptedRows.map((row) => row.invitation_id)
      );
    if (reconcileError) throw reconcileError;
  }

  return rows
    .filter((row) => !memberEmails.has(row.email))
    .map((row) => ({
      email: row.email,
      invitationId: row.invitation_id,
      invitedAt: row.created_at,
      lastSentAt: row.last_sent_at,
      status: "pending" as const,
    }));
}

async function fetchOrgRoles(admin: SupabaseAdminClient, workspaceId: string) {
  const { data, error } = await (admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at, is_expired"
    )
    .eq("company_workspace_id", workspaceId)
    .not("is_expired", "is", true);

  if (error) throw error;
  return sortRoles((data ?? []) as CompanyRoleRow[]).map(toRole);
}

export async function fetchOrgBootstrap(args: {
  orgId?: string | null;
  user: User;
}): Promise<OrgBootstrapResponse> {
  const admin = getSupabaseAdmin();
  const requestedWorkspaceId = normalizeText(args.orgId);
  const hasAllInternalWorkspaceAccess = hasOrgAllInternalWorkspaceAccess(
    args.user
  );

  await upsertOrgCompanyUser(admin, args.user);

  if (requestedWorkspaceId && !hasAllInternalWorkspaceAccess) {
    await ensureOrgMembership({
      admin,
      user: args.user,
      workspaceId: requestedWorkspaceId,
    });
  }

  const memberships = await fetchMembershipsForUser(admin, args.user.id);
  if (memberships.length === 0 && !hasAllInternalWorkspaceAccess) {
    return {
      currentUser: null,
      invitations: [],
      members: [],
      ok: true,
      roles: [],
      workspace: null,
      workspaces: [],
    };
  }

  const workspaces = hasAllInternalWorkspaceAccess
    ? await fetchAllInternalWorkspaces(admin)
    : await fetchWorkspacesByIds(
        admin,
        uniqueTexts(memberships.map((row) => row.company_workspace_id))
      );
  const workspaceById = new Map(
    workspaces.map((row) => [row.company_workspace_id, row])
  );
  const selectedWorkspaceId =
    requestedWorkspaceId && workspaceById.has(requestedWorkspaceId)
      ? requestedWorkspaceId
      : hasAllInternalWorkspaceAccess
        ? workspaces[0]?.company_workspace_id
        : memberships[0]?.company_workspace_id;
  const selectedWorkspace = selectedWorkspaceId
    ? (workspaceById.get(selectedWorkspaceId) ?? null)
    : null;

  if (!selectedWorkspace) {
    return {
      currentUser: hasAllInternalWorkspaceAccess
        ? buildVirtualOrgMember(args.user)
        : null,
      invitations: [],
      members: [],
      ok: true,
      roles: [],
      workspace: null,
      workspaces: workspaces.map(toWorkspace),
    };
  }

  const [members, roles] = await Promise.all([
    fetchOrgMembers(admin, selectedWorkspace.company_workspace_id),
    fetchOrgRoles(admin, selectedWorkspace.company_workspace_id),
  ]);
  const invitations = await fetchOrgPendingInvitations(
    admin,
    selectedWorkspace.company_workspace_id,
    members
  );

  return {
    currentUser:
      members.find((member) => member.userId === args.user.id) ??
      (hasAllInternalWorkspaceAccess ? buildVirtualOrgMember(args.user) : null),
    invitations,
    members,
    ok: true,
    roles,
    workspace: toWorkspace(selectedWorkspace),
    workspaces: workspaces.map(toWorkspace),
  };
}

function getOrgInviteFromEmail() {
  const configured = normalizeText(process.env.ORG_INVITE_FROM_EMAIL);
  if (configured) return configured;

  const defaultFrom = getDefaultResendFromEmail();
  const bracketedAddress = defaultFrom.match(/<\s*([^<>]+)\s*>$/)?.[1];
  const address = normalizeText(bracketedAddress ?? defaultFrom);
  return `Harper <${address}>`;
}

export async function sendOrgWorkspaceInvitations(args: {
  emails: unknown;
  siteUrl: string;
  user: User;
  workspaceId: string;
}): Promise<OrgInviteSendResponse> {
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  if (!Array.isArray(args.emails)) {
    throw new OrgHttpError(400, "emails must be an array");
  }
  if (args.emails.length > 20) {
    throw new OrgHttpError(400, "한 번에 최대 20명까지 초대할 수 있습니다.");
  }

  const emails = uniqueTexts(
    args.emails.map((email) => normalizeText(email).toLowerCase())
  );
  if (emails.length === 0) {
    throw new OrgHttpError(400, "초대할 이메일을 입력해 주세요.");
  }

  const admin = getSupabaseAdmin();
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });
  const workspace = await fetchWorkspaceById(admin, workspaceId);
  if (!workspace) throw new OrgHttpError(404, "Workspace not found");

  const members = await fetchOrgMembers(admin, workspaceId);
  const memberEmails = new Set(
    members
      .map((member) => normalizeText(member.email).toLowerCase())
      .filter(Boolean)
  );
  const inviterName = getUserName(args.user);
  const inviterEmail = getUserEmail(args.user);
  const inviteUrl = new URL("/org", args.siteUrl);
  inviteUrl.searchParams.set("orgId", workspaceId);
  const draft = buildOrgInviteEmail({
    companyName: workspace.company_name,
    inviteUrl: inviteUrl.toString(),
    inviterEmail,
    inviterName,
  });

  const results = await Promise.all(
    emails.map(async (email): Promise<OrgInviteDeliveryResult> => {
      if (email.length > 320 || !isValidEmailAddress(email)) {
        return {
          email,
          message: "이메일 형식을 확인해 주세요.",
          status: "invalid",
        };
      }
      if (memberEmails.has(email)) {
        return {
          email,
          message: "이미 Organization에 참여 중입니다.",
          status: "already_member",
        };
      }

      try {
        await sendResendEmail({
          from: getOrgInviteFromEmail(),
          html: draft.html,
          replyTo:
            inviterEmail && isValidEmailAddress(inviterEmail)
              ? inviterEmail
              : null,
          subject: draft.subject,
          text: draft.text,
          to: email,
        });
        const now = new Date().toISOString();
        const { error: invitationError } = await (
          admin.from("company_workspace_invitations") as any
        ).upsert(
          {
            accepted_at: null,
            company_workspace_id: workspaceId,
            email,
            invited_by_user_id: args.user.id,
            last_sent_at: now,
            updated_at: now,
          },
          { onConflict: "company_workspace_id,email" }
        );
        if (invitationError) throw invitationError;
        return {
          email,
          message: "초대 메일을 보냈습니다.",
          status: "sent",
        };
      } catch (error) {
        console.error("[org/invitations] send failed", {
          error: error instanceof Error ? error.message : String(error),
          workspaceId,
        });
        return {
          email,
          message: "메일을 보내지 못했습니다. 다시 시도해 주세요.",
          status: "failed",
        };
      }
    })
  );

  return { ok: true, results, workspaceId };
}

async function fetchRoleRowsForWorkspace(
  admin: SupabaseAdminClient,
  workspaceId: string
) {
  const { data, error } = await (admin.from("company_roles" as any) as any)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at, is_expired"
    )
    .eq("company_workspace_id", workspaceId)
    .not("is_expired", "is", true);

  if (error) throw error;
  return sortRoles((data ?? []) as CompanyRoleRow[]);
}

async function fetchCustomStages(
  admin: SupabaseAdminClient,
  roleIds: string[]
) {
  if (roleIds.length === 0) return [];
  const { data, error } = await (
    admin.from("ops_matching_role_stages" as any) as any
  )
    .select("id, role_id, label, sort_order")
    .in("role_id", roleIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RoleStageRow[];
}

function buildBoardStages(args: {
  customStages: RoleStageRow[];
  roleById: ReadonlyMap<string, CompanyRoleRow>;
  selectedRoleId: string | null;
}) {
  const stages: OrgStage[] = [
    { id: "pending_connection", label: "연결 대기", sortOrder: 0 },
    { id: "connected", label: "연결됨", sortOrder: 1 },
    ...args.customStages.map((row) => {
      const roleName = args.roleById.get(row.role_id)?.name ?? null;
      return {
        id: buildCustomStageId(row.id),
        label:
          args.selectedRoleId || !roleName
            ? row.label
            : `${roleName} · ${row.label}`,
        roleId: row.role_id,
        sortOrder: 100 + (row.sort_order ?? 0),
      };
    }),
    { id: "final_offer", label: "최종 오퍼", sortOrder: 10_000 },
    { id: "process_stopped", label: "프로세스 중단", sortOrder: 10_001 },
  ];

  return stages.sort((left, right) => left.sortOrder - right.sortOrder);
}

async function fetchTagsForBoard(args: {
  admin: SupabaseAdminClient;
  roleIds: string[];
  talentIds: string[];
}) {
  if (args.roleIds.length === 0 || args.talentIds.length === 0) {
    return new Map<string, TalentOpportunityTagRow[]>();
  }

  const { data, error } = await (
    args.admin.from("talent_opportunity_tag" as any) as any
  )
    .select("id, talent_id, opportunity_id, tag, created_at, updated_at")
    .in("opportunity_id", args.roleIds)
    .in("talent_id", args.talentIds)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw error;
  const map = new Map<string, TalentOpportunityTagRow[]>();
  for (const row of (data ?? []) as TalentOpportunityTagRow[]) {
    const key = `${row.talent_id}:${row.opportunity_id}`;
    const rows = map.get(key) ?? [];
    rows.push(row);
    map.set(key, rows);
  }
  return map;
}

async function fetchTalentRows(
  admin: SupabaseAdminClient,
  talentIds: string[]
) {
  if (talentIds.length === 0) return new Map<string, TalentUserRow>();
  const { data, error } = await (admin.from("talent_users" as any) as any)
    .select("user_id, email, name, profile_picture, headline")
    .in("user_id", talentIds);

  if (error) throw error;
  return new Map(
    ((data ?? []) as TalentUserRow[]).map((row) => [row.user_id, row])
  );
}

export async function fetchOrgBoard(args: {
  query?: string | null;
  recommendedDate?: string | null;
  recommendedFromDate?: string | null;
  recommendedToDate?: string | null;
  roleId?: string | null;
  user: User;
  workspaceId: string;
}): Promise<OrgBoardResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const selectedRoleId = normalizeNullableText(args.roleId);

  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const roleRows = await fetchRoleRowsForWorkspace(admin, workspaceId);
  const roleById = new Map(roleRows.map((row) => [row.role_id, row]));
  if (selectedRoleId && !roleById.has(selectedRoleId)) {
    throw new OrgHttpError(404, "Role not found");
  }

  const roleIds = selectedRoleId
    ? [selectedRoleId]
    : roleRows.map((row) => row.role_id);
  const customStages = await fetchCustomStages(admin, roleIds);
  const stages = buildBoardStages({
    customStages,
    roleById,
    selectedRoleId,
  });

  if (roleIds.length === 0) {
    return {
      items: [],
      roleId: selectedRoleId,
      stages,
      totalCount: 0,
      workspaceId,
    };
  }

  const dateRange = getDateRangeForKstDates({
    fallbackDate: args.recommendedDate,
    fromDate: args.recommendedFromDate,
    toDate: args.recommendedToDate,
  });
  let recommendationQuery = (
    admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, fit_summary, fit_reasons, recommended_at, created_at, updated_at"
    )
    .in("role_id", roleIds)
    .order("recommended_at", { ascending: false })
    .limit(800);

  if (dateRange.startIso) {
    recommendationQuery = recommendationQuery.gte(
      "recommended_at",
      dateRange.startIso
    );
  }
  if (dateRange.endIso) {
    recommendationQuery = recommendationQuery.lt(
      "recommended_at",
      dateRange.endIso
    );
  }

  const { data: recommendations, error } = await recommendationQuery;
  if (error) throw error;

  const recommendationRows = (recommendations ?? []) as RecommendationRow[];
  const talentIds = uniqueTexts(recommendationRows.map((row) => row.talent_id));
  const [talentById, tagsByKey, profileLabels] = await Promise.all([
    fetchTalentRows(admin, talentIds),
    fetchTagsForBoard({ admin, roleIds, talentIds }),
    fetchBoardProfileLabels({ admin, talentIds }),
  ]);
  const customStageByTagKey = new Map(
    customStages.map((row) => [
      customTagKeyFromStageRow(row),
      buildCustomStageId(row.id),
    ])
  );
  const searchQuery = normalizeText(args.query).toLowerCase();

  const items = recommendationRows.flatMap((row): OrgBoardItem[] => {
    const talent = talentById.get(row.talent_id);
    if (!talent) return [];
    const recentCompanies =
      profileLabels.recentCompanies.get(row.talent_id) ?? [];
    const recentSchools = profileLabels.recentSchools.get(row.talent_id) ?? [];

    if (searchQuery) {
      const haystack = [
        talent.name,
        talent.email,
        talent.headline,
        roleById.get(row.role_id)?.name,
        ...recentCompanies.flatMap((item) => [
          item.label,
          item.detail,
          item.period,
        ]),
        ...recentSchools.flatMap((item) => [
          item.label,
          item.detail,
          item.period,
        ]),
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .join(" ");
      if (!haystack.includes(searchQuery)) return [];
    }

    const stageInfo = getVisibleOrgStage({
      customStageByTagKey,
      tags: tagsByKey.get(`${row.talent_id}:${row.role_id}`) ?? [],
    });
    if (!stageInfo) return [];

    return [
      {
        createdAt: row.created_at,
        fitReasons: coerceJsonStringList(row.fit_reasons),
        fitSummary: row.fit_summary ?? null,
        recommendedAt: row.recommended_at,
        recommendationId: row.id,
        roleId: row.role_id,
        roleName: roleById.get(row.role_id)?.name ?? null,
        stage: stageInfo.stage,
        stageTag: stageInfo.stageTag,
        talent: toBoardTalent(talent, { recentCompanies, recentSchools }),
        talentId: row.talent_id,
        updatedAt: row.updated_at,
      },
    ];
  });

  return {
    items,
    roleId: selectedRoleId,
    stages,
    totalCount: items.length,
    workspaceId,
  };
}

async function fetchRecommendationForStage(args: {
  admin: SupabaseAdminClient;
  recommendationId: string;
  roleId: string;
  talentId: string;
}) {
  const { data, error } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, fit_summary, fit_reasons, recommended_at, created_at, updated_at"
    )
    .eq("id", args.recommendationId)
    .eq("role_id", args.roleId)
    .eq("talent_id", args.talentId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Recommendation not found");
  return data as RecommendationRow;
}

async function fetchOrgSlackTalent(
  admin: SupabaseAdminClient,
  talentId: string
) {
  const { data, error } = await (admin.from("talent_users" as any) as any)
    .select("user_id, email, name")
    .eq("user_id", talentId)
    .maybeSingle();

  if (error) throw error;
  const row = data as TalentUserRow | null;
  return row
    ? {
        email: row.email ?? null,
        name: row.name ?? null,
        talentId: row.user_id,
      }
    : null;
}

async function fetchOrgCompanyUser(admin: SupabaseAdminClient, user: User) {
  const { data, error } = await (admin.from("company_users" as any) as any)
    .select("user_id, email, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  const row = data as CompanyUserRow | null;
  return {
    email: normalizeText(row?.email ?? user.email).toLowerCase() || null,
    name: normalizeNullableText(row?.name) ?? getUserName(user),
    userId: user.id,
  };
}

function buildOrgIntroDeliveryIdentity(args: {
  recommendationId: string;
  recipients: string[];
}) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        recommendationId: args.recommendationId,
        recipients: [...args.recipients].sort(),
      })
    )
    .digest("hex");
  const uuidHex = digest.slice(0, 32).split("");
  uuidHex[12] = "4";
  uuidHex[16] = "8";
  const normalizedUuidHex = uuidHex.join("");

  return {
    idempotencyKey: `org-intro/${digest}`,
    messageId: [
      normalizedUuidHex.slice(0, 8),
      normalizedUuidHex.slice(8, 12),
      normalizedUuidHex.slice(12, 16),
      normalizedUuidHex.slice(16, 20),
      normalizedUuidHex.slice(20, 32),
    ].join("-"),
  };
}

function getOrgIntroFromEmail() {
  const configured = normalizeText(process.env.ORG_INTRO_FROM_EMAIL);
  if (configured) return configured;

  const defaultFrom = getDefaultResendFromEmail();
  const bracketedAddress = defaultFrom.match(/<\s*([^<>]+)\s*>$/)?.[1];
  const address = normalizeText(bracketedAddress ?? defaultFrom);
  return `Harper <${address}>`;
}

function isOrgIntroMailTypeConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; message?: unknown };
  return (
    row.code === "23514" &&
    typeof row.message === "string" &&
    row.message.includes("career_email_messages_mail_type_check")
  );
}

async function sendOrgIntroEmail(args: {
  acceptReason: string;
  admin: SupabaseAdminClient;
  candidate: {
    email: string | null;
    name: string | null;
    talentId: string;
  };
  companyUser: {
    email: string | null;
    name: string;
    userId: string;
  };
  introEmails: string[];
  recommendation: RecommendationRow;
  role: CompanyRoleRow;
  workspace: CompanyWorkspaceRow;
}) {
  const candidateEmail = normalizeText(args.candidate.email).toLowerCase();
  const companyUserEmail = normalizeText(args.companyUser.email).toLowerCase();
  if (!candidateEmail || !isValidEmailAddress(candidateEmail)) {
    throw new OrgHttpError(422, "Candidate email is missing or invalid");
  }
  if (!companyUserEmail || !isValidEmailAddress(companyUserEmail)) {
    throw new OrgHttpError(
      422,
      "Current company user email is missing or invalid"
    );
  }

  const cc = normalizeLooseEmailList([
    companyUserEmail,
    ...args.introEmails,
  ]).filter((email) => email !== candidateEmail);
  if (cc.some((email) => !isValidEmailAddress(email))) {
    throw new OrgHttpError(400, "One or more introduction emails are invalid");
  }

  const recipients = [candidateEmail, ...cc];
  const identity = buildOrgIntroDeliveryIdentity({
    recommendationId: args.recommendation.id,
    recipients,
  });
  const fromEmail = getOrgIntroFromEmail();
  const { data: existingMessage, error: existingError } = await (
    args.admin.from("career_email_messages" as any) as any
  )
    .select("id, body_text, metadata, status, subject")
    .eq("id", identity.messageId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingMessage?.status === "sent") {
    return {
      cc,
      messageId: identity.messageId,
      recipients,
      resendEmailId: null as string | null,
    };
  }

  const storedSubject = normalizeText(existingMessage?.subject);
  const storedBody = normalizeText(existingMessage?.body_text);
  const generatedDraft =
    storedSubject && storedBody
      ? null
      : await buildOrgIntroEmailDraft({
          acceptanceReason: args.acceptReason || null,
          candidateName:
            normalizeText(args.candidate.name) || candidateEmail.split("@")[0],
          companyDescription:
            normalizeNullableText(args.workspace.company_description)?.slice(
              0,
              3_000
            ) ?? null,
          companyName: args.workspace.company_name,
          companyUserName: args.companyUser.name,
          fitReasons: coerceJsonStringList(args.recommendation.fit_reasons)
            .slice(0, 10)
            .map((reason) => reason.slice(0, 1_000)),
          fitSummary:
            normalizeNullableText(args.recommendation.fit_summary)?.slice(
              0,
              3_000
            ) ?? null,
          pitch:
            normalizeNullableText(args.workspace.pitch)?.slice(0, 3_000) ??
            null,
          roleTitle: args.role.name,
          senderName: "Harper",
        });
  const subject = storedSubject || generatedDraft?.subject || "";
  const body = storedBody || generatedDraft?.body || "";
  const model = generatedDraft?.model ?? "claude-sonnet-5";
  const now = new Date().toISOString();
  const baseMetadata = {
    cc,
    companyUserId: args.companyUser.userId,
    companyUserName: args.companyUser.name,
    emailKind: "orgIntro",
    idempotencyKey: identity.idempotencyKey,
    model,
    recommendationId: args.recommendation.id,
    recipients,
    roleId: args.role.role_id,
    source: "org_candidate_acceptance",
    workspaceId: args.workspace.company_workspace_id,
  } satisfies Record<string, unknown>;
  let messageMetadata: Record<string, unknown> = baseMetadata;
  const queuedMessage = {
    body_text: body,
    created_by: args.companyUser.userId,
    direction: "outbound",
    from_email: fromEmail,
    id: identity.messageId,
    mail_type: "org_intro",
    metadata: messageMetadata as Json,
    occurred_at: now,
    status: "queued",
    subject,
    talent_id: args.candidate.talentId,
    to_email: candidateEmail,
  };
  let { error: queueError } = await (
    args.admin.from("career_email_messages" as any) as any
  ).upsert(queuedMessage, { onConflict: "id" });

  if (isOrgIntroMailTypeConstraintError(queueError)) {
    messageMetadata = {
      ...baseMetadata,
      intendedMailType: "org_intro",
      schemaFallback: "career_email_messages_mail_type_check",
      storedMailType: "other",
    };
    console.warn(
      "[org/intro-email] org_intro mail type is not available; retrying as other",
      { messageId: identity.messageId }
    );
    const fallbackResult = await (
      args.admin.from("career_email_messages" as any) as any
    ).upsert(
      {
        ...queuedMessage,
        mail_type: "other",
        metadata: messageMetadata as Json,
      },
      { onConflict: "id" }
    );
    queueError = fallbackResult.error;
  }

  if (queueError) throw queueError;

  let sendResult: { id?: string };
  try {
    sendResult = await sendResendEmail({
      cc,
      from: fromEmail,
      html: renderEmailBodyHtml(body),
      idempotencyKey: identity.idempotencyKey,
      subject,
      text: body,
      to: candidateEmail,
    });
  } catch (error) {
    const { error: failedUpdateError } = await (
      args.admin.from("career_email_messages" as any) as any
    )
      .update({
        metadata: {
          ...messageMetadata,
          sendError: error instanceof Error ? error.message : String(error),
        } as Json,
        status: "failed",
      })
      .eq("id", identity.messageId);
    if (failedUpdateError) {
      console.error("[org/intro-email] failed to record send error", {
        error: failedUpdateError,
        messageId: identity.messageId,
      });
    }
    throw error;
  }

  const sentAt = new Date().toISOString();
  const { error: sentUpdateError } = await (
    args.admin.from("career_email_messages" as any) as any
  )
    .update({
      metadata: {
        ...messageMetadata,
        resendEmailId: sendResult.id ?? null,
      } as Json,
      occurred_at: sentAt,
      status: "sent",
    })
    .eq("id", identity.messageId);

  if (sentUpdateError) throw sentUpdateError;

  return {
    cc,
    messageId: identity.messageId,
    recipients,
    resendEmailId: sendResult.id ?? null,
  };
}

function getStageTagForInsert(stage: OrgStageId) {
  if (stage === "pending_connection")
    return STAGE_TAG_BY_STAGE.pending_connection;
  if (stage === "connected") return STAGE_TAG_BY_STAGE.connected;
  if (stage === "final_offer") return STAGE_TAG_BY_STAGE.final_offer;
  if (stage === "process_stopped") return STAGE_TAG_BY_STAGE.process_stopped;
  const customStageId = getCustomStageDbId(stage);
  if (!customStageId) throw new OrgHttpError(400, "Invalid stage");
  return buildCustomStageTag(customStageId);
}

async function fetchStageRowsForRole(
  admin: SupabaseAdminClient,
  roleId: string
) {
  const { data, error } = await (
    admin.from("ops_matching_role_stages" as any) as any
  )
    .select("id, role_id, label, sort_order")
    .eq("role_id", roleId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RoleStageRow[];
}

function validateStageForRole(stage: OrgStageId, stageRows: RoleStageRow[]) {
  if (!stage.startsWith(CUSTOM_STAGE_ID_PREFIX)) return;
  const customStageId = getCustomStageDbId(stage);
  if (!stageRows.some((row) => row.id === customStageId)) {
    throw new OrgHttpError(400, "Invalid stage");
  }
}

export async function setOrgCandidateStage(args: {
  acceptReason?: string | null;
  introEmails?: string[] | null;
  recommendationId: string;
  roleId: string;
  stage: OrgStageId;
  stopNote?: string | null;
  stopReason?: OrgStopReason | null;
  talentId: string;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  const recommendationId = normalizeText(args.recommendationId);
  const stage = normalizeText(args.stage) as OrgStageId;
  const acceptReason = normalizeText(args.acceptReason).slice(0, 2000);
  const introEmails = normalizeLooseEmailList(args.introEmails);
  const stopNote = normalizeText(args.stopNote);

  if (!workspaceId || !roleId || !talentId || !recommendationId || !stage) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  if (
    stage === "process_stopped" &&
    args.stopReason !== "candidate" &&
    args.stopReason !== "company"
  ) {
    throw new OrgHttpError(400, "Stop reason is required");
  }
  if (stage === "process_stopped" && !stopNote) {
    throw new OrgHttpError(400, "Stop note is required");
  }
  if (introEmails.some((email) => !isValidEmailAddress(email))) {
    throw new OrgHttpError(400, "One or more introduction emails are invalid");
  }

  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });
  await upsertOrgCompanyUser(admin, args.user);
  const roleRows = await fetchRoleRowsForWorkspace(admin, workspaceId);
  const role = roleRows.find((row) => row.role_id === roleId);
  if (!role) throw new OrgHttpError(404, "Role not found");

  const stageRows = await fetchStageRowsForRole(admin, roleId);
  validateStageForRole(stage, stageRows);
  const recommendation = await fetchRecommendationForStage({
    admin,
    recommendationId,
    roleId,
    talentId,
  });

  const allStageTags = [
    ...Object.values(STAGE_TAG_BY_STAGE),
    ...EXTRA_INTERNAL_STAGE_TAGS,
    ...stageRows.map((row) => buildCustomStageTag(row.id)),
  ];
  const { data: previousTags, error: previousError } = await (
    admin.from("talent_opportunity_tag" as any) as any
  )
    .select("id, talent_id, opportunity_id, tag, created_at, updated_at")
    .eq("talent_id", talentId)
    .eq("opportunity_id", roleId)
    .in("tag", allStageTags);

  if (previousError) throw previousError;
  const previousStage =
    getVisibleOrgStage({
      customStageByTagKey: new Map(
        stageRows.map((row) => [
          customTagKeyFromStageRow(row),
          buildCustomStageId(row.id),
        ])
      ),
      tags: (previousTags ?? []) as TalentOpportunityTagRow[],
    })?.stage ?? "pending_connection";

  const isIntroRequested =
    stage !== "process_stopped" && introEmails.length > 0;
  let introDelivery: {
    cc: string[];
    messageId: string;
    recipients: string[];
    resendEmailId: string | null;
  } | null = null;

  if (isIntroRequested) {
    const [workspace, candidate, companyUser] = await Promise.all([
      fetchWorkspaceById(admin, workspaceId),
      fetchOrgSlackTalent(admin, talentId),
      fetchOrgCompanyUser(admin, args.user),
    ]);
    if (!workspace) throw new OrgHttpError(404, "Workspace not found");
    if (!candidate) throw new OrgHttpError(404, "Candidate not found");

    try {
      introDelivery = await sendOrgIntroEmail({
        acceptReason,
        admin,
        candidate,
        companyUser,
        introEmails,
        recommendation,
        role,
        workspace,
      });
    } catch (error) {
      if (error instanceof OrgHttpError) throw error;
      console.error("[org/intro-email] generation or delivery failed", error);
      throw new OrgHttpError(
        502,
        "연결 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }

  const { error: deleteError } = await (
    admin.from("talent_opportunity_tag" as any) as any
  )
    .delete()
    .eq("talent_id", talentId)
    .eq("opportunity_id", roleId)
    .in("tag", allStageTags);

  if (deleteError) throw deleteError;

  const nextTag = getStageTagForInsert(stage);
  const { error: insertError } = await (
    admin.from("talent_opportunity_tag" as any) as any
  ).insert({
    opportunity_id: roleId,
    tag: nextTag,
    talent_id: talentId,
  });

  if (insertError) throw insertError;

  const previousLabel = buildStageLabel(previousStage, stageRows);
  const nextLabel = buildStageLabel(stage, stageRows);
  const nextDestinationLabel = buildStageDestinationLabel(nextLabel);
  const baseText =
    stage === "process_stopped"
      ? `프로세스 중단으로 옮겼습니다.`
      : isIntroRequested
        ? previousStage === stage
          ? `warm intro를 요청했습니다.`
          : `${nextDestinationLabel} 옮기고 warm intro를 요청했습니다.`
        : previousStage === stage
          ? `${nextDestinationLabel} 표시했습니다.`
          : `${previousLabel}에서 ${nextDestinationLabel} 옮겼습니다.`;
  const text =
    stage !== "process_stopped" && acceptReason
      ? `${baseText}\n수락 이유: ${acceptReason}`
      : baseText;
  const metadata = {
    acceptReason: stage !== "process_stopped" ? acceptReason || null : null,
    introEmailCc: introDelivery?.cc ?? [],
    introEmailMessageId: introDelivery?.messageId ?? null,
    introEmailRecipients: introDelivery?.recipients ?? [],
    introEmailResendId: introDelivery?.resendEmailId ?? null,
    introEmails: isIntroRequested ? introEmails : [],
    introRequested: isIntroRequested,
    org: true,
    previousStage,
    stage,
    stopNote: stage === "process_stopped" ? stopNote : null,
    stopReason: stage === "process_stopped" ? (args.stopReason ?? null) : null,
    tag: nextTag,
    workspaceId,
  } satisfies Record<string, unknown>;

  const { error: progressError } = await (
    admin.from("talent_progress" as any) as any
  ).insert({
    company_user_id: args.user.id,
    kind: "org_stage_change",
    metadata: metadata as Json,
    recommendation_id: recommendationId,
    role_id: roleId,
    talent_id: talentId,
    text,
    user_id: getUserEmail(args.user),
  });

  if (progressError) throw progressError;

  if (isIntroRequested || stage === "process_stopped") {
    try {
      const [workspace, candidate] = await Promise.all([
        fetchWorkspaceById(admin, workspaceId),
        fetchOrgSlackTalent(admin, talentId),
      ]);

      if (workspace && candidate) {
        const slackBaseArgs = {
          actor: {
            email: getUserEmail(args.user),
            name: getUserName(args.user),
            userId: args.user.id,
          },
          candidate,
          roleId,
          roleName: role.name,
          workspace: {
            companyName: workspace.company_name,
            workspaceId: workspace.company_workspace_id,
          },
        };

        if (isIntroRequested) {
          await notifyOrgCandidateAcceptedSlack({
            ...slackBaseArgs,
            acceptReason,
            introEmails,
          });
        } else {
          await notifyOrgCandidateRejectedSlack({
            ...slackBaseArgs,
            stopNote,
            stopReason: args.stopReason ?? null,
          });
        }
      }
    } catch (slackError) {
      console.error("[org/slack] candidate decision notify failed", slackError);
    }
  }

  return {
    ok: true as const,
    roleId,
    stage,
    talentId,
  };
}

export async function createOrgTalentFeedItem(args: {
  recommendationId?: string | null;
  roleId: string;
  talentId: string;
  text: string;
  user: User;
  workspaceId: string;
}): Promise<OrgFeedCreateResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  const text = normalizeText(args.text).slice(0, 2000);
  if (!workspaceId || !roleId || !talentId || !text) {
    throw new OrgHttpError(400, "Missing required fields");
  }

  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });
  await upsertOrgCompanyUser(admin, args.user);
  const roleRows = await fetchRoleRowsForWorkspace(admin, workspaceId);
  if (!roleRows.some((row) => row.role_id === roleId)) {
    throw new OrgHttpError(404, "Role not found");
  }

  const recommendation = await fetchRecommendationForDetail({
    admin,
    recommendationId: normalizeNullableText(args.recommendationId),
    roleId,
    talentId,
  });

  const { error } = await (admin.from("talent_progress" as any) as any).insert({
    company_user_id: args.user.id,
    kind: "org_note",
    metadata: {
      org: true,
      workspaceId,
    } as Json,
    recommendation_id: recommendation.id,
    role_id: roleId,
    talent_id: talentId,
    text,
    user_id: getUserEmail(args.user),
  });

  if (error) throw error;
  return { ok: true };
}

async function fetchMutableOrgFeedRow(args: {
  admin: SupabaseAdminClient;
  progressId: string;
  user: User;
  workspaceId: string;
}) {
  const progressId = normalizeText(args.progressId);
  const workspaceId = normalizeText(args.workspaceId);
  if (!progressId || !workspaceId) {
    throw new OrgHttpError(400, "Missing required fields");
  }

  await assertOrgWorkspaceAccess({
    admin: args.admin,
    user: args.user,
    workspaceId,
  });

  const { data, error } = await (
    args.admin.from("talent_progress" as any) as any
  )
    .select(
      "id, talent_id, role_id, recommendation_id, text, kind, metadata, company_user_id, user_id, created_at"
    )
    .eq("id", progressId)
    .maybeSingle();

  if (error) throw error;
  const row = data as TalentProgressRow | null;
  if (!row) throw new OrgHttpError(404, "Feed item not found");
  if (row.company_user_id !== args.user.id) {
    throw new OrgHttpError(403, "Feed item access denied");
  }
  if (row.kind !== "org_note") {
    throw new OrgHttpError(400, "Only notes can be changed");
  }

  const roleRows = await fetchRoleRowsForWorkspace(args.admin, workspaceId);
  if (!roleRows.some((role) => role.role_id === row.role_id)) {
    throw new OrgHttpError(403, "Feed item access denied");
  }

  return row;
}

export async function updateOrgTalentFeedItem(args: {
  progressId: string;
  text: string;
  user: User;
  workspaceId: string;
}): Promise<OrgFeedMutationResponse> {
  const admin = getSupabaseAdmin();
  const text = normalizeText(args.text).slice(0, 2000);
  if (!text) throw new OrgHttpError(400, "Text is required");

  const row = await fetchMutableOrgFeedRow({
    admin,
    progressId: args.progressId,
    user: args.user,
    workspaceId: args.workspaceId,
  });

  const { error } = await (admin.from("talent_progress" as any) as any)
    .update({ text })
    .eq("id", row.id);

  if (error) throw error;
  return { ok: true };
}

export async function deleteOrgTalentFeedItem(args: {
  progressId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgFeedMutationResponse> {
  const admin = getSupabaseAdmin();
  const row = await fetchMutableOrgFeedRow({
    admin,
    progressId: args.progressId,
    user: args.user,
    workspaceId: args.workspaceId,
  });

  const { error } = await (admin.from("talent_progress" as any) as any)
    .delete()
    .eq("id", row.id);

  if (error) throw error;
  return { ok: true };
}

function getExtraMarkdown(extras: TalentExtraRow[]) {
  const lines: string[] = [];
  for (const extra of extras) {
    const values = Array.isArray(extra.content)
      ? extra.content
      : extra.content && typeof extra.content === "object"
        ? Object.values(extra.content as Record<string, unknown>)
        : [];
    for (const item of values) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const title = normalizeNullableText(record.title ?? record.name);
      const description = normalizeNullableText(
        record.description ?? record.memo
      );
      const date = normalizeNullableText(record.date);
      if (!title && !description) continue;
      lines.push(`- ${[title, date].filter(Boolean).join(" · ")}`);
      if (description) lines.push(`  ${description}`);
    }
  }
  return lines;
}

function buildProfileExtras(extras: TalentExtraRow[]): OrgProfileExtra[] {
  return extras.flatMap((extra) => {
    const values = Array.isArray(extra.content)
      ? extra.content
      : extra.content && typeof extra.content === "object"
        ? Object.values(extra.content as Record<string, unknown>)
        : [];

    return values.flatMap((item): OrgProfileExtra[] => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const title = normalizeNullableText(record.title ?? record.name);
      const description = normalizeNullableText(
        record.description ?? record.memo
      );
      const date = normalizeNullableText(record.date);
      if (!title && !description) return [];
      return [{ date, description, title }];
    });
  });
}

function buildProfileMarkdown(args: {
  educations: TalentEducationRow[];
  experiences: TalentExperienceRow[];
  extras: TalentExtraRow[];
  insights: TalentInsightRow[];
  talent: TalentUserRow;
}) {
  const resumeText = normalizeText(args.talent.resume_text);
  if (resumeText) return resumeText;

  const sections: string[] = [];
  if (args.talent.bio) sections.push(args.talent.bio.trim());

  if (args.experiences.length > 0) {
    const lines = args.experiences.map((item) => {
      const title = [item.role, item.company_name].filter(Boolean).join(" · ");
      const period = [item.start_date, item.end_date ?? "Present"]
        .filter(Boolean)
        .join(" - ");
      return `- ${[title || "Experience", period].filter(Boolean).join(" | ")}`;
    });
    sections.push(["## Experience", ...lines].join("\n"));
  }

  if (args.educations.length > 0) {
    const lines = args.educations.map((item) => {
      const title = [item.school, item.degree, item.field]
        .filter(Boolean)
        .join(" · ");
      const period = [item.start_date, item.end_date]
        .filter(Boolean)
        .join(" - ");
      return `- ${[title || "Education", period].filter(Boolean).join(" | ")}`;
    });
    sections.push(["## Education", ...lines].join("\n"));
  }

  const extraLines = getExtraMarkdown(args.extras);
  if (extraLines.length > 0) {
    sections.push(["## Extra", ...extraLines].join("\n"));
  }

  const insightLines = args.insights.flatMap((row) => {
    if (!row.content || typeof row.content !== "object") return [];
    return Object.entries(row.content as Record<string, unknown>).flatMap(
      ([key, value]) => {
        if (typeof value !== "string" || !value.trim()) return [];
        return [`- ${key}: ${value.trim()}`];
      }
    );
  });
  if (insightLines.length > 0) {
    sections.push(["## Insights", ...insightLines].join("\n"));
  }

  return sections.join("\n\n").trim();
}

async function fetchRecommendationForDetail(args: {
  admin: SupabaseAdminClient;
  recommendationId?: string | null;
  roleId?: string | null;
  talentId: string;
}) {
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, recommended_at, created_at, updated_at"
    )
    .eq("talent_id", args.talentId)
    .order("recommended_at", { ascending: false })
    .limit(1);

  if (args.recommendationId) query = query.eq("id", args.recommendationId);
  if (args.roleId) query = query.eq("role_id", args.roleId);

  const { data, error } = await query;
  if (error) throw error;
  const row = ((data ?? []) as RecommendationRow[])[0] ?? null;
  if (!row) throw new OrgHttpError(404, "Recommendation not found");
  return row;
}

async function fetchProgressActors(
  admin: SupabaseAdminClient,
  progressRows: TalentProgressRow[]
) {
  const companyUserIds = uniqueTexts(
    progressRows.flatMap((row) =>
      row.company_user_id ? [row.company_user_id] : []
    )
  );
  if (companyUserIds.length === 0) return new Map<string, OrgFeedActor>();

  const { data, error } = await (admin.from("company_users" as any) as any)
    .select("user_id, email, name, profile_picture")
    .in("user_id", companyUserIds);

  if (error) throw error;
  const rows = (data ?? []) as CompanyUserRow[];
  const userById = new Map(rows.map((row) => [row.user_id, row]));

  return new Map(
    companyUserIds.flatMap((companyUserId) => {
      const row = userById.get(companyUserId);
      if (!row) return [];
      return [
        [
          companyUserId,
          {
            companyUserId: row.user_id,
            email: row.email ?? null,
            name: row.name ?? null,
            profilePicture: row.profile_picture ?? null,
            userId: row.user_id,
          },
        ] as const,
      ];
    })
  );
}

function optionalRows<T>(
  result: { data: unknown; error: unknown },
  label: string
) {
  if (result.error) {
    console.error(`[org/detail] ${label}`, result.error);
    return [] as T[];
  }
  return ((result.data ?? []) as T[]) ?? [];
}

function isAcceptedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return normalized === "like" || normalized === "positive";
}

function isRejectedFeedback(feedback: string | null | undefined) {
  const normalized = normalizeText(feedback).toLowerCase();
  return normalized === "dislike" || normalized === "negative";
}

function appendReason(text: string, reason: string | null) {
  return reason ? `${text}\n이유: ${reason}` : text;
}

function getOrgStageChangeFeedKind(row: TalentProgressRow) {
  if (row.kind !== "org_stage_change") return row.kind;
  const metadata = getJsonRecord(row.metadata);
  const stage = normalizeText(metadata.stage);
  const acceptReason = normalizeNullableText(metadata.acceptReason);
  const stopNote = normalizeNullableText(metadata.stopNote);

  if (stage === "connected" || acceptReason) return "org_acceptance";
  if (stage === "process_stopped" || stopNote) return "org_rejection";
  return row.kind;
}

function getOrgProgressFeedText(row: TalentProgressRow) {
  if (row.kind !== "org_stage_change") return row.text;
  const metadata = getJsonRecord(row.metadata);
  const kind = getOrgStageChangeFeedKind(row);

  if (kind === "org_acceptance") {
    return appendReason(
      "수락했습니다.",
      normalizeNullableText(metadata.acceptReason)
    );
  }
  if (kind === "org_rejection") {
    return appendReason(
      "거절했습니다.",
      normalizeNullableText(metadata.stopNote)
    );
  }
  return row.text;
}

function buildRecommendationFeedbackFeedItem(args: {
  recommendation: RecommendationRow;
  roleName: string | null;
}): OrgFeedItem | null {
  const accepted = isAcceptedFeedback(args.recommendation.feedback);
  const rejected = isRejectedFeedback(args.recommendation.feedback);
  if (!accepted && !rejected) return null;

  const actionText = accepted ? "수락" : "거절";
  return {
    actor: null,
    companyUserId: null,
    createdAt:
      args.recommendation.feedback_at ??
      args.recommendation.updated_at ??
      args.recommendation.recommended_at,
    id: `recommendation-feedback:${args.recommendation.id}`,
    kind: accepted
      ? "talent_recommendation_accepted"
      : "talent_recommendation_rejected",
    recommendationId: args.recommendation.id,
    roleId: args.recommendation.role_id,
    roleName: args.roleName,
    text: appendReason(
      `Talent가 이 추천을 ${actionText}했습니다.`,
      normalizeNullableText(args.recommendation.feedback_reason)
    ),
  };
}

function sortOrgFeedItems(items: OrgFeedItem[]) {
  return items.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    return (
      (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0)
    );
  });
}

export async function fetchOrgTalentDetail(args: {
  recommendationId?: string | null;
  roleId?: string | null;
  talentId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgTalentDetailResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const talentId = normalizeText(args.talentId);
  if (!workspaceId || !talentId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const recommendation = await fetchRecommendationForDetail({
    admin,
    recommendationId: normalizeNullableText(args.recommendationId),
    roleId: normalizeNullableText(args.roleId),
    talentId,
  });
  const roleRows = await fetchRoleRowsForWorkspace(admin, workspaceId);
  const roleRow = roleRows.find(
    (row) => row.role_id === recommendation.role_id
  );
  if (!roleRow) throw new OrgHttpError(404, "Role not found");

  const [
    talentResult,
    experiencesResult,
    educationsResult,
    extrasResult,
    insightsResult,
    progressResult,
  ] = await Promise.all([
    (admin.from("talent_users" as any) as any)
      .select(
        "user_id, email, name, profile_picture, headline, bio, current_location, location, resume_file_name, resume_storage_path, resume_links, resume_text"
      )
      .eq("user_id", talentId)
      .maybeSingle(),
    (admin.from("talent_experiences" as any) as any)
      .select("*")
      .eq("talent_id", talentId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    (admin.from("talent_educations" as any) as any)
      .select("*")
      .eq("talent_id", talentId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    (admin.from("talent_extras" as any) as any)
      .select("*")
      .eq("talent_id", talentId),
    (admin.from("talent_insights" as any) as any)
      .select("*")
      .eq("talent_id", talentId)
      .order("created_at", { ascending: false }),
    (admin.from("talent_progress" as any) as any)
      .select(
        "id, talent_id, role_id, recommendation_id, text, kind, metadata, company_user_id, user_id, created_at"
      )
      .eq("talent_id", talentId)
      .eq("role_id", recommendation.role_id)
      .in("kind", ["org_stage_change", "org_note"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const talent = talentResult.data as TalentUserRow | null;
  if (talentResult.error) throw talentResult.error;
  if (!talent) throw new OrgHttpError(404, "Talent not found");

  const experiences = optionalRows<TalentExperienceRow>(
    experiencesResult,
    "experiences"
  );
  const educations = optionalRows<TalentEducationRow>(
    educationsResult,
    "educations"
  );
  const extras = optionalRows<TalentExtraRow>(extrasResult, "extras");
  const insights = optionalRows<TalentInsightRow>(insightsResult, "insights");
  const progressRows = optionalRows<TalentProgressRow>(
    progressResult,
    "progress"
  );
  const registeredLinks = Array.isArray(talent.resume_links)
    ? talent.resume_links.filter((link) => normalizeText(link))
    : [];
  const actorById = await fetchProgressActors(admin, progressRows).catch(
    (error) => {
      console.error("[org/detail] progress actors", error);
      return new Map<string, OrgFeedActor>();
    }
  );

  const progressFeedItems: OrgFeedItem[] = progressRows.map((row) => {
    const actorKey = row.company_user_id;
    return {
      actor: actorKey ? (actorById.get(actorKey) ?? null) : null,
      companyUserId: row.company_user_id ?? null,
      createdAt: row.created_at,
      id: row.id,
      kind: getOrgStageChangeFeedKind(row),
      recommendationId: row.recommendation_id ?? null,
      roleId: row.role_id,
      roleName: roleRow.name,
      text: getOrgProgressFeedText(row),
    };
  });
  const recommendationFeedbackItem = buildRecommendationFeedbackFeedItem({
    recommendation,
    roleName: roleRow.name,
  });

  return {
    feed: sortOrgFeedItems(
      recommendationFeedbackItem
        ? [...progressFeedItems, recommendationFeedbackItem]
        : progressFeedItems
    ).slice(0, 50),
    profile: {
      bio: talent.bio ?? null,
      educations: educations.map((education) => ({
        degree: education.degree ?? null,
        description: education.description ?? education.memo ?? null,
        endDate: education.end_date ?? null,
        field: education.field ?? null,
        school: education.school ?? null,
        startDate: education.start_date ?? null,
        url: education.url ?? null,
      })),
      experiences: experiences.map((experience) => ({
        companyLocation: experience.company_location ?? null,
        companyName: experience.company_name ?? null,
        description: experience.description ?? experience.memo ?? null,
        employmentType: experience.employment_type ?? null,
        endDate: experience.end_date ?? null,
        role: experience.role ?? null,
        startDate: experience.start_date ?? null,
      })),
      extras: buildProfileExtras(extras),
      location: talent.current_location ?? talent.location ?? null,
      registeredLinks,
    },
    profileMarkdown: buildProfileMarkdown({
      educations,
      experiences,
      extras,
      insights,
      talent,
    }),
    recommendation: {
      fitReasons: coerceJsonStringList(recommendation.fit_reasons),
      fitSummary: recommendation.fit_summary ?? null,
      recommendedAt: recommendation.recommended_at,
      recommendationId: recommendation.id,
    },
    resume: {
      fileName: talent.resume_file_name ?? null,
      hasStorageFile: Boolean(talent.resume_storage_path),
      links: registeredLinks,
    },
    role: toRole(roleRow),
    talent: {
      bio: talent.bio ?? null,
      email: talent.email ?? null,
      headline: talent.headline ?? null,
      name: talent.name ?? null,
      profilePicture: talent.profile_picture ?? null,
      userId: talent.user_id,
    },
  };
}

export async function openOrgResume(args: {
  kind?: "storage" | "link" | null;
  link?: string | null;
  talentId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgResumeAccessResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const talentId = normalizeText(args.talentId);
  if (!workspaceId || !talentId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const { data, error } = await (admin.from("talent_users" as any) as any)
    .select("user_id, resume_storage_path, resume_links, resume_file_name")
    .eq("user_id", talentId)
    .maybeSingle();

  if (error) throw error;
  const talent = data as TalentUserRow | null;
  if (!talent) throw new OrgHttpError(404, "Talent not found");

  const links = Array.isArray(talent.resume_links) ? talent.resume_links : [];
  let url = "";
  let kind: "storage" | "link" = args.kind === "link" ? "link" : "storage";

  if (kind === "link") {
    const requested = normalizeText(args.link);
    url = requested && links.includes(requested) ? requested : (links[0] ?? "");
  } else if (talent.resume_storage_path) {
    const { data: signed, error: signedError } = await admin.storage
      .from(TALENT_RESUME_BUCKET)
      .createSignedUrl(talent.resume_storage_path, 10 * 60);
    if (signedError) throw signedError;
    url = signed?.signedUrl ?? "";
  }

  if (!url && links.length > 0) {
    kind = "link";
    url = links[0] ?? "";
  }
  if (!url) throw new OrgHttpError(404, "Resume not found");

  const { error: logError } = await (admin.from("logs" as any) as any).insert({
    is_mobile: null,
    meta_data: {
      kind,
      resumeFileName: talent.resume_file_name ?? null,
      talentId,
      workspaceId,
    } satisfies Record<string, unknown>,
    type: "org_resume_opened",
    user_id: getUserEmail(args.user),
  });
  if (logError) throw logError;

  return { ok: true, url };
}

export async function updateOrgWorkspace(args: {
  companyDescription?: string | null;
  pitch?: string | null;
  request?: string | null;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const patch = {
    company_description: args.companyDescription ?? null,
    pitch: args.pitch ?? null,
    request: args.request ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await (admin.from("company_workspace" as any) as any)
    .update(patch)
    .eq("company_workspace_id", workspaceId)
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, updated_at"
    )
    .single();

  if (error) throw error;
  return {
    ok: true as const,
    workspace: toWorkspace(data as CompanyWorkspaceRow),
  };
}

export async function updateOrgWorkspaceRequestOnly(args: {
  expectedRequest?: string | null;
  request?: string | null;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const { data: before, error: beforeError } = await (
    admin.from("company_workspace" as any) as any
  )
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();

  if (beforeError) throw beforeError;
  if (!before) throw new OrgHttpError(404, "Workspace not found");

  const shouldCheckExpectedRequest = Object.prototype.hasOwnProperty.call(
    args,
    "expectedRequest"
  );
  const previousRequest = (before as CompanyWorkspaceRow).request ?? null;
  if (
    shouldCheckExpectedRequest &&
    previousRequest !== (args.expectedRequest ?? null)
  ) {
    throw new OrgHttpError(
      409,
      "Company request changed while the agent was responding"
    );
  }

  let updateQuery = (admin.from("company_workspace" as any) as any)
    .update({
      request: args.request ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("company_workspace_id", workspaceId);
  if (shouldCheckExpectedRequest) {
    updateQuery = previousRequest === null
      ? updateQuery.is("request", null)
      : updateQuery.eq("request", previousRequest);
  }
  const { data, error } = await updateQuery
    .select(
      "company_workspace_id, company_name, company_description, pitch, request, logo_url, updated_at"
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new OrgHttpError(
      409,
      "Company request changed while the agent was responding"
    );
  }
  return {
    ok: true as const,
    previousRequest,
    workspace: toWorkspace(data as CompanyWorkspaceRow),
  };
}

export async function updateOrgRole(args: {
  description?: string | null;
  employmentTypes?: string[] | null;
  externalJdUrl?: string | null;
  isExpired?: boolean | null;
  locationText?: string | null;
  name?: string | null;
  request?: string | null;
  roleId: string;
  status?: string | null;
  user: User;
  workMode?: string | null;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  await assertOrgWorkspaceAccess({ admin, user: args.user, workspaceId });

  const name = normalizeText(args.name);
  if (!name) {
    throw new OrgHttpError(400, "Role title is required");
  }

  const patch: Record<string, unknown> = {
    description: args.description ?? null,
    external_jd_url: normalizeNullableText(args.externalJdUrl),
    location_text: normalizeNullableText(args.locationText),
    name,
    request: args.request ?? null,
    status: normalizeOrgRoleStatus(args.status),
    type: normalizeOrgRoleEmploymentTypes(args.employmentTypes),
    updated_at: new Date().toISOString(),
    work_mode: normalizeOrgRoleWorkMode(args.workMode),
  };
  if (typeof args.isExpired === "boolean") {
    patch.is_expired = args.isExpired;
  }

  const { data, error } = await (admin.from("company_roles" as any) as any)
    .update(patch)
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at"
    )
    .single();

  if (error) throw error;
  return { ok: true as const, role: toRole(data as CompanyRoleRow) };
}

export async function updateOrgRoleRequestOnly(args: {
  expectedRequest?: string | null;
  request?: string | null;
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  await assertOrgRoleAccess({ admin, user: args.user, workspaceId, roleId });

  const { data: before, error: beforeError } = await (
    admin.from("company_roles" as any) as any
  )
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at"
    )
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId)
    .maybeSingle();

  if (beforeError) throw beforeError;
  if (!before) throw new OrgHttpError(404, "Role not found");

  const shouldCheckExpectedRequest = Object.prototype.hasOwnProperty.call(
    args,
    "expectedRequest"
  );
  const previousRequest = (before as CompanyRoleRow).request ?? null;
  if (
    shouldCheckExpectedRequest &&
    previousRequest !== (args.expectedRequest ?? null)
  ) {
    throw new OrgHttpError(
      409,
      "Role request changed while the agent was responding"
    );
  }

  let updateQuery = (admin.from("company_roles" as any) as any)
    .update({
      request: args.request ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("company_workspace_id", workspaceId)
    .eq("role_id", roleId);
  if (shouldCheckExpectedRequest) {
    updateQuery = previousRequest === null
      ? updateQuery.is("request", null)
      : updateQuery.eq("request", previousRequest);
  }
  const { data, error } = await updateQuery
    .select(
      "role_id, company_workspace_id, name, external_jd_url, description, request, status, type, location_text, work_mode, updated_at"
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new OrgHttpError(
      409,
      "Role request changed while the agent was responding"
    );
  }
  return {
    ok: true as const,
    previousRequest,
    role: toRole(data as CompanyRoleRow),
  };
}

export async function assertOrgRoleAccess(args: {
  admin: SupabaseAdminClient;
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  await assertOrgWorkspaceAccess({
    admin: args.admin,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const roleRows = await fetchRoleRowsForWorkspace(
    args.admin,
    args.workspaceId
  );
  if (!roleRows.some((row) => row.role_id === args.roleId)) {
    throw new OrgHttpError(404, "Role not found");
  }
}

export async function createOrgRoleReviewStage(args: {
  label: unknown;
  roleId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgRoleReviewStageCreateResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  const label = normalizeText(args.label).slice(
    0,
    MAX_ORG_ROLE_STAGE_LABEL_LENGTH
  );
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  if (!label) throw new OrgHttpError(400, "label is required");

  await assertOrgRoleAccess({
    admin,
    roleId,
    user: args.user,
    workspaceId,
  });

  const { data: latestRows, error: latestError } = await (
    admin.from("ops_matching_role_stages" as any) as any
  )
    .select("sort_order")
    .eq("role_id", roleId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (latestError) throw latestError;
  const latestSortOrder =
    ((latestRows ?? []) as Pick<RoleStageRow, "sort_order">[])[0]?.sort_order ??
    0;

  const { data, error } = await (
    admin.from("ops_matching_role_stages" as any) as any
  )
    .insert({
      label,
      role_id: roleId,
      sort_order: latestSortOrder + 1,
    })
    .select("id, role_id, label, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new OrgHttpError(409, "이미 같은 이름의 칼럼이 있습니다.");
    }
    throw error;
  }

  return {
    ok: true,
    roleId,
    stage: buildOrgRoleReviewStage(data as RoleStageRow),
  };
}

export async function updateOrgRoleReviewStage(args: {
  label: unknown;
  roleId: string;
  stageId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgRoleReviewStageUpdateResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  const stageId = normalizeText(args.stageId);
  const label = normalizeText(args.label).slice(
    0,
    MAX_ORG_ROLE_STAGE_LABEL_LENGTH
  );
  if (!workspaceId || !roleId || !stageId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  if (!label) throw new OrgHttpError(400, "label is required");

  await assertOrgRoleAccess({
    admin,
    roleId,
    user: args.user,
    workspaceId,
  });

  const { data, error } = await (
    admin.from("ops_matching_role_stages" as any) as any
  )
    .update({ label })
    .eq("id", stageId)
    .eq("role_id", roleId)
    .select("id, role_id, label, sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new OrgHttpError(409, "이미 같은 이름의 칼럼이 있습니다.");
    }
    throw error;
  }

  return {
    ok: true,
    roleId,
    stage: buildOrgRoleReviewStage(data as RoleStageRow),
  };
}

export async function deleteOrgRoleReviewStage(args: {
  roleId: string;
  stageId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgRoleReviewStageDeleteResponse> {
  const admin = getSupabaseAdmin();
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  const stageId = normalizeText(args.stageId);
  if (!workspaceId || !roleId || !stageId) {
    throw new OrgHttpError(400, "Missing required fields");
  }

  await assertOrgRoleAccess({
    admin,
    roleId,
    user: args.user,
    workspaceId,
  });

  const { error: stageError } = await (
    admin.from("ops_matching_role_stages" as any) as any
  )
    .delete()
    .eq("id", stageId)
    .eq("role_id", roleId);

  if (stageError) throw stageError;

  const { error: tagError } = await (
    admin.from("talent_opportunity_tag" as any) as any
  )
    .delete()
    .eq("opportunity_id", roleId)
    .eq("tag", buildCustomStageTag(stageId));

  if (tagError) throw tagError;

  return {
    ok: true,
    roleId,
    stageId,
  };
}
