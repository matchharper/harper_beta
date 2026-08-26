import { createHash, randomUUID } from "crypto";
import { sendHarperWorkspaceSlackMessage } from "@/lib/org/slackHarper";
import {
  AUTO_INTRO_MAX_PENDING_AGE_DAYS,
  AUTO_INTRO_PENDING_TAG,
  AUTO_INTRO_RESPONSE_GUIDANCE,
  AUTO_INTRO_WORKSPACE_OPENING,
  buildAutoIntroFollowUpPostscript,
  getAutoIntroReasonMode,
  getAutoIntroRoleSummaryDateKey,
  getFreshPendingConnectionSince,
  getLatestAutoIntroInternalStage,
  isAutoIntroRoleSummaryDay,
  wasAutoIntroSlackSent,
  type AutoIntroReasonMode,
} from "@/lib/ops/autoIntroToCompanyPolicy";
import {
  attachAutoIntroSlackReviewAction,
  buildAutoIntroCandidateNameLink,
  buildAutoIntroRoleSummarySlackBlocks,
  buildAutoIntroRoleSummaryText,
  buildAutoIntroWorkspaceActionGuidance,
  escapeAutoIntroSlackHeading,
  groupAutoIntroItemsByWorkspaceAndRole,
  renderAutoIntroCandidateCopy,
  renderAutoIntroSlackProfile,
  validateAutoIntroCandidateSentences,
  validateAutoIntroSlackProfile,
  type AutoIntroPresentation,
  type AutoIntroRoleSummary,
  type AutoIntroSlackProfile,
} from "@/lib/ops/autoIntroToCompanyMessage";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import { getTalentEngagementLabels } from "@/lib/talentNetworkOptions";
import { normalizeOrgRoleCriteria } from "@/lib/org/roleCriteria";
import type { Json } from "@/types/database.types";

const INTRO_TO_COMPANY_KIND = "intro_to_company";
const HARPER_WORKER_USER_ID = "harper_worker";
const BATCH_SIZE = 1000;
const ID_FILTER_CHUNK_SIZE = 80;
const DEFAULT_MAX_CANDIDATES = Number.MAX_SAFE_INTEGER;
const MAX_CODEX_REASON_CHARS = 2400;
const CLAIM_TTL_MS = 30 * 60 * 1000;

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type FetchPageResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type RoleRow = {
  company_internal_roles?:
    | {
        considerations?: Json | null;
        criteria?: Json | null;
        memory?: string | null;
        questions?: Json | null;
        request?: string | null;
      }
    | Array<{
        considerations?: Json | null;
        criteria?: Json | null;
        memory?: string | null;
        questions?: Json | null;
        request?: string | null;
      }>
    | null;
  company_workspace_id: string;
  description: string | null;
  description_summary: string | null;
  external_jd_url: string | null;
  information: Json | null;
  is_expired: boolean | null;
  location_text: string | null;
  name: string;
  role_id: string;
  salary_range: string | null;
  seniority_level: string | null;
  status: string | null;
  summary: Json | null;
  type: string[] | null;
  work_mode: string | null;
};

type RoleSummaryRow = {
  company_workspace_id: string;
  is_expired: boolean | null;
  name: string;
  role_id: string;
  status: string | null;
};

type CandidateReplyReminderRow = {
  company_workspace_id: string;
  expects_document: boolean;
  recommendation_id: string | null;
  role_id: string;
  talent_id: string;
  updated_at: string;
};

type UpcomingMeetingReminderRow = {
  company_attendees: Json;
  company_workspace_id: string;
  confirmed_start_at: string;
  recommendation_id: string | null;
  role_id: string;
  talent_id: string;
};

type WorkspaceRow = {
  brief: string | null;
  career_url: string | null;
  company_db_id: number | null;
  company_description: string | null;
  company_name: string;
  company_workspace_id: string;
  homepage_url: string | null;
  linkedin_url: string | null;
  pitch: string | null;
  request: string | null;
};

type CompanyDbRow = {
  description: string | null;
  employee_count_range: Json | null;
  id: number;
  location: string | null;
  short_description: string | null;
  specialities: string;
};

type RecommendationRow = {
  created_at: string;
  id: string;
  recommended_at: string;
  role_id: string;
  talent_id: string;
  updated_at: string;
};

type TagRow = {
  created_at: string;
  id: string;
  opportunity_id: string;
  tag: string;
  talent_id: string;
  updated_at: string;
};

type FitRow = {
  company_criteria_evaluations: Json | null;
  created_at: string;
  id: string;
  kind: string | null;
  last_evaluated_at: string;
  opportunity_id: string;
  reason: string;
  reevaluation_criteria: Json | null;
  talent_id: string;
};

type CompanyMemoryRow = {
  company_workspace_id: string;
  content: string;
  role_id: string | null;
  updated_at: string;
};

type TalentRow = {
  bio: string | null;
  current_location: string | null;
  headline: string | null;
  location: string | null;
  name: string | null;
  resume_links: string[] | null;
  user_id: string;
};

type ExperienceRow = {
  company_link: string | null;
  company_location: string | null;
  company_name: string | null;
  description: string | null;
  employment_type: string | null;
  end_date: string | null;
  id: number;
  memo: string | null;
  months: number | null;
  role: string | null;
  start_date: string | null;
  talent_id: string;
};

type EducationRow = {
  degree: string | null;
  description: string | null;
  end_date: string | null;
  field: string | null;
  id: number;
  memo: string | null;
  school: string | null;
  start_date: string | null;
  talent_id: string;
  url: string | null;
};

type CandidateProfile = {
  bio: string | null;
  currentLocation: string | null;
  educations: Array<Omit<EducationRow, "id" | "talent_id">>;
  engagementTypes: string[];
  experiences: Array<Omit<ExperienceRow, "id" | "talent_id">>;
  extras: Json | null;
  headline: string | null;
  insights: Json | null;
  location: string | null;
  resumeLinks: string[];
};

type AutoIntroCompanyPromptContext = {
  companyInformation: string | null;
  companyName: string;
  employeeCount: string | null;
  hiringRequest: string | null;
  location: string | null;
  specialities: string | null;
  workspaceMemory: string | null;
};

type AutoIntroRolePromptContext = {
  criteria: Array<{ criteria: string; name: string }>;
  description: string | null;
  descriptionSummary: string | null;
  employmentTypes: string[];
  location: string | null;
  memory: string | null;
  name: string;
  request: string | null;
  roleId: string;
  salaryRange: string | null;
  seniority: string | null;
  workMode: string | null;
};

type AutoIntroCandidate = {
  candidateProfile: CandidateProfile | null;
  companyName: string;
  fitCompanyCriteriaEvaluations: Json | null;
  fitId: string | null;
  fitKind: string | null;
  fitReason: string;
  fitReevaluationCriteria: Json | null;
  pendingSince: string;
  reasonMode: Exclude<AutoIntroReasonMode, "skip">;
  recommendationId: string | null;
  roleId: string;
  roleTitle: string;
  talentId: string;
  talentName: string;
  workspaceId: string;
};

type WorkspaceRoleNotificationSection = {
  candidates: AutoIntroCandidate[];
  role: RoleRow;
  roleId: string;
  roleTitle: string;
};

type WorkspaceNotificationGroup = {
  candidates: AutoIntroCandidate[];
  companyName: string;
  roleSections: WorkspaceRoleNotificationSection[];
  workspace: WorkspaceRow;
  workspaceId: string;
};

type GeneratedWorkspaceMessage = {
  body: string;
  candidateCopyByCandidateKey: Record<string, string>;
  externalSourcesByCandidateKey: Record<
    string,
    Array<{ title: string | null; url: string }>
  >;
  followUpQuestion: string | null;
  fitReasonByCandidateKey: Record<string, string>;
  model: string;
  presentationByCandidateKey: Record<string, AutoIntroPresentation | "profile">;
  slackBlocks?: Array<Record<string, unknown>>;
  source: string;
  webToolCallCount: number;
};

type DeliveryOutcome = {
  idempotencyKey: string;
  slackConnected: boolean;
  slackError: string | null;
  slackSent: boolean;
};

type EligibilityStats = {
  recentPendingConnectionCount: number;
  skippedAlreadySentCount: number;
  skippedLaterStageCount: number;
  skippedMissingFitCount: number;
  skippedMissingCodexReasonCount: number;
  skippedUnsupportedFitKindCount: number;
};

type CodexAuthoredCandidateBase = {
  sources?: Array<{ title?: string | null; url: string }>;
  talentId: string;
};

export type CodexAuthoredCandidateCopy = CodexAuthoredCandidateBase &
  (
    | {
        presentation: AutoIntroPresentation;
        sentences: string[];
        slackProfile?: never;
      }
    | {
        presentation?: never;
        sentences?: never;
        slackProfile: AutoIntroSlackProfile;
      }
  );

export type CodexAuthoredRoleSection = {
  candidates: CodexAuthoredCandidateCopy[];
  roleId: string;
};

export type CodexAuthoredWorkspaceMessage = {
  followUpQuestion?: string | null;
  generation?: {
    model?: string | null;
    source?: string | null;
    webToolCallCount?: number | null;
  };
  roles: CodexAuthoredRoleSection[];
  workspaceId: string;
};

export type AutoIntroToCompanyCandidateDossiers = EligibilityStats & {
  eligibleCandidateCount: number;
  groups: Array<{
    candidateCount: number;
    companyName: string;
    companyContext: AutoIntroCompanyPromptContext;
    roles: Array<{
      candidateCount: number;
      candidates: Array<{
        name: string;
        professionalProfile: CandidateProfile | null;
        reasonMode: "codex" | "author";
        storedCompanyCriteriaEvaluations: Json | null;
        storedReevaluationCriteria: Json | null;
        storedReason: string | null;
        talentId: string;
      }>;
      roleId: string;
      roleTitle: string;
    }>;
    slackConnected: boolean;
    workspaceRoles: AutoIntroRolePromptContext[];
    workspaceId: string;
  }>;
  roleSummaries: Array<
    AutoIntroRoleSummary & {
      slackConnected: boolean;
    }
  >;
  roleSummaryDue: boolean;
  roleSummaryWorkspaceCount: number;
  skippedNoChannelCount: number;
  skippedRoleSummaryNoChannelCount: number;
};

export type AutoIntroToCompanyDeliveryResult = EligibilityStats & {
  eligibleCandidateCount: number;
  failedCandidateCount: number;
  groups: Array<{
    candidateCount: number;
    companyName: string;
    message?: GeneratedWorkspaceMessage;
    roleIds: string[];
    roleTitles: string[];
    slackConnected: boolean;
    workspaceId: string;
  }>;
  failedRoleSummaryCount: number;
  processedCandidateCount: number;
  roleSummaries: Array<{
    body: string;
    companyName: string;
    roleCount: number;
    slackConnected: boolean;
    slackError: string | null;
    slackSent: boolean;
    workspaceId: string;
  }>;
  roleSummaryDue: boolean;
  roleSummaryWorkspaceCount: number;
  sentCandidateCount: number;
  sentRoleSummaryCount: number;
  sentSlackCount: number;
  skippedNoChannelCount: number;
  skippedRoleSummaryNoChannelCount: number;
};

type AutoIntroRunFilters = {
  limit: number;
  roleId: string | null;
  workspaceId: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultiline(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .trim();
}

function truncateText(value: unknown, maxChars: number) {
  const normalized = normalizeMultiline(value);
  return normalized ? normalized.slice(0, maxChars) : null;
}

function uniqueTexts(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  );
}

function chunkValues<T>(values: T[], size = ID_FILTER_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await loadPage(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(error.message || "Failed to load rows");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
  }
  return rows;
}

function parsePositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1000);
}

function normalizeOptionalFilter(value: string | null | undefined) {
  return normalizeText(value) || null;
}

function deterministicUuid(parts: string[]) {
  const hex = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  const uuidHex = hex.slice(0, 32).split("");
  uuidHex[12] = "4";
  uuidHex[16] = (
    (Number.parseInt(uuidHex[16] ?? "0", 16) & 0x3) |
    0x8
  ).toString(16);
  const normalized = uuidHex.join("");
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

function progressIdForCandidate(candidate: AutoIntroCandidate) {
  return deterministicUuid([
    "talent_progress",
    INTRO_TO_COMPANY_KIND,
    candidate.roleId,
    candidate.talentId,
  ]);
}

function candidateKey(
  candidate: Pick<AutoIntroCandidate, "roleId" | "talentId">
) {
  return `${candidate.roleId}:${candidate.talentId}`;
}

function deliveryIdempotencyKey(group: WorkspaceNotificationGroup) {
  return deterministicUuid([
    "auto_intro_to_company_slack",
    group.workspaceId,
    ...group.candidates
      .map(
        (candidate) =>
          `${candidate.roleId}:${candidate.talentId}:${candidate.pendingSince}`
      )
      .sort(),
  ]);
}

function roleSummaryIdempotencyKey(workspaceId: string, dateKey: string) {
  return deterministicUuid([
    "auto_intro_to_company_role_summary",
    workspaceId,
    dateKey,
  ]);
}

async function fetchRecentPendingTags(
  admin: AdminClient,
  filters: AutoIntroRunFilters
) {
  const cutoff = new Date(
    Date.now() - AUTO_INTRO_MAX_PENDING_AGE_DAYS * 24 * 60 * 60 * 1_000
  ).toISOString();
  return fetchAllRows<TagRow>((from, to) => {
    let query = (admin.from("talent_opportunity_tag" as any) as any)
      .select("id, opportunity_id, tag, talent_id, created_at, updated_at")
      .eq("tag", AUTO_INTRO_PENDING_TAG)
      .gt("updated_at", cutoff);
    if (filters.roleId) query = query.eq("opportunity_id", filters.roleId);
    return query
      .order("updated_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
  });
}

async function fetchRoles(
  admin: AdminClient,
  roleIds: string[],
  filters: AutoIntroRunFilters
) {
  const rows: RoleRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    let query = (admin.from("company_roles" as any) as any)
      .select(
        "role_id, company_workspace_id, name, description, description_summary, external_jd_url, information, summary, location_text, work_mode, type, seniority_level, salary_range, status, is_expired, company_internal_roles(request, criteria, considerations, questions, memory)"
      )
      .in("role_id", roleIdChunk);
    if (filters.workspaceId) {
      query = query.eq("company_workspace_id", filters.workspaceId);
    }
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as RoleRow[]));
  }

  return rows.filter((role) => {
    if (role.is_expired === true) return false;
    const status = normalizeText(role.status).toLowerCase();
    return status !== "deleted" && status !== "ended";
  });
}

const INACTIVE_ROLE_SUMMARY_STATUSES = new Set([
  "archived",
  "closed",
  "deleted",
  "ended",
  "expired",
  "inactive",
]);

async function fetchCandidateReplyReminderRows(
  admin: AdminClient,
  roleIds: string[]
) {
  const rows: CandidateReplyReminderRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    rows.push(
      ...(await fetchAllRows<CandidateReplyReminderRow>((from, to) =>
        (admin.from("company_talent_requests" as any) as any)
          .select(
            "company_workspace_id, role_id, talent_id, recommendation_id, expects_document, updated_at"
          )
          .in("role_id", roleIdChunk)
          .eq("workflow_status", "delivered")
          .not("talent_source_message_id", "is", null)
          .order("updated_at", { ascending: false })
          .range(from, to)
      ))
    );
  }
  return rows.sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at)
  );
}

async function fetchUpcomingMeetingReminderRows(args: {
  admin: AdminClient;
  now: Date;
  roleIds: string[];
}) {
  const rows: UpcomingMeetingReminderRow[] = [];
  const windowEnd = new Date(args.now.getTime() + 3 * 24 * 60 * 60 * 1_000);
  for (const roleIdChunk of chunkValues(args.roleIds)) {
    rows.push(
      ...(await fetchAllRows<UpcomingMeetingReminderRow>((from, to) =>
        (args.admin.from("meeting_schedules" as any) as any)
          .select(
            "company_workspace_id, role_id, talent_id, recommendation_id, confirmed_start_at, company_attendees"
          )
          .in("role_id", roleIdChunk)
          .eq("status", "confirmed")
          .gt("confirmed_start_at", args.now.toISOString())
          .lte("confirmed_start_at", windowEnd.toISOString())
          .order("confirmed_start_at", { ascending: true })
          .range(from, to)
      ))
    );
  }
  return rows.sort((left, right) =>
    left.confirmed_start_at.localeCompare(right.confirmed_start_at)
  );
}

async function fetchRoleSummaryTalentNames(
  admin: AdminClient,
  talentIds: string[]
) {
  const names = new Map<string, string>();
  for (const talentIdChunk of chunkValues(talentIds)) {
    const { data, error } = await (admin.from("talent_users" as any) as any)
      .select("user_id, name")
      .in("user_id", talentIdChunk);
    if (error) throw error;
    for (const row of data ?? []) {
      names.set(
        normalizeText(row.user_id),
        normalizeText(row.name) || "후보자"
      );
    }
  }
  return names;
}

function meetingAttendeeNames(value: Json) {
  if (!Array.isArray(value)) return [];
  return uniqueTexts(
    value.flatMap((attendee) => {
      if (
        !attendee ||
        typeof attendee !== "object" ||
        Array.isArray(attendee)
      ) {
        return [];
      }
      const name = normalizeText((attendee as Record<string, Json>).name);
      return name ? [name] : [];
    })
  );
}

async function fetchCurrentRoleSummaries(
  admin: AdminClient,
  filters: AutoIntroRunFilters,
  now: Date
) {
  const roles = await fetchAllRows<RoleSummaryRow>((from, to) => {
    let query = (admin.from("company_roles" as any) as any)
      .select("role_id, company_workspace_id, name, status, is_expired")
      .eq("source_type", "internal")
      .eq("is_expired", false);
    if (filters.workspaceId) {
      query = query.eq("company_workspace_id", filters.workspaceId);
    }
    if (filters.roleId) query = query.eq("role_id", filters.roleId);
    return query
      .order("company_workspace_id", { ascending: true })
      .order("name", { ascending: true })
      .order("role_id", { ascending: true })
      .range(from, to);
  });
  const currentRoles = roles.filter(
    (role) =>
      role.is_expired !== true &&
      !INACTIVE_ROLE_SUMMARY_STATUSES.has(
        normalizeText(role.status).toLowerCase()
      )
  );
  if (currentRoles.length === 0) return [];

  const roleIds = uniqueTexts(currentRoles.map((role) => role.role_id));
  const pendingTags: TagRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    pendingTags.push(
      ...(await fetchAllRows<TagRow>((from, to) =>
        (admin.from("talent_opportunity_tag" as any) as any)
          .select("id, opportunity_id, tag, talent_id, created_at, updated_at")
          .eq("tag", AUTO_INTRO_PENDING_TAG)
          .in("opportunity_id", roleIdChunk)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(from, to)
      ))
    );
  }
  const candidateKeys = new Set(
    pendingTags.map((tag) => `${tag.opportunity_id}:${tag.talent_id}`)
  );
  const pendingCountByRoleId = new Map<string, number>();
  let tagsByKey = new Map<string, TagRow[]>();
  if (candidateKeys.size > 0) {
    const talentIds = uniqueTexts(pendingTags.map((tag) => tag.talent_id));
    tagsByKey = groupTagsByRoleTalent(
      await fetchTags(admin, roleIds, talentIds)
    );
    for (const key of candidateKeys) {
      const latestStage = getLatestAutoIntroInternalStage(
        tagsByKey.get(key) ?? []
      );
      if (normalizeText(latestStage?.tag) !== AUTO_INTRO_PENDING_TAG) continue;
      const [roleId] = key.split(":");
      if (!roleId) continue;
      pendingCountByRoleId.set(
        roleId,
        (pendingCountByRoleId.get(roleId) ?? 0) + 1
      );
    }
  }

  const [candidateReplyRows, upcomingMeetingRows] = await Promise.all([
    fetchCandidateReplyReminderRows(admin, roleIds),
    fetchUpcomingMeetingReminderRows({ admin, now, roleIds }),
  ]);
  const talentNameById = await fetchRoleSummaryTalentNames(
    admin,
    uniqueTexts([
      ...candidateReplyRows.map((row) => row.talent_id),
      ...upcomingMeetingRows.map((row) => row.talent_id),
    ])
  );
  const roleById = new Map(
    currentRoles.map((role) => [role.role_id, role] as const)
  );
  const candidateRepliesByWorkspaceId = new Map<
    string,
    NonNullable<AutoIntroRoleSummary["reminders"]>["candidateReplies"]
  >();
  const seenReplyPairs = new Set<string>();
  for (const row of candidateReplyRows) {
    const role = roleById.get(row.role_id);
    const pairKey = `${row.role_id}:${row.talent_id}`;
    const latestStage = getLatestAutoIntroInternalStage(
      tagsByKey.get(pairKey) ?? []
    );
    if (
      !role ||
      role.company_workspace_id !== row.company_workspace_id ||
      normalizeText(latestStage?.tag) !== AUTO_INTRO_PENDING_TAG ||
      seenReplyPairs.has(pairKey)
    ) {
      continue;
    }
    seenReplyPairs.add(pairKey);
    const reminders =
      candidateRepliesByWorkspaceId.get(row.company_workspace_id) ?? [];
    reminders.push({
      candidateName: talentNameById.get(row.talent_id) ?? "후보자",
      expectsDocument: row.expects_document,
      recommendationId: row.recommendation_id,
      roleId: row.role_id,
      roleTitle: normalizeText(role.name) || "Role",
      talentId: row.talent_id,
      workspaceId: row.company_workspace_id,
    });
    candidateRepliesByWorkspaceId.set(row.company_workspace_id, reminders);
  }

  const upcomingMeetingsByWorkspaceId = new Map<
    string,
    NonNullable<AutoIntroRoleSummary["reminders"]>["upcomingMeetings"]
  >();
  for (const row of upcomingMeetingRows) {
    const role = roleById.get(row.role_id);
    if (!role || role.company_workspace_id !== row.company_workspace_id) {
      continue;
    }
    const reminders =
      upcomingMeetingsByWorkspaceId.get(row.company_workspace_id) ?? [];
    reminders.push({
      attendeeNames: meetingAttendeeNames(row.company_attendees),
      candidateName: talentNameById.get(row.talent_id) ?? "후보자",
      confirmedStartAt: row.confirmed_start_at,
      recommendationId: row.recommendation_id,
      roleId: row.role_id,
      roleTitle: normalizeText(role.name) || "Role",
      talentId: row.talent_id,
      workspaceId: row.company_workspace_id,
    });
    upcomingMeetingsByWorkspaceId.set(row.company_workspace_id, reminders);
  }

  const workspaces = await fetchWorkspaces(
    admin,
    uniqueTexts(currentRoles.map((role) => role.company_workspace_id))
  );
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.company_workspace_id, workspace])
  );
  const rolesByWorkspaceId = new Map<string, RoleSummaryRow[]>();
  for (const role of currentRoles) {
    const workspaceRoles =
      rolesByWorkspaceId.get(role.company_workspace_id) ?? [];
    workspaceRoles.push(role);
    rolesByWorkspaceId.set(role.company_workspace_id, workspaceRoles);
  }
  return Array.from(rolesByWorkspaceId, ([workspaceId, workspaceRoles]) => {
    const workspace = workspaceById.get(workspaceId);
    return {
      companyName: normalizeText(workspace?.company_name) || "회사",
      reminders: {
        candidateReplies: candidateRepliesByWorkspaceId.get(workspaceId) ?? [],
        upcomingMeetings: upcomingMeetingsByWorkspaceId.get(workspaceId) ?? [],
      },
      roles: workspaceRoles.map((role) => ({
        pendingDecisionCount: pendingCountByRoleId.get(role.role_id) ?? 0,
        roleId: role.role_id,
        roleTitle: normalizeText(role.name) || "Role",
        status: role.status,
        workspaceId,
      })),
      workspaceId,
    } satisfies AutoIntroRoleSummary;
  }).sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
}

async function fetchTags(
  admin: AdminClient,
  roleIds: string[],
  talentIds: string[]
) {
  const rows: TagRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    for (const talentIdChunk of chunkValues(talentIds)) {
      rows.push(
        ...(await fetchAllRows<TagRow>((from, to) =>
          (admin.from("talent_opportunity_tag" as any) as any)
            .select(
              "id, opportunity_id, tag, talent_id, created_at, updated_at"
            )
            .in("opportunity_id", roleIdChunk)
            .in("talent_id", talentIdChunk)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .range(from, to)
        ))
      );
    }
  }
  return rows;
}

function groupTagsByRoleTalent(tags: TagRow[]) {
  const map = new Map<string, TagRow[]>();
  for (const tag of tags) {
    const key = `${tag.opportunity_id}:${tag.talent_id}`;
    const current = map.get(key) ?? [];
    current.push(tag);
    map.set(key, current);
  }
  return map;
}

async function fetchWorkspaces(admin: AdminClient, workspaceIds: string[]) {
  const rows: WorkspaceRow[] = [];
  for (const workspaceIdChunk of chunkValues(workspaceIds)) {
    const { data, error } = await (
      admin.from("company_workspace" as any) as any
    )
      .select(
        "company_workspace_id, company_db_id, company_name, brief, company_description, pitch, request, homepage_url, career_url, linkedin_url"
      )
      .in("company_workspace_id", workspaceIdChunk);
    if (error) throw new Error(error.message || "Failed to load workspaces");
    rows.push(...((data ?? []) as WorkspaceRow[]));
  }
  return rows;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstPresentDocument(values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeMultiline(value);
    if (normalized) return normalized;
  }
  return null;
}

function employeeCountLabel(value: unknown) {
  const range = asObject(value);
  const start =
    range.start === null || range.start === undefined
      ? Number.NaN
      : Number(range.start);
  const end =
    range.end === null || range.end === undefined
      ? Number.NaN
      : Number(range.end);
  if (Number.isFinite(start) && Number.isFinite(end)) return `${start}-${end}`;
  if (Number.isFinite(start)) return `${start}+`;
  if (Number.isFinite(end)) return `Up to ${end}`;
  return null;
}

function rolePromptContext(role: RoleRow): AutoIntroRolePromptContext {
  const internal = getCompanyInternalRoleRecord(role.company_internal_roles);
  return {
    criteria: normalizeOrgRoleCriteria(internal?.criteria),
    description: normalizeMultiline(role.description) || null,
    descriptionSummary: normalizeMultiline(role.description_summary) || null,
    employmentTypes: uniqueTexts(role.type ?? []),
    location: normalizeText(role.location_text) || null,
    memory: null,
    name: normalizeText(role.name) || "Role",
    request: normalizeMultiline(internal?.request) || null,
    roleId: role.role_id,
    salaryRange: normalizeText(role.salary_range) || null,
    seniority: normalizeText(role.seniority_level) || null,
    workMode: normalizeText(role.work_mode) || null,
  };
}

async function fetchCompanyPromptMemories(args: {
  admin: AdminClient;
  roleIds: string[];
  workspaceIds: string[];
}) {
  const workspaceRows: CompanyMemoryRow[] = [];
  for (const workspaceIdChunk of chunkValues(args.workspaceIds)) {
    workspaceRows.push(
      ...(await fetchAllRows<CompanyMemoryRow>((from, to) =>
        (args.admin.from("company_memories" as any) as any)
          .select("company_workspace_id, role_id, content, updated_at")
          .in("company_workspace_id", workspaceIdChunk)
          .is("role_id", null)
          .order("updated_at", { ascending: false })
          .range(from, to)
      ))
    );
  }

  const roleRows: CompanyMemoryRow[] = [];
  for (const roleIdChunk of chunkValues(args.roleIds)) {
    roleRows.push(
      ...(await fetchAllRows<CompanyMemoryRow>((from, to) =>
        (args.admin.from("company_memories" as any) as any)
          .select("company_workspace_id, role_id, content, updated_at")
          .in("role_id", roleIdChunk)
          .order("updated_at", { ascending: false })
          .range(from, to)
      ))
    );
  }

  const workspaceMemoryByWorkspaceId = new Map<string, string>();
  for (const row of workspaceRows) {
    const content = normalizeMultiline(row.content);
    if (
      content &&
      !workspaceMemoryByWorkspaceId.has(row.company_workspace_id)
    ) {
      workspaceMemoryByWorkspaceId.set(row.company_workspace_id, content);
    }
  }
  const roleMemoryByRoleId = new Map<string, string>();
  for (const row of roleRows) {
    const roleId = normalizeText(row.role_id);
    const content = normalizeMultiline(row.content);
    if (roleId && content && !roleMemoryByRoleId.has(roleId)) {
      roleMemoryByRoleId.set(roleId, content);
    }
  }
  return { roleMemoryByRoleId, workspaceMemoryByWorkspaceId };
}

async function fetchWorkspacePromptContexts(args: {
  admin: AdminClient;
  targetRoles: RoleRow[];
  workspaces: WorkspaceRow[];
}) {
  const workspaceIds = uniqueTexts(
    args.workspaces.map((workspace) => workspace.company_workspace_id)
  );
  if (workspaceIds.length === 0) {
    return {
      companyByWorkspaceId: new Map<string, AutoIntroCompanyPromptContext>(),
      rolesByWorkspaceId: new Map<string, AutoIntroRolePromptContext[]>(),
    };
  }

  const companyDbIds = Array.from(
    new Set(
      args.workspaces.flatMap((workspace) =>
        workspace.company_db_id == null ? [] : [workspace.company_db_id]
      )
    )
  );
  const companyDbRows: CompanyDbRow[] = [];
  for (const companyDbIdChunk of chunkValues(companyDbIds)) {
    const { data, error } = await (args.admin.from("company_db" as any) as any)
      .select(
        "id, description, short_description, location, employee_count_range, specialities"
      )
      .in("id", companyDbIdChunk);
    if (error) throw error;
    companyDbRows.push(...((data ?? []) as CompanyDbRow[]));
  }

  const memories = await fetchCompanyPromptMemories({
    admin: args.admin,
    roleIds: uniqueTexts(args.targetRoles.map((role) => role.role_id)),
    workspaceIds,
  });

  const companyDbById = new Map(companyDbRows.map((row) => [row.id, row]));
  const companyByWorkspaceId = new Map<string, AutoIntroCompanyPromptContext>();
  for (const workspace of args.workspaces) {
    const companyDb =
      workspace.company_db_id == null
        ? undefined
        : companyDbById.get(workspace.company_db_id);
    companyByWorkspaceId.set(workspace.company_workspace_id, {
      companyInformation: firstPresentDocument([
        workspace.pitch,
        workspace.company_description,
        companyDb?.description,
        companyDb?.short_description,
        workspace.brief,
      ]),
      companyName: normalizeText(workspace.company_name) || "Company",
      employeeCount: employeeCountLabel(companyDb?.employee_count_range),
      hiringRequest: normalizeMultiline(workspace.request) || null,
      location: normalizeText(companyDb?.location) || null,
      specialities: normalizeText(companyDb?.specialities) || null,
      workspaceMemory:
        memories.workspaceMemoryByWorkspaceId.get(
          workspace.company_workspace_id
        ) ?? null,
    });
  }

  const rolesByWorkspaceId = new Map<string, AutoIntroRolePromptContext[]>();
  for (const role of args.targetRoles) {
    if (!workspaceIds.includes(role.company_workspace_id)) continue;
    const roles = rolesByWorkspaceId.get(role.company_workspace_id) ?? [];
    roles.push({
      ...rolePromptContext(role),
      memory: memories.roleMemoryByRoleId.get(role.role_id) ?? null,
    });
    rolesByWorkspaceId.set(role.company_workspace_id, roles);
  }
  for (const roles of rolesByWorkspaceId.values()) {
    roles.sort(
      (left, right) =>
        left.name.localeCompare(right.name, "ko") ||
        left.roleId.localeCompare(right.roleId)
    );
  }
  return { companyByWorkspaceId, rolesByWorkspaceId };
}

async function fetchRecommendations(
  admin: AdminClient,
  roleIds: string[],
  talentIds: string[]
) {
  const rows: RecommendationRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    for (const talentIdChunk of chunkValues(talentIds)) {
      rows.push(
        ...(await fetchAllRows<RecommendationRow>((from, to) =>
          (admin.from("talent_opportunity_recommendation" as any) as any)
            .select(
              "id, talent_id, role_id, recommended_at, created_at, updated_at"
            )
            .in("role_id", roleIdChunk)
            .in("talent_id", talentIdChunk)
            .order("recommended_at", { ascending: false, nullsFirst: false })
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .range(from, to)
        ))
      );
    }
  }
  const latest = new Map<string, RecommendationRow>();
  for (const row of rows) {
    const key = `${row.role_id}:${row.talent_id}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}

async function fetchFits(
  admin: AdminClient,
  roleIds: string[],
  talentIds: string[]
) {
  const rows: FitRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    for (const talentIdChunk of chunkValues(talentIds)) {
      rows.push(
        ...(await fetchAllRows<FitRow>((from, to) =>
          (admin.from("talent_opportunity_fit" as any) as any)
            .select(
              "id, opportunity_id, talent_id, reason, kind, company_criteria_evaluations, reevaluation_criteria, last_evaluated_at, created_at"
            )
            .in("opportunity_id", roleIdChunk)
            .in("talent_id", talentIdChunk)
            .order("last_evaluated_at", {
              ascending: false,
              nullsFirst: false,
            })
            .order("created_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .range(from, to)
        ))
      );
    }
  }
  const latest = new Map<string, FitRow>();
  for (const row of rows) {
    const key = `${row.opportunity_id}:${row.talent_id}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}

async function fetchSentIntroProgressKeys(
  admin: AdminClient,
  roleIds: string[],
  talentIds: string[]
) {
  const keys = new Set<string>();
  for (const roleIdChunk of chunkValues(roleIds)) {
    for (const talentIdChunk of chunkValues(talentIds)) {
      const rows = await fetchAllRows<{
        metadata: Json;
        role_id: string;
        talent_id: string;
      }>((from, to) =>
        (admin.from("talent_progress" as any) as any)
          .select("role_id, talent_id, metadata")
          .eq("kind", INTRO_TO_COMPANY_KIND)
          .in("role_id", roleIdChunk)
          .in("talent_id", talentIdChunk)
          .range(from, to)
      );
      for (const row of rows) {
        if (wasAutoIntroSlackSent(row.metadata)) {
          keys.add(`${row.role_id}:${row.talent_id}`);
        }
      }
    }
  }
  return keys;
}

async function fetchTalents(admin: AdminClient, talentIds: string[]) {
  const rows: TalentRow[] = [];
  for (const talentIdChunk of chunkValues(talentIds)) {
    const { data, error } = await (admin.from("talent_users" as any) as any)
      .select(
        "user_id, name, headline, bio, current_location, location, resume_links"
      )
      .in("user_id", talentIdChunk);
    if (error) throw new Error(error.message || "Failed to load talents");
    rows.push(...((data ?? []) as TalentRow[]));
  }
  return rows;
}

async function fetchCandidateProfiles(
  admin: AdminClient,
  talents: TalentRow[],
  talentIds: string[]
) {
  if (talentIds.length === 0) return new Map<string, CandidateProfile>();
  const experiences: ExperienceRow[] = [];
  const educations: EducationRow[] = [];
  const extras = new Map<string, Json | null>();
  const insights = new Map<string, Json | null>();
  const engagementTypes = new Map<string, string[]>();

  for (const talentIdChunk of chunkValues(talentIds)) {
    const [
      experienceResult,
      educationResult,
      extraResult,
      insightResult,
      settingResult,
    ] = await Promise.all([
      (admin.from("talent_experiences" as any) as any)
        .select(
          "id, talent_id, company_name, company_link, company_location, role, employment_type, start_date, end_date, months, description, memo"
        )
        .in("talent_id", talentIdChunk),
      (admin.from("talent_educations" as any) as any)
        .select(
          "id, talent_id, school, degree, field, start_date, end_date, url, description, memo"
        )
        .in("talent_id", talentIdChunk),
      (admin.from("talent_extras" as any) as any)
        .select("talent_id, content")
        .in("talent_id", talentIdChunk),
      (admin.from("talent_insights" as any) as any)
        .select("talent_id, content")
        .in("talent_id", talentIdChunk),
      (admin.from("talent_setting" as any) as any)
        .select("user_id, engagement_types")
        .in("user_id", talentIdChunk),
    ]);
    if (experienceResult.error) throw experienceResult.error;
    if (educationResult.error) throw educationResult.error;
    if (extraResult.error) throw extraResult.error;
    if (insightResult.error) throw insightResult.error;
    if (settingResult.error) throw settingResult.error;
    experiences.push(...((experienceResult.data ?? []) as ExperienceRow[]));
    educations.push(...((educationResult.data ?? []) as EducationRow[]));
    for (const row of extraResult.data ?? []) {
      extras.set(row.talent_id, row.content as Json | null);
    }
    for (const row of insightResult.data ?? []) {
      if (row.talent_id)
        insights.set(row.talent_id, row.content as Json | null);
    }
    for (const row of settingResult.data ?? []) {
      engagementTypes.set(
        row.user_id,
        getTalentEngagementLabels(row.engagement_types)
      );
    }
  }

  const talentById = new Map(talents.map((talent) => [talent.user_id, talent]));
  const profiles = new Map<string, CandidateProfile>();
  for (const talentId of talentIds) {
    const talent = talentById.get(talentId);
    profiles.set(talentId, {
      bio: normalizeMultiline(talent?.bio) || null,
      currentLocation: normalizeText(talent?.current_location) || null,
      educations: educations
        .filter((row) => row.talent_id === talentId)
        .sort((left, right) =>
          `${right.end_date ?? ""}|${right.id}`.localeCompare(
            `${left.end_date ?? ""}|${left.id}`
          )
        )
        .map(({ id: _id, talent_id: _talentId, ...row }) => ({
          ...row,
          description: normalizeMultiline(row.description) || null,
          memo: normalizeMultiline(row.memo) || null,
        })),
      engagementTypes: engagementTypes.get(talentId) ?? [],
      experiences: experiences
        .filter((row) => row.talent_id === talentId)
        .sort((left, right) =>
          `${right.end_date ?? "9999"}|${right.start_date ?? ""}|${right.id}`.localeCompare(
            `${left.end_date ?? "9999"}|${left.start_date ?? ""}|${left.id}`
          )
        )
        .map(({ id: _id, talent_id: _talentId, ...row }) => ({
          ...row,
          description: normalizeMultiline(row.description) || null,
          memo: normalizeMultiline(row.memo) || null,
        })),
      extras: extras.get(talentId) ?? null,
      headline: normalizeText(talent?.headline) || null,
      insights: insights.get(talentId) ?? null,
      location: normalizeText(talent?.location) || null,
      resumeLinks: uniqueTexts(talent?.resume_links ?? []),
    });
  }
  return profiles;
}

async function buildEligibleCandidates(
  admin: AdminClient,
  filters: AutoIntroRunFilters
) {
  const stats: EligibilityStats = {
    recentPendingConnectionCount: 0,
    skippedAlreadySentCount: 0,
    skippedLaterStageCount: 0,
    skippedMissingFitCount: 0,
    skippedMissingCodexReasonCount: 0,
    skippedUnsupportedFitKindCount: 0,
  };
  const recentPendingTags = await fetchRecentPendingTags(admin, filters);
  if (recentPendingTags.length === 0) {
    return { candidates: [], roles: [], stats, workspaces: [] };
  }

  const recentRoleIds = uniqueTexts(
    recentPendingTags.map((tag) => tag.opportunity_id)
  );
  const roles = await fetchRoles(admin, recentRoleIds, filters);
  if (roles.length === 0) {
    return { candidates: [], roles: [], stats, workspaces: [] };
  }
  const allowedRoleIds = new Set(roles.map((role) => role.role_id));
  const candidateTags = recentPendingTags.filter((tag) =>
    allowedRoleIds.has(tag.opportunity_id)
  );
  const candidateKeys = new Set(
    candidateTags.map((tag) => `${tag.opportunity_id}:${tag.talent_id}`)
  );
  stats.recentPendingConnectionCount = candidateKeys.size;
  const roleIds = uniqueTexts(candidateTags.map((tag) => tag.opportunity_id));
  const recentTalentIds = uniqueTexts(
    candidateTags.map((tag) => tag.talent_id)
  );
  const tagsByKey = groupTagsByRoleTalent(
    await fetchTags(admin, roleIds, recentTalentIds)
  );
  const now = new Date();
  const freshPairs: Array<{
    key: string;
    pendingSince: string;
    roleId: string;
    talentId: string;
  }> = [];

  for (const key of candidateKeys) {
    const tags = tagsByKey.get(key) ?? [];
    const latestStage = getLatestAutoIntroInternalStage(tags);
    if (normalizeText(latestStage?.tag) !== AUTO_INTRO_PENDING_TAG) {
      stats.skippedLaterStageCount += 1;
      continue;
    }
    const pendingSince = getFreshPendingConnectionSince(tags, now);
    if (!pendingSince) {
      stats.skippedLaterStageCount += 1;
      continue;
    }
    const [roleId, talentId] = key.split(":");
    if (!roleId || !talentId) continue;
    freshPairs.push({ key, pendingSince, roleId, talentId });
  }

  const limitedPairs = freshPairs.sort(
    (left, right) =>
      left.pendingSince.localeCompare(right.pendingSince) ||
      left.key.localeCompare(right.key)
  );
  const workspaces = await fetchWorkspaces(
    admin,
    uniqueTexts(roles.map((role) => role.company_workspace_id))
  );
  if (limitedPairs.length === 0) {
    return { candidates: [], roles, stats, workspaces };
  }

  const talentIds = uniqueTexts(limitedPairs.map((pair) => pair.talentId));
  const limitedRoleIds = uniqueTexts(limitedPairs.map((pair) => pair.roleId));
  const [fits, recommendations, sentProgressKeys, talents] = await Promise.all([
    fetchFits(admin, limitedRoleIds, talentIds),
    fetchRecommendations(admin, limitedRoleIds, talentIds),
    fetchSentIntroProgressKeys(admin, limitedRoleIds, talentIds),
    fetchTalents(admin, talentIds),
  ]);
  const profiles = await fetchCandidateProfiles(admin, talents, talentIds);

  const roleById = new Map(roles.map((role) => [role.role_id, role]));
  const talentById = new Map(talents.map((talent) => [talent.user_id, talent]));
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.company_workspace_id, workspace])
  );
  const candidates: AutoIntroCandidate[] = [];

  for (const pair of limitedPairs) {
    if (sentProgressKeys.has(pair.key)) {
      stats.skippedAlreadySentCount += 1;
      continue;
    }
    const role = roleById.get(pair.roleId);
    if (!role) continue;
    const workspace = workspaceById.get(role.company_workspace_id);
    if (!workspace) continue;
    const fit = fits.get(pair.key) ?? null;
    if (!fit) {
      stats.skippedMissingFitCount += 1;
      continue;
    }
    const reasonMode = getAutoIntroReasonMode(fit?.kind ?? null);
    if (reasonMode === "skip") {
      stats.skippedUnsupportedFitKindCount += 1;
      continue;
    }
    const fitReason = truncateText(fit?.reason, MAX_CODEX_REASON_CHARS) ?? "";
    if (reasonMode === "codex" && !fitReason) {
      stats.skippedMissingCodexReasonCount += 1;
      continue;
    }
    const talent = talentById.get(pair.talentId);
    const talentName = normalizeText(talent?.name) || "후보자";
    candidates.push({
      candidateProfile: profiles.get(pair.talentId) ?? null,
      companyName: normalizeText(workspace.company_name) || "회사",
      fitCompanyCriteriaEvaluations: fit.company_criteria_evaluations ?? null,
      fitId: fit?.id ?? null,
      fitKind: fit?.kind ?? null,
      fitReason,
      fitReevaluationCriteria: fit.reevaluation_criteria ?? null,
      pendingSince: pair.pendingSince,
      reasonMode,
      recommendationId: recommendations.get(pair.key)?.id ?? null,
      roleId: role.role_id,
      roleTitle: normalizeText(role.name) || "포지션",
      talentId: pair.talentId,
      talentName,
      workspaceId: role.company_workspace_id,
    });
  }
  return {
    candidates: candidates.slice(0, filters.limit),
    roles,
    stats,
    workspaces,
  };
}

function groupCandidatesByWorkspace(
  candidates: AutoIntroCandidate[],
  roles: RoleRow[],
  workspaces: WorkspaceRow[]
) {
  const roleById = new Map(roles.map((role) => [role.role_id, role]));
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.company_workspace_id, workspace])
  );
  return groupAutoIntroItemsByWorkspaceAndRole(candidates).flatMap(
    (workspaceGroup) => {
      const workspace = workspaceById.get(workspaceGroup.workspaceId);
      const firstCandidate = workspaceGroup.items[0];
      if (!workspace || !firstCandidate) return [];
      const roleSections = workspaceGroup.roles.flatMap((roleGroup) => {
        const role = roleById.get(roleGroup.roleId);
        if (!role) return [];
        return [
          {
            candidates: roleGroup.items,
            role,
            roleId: roleGroup.roleId,
            roleTitle: roleGroup.items[0]?.roleTitle ?? role.name,
          } satisfies WorkspaceRoleNotificationSection,
        ];
      });
      const validCandidateKeys = new Set(
        roleSections.flatMap((section) => section.candidates.map(candidateKey))
      );
      const validCandidates = workspaceGroup.items.filter((candidate) =>
        validCandidateKeys.has(candidateKey(candidate))
      );
      if (validCandidates.length === 0) return [];
      return [
        {
          candidates: validCandidates,
          companyName: firstCandidate.companyName,
          roleSections,
          workspace,
          workspaceId: workspaceGroup.workspaceId,
        } satisfies WorkspaceNotificationGroup,
      ];
    }
  );
}

function groupWithCandidates(
  group: WorkspaceNotificationGroup,
  candidates: AutoIntroCandidate[]
) {
  const ids = new Set(
    candidates.map((candidate) => `${candidate.roleId}:${candidate.talentId}`)
  );
  return {
    ...group,
    candidates,
    roleSections: group.roleSections
      .map((section) => ({
        ...section,
        candidates: section.candidates.filter((candidate) =>
          ids.has(`${candidate.roleId}:${candidate.talentId}`)
        ),
      }))
      .filter((section) => section.candidates.length > 0),
  } satisfies WorkspaceNotificationGroup;
}

function splitWorkspaceGroupsByCandidate(groups: WorkspaceNotificationGroup[]) {
  return groups.flatMap((group) =>
    group.candidates.map((candidate) => groupWithCandidates(group, [candidate]))
  );
}

async function hasWorkspaceSlackDeliveryChannel(
  admin: AdminClient,
  workspaceId: string
) {
  const { data, error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select("company_workspace_id")
    .eq("company_workspace_id", workspaceId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;

  const { data: channelRows, error: channelError } = await (
    admin.from("company_slack_channels" as any) as any
  )
    .select("id")
    .eq("company_workspace_id", workspaceId)
    .eq("is_enabled", true);
  if (channelError) throw channelError;
  return Boolean(channelRows?.length);
}

const AUTO_INTRO_PRESENTATIONS = new Set<AutoIntroPresentation>([
  "paragraph",
  "tldr",
  "bullets",
  "tldr_bullets",
]);

function buildWorkspaceMessageBody(args: {
  candidateCopyByCandidateKey: Record<string, string>;
  followUpQuestion: string | null;
  group: WorkspaceNotificationGroup;
}) {
  const roleBlocks = args.group.roleSections.map((section) => {
    const candidates = section.candidates.map((candidate) => {
      const copy = args.candidateCopyByCandidateKey[candidateKey(candidate)];
      if (!copy) {
        throw new Error(
          `Missing candidate copy: ${candidate.roleId}:${candidate.talentId}`
        );
      }
      return `*Candidate:* ${buildAutoIntroCandidateNameLink({
        name: candidate.talentName,
        recommendationId: candidate.recommendationId,
        roleId: candidate.roleId,
        talentId: candidate.talentId,
        workspaceId: candidate.workspaceId,
      })}\n${copy}`;
    });
    const roleTitle = escapeAutoIntroSlackHeading(section.roleTitle);
    return [`*${roleTitle}*`, ...candidates].join("\n\n");
  });
  const postscript = buildAutoIntroFollowUpPostscript(args.followUpQuestion);
  return [
    ...AUTO_INTRO_WORKSPACE_OPENING,
    ...roleBlocks,
    AUTO_INTRO_RESPONSE_GUIDANCE,
    buildAutoIntroWorkspaceActionGuidance({
      workspaceId: args.group.workspaceId,
    }),
    ...(postscript ? [postscript] : []),
  ].join("\n\n");
}

function parseCodexAuthoredMessage(
  authored: CodexAuthoredWorkspaceMessage,
  group: WorkspaceNotificationGroup
): GeneratedWorkspaceMessage {
  if (normalizeText(authored.workspaceId) !== group.workspaceId) {
    throw new Error("Authored message workspace does not match");
  }
  if (!Array.isArray(authored.roles) || authored.roles.length === 0) {
    throw new Error("Authored workspace message has no roles array");
  }

  const expectedCandidates = new Map(
    group.candidates.map((candidate) => [candidateKey(candidate), candidate])
  );
  const expectedRoleIds = new Set(
    group.roleSections.map((section) => section.roleId)
  );
  const seenRoleIds = new Set<string>();
  const candidateCopyByCandidateKey: Record<string, string> = {};
  const externalSourcesByCandidateKey: GeneratedWorkspaceMessage["externalSourcesByCandidateKey"] =
    {};
  const fitReasonByCandidateKey: Record<string, string> = {};
  const presentationByCandidateKey: GeneratedWorkspaceMessage["presentationByCandidateKey"] =
    {};

  for (const role of authored.roles) {
    const roleId = normalizeText(role.roleId);
    if (!expectedRoleIds.has(roleId) || seenRoleIds.has(roleId)) {
      throw new Error(`Unexpected or duplicated role section: ${roleId}`);
    }
    seenRoleIds.add(roleId);
    if (!Array.isArray(role.candidates) || role.candidates.length === 0) {
      throw new Error(`Authored role has no candidates: ${roleId}`);
    }
    for (const row of role.candidates) {
      const talentId = normalizeText(row.talentId);
      const key = `${roleId}:${talentId}`;
      const candidate = expectedCandidates.get(key);
      if (!candidate || candidateCopyByCandidateKey[key]) {
        throw new Error(`Unexpected or duplicated candidate copy: ${key}`);
      }
      let candidateCopy: string;
      let fitReason: string;
      let presentation: AutoIntroPresentation | "profile";
      let sentences: string[] | undefined;
      if ("slackProfile" in row && row.slackProfile) {
        try {
          const slackProfile = validateAutoIntroSlackProfile(row.slackProfile);
          candidateCopy = renderAutoIntroSlackProfile(slackProfile);
          fitReason = slackProfile.body;
        } catch (error) {
          throw new Error(`${formatError(error)}: ${key}`);
        }
        presentation = "profile";
      } else {
        if (!Array.isArray(row.sentences)) {
          throw new Error(`Candidate copy has no sentences: ${key}`);
        }
        sentences = row.sentences.map(normalizeText).filter(Boolean);
        try {
          validateAutoIntroCandidateSentences(sentences);
        } catch (error) {
          throw new Error(`${formatError(error)}: ${key}`);
        }
        presentation = normalizeText(row.presentation) as AutoIntroPresentation;
        if (!AUTO_INTRO_PRESENTATIONS.has(presentation)) {
          throw new Error(`Unsupported candidate presentation: ${key}`);
        }
        candidateCopy = renderAutoIntroCandidateCopy(presentation, sentences);
        fitReason = candidateCopy;
      }
      candidateCopyByCandidateKey[key] = candidateCopy;
      fitReasonByCandidateKey[key] = fitReason;
      presentationByCandidateKey[key] = presentation;
      externalSourcesByCandidateKey[key] = Array.isArray(row.sources)
        ? row.sources
            .flatMap((source) => {
              const url = normalizeText(source?.url);
              if (!/^https?:\/\//i.test(url)) return [];
              return [
                {
                  title: normalizeText(source?.title) || null,
                  url: url.slice(0, 2_000),
                },
              ];
            })
            .slice(0, 10)
        : [];
    }
  }

  if (seenRoleIds.size !== expectedRoleIds.size) {
    throw new Error("Auto intro message omitted a role section");
  }
  if (
    Object.keys(candidateCopyByCandidateKey).length !== expectedCandidates.size
  ) {
    throw new Error("Auto intro message omitted a candidate");
  }
  const normalizedQuestion = normalizeText(authored.followUpQuestion);
  const followUpQuestion =
    !normalizedQuestion || normalizedQuestion.toLowerCase() === "null"
      ? null
      : normalizedQuestion;
  const model = normalizeText(authored.generation?.model) || "codex-scheduled";
  const source =
    normalizeText(authored.generation?.source) ||
    "codex_scheduled_auto_intro_to_company";
  const rawWebToolCallCount = Number(
    authored.generation?.webToolCallCount ?? 0
  );
  const webToolCallCount = Number.isFinite(rawWebToolCallCount)
    ? Math.max(0, Math.min(10, Math.trunc(rawWebToolCallCount)))
    : 0;
  return {
    body: buildWorkspaceMessageBody({
      candidateCopyByCandidateKey,
      followUpQuestion,
      group,
    }),
    candidateCopyByCandidateKey,
    externalSourcesByCandidateKey,
    followUpQuestion,
    fitReasonByCandidateKey,
    model,
    presentationByCandidateKey,
    source: source.slice(0, 120),
    webToolCallCount,
  };
}

function pendingClaimIsFresh(metadata: unknown) {
  const record = metadataRecord(metadata);
  if (record.deliveryStatus !== "pending") return false;
  const claimedAt = new Date(normalizeText(record.claimedAt));
  return (
    Number.isFinite(claimedAt.getTime()) &&
    Date.now() - claimedAt.getTime() < CLAIM_TTL_MS
  );
}

function progressMetadata(args: {
  candidate: AutoIntroCandidate;
  deliveryStatus: "pending" | "failed" | "sent";
  message: GeneratedWorkspaceMessage;
}) {
  const now = new Date().toISOString();
  return {
    autoIntroToCompany: true,
    candidateCopy:
      args.message.candidateCopyByCandidateKey[candidateKey(args.candidate)],
    claimedAt: now,
    deliveryStatus: args.deliveryStatus,
    externalSources:
      args.message.externalSourcesByCandidateKey[
        candidateKey(args.candidate)
      ] ?? [],
    fitId: args.candidate.fitId,
    fitKind: args.candidate.fitKind,
    generatedAt: now,
    model: args.message.model,
    pendingSince: args.candidate.pendingSince,
    presentation:
      args.message.presentationByCandidateKey[candidateKey(args.candidate)],
    reasonSource: args.candidate.reasonMode,
    recommendationId: args.candidate.recommendationId,
    roleTitle: args.candidate.roleTitle,
    source: args.message.source,
    webToolCallCount: args.message.webToolCallCount,
    workspaceId: args.candidate.workspaceId,
  } satisfies Record<string, unknown>;
}

async function claimCandidateProgressRows(args: {
  admin: AdminClient;
  group: WorkspaceNotificationGroup;
  message: GeneratedWorkspaceMessage;
}) {
  const claimed: AutoIntroCandidate[] = [];
  for (const candidate of args.group.candidates) {
    const id = progressIdForCandidate(candidate);
    const { data: existing, error: existingError } = await (
      args.admin.from("talent_progress" as any) as any
    )
      .select("id, metadata")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (wasAutoIntroSlackSent(existing?.metadata)) continue;
    if (pendingClaimIsFresh(existing?.metadata)) continue;
    const metadata = progressMetadata({
      candidate,
      deliveryStatus: "pending",
      message: args.message,
    });
    const values = {
      id,
      kind: INTRO_TO_COMPANY_KIND,
      metadata: metadata as Json,
      recommendation_id: candidate.recommendationId,
      role_id: candidate.roleId,
      talent_id: candidate.talentId,
      text:
        args.message.candidateCopyByCandidateKey[candidateKey(candidate)] ||
        `${candidate.talentName}님을 만나보시기를 제안드립니다.`,
      user_id: HARPER_WORKER_USER_ID,
    };
    const result = existing
      ? await (args.admin.from("talent_progress" as any) as any)
          .update(values)
          .eq("id", id)
      : await (args.admin.from("talent_progress" as any) as any).insert(values);
    if (result.error) {
      if ((result.error as { code?: string }).code === "23505") continue;
      throw result.error;
    }
    claimed.push(candidate);
  }
  return claimed;
}

async function updateCandidateProgressMetadata(args: {
  admin: AdminClient;
  delivery: DeliveryOutcome;
  group: WorkspaceNotificationGroup;
  message: GeneratedWorkspaceMessage;
}) {
  const now = new Date().toISOString();
  const deliveryStatus = args.delivery.slackSent ? "sent" : "failed";
  for (const candidate of args.group.candidates) {
    const metadata = {
      ...progressMetadata({ candidate, deliveryStatus, message: args.message }),
      attemptedAt: now,
      deliveredAt: args.delivery.slackSent ? now : null,
      idempotencyKey: args.delivery.idempotencyKey,
      slackConnected: args.delivery.slackConnected,
      slackError: args.delivery.slackError,
      slackSent: args.delivery.slackSent,
    } satisfies Record<string, unknown>;
    const { error } = await (args.admin.from("talent_progress" as any) as any)
      .update({ metadata: metadata as Json })
      .eq("id", progressIdForCandidate(candidate));
    if (error) throw error;
  }
}

async function persistAutoIntroSlackBodiesAsFitReasons(args: {
  admin: AdminClient;
  group: WorkspaceNotificationGroup;
  message: GeneratedWorkspaceMessage;
}) {
  for (const candidate of args.group.candidates) {
    if (!candidate.fitId) {
      throw new Error(`Missing candidate fit row: ${candidate.talentId}`);
    }
    const reason =
      args.message.fitReasonByCandidateKey[candidateKey(candidate)];
    if (!reason) {
      throw new Error(`Missing candidate Slack body: ${candidate.talentId}`);
    }
    const { data, error } = await (
      args.admin.from("talent_opportunity_fit" as any) as any
    )
      .update({ reason })
      .eq("id", candidate.fitId)
      .eq("opportunity_id", candidate.roleId)
      .eq("talent_id", candidate.talentId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        `Candidate fit changed before Slack body persistence: ${candidate.fitId}`
      );
    }
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function attachRoleSummaryToMessage(
  message: GeneratedWorkspaceMessage,
  summary: AutoIntroRoleSummary
): GeneratedWorkspaceMessage {
  return {
    ...message,
    body: buildAutoIntroRoleSummaryText({
      introBody: message.body,
      summary,
    }),
    slackBlocks: buildAutoIntroRoleSummarySlackBlocks({
      introBody: message.body,
      summary,
    }),
  };
}

function attachReviewActionToMessage(
  message: GeneratedWorkspaceMessage,
  candidateCount: number
): GeneratedWorkspaceMessage {
  return {
    ...message,
    slackBlocks: attachAutoIntroSlackReviewAction({
      blocks: message.slackBlocks,
      candidateCount,
      messageBody: message.body,
    }),
  };
}

async function sendWorkspaceMessage(args: {
  group: WorkspaceNotificationGroup;
  idempotencyKey?: string;
  message: GeneratedWorkspaceMessage;
  slackConnected: boolean;
  suppressLinkPreviews?: boolean;
}): Promise<DeliveryOutcome> {
  const idempotencyKey =
    args.idempotencyKey ?? deliveryIdempotencyKey(args.group);
  let slackSent = false;
  let slackError: string | null = null;
  if (args.slackConnected) {
    try {
      slackSent = await sendHarperWorkspaceSlackMessage({
        blocks: args.message.slackBlocks,
        idempotencyKey,
        messageMetadata: {
          autoIntroToCompany: {
            candidateIds: uniqueTexts(
              args.group.candidates.map((candidate) => candidate.talentId)
            ),
            candidateKeys: args.group.candidates.map(candidateKey),
            pendingSinceByCandidateKey: Object.fromEntries(
              args.group.candidates.map((candidate) => [
                candidateKey(candidate),
                candidate.pendingSince,
              ])
            ),
            reasonSourceByCandidateKey: Object.fromEntries(
              args.group.candidates.map((candidate) => [
                candidateKey(candidate),
                candidate.reasonMode === "codex" ? "codex" : "codex-authored",
              ])
            ),
            roleIds: args.group.roleSections.map((section) => section.roleId),
            webToolCallCount: args.message.webToolCallCount,
          },
          model: args.message.model,
          source: args.message.source,
        },
        mentions: args.group.candidates.map((candidate) => ({
          displayName: candidate.talentName,
          recommendationId: candidate.recommendationId,
          roleId: candidate.roleId,
          talentId: candidate.talentId,
        })),
        roleId: null,
        text: args.message.body,
        unfurlLinks: args.suppressLinkPreviews ? false : undefined,
        unfurlMedia: args.suppressLinkPreviews ? false : undefined,
        workspaceId: args.group.workspaceId,
      });
      if (!slackSent)
        slackError = "No eligible Slack channel accepted delivery";
    } catch (error) {
      slackError = formatError(error).slice(0, 500);
    }
  }
  return {
    idempotencyKey,
    slackConnected: args.slackConnected,
    slackError,
    slackSent,
  };
}

async function sendRoleSummaryOnly(args: {
  dateKey: string;
  slackConnected: boolean;
  summary: AutoIntroRoleSummary;
}): Promise<DeliveryOutcome> {
  const idempotencyKey = roleSummaryIdempotencyKey(
    args.summary.workspaceId,
    args.dateKey
  );
  let slackSent = false;
  let slackError: string | null = null;
  if (args.slackConnected) {
    try {
      slackSent = await sendHarperWorkspaceSlackMessage({
        blocks: buildAutoIntroRoleSummarySlackBlocks({
          summary: args.summary,
        }),
        idempotencyKey,
        messageMetadata: {
          model: "application",
          source: "codex_scheduled_auto_intro_role_summary",
        },
        roleId: null,
        text: buildAutoIntroRoleSummaryText({ summary: args.summary }),
        unfurlLinks: false,
        unfurlMedia: false,
        workspaceId: args.summary.workspaceId,
      });
      if (!slackSent) {
        slackError = "No eligible Slack channel accepted delivery";
      }
    } catch (error) {
      slackError = formatError(error).slice(0, 500);
    }
  }
  return {
    idempotencyKey,
    slackConnected: args.slackConnected,
    slackError,
    slackSent,
  };
}

function defaultCompanyPromptContext(group: WorkspaceNotificationGroup) {
  return {
    companyInformation: null,
    companyName: group.companyName,
    employeeCount: null,
    hiringRequest: null,
    location: null,
    specialities: null,
    workspaceMemory: null,
  } satisfies AutoIntroCompanyPromptContext;
}

function buildCandidateDossierGroup(args: {
  companyContext?: AutoIntroCompanyPromptContext;
  group: WorkspaceNotificationGroup;
  slackConnected: boolean;
  workspaceRoles?: AutoIntroRolePromptContext[];
}): AutoIntroToCompanyCandidateDossiers["groups"][number] {
  const candidate = args.group.candidates[0];
  const roleSection = args.group.roleSections[0];
  if (
    args.group.candidates.length !== 1 ||
    args.group.roleSections.length !== 1 ||
    !candidate ||
    !roleSection ||
    roleSection.candidates.length !== 1 ||
    roleSection.candidates[0]?.talentId !== candidate.talentId
  ) {
    throw new Error(
      "Auto-intro LLM dossier must contain exactly one role and one candidate"
    );
  }
  return {
    candidateCount: 1,
    companyContext:
      args.companyContext ?? defaultCompanyPromptContext(args.group),
    companyName: args.group.companyName,
    roles: [
      {
        candidateCount: 1,
        candidates: [
          {
            name: candidate.talentName,
            professionalProfile: candidate.candidateProfile,
            reasonMode: candidate.reasonMode,
            storedCompanyCriteriaEvaluations:
              candidate.fitCompanyCriteriaEvaluations,
            storedReevaluationCriteria: candidate.fitReevaluationCriteria,
            storedReason: candidate.fitReason || null,
            talentId: candidate.talentId,
          },
        ],
        roleId: roleSection.roleId,
        roleTitle: roleSection.roleTitle,
      },
    ],
    slackConnected: args.slackConnected,
    workspaceId: args.group.workspaceId,
    workspaceRoles: (args.workspaceRoles ?? [])
      .filter((role) => role.roleId === roleSection.roleId)
      .slice(0, 1),
  };
}

async function buildManualAutoIntroContext(args: {
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const roleId = normalizeText(args.roleId);
  const talentId = normalizeText(args.talentId);
  const workspaceId = normalizeText(args.workspaceId);
  if (!roleId || !talentId || !workspaceId) {
    throw new Error("workspaceId, roleId, and talentId are required");
  }

  const admin = getSupabaseAdmin();
  const { data: roleData, error: roleError } = await (
    admin.from("company_roles" as any) as any
  )
    .select(
      "role_id, company_workspace_id, name, description, description_summary, external_jd_url, information, summary, location_text, work_mode, type, seniority_level, salary_range, status, is_expired, company_internal_roles(request, criteria, considerations, questions, memory)"
    )
    .eq("role_id", roleId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!roleData) {
    throw new Error("이 workspace에서 해당 역할을 찾지 못했습니다.");
  }
  const role = roleData as RoleRow;

  const [workspaces, talents, fits, recommendations] = await Promise.all([
    fetchWorkspaces(admin, [workspaceId]),
    fetchTalents(admin, [talentId]),
    fetchFits(admin, [roleId], [talentId]),
    fetchRecommendations(admin, [roleId], [talentId]),
  ]);
  const workspace = workspaces[0];
  if (!workspace) throw new Error("회사 workspace를 찾지 못했습니다.");
  const talent = talents.find((row) => row.user_id === talentId);
  if (!talent) throw new Error("후보자 정보를 찾지 못했습니다.");

  const profiles = await fetchCandidateProfiles(admin, talents, [talentId]);
  const pairKey = `${roleId}:${talentId}`;
  const fit = fits.get(pairKey) ?? null;
  const fitReason = truncateText(fit?.reason, MAX_CODEX_REASON_CHARS) ?? "";
  const policyReasonMode = getAutoIntroReasonMode(fit?.kind ?? null);
  const reasonMode: AutoIntroCandidate["reasonMode"] =
    policyReasonMode === "codex" && fitReason ? "codex" : "author";
  const candidate: AutoIntroCandidate = {
    candidateProfile: profiles.get(talentId) ?? null,
    companyName: normalizeText(workspace.company_name) || "회사",
    fitCompanyCriteriaEvaluations: fit?.company_criteria_evaluations ?? null,
    fitId: fit?.id ?? null,
    fitKind: fit?.kind ?? null,
    fitReason,
    fitReevaluationCriteria: fit?.reevaluation_criteria ?? null,
    pendingSince: new Date().toISOString(),
    reasonMode,
    recommendationId: recommendations.get(pairKey)?.id ?? null,
    roleId,
    roleTitle: normalizeText(role.name) || "포지션",
    talentId,
    talentName: normalizeText(talent.name) || "후보자",
    workspaceId,
  };
  const group: WorkspaceNotificationGroup = {
    candidates: [candidate],
    companyName: candidate.companyName,
    roleSections: [
      {
        candidates: [candidate],
        role,
        roleId,
        roleTitle: candidate.roleTitle,
      },
    ],
    workspace,
    workspaceId,
  };
  const [promptContexts, slackConnected] = await Promise.all([
    fetchWorkspacePromptContexts({
      admin,
      targetRoles: [role],
      workspaces: [workspace],
    }),
    hasWorkspaceSlackDeliveryChannel(admin, workspaceId),
  ]);
  return {
    dossier: buildCandidateDossierGroup({
      companyContext: promptContexts.companyByWorkspaceId.get(workspaceId),
      group,
      slackConnected,
      workspaceRoles: promptContexts.rolesByWorkspaceId.get(workspaceId),
    }),
    group,
    slackConnected,
  };
}

export async function fetchManualAutoIntroToCompanyCandidateDossier(args: {
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const context = await buildManualAutoIntroContext(args);
  return context.dossier;
}

export async function sendManualAutoIntroToCompanyNotification(args: {
  authored: CodexAuthoredWorkspaceMessage;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const context = await buildManualAutoIntroContext(args);
  const parsedMessage = parseCodexAuthoredMessage(args.authored, context.group);
  const message = attachReviewActionToMessage(parsedMessage, 1);
  const delivery = await sendWorkspaceMessage({
    group: context.group,
    idempotencyKey: randomUUID(),
    message,
    slackConnected: context.slackConnected,
  });
  return { body: message.body, ...delivery };
}

function autoIntroFilters(args?: {
  limit?: number;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  return {
    limit: args?.limit ?? DEFAULT_MAX_CANDIDATES,
    roleId: normalizeOptionalFilter(args?.roleId),
    workspaceId: normalizeOptionalFilter(args?.workspaceId),
  } satisfies AutoIntroRunFilters;
}

export async function fetchAutoIntroToCompanyCandidateDossiers(args?: {
  limit?: number;
  now?: Date;
  roleId?: string | null;
  workspaceId?: string | null;
}): Promise<AutoIntroToCompanyCandidateDossiers> {
  const admin = getSupabaseAdmin();
  const filters = autoIntroFilters(args);
  const now = args?.now ?? new Date();
  const roleSummaryDue = isAutoIntroRoleSummaryDay(now);
  const [eligibility, summaries] = await Promise.all([
    buildEligibleCandidates(admin, filters),
    roleSummaryDue
      ? fetchCurrentRoleSummaries(admin, filters, now)
      : Promise.resolve([]),
  ]);
  const groups = splitWorkspaceGroupsByCandidate(
    groupCandidatesByWorkspace(
      eligibility.candidates,
      eligibility.roles,
      eligibility.workspaces
    )
  );
  const promptWorkspaceIds = new Set(groups.map((group) => group.workspaceId));
  const promptContexts = await fetchWorkspacePromptContexts({
    admin,
    targetRoles: eligibility.roles.filter((role) =>
      promptWorkspaceIds.has(role.company_workspace_id)
    ),
    workspaces: eligibility.workspaces.filter((workspace) =>
      promptWorkspaceIds.has(workspace.company_workspace_id)
    ),
  });
  const slackConnectedByWorkspace = new Map<string, boolean>();
  await Promise.all(
    summaries.map(async (summary) => {
      slackConnectedByWorkspace.set(
        summary.workspaceId,
        await hasWorkspaceSlackDeliveryChannel(admin, summary.workspaceId)
      );
    })
  );
  const result: AutoIntroToCompanyCandidateDossiers = {
    ...eligibility.stats,
    eligibleCandidateCount: eligibility.candidates.length,
    groups: [],
    roleSummaries: summaries.map((summary) => ({
      ...summary,
      slackConnected:
        slackConnectedByWorkspace.get(summary.workspaceId) ?? false,
    })),
    roleSummaryDue,
    roleSummaryWorkspaceCount: summaries.length,
    skippedNoChannelCount: 0,
    skippedRoleSummaryNoChannelCount: summaries.filter(
      (summary) => !slackConnectedByWorkspace.get(summary.workspaceId)
    ).length,
  };

  for (const group of groups) {
    let slackConnected = slackConnectedByWorkspace.get(group.workspaceId);
    if (slackConnected === undefined) {
      slackConnected = await hasWorkspaceSlackDeliveryChannel(
        admin,
        group.workspaceId
      );
      slackConnectedByWorkspace.set(group.workspaceId, slackConnected);
    }
    if (!slackConnected) {
      result.skippedNoChannelCount += group.candidates.length;
    }
    result.groups.push(
      buildCandidateDossierGroup({
        companyContext: promptContexts.companyByWorkspaceId.get(
          group.workspaceId
        ),
        group,
        slackConnected,
        workspaceRoles: promptContexts.rolesByWorkspaceId.get(
          group.workspaceId
        ),
      })
    );
  }
  return result;
}

function filterAuthoredMessageToCandidates(
  authored: CodexAuthoredWorkspaceMessage,
  keys: Set<string>
): CodexAuthoredWorkspaceMessage {
  return {
    ...authored,
    roles: authored.roles
      .map((role) => {
        const roleId = normalizeText(role.roleId);
        return {
          ...role,
          roleId,
          candidates: role.candidates.filter((candidate) =>
            keys.has(`${roleId}:${normalizeText(candidate.talentId)}`)
          ),
        };
      })
      .filter((role) => role.candidates.length > 0),
  };
}

export async function sendCodexAuthoredAutoIntroToCompanyNotifications(args: {
  groups: CodexAuthoredWorkspaceMessage[];
  limit?: number;
  now?: Date;
  roleId?: string | null;
  workspaceId?: string | null;
}): Promise<AutoIntroToCompanyDeliveryResult> {
  if (!Array.isArray(args.groups)) {
    throw new Error("groups must be an array");
  }
  const admin = getSupabaseAdmin();
  const filters = autoIntroFilters(args);
  const now = args.now ?? new Date();
  const roleSummaryDue = isAutoIntroRoleSummaryDay(now);
  const roleSummaryDateKey = getAutoIntroRoleSummaryDateKey(now);
  const [eligibility, roleSummaries] = await Promise.all([
    buildEligibleCandidates(admin, filters),
    roleSummaryDue
      ? fetchCurrentRoleSummaries(admin, filters, now)
      : Promise.resolve([]),
  ]);
  const availableGroups = groupCandidatesByWorkspace(
    eligibility.candidates,
    eligibility.roles,
    eligibility.workspaces
  );
  const groupByWorkspaceId = new Map(
    availableGroups.map((group) => [group.workspaceId, group])
  );
  const roleSummaryByWorkspaceId = new Map(
    roleSummaries.map((summary) => [summary.workspaceId, summary])
  );

  const result: AutoIntroToCompanyDeliveryResult = {
    ...eligibility.stats,
    eligibleCandidateCount: eligibility.candidates.length,
    failedCandidateCount: 0,
    failedRoleSummaryCount: 0,
    groups: [],
    processedCandidateCount: 0,
    roleSummaries: [],
    roleSummaryDue,
    roleSummaryWorkspaceCount: roleSummaries.length,
    sentCandidateCount: 0,
    sentRoleSummaryCount: 0,
    sentSlackCount: 0,
    skippedNoChannelCount: 0,
    skippedRoleSummaryNoChannelCount: 0,
  };
  const submittedWorkspaceIds = new Set<string>();
  const attemptedRoleSummaryWorkspaceIds = new Set<string>();
  const slackConnectedByWorkspace = new Map<string, boolean>();
  const slackConnectedFor = async (workspaceId: string) => {
    const cached = slackConnectedByWorkspace.get(workspaceId);
    if (cached !== undefined) return cached;
    const connected = await hasWorkspaceSlackDeliveryChannel(
      admin,
      workspaceId
    );
    slackConnectedByWorkspace.set(workspaceId, connected);
    return connected;
  };
  const recordRoleSummary = (
    summary: AutoIntroRoleSummary,
    slackConnected: boolean,
    delivery?: DeliveryOutcome
  ) => {
    attemptedRoleSummaryWorkspaceIds.add(summary.workspaceId);
    result.roleSummaries.push({
      body: buildAutoIntroRoleSummaryText({ summary }),
      companyName: summary.companyName,
      roleCount: summary.roles.length,
      slackConnected,
      slackError: delivery?.slackError ?? null,
      slackSent: delivery?.slackSent ?? false,
      workspaceId: summary.workspaceId,
    });
    if (!slackConnected) {
      result.skippedRoleSummaryNoChannelCount += 1;
    } else if (delivery?.slackSent) {
      result.sentRoleSummaryCount += 1;
    } else {
      result.failedRoleSummaryCount += 1;
    }
  };

  for (const authored of args.groups) {
    const workspaceId = normalizeText(authored.workspaceId);
    if (!workspaceId || submittedWorkspaceIds.has(workspaceId)) {
      throw new Error(
        `Unexpected or duplicated workspace group: ${workspaceId}`
      );
    }
    submittedWorkspaceIds.add(workspaceId);
    const group = groupByWorkspaceId.get(workspaceId);
    if (!group)
      throw new Error(`No currently eligible workspace: ${workspaceId}`);
    const normalizedAuthored = { ...authored, workspaceId };
    const eligibleCandidateByKey = new Map(
      group.candidates.map((candidate) => [candidateKey(candidate), candidate])
    );
    const authoredCandidates: AutoIntroCandidate[] = [];
    const authoredCandidateKeys = new Set<string>();
    for (const role of normalizedAuthored.roles) {
      const roleId = normalizeText(role.roleId);
      for (const candidateCopy of role.candidates) {
        const key = `${roleId}:${normalizeText(candidateCopy.talentId)}`;
        const candidate = eligibleCandidateByKey.get(key);
        if (!candidate || authoredCandidateKeys.has(key)) {
          throw new Error(
            `Unexpected or duplicated authored candidate: ${key}`
          );
        }
        authoredCandidateKeys.add(key);
        authoredCandidates.push(candidate);
      }
    }
    if (authoredCandidates.length === 0) {
      throw new Error(
        `Authored workspace message has no candidates: ${workspaceId}`
      );
    }
    const authoredGroup = groupWithCandidates(group, authoredCandidates);
    const message = parseCodexAuthoredMessage(
      normalizedAuthored,
      authoredGroup
    );
    const roleSummary = roleSummaryByWorkspaceId.get(group.workspaceId);
    const previewMessage = roleSummary
      ? attachRoleSummaryToMessage(message, roleSummary)
      : message;
    const slackConnected = await slackConnectedFor(group.workspaceId);
    if (!slackConnected) {
      result.skippedNoChannelCount += authoredGroup.candidates.length;
      if (roleSummary) {
        recordRoleSummary(roleSummary, false);
      }
      result.groups.push({
        candidateCount: authoredGroup.candidates.length,
        companyName: group.companyName,
        message: previewMessage,
        roleIds: authoredGroup.roleSections.map((section) => section.roleId),
        roleTitles: authoredGroup.roleSections.map(
          (section) => section.roleTitle
        ),
        slackConnected,
        workspaceId: group.workspaceId,
      });
      continue;
    }

    const claimedCandidates = await claimCandidateProgressRows({
      admin,
      group: authoredGroup,
      message,
    });
    if (claimedCandidates.length === 0) continue;
    const claimedKeys = new Set(
      claimedCandidates.map((candidate) => candidateKey(candidate))
    );
    const claimedGroup = groupWithCandidates(authoredGroup, claimedCandidates);
    const candidateMessage =
      claimedCandidates.length === authoredGroup.candidates.length
        ? message
        : parseCodexAuthoredMessage(
            filterAuthoredMessageToCandidates(normalizedAuthored, claimedKeys),
            claimedGroup
          );
    const deliveryMessage = roleSummary
      ? attachRoleSummaryToMessage(candidateMessage, roleSummary)
      : candidateMessage;
    await persistAutoIntroSlackBodiesAsFitReasons({
      admin,
      group: claimedGroup,
      message: deliveryMessage,
    });
    const delivery = await sendWorkspaceMessage({
      group: claimedGroup,
      message: deliveryMessage,
      slackConnected,
      suppressLinkPreviews: true,
    });
    if (roleSummary) {
      recordRoleSummary(roleSummary, slackConnected, delivery);
    }
    await updateCandidateProgressMetadata({
      admin,
      delivery,
      group: claimedGroup,
      message: deliveryMessage,
    });

    result.groups.push({
      candidateCount: claimedCandidates.length,
      companyName: group.companyName,
      message: deliveryMessage,
      roleIds: claimedGroup.roleSections.map((section) => section.roleId),
      roleTitles: claimedGroup.roleSections.map((section) => section.roleTitle),
      slackConnected,
      workspaceId: group.workspaceId,
    });
    result.processedCandidateCount += claimedCandidates.length;
    result.sentSlackCount += delivery.slackSent ? 1 : 0;
    result.sentCandidateCount += delivery.slackSent
      ? claimedCandidates.length
      : 0;
    result.failedCandidateCount += delivery.slackSent
      ? 0
      : claimedCandidates.length;
  }

  for (const summary of roleSummaries) {
    if (attemptedRoleSummaryWorkspaceIds.has(summary.workspaceId)) continue;
    const slackConnected = await slackConnectedFor(summary.workspaceId);
    if (!slackConnected) {
      recordRoleSummary(summary, false);
      continue;
    }
    const delivery = await sendRoleSummaryOnly({
      dateKey: roleSummaryDateKey,
      slackConnected,
      summary,
    });
    recordRoleSummary(summary, slackConnected, delivery);
    result.sentSlackCount += delivery.slackSent ? 1 : 0;
  }
  return result;
}

export function parseAutoIntroToCompanyLimit(value: string | null | undefined) {
  return parsePositiveInt(value, DEFAULT_MAX_CANDIDATES);
}
