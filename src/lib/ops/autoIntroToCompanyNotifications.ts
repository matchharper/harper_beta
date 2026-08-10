import { createHash } from "crypto";
import { sendHarperWorkspaceSlackMessage } from "@/lib/org/slackHarper";
import {
  AUTO_INTRO_MAX_PENDING_AGE_DAYS,
  AUTO_INTRO_PENDING_TAG,
  AUTO_INTRO_RESPONSE_GUIDANCE,
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
  validateAutoIntroCandidateSentences,
  validateAutoIntroInternalReason,
  type AutoIntroPresentation,
  type AutoIntroRoleSummary,
} from "@/lib/ops/autoIntroToCompanyMessage";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { Json } from "@/types/database.types";

const INTRO_TO_COMPANY_KIND = "intro_to_company";
const HARPER_WORKER_USER_ID = "harper_worker";
const BATCH_SIZE = 1000;
const ID_FILTER_CHUNK_SIZE = 80;
const DEFAULT_MAX_CANDIDATES = Number.MAX_SAFE_INTEGER;
const MAX_CODEX_REASON_CHARS = 2400;
const MAX_PROFILE_TEXT_CHARS = 3500;
const CLAIM_TTL_MS = 30 * 60 * 1000;

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type FetchPageResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type RoleRow = {
  company_workspace_id: string;
  description: string | null;
  description_summary: string | null;
  information: Json | null;
  is_expired: boolean | null;
  location_text: string | null;
  name: string;
  request: string | null;
  role_id: string;
  salary_range: string | null;
  seniority_level: string | null;
  status: string | null;
  summary: Json | null;
  work_mode: string | null;
};

type RoleSummaryRow = {
  company_workspace_id: string;
  is_expired: boolean | null;
  name: string;
  role_id: string;
  status: string | null;
};

type WorkspaceRow = {
  brief: string | null;
  company_description: string | null;
  company_name: string;
  company_workspace_id: string;
  pitch: string | null;
  request: string | null;
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
  created_at: string;
  id: string;
  kind: string | null;
  last_evaluated_at: string;
  opportunity_id: string;
  reason: string;
  talent_id: string;
};

type TalentRow = {
  bio: string | null;
  current_location: string | null;
  email: string | null;
  headline: string | null;
  location: string | null;
  name: string | null;
  resume_text: string | null;
  user_id: string;
};

type ExperienceRow = {
  company_location: string | null;
  company_name: string | null;
  description: string | null;
  employment_type: string | null;
  end_date: string | null;
  id: number;
  memo: string | null;
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
};

type CandidateProfile = {
  bio: string | null;
  currentLocation: string | null;
  educations: Array<Record<string, unknown>>;
  experiences: Array<Record<string, unknown>>;
  extras: Json | null;
  headline: string | null;
  insights: Json | null;
  location: string | null;
  resumeExcerpt: string | null;
};

type AutoIntroCandidate = {
  candidateProfile: CandidateProfile | null;
  companyName: string;
  fitId: string | null;
  fitKind: string | null;
  fitReason: string;
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
  followUpQuestion: string | null;
  internalReasonByCandidateKey: Record<string, string>;
  model: string;
  presentationByCandidateKey: Record<string, AutoIntroPresentation>;
  slackBlocks?: Array<Record<string, unknown>>;
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

export type CodexAuthoredCandidateCopy = {
  internalReason?: string | null;
  presentation: AutoIntroPresentation;
  sentences: string[];
  talentId: string;
};

export type CodexAuthoredRoleSection = {
  candidates: CodexAuthoredCandidateCopy[];
  roleId: string;
};

export type CodexAuthoredWorkspaceMessage = {
  followUpQuestion?: string | null;
  roles: CodexAuthoredRoleSection[];
  workspaceId: string;
};

export type AutoIntroToCompanyCandidateDossiers = EligibilityStats & {
  eligibleCandidateCount: number;
  groups: Array<{
    candidateCount: number;
    companyName: string;
    companyContext: Record<string, unknown>;
    roles: Array<{
      candidateCount: number;
      candidates: Array<{
        fitId: string;
        fitKind: string | null;
        name: string;
        pendingSince: string;
        professionalProfile: ReturnType<typeof candidateProfileForCodex>;
        reasonMode: "codex" | "author";
        storedReason: string | null;
        talentId: string;
      }>;
      roleContext: Record<string, unknown>;
      roleId: string;
      roleTitle: string;
    }>;
    slackConnected: boolean;
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
        "role_id, company_workspace_id, name, description, description_summary, request, information, summary, location_text, work_mode, seniority_level, salary_range, status, is_expired"
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

async function fetchCurrentRoleSummaries(
  admin: AdminClient,
  filters: AutoIntroRunFilters
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
  if (candidateKeys.size > 0) {
    const talentIds = uniqueTexts(pendingTags.map((tag) => tag.talent_id));
    const tagsByKey = groupTagsByRoleTalent(
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
        "company_workspace_id, company_name, brief, company_description, pitch, request"
      )
      .in("company_workspace_id", workspaceIdChunk);
    if (error) throw new Error(error.message || "Failed to load workspaces");
    rows.push(...((data ?? []) as WorkspaceRow[]));
  }
  return rows;
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
              "id, opportunity_id, talent_id, reason, kind, last_evaluated_at, created_at"
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
        "user_id, name, email, headline, bio, current_location, location, resume_text"
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

  for (const talentIdChunk of chunkValues(talentIds)) {
    const [experienceResult, educationResult, extraResult, insightResult] =
      await Promise.all([
        (admin.from("talent_experiences" as any) as any)
          .select(
            "id, talent_id, company_name, company_location, role, employment_type, start_date, end_date, description, memo"
          )
          .in("talent_id", talentIdChunk),
        (admin.from("talent_educations" as any) as any)
          .select(
            "id, talent_id, school, degree, field, start_date, end_date, description, memo"
          )
          .in("talent_id", talentIdChunk),
        (admin.from("talent_extras" as any) as any)
          .select("talent_id, content")
          .in("talent_id", talentIdChunk),
        (admin.from("talent_insights" as any) as any)
          .select("talent_id, content")
          .in("talent_id", talentIdChunk),
      ]);
    if (experienceResult.error) throw experienceResult.error;
    if (educationResult.error) throw educationResult.error;
    if (extraResult.error) throw extraResult.error;
    if (insightResult.error) throw insightResult.error;
    experiences.push(...((experienceResult.data ?? []) as ExperienceRow[]));
    educations.push(...((educationResult.data ?? []) as EducationRow[]));
    for (const row of extraResult.data ?? []) {
      extras.set(row.talent_id, row.content as Json | null);
    }
    for (const row of insightResult.data ?? []) {
      if (row.talent_id)
        insights.set(row.talent_id, row.content as Json | null);
    }
  }

  const talentById = new Map(talents.map((talent) => [talent.user_id, talent]));
  const profiles = new Map<string, CandidateProfile>();
  for (const talentId of talentIds) {
    const talent = talentById.get(talentId);
    profiles.set(talentId, {
      bio: truncateText(talent?.bio, 1200),
      currentLocation: truncateText(talent?.current_location, 300),
      educations: educations
        .filter((row) => row.talent_id === talentId)
        .sort((left, right) =>
          `${right.end_date ?? ""}|${right.id}`.localeCompare(
            `${left.end_date ?? ""}|${left.id}`
          )
        )
        .slice(0, 3)
        .map(({ talent_id: _talentId, ...row }) => ({
          ...row,
          description: truncateText(row.description, 500),
          memo: truncateText(row.memo, 500),
        })),
      experiences: experiences
        .filter((row) => row.talent_id === talentId)
        .sort((left, right) =>
          `${right.end_date ?? "9999"}|${right.start_date ?? ""}|${right.id}`.localeCompare(
            `${left.end_date ?? "9999"}|${left.start_date ?? ""}|${left.id}`
          )
        )
        .slice(0, 8)
        .map(({ talent_id: _talentId, ...row }) => ({
          ...row,
          description: truncateText(row.description, 800),
          memo: truncateText(row.memo, 500),
        })),
      extras: extras.get(talentId) ?? null,
      headline: truncateText(talent?.headline, 500),
      insights: insights.get(talentId) ?? null,
      location: truncateText(talent?.location, 300),
      resumeExcerpt: truncateText(talent?.resume_text, MAX_PROFILE_TEXT_CHARS),
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
  const generateTalentIds = uniqueTexts(
    limitedPairs
      .filter((pair) => {
        const fit = fits.get(pair.key);
        return getAutoIntroReasonMode(fit?.kind ?? null) === "author";
      })
      .map((pair) => pair.talentId)
  );
  const profiles = await fetchCandidateProfiles(
    admin,
    talents,
    generateTalentIds
  );

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
    const talentName =
      normalizeText(talent?.name) || normalizeText(talent?.email) || "후보자";
    candidates.push({
      candidateProfile:
        reasonMode === "author" ? (profiles.get(pair.talentId) ?? null) : null,
      companyName: normalizeText(workspace.company_name) || "회사",
      fitId: fit?.id ?? null,
      fitKind: fit?.kind ?? null,
      fitReason,
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

function compactJson(value: unknown, maxChars: number) {
  try {
    return JSON.stringify(value).slice(0, maxChars);
  } catch {
    return "null";
  }
}

function candidateProfileForCodex(profile: CandidateProfile | null) {
  if (!profile) return null;
  return {
    ...profile,
    extras: compactJson(profile.extras, 2000),
    insights: compactJson(profile.insights, 2000),
  };
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
      return `${buildAutoIntroCandidateNameLink({
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
    "*새로운 후보자 연결 제안*",
    "안녕하세요, Harper입니다. 연결을 제안드리고 싶은 후보자를 공유드립니다.",
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
  const internalReasonByCandidateKey: Record<string, string> = {};
  const presentationByCandidateKey: Record<string, AutoIntroPresentation> = {};

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
      if (!Array.isArray(row.sentences)) {
        throw new Error(`Candidate copy has no sentences: ${key}`);
      }
      const sentences = row.sentences.map(normalizeText).filter(Boolean);
      try {
        validateAutoIntroCandidateSentences(sentences);
      } catch (error) {
        throw new Error(`${formatError(error)}: ${key}`);
      }
      const presentation = normalizeText(
        row.presentation
      ) as AutoIntroPresentation;
      if (!AUTO_INTRO_PRESENTATIONS.has(presentation)) {
        throw new Error(`Unsupported candidate presentation: ${key}`);
      }
      let internalReason: string | null;
      try {
        internalReason = validateAutoIntroInternalReason({
          internalReason: row.internalReason,
          reasonMode: candidate.reasonMode,
          sentences,
        });
      } catch (error) {
        throw new Error(`${formatError(error)}: ${key}`);
      }
      if (internalReason) {
        internalReasonByCandidateKey[key] = internalReason;
      }
      candidateCopyByCandidateKey[key] = renderAutoIntroCandidateCopy(
        presentation,
        sentences
      );
      presentationByCandidateKey[key] = presentation;
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
  return {
    body: buildWorkspaceMessageBody({
      candidateCopyByCandidateKey,
      followUpQuestion,
      group,
    }),
    candidateCopyByCandidateKey,
    followUpQuestion,
    internalReasonByCandidateKey,
    model: "codex-scheduled",
    presentationByCandidateKey,
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
    source: "codex_scheduled_auto_intro_to_company",
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

async function persistCodexAuthoredFitReasons(args: {
  admin: AdminClient;
  group: WorkspaceNotificationGroup;
  message: GeneratedWorkspaceMessage;
}) {
  for (const candidate of args.group.candidates) {
    if (candidate.reasonMode !== "author" || !candidate.fitId) continue;
    const reason =
      args.message.internalReasonByCandidateKey[candidateKey(candidate)];
    if (!reason)
      throw new Error(`Missing Codex-authored reason: ${candidate.talentId}`);
    const { data, error } = await (
      args.admin.from("talent_opportunity_fit" as any) as any
    )
      .update({ reason })
      .eq("id", candidate.fitId)
      .is("kind", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        `Fit kind changed before Codex-authored reason persistence: ${candidate.fitId}`
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
  message: GeneratedWorkspaceMessage;
  slackConnected: boolean;
}): Promise<DeliveryOutcome> {
  const idempotencyKey = deliveryIdempotencyKey(args.group);
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
          },
          model: args.message.model,
          source: "codex_scheduled_auto_intro_to_company",
        },
        mentions: args.group.candidates.map((candidate) => ({
          displayName: candidate.talentName,
          recommendationId: candidate.recommendationId,
          roleId: candidate.roleId,
          talentId: candidate.talentId,
        })),
        roleId: null,
        text: args.message.body,
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

function companyContext(group: WorkspaceNotificationGroup) {
  return {
    brief: truncateText(group.workspace.brief, 1200),
    companyDescription: truncateText(group.workspace.company_description, 2000),
    companyName: group.workspace.company_name,
    pitch: truncateText(group.workspace.pitch, 1200),
    request: truncateText(group.workspace.request, 1600),
  };
}

function roleContext(section: WorkspaceRoleNotificationSection) {
  return {
    description: truncateText(section.role.description, 3500),
    descriptionSummary: truncateText(section.role.description_summary, 1600),
    information: compactJson(section.role.information, 2000),
    location: section.role.location_text,
    name: section.role.name,
    request: truncateText(section.role.request, 2000),
    salaryRange: section.role.salary_range,
    seniority: section.role.seniority_level,
    summary: compactJson(section.role.summary, 2000),
    workMode: section.role.work_mode,
  };
}

export async function fetchAutoIntroToCompanyCandidateDossiers(args?: {
  limit?: number;
  now?: Date;
  roleId?: string | null;
  workspaceId?: string | null;
}): Promise<AutoIntroToCompanyCandidateDossiers> {
  const admin = getSupabaseAdmin();
  const filters = autoIntroFilters(args);
  const roleSummaryDue = isAutoIntroRoleSummaryDay(args?.now);
  const [eligibility, summaries] = await Promise.all([
    buildEligibleCandidates(admin, filters),
    roleSummaryDue
      ? fetchCurrentRoleSummaries(admin, filters)
      : Promise.resolve([]),
  ]);
  const groups = groupCandidatesByWorkspace(
    eligibility.candidates,
    eligibility.roles,
    eligibility.workspaces
  );
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
    result.groups.push({
      candidateCount: group.candidates.length,
      companyContext: companyContext(group),
      companyName: group.companyName,
      roles: group.roleSections.map((section) => ({
        candidateCount: section.candidates.length,
        candidates: section.candidates.map((candidate) => ({
          fitId: candidate.fitId as string,
          fitKind: candidate.fitKind,
          name: candidate.talentName,
          pendingSince: candidate.pendingSince,
          professionalProfile:
            candidate.reasonMode === "author"
              ? candidateProfileForCodex(candidate.candidateProfile)
              : null,
          reasonMode: candidate.reasonMode,
          storedReason:
            candidate.reasonMode === "codex" ? candidate.fitReason : null,
          talentId: candidate.talentId,
        })),
        roleContext: roleContext(section),
        roleId: section.roleId,
        roleTitle: section.roleTitle,
      })),
      slackConnected,
      workspaceId: group.workspaceId,
    });
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
      ? fetchCurrentRoleSummaries(admin, filters)
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
    const message = parseCodexAuthoredMessage(normalizedAuthored, group);
    const roleSummary = roleSummaryByWorkspaceId.get(group.workspaceId);
    const previewMessage = attachReviewActionToMessage(
      roleSummary ? attachRoleSummaryToMessage(message, roleSummary) : message,
      group.candidates.length
    );
    const slackConnected = await slackConnectedFor(group.workspaceId);
    if (!slackConnected) {
      result.skippedNoChannelCount += group.candidates.length;
      if (roleSummary) {
        recordRoleSummary(roleSummary, false);
      }
      result.groups.push({
        candidateCount: group.candidates.length,
        companyName: group.companyName,
        message: previewMessage,
        roleIds: group.roleSections.map((section) => section.roleId),
        roleTitles: group.roleSections.map((section) => section.roleTitle),
        slackConnected,
        workspaceId: group.workspaceId,
      });
      continue;
    }

    const claimedCandidates = await claimCandidateProgressRows({
      admin,
      group,
      message,
    });
    if (claimedCandidates.length === 0) continue;
    const claimedKeys = new Set(
      claimedCandidates.map((candidate) => candidateKey(candidate))
    );
    const claimedGroup = groupWithCandidates(group, claimedCandidates);
    const candidateMessage =
      claimedCandidates.length === group.candidates.length
        ? message
        : parseCodexAuthoredMessage(
            filterAuthoredMessageToCandidates(normalizedAuthored, claimedKeys),
            claimedGroup
          );
    const deliveryMessage = attachReviewActionToMessage(
      roleSummary
        ? attachRoleSummaryToMessage(candidateMessage, roleSummary)
        : candidateMessage,
      claimedGroup.candidates.length
    );
    await persistCodexAuthoredFitReasons({
      admin,
      group: claimedGroup,
      message: deliveryMessage,
    });
    const delivery = await sendWorkspaceMessage({
      group: claimedGroup,
      message: deliveryMessage,
      slackConnected,
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
