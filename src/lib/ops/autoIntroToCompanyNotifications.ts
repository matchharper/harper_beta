import { createHash } from "crypto";
import { renderEmailBodyHtml } from "@/lib/email/bodyFormat";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import { CLAUDE_MODEL } from "@/lib/llm/modelConfig";
import { sendOrgWorkspaceSlackMessage } from "@/lib/org/slackIntegration";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import type { Json } from "@/types/database.types";

const INTRO_TO_COMPANY_KIND = "intro_to_company";
const HARPER_WORKER_USER_ID = "harper_worker";
const BATCH_SIZE = 1000;
const ID_FILTER_CHUNK_SIZE = 80;
const DEFAULT_MAX_CANDIDATES = 200;
const MAX_REASON_CHARS = 700;

const PENDING_CONNECTION_TAG = "내부:연결대기";
const RECOMMENDED_TAG = "내부:추천";
const CUSTOM_STAGE_TAG_PREFIX = "내부단계:";
const INTERNAL_STAGE_TAGS = new Set([
  "내부:수락",
  "내부:아카이브",
  "내부:최종오퍼",
  "내부:보류",
  PENDING_CONNECTION_TAG,
  "내부:프로세스중단",
  "내부:거절",
  RECOMMENDED_TAG,
  "내부:연결됨",
]);

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type FetchPageResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type RoleRow = {
  company_workspace_id: string;
  is_expired?: boolean | null;
  name: string;
  role_id: string;
  status?: string | null;
};

type WorkspaceRow = {
  company_name: string;
  company_workspace_id: string;
};

type RecommendationRow = {
  created_at: string;
  feedback: string | null;
  id: string;
  recommended_at: string;
  role_id: string;
  saved_stage: string | null;
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
  label: string;
  last_evaluated_at: string;
  opportunity_id: string;
  reason: string;
  score: number;
  talent_id: string;
};

type TalentRow = {
  email: string | null;
  name: string | null;
  user_id: string;
};

type MemberRow = {
  company_user_id: string;
  company_workspace_id: string;
};

type CompanyUserRow = {
  email: string | null;
  name: string | null;
  user_id: string;
};

type AutoIntroCandidate = {
  companyName: string;
  fitId: string | null;
  fitReason: string;
  recommendationId: string;
  roleId: string;
  roleTitle: string;
  talentEmail: string | null;
  talentId: string;
  talentName: string;
  workspaceId: string;
};

type WorkspaceNotificationGroup = {
  candidates: AutoIntroCandidate[];
  companyName: string;
  workspaceId: string;
};

type GeneratedWorkspaceMessage = {
  body: string;
  model: string;
  raw: string | null;
  subject: string;
};

type DeliveryOutcome = {
  emailErrors: Array<{ email: string; error: string }>;
  emailRecipients: string[];
  emailsSent: number;
  slackConnected: boolean;
  slackError: string | null;
  slackSent: boolean;
};

export type AutoIntroToCompanyRunResult = {
  dryRun: boolean;
  eligibleCandidateCount: number;
  groups: Array<{
    candidateCount: number;
    companyName: string;
    emailRecipients: string[];
    message?: GeneratedWorkspaceMessage;
    slackConnected: boolean;
    workspaceId: string;
  }>;
  processedCandidateCount: number;
  skippedNoChannelCount: number;
  sentEmailCount: number;
  sentSlackCount: number;
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

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function isNewerByTimestamps(
  candidate: {
    created_at?: string | null;
    id: string;
    recommended_at?: string | null;
    updated_at?: string | null;
  },
  current: {
    created_at?: string | null;
    id: string;
    recommended_at?: string | null;
    updated_at?: string | null;
  }
) {
  const candidateKey = [
    candidate.recommended_at ?? "",
    candidate.updated_at ?? "",
    candidate.created_at ?? "",
    candidate.id,
  ].join("|");
  const currentKey = [
    current.recommended_at ?? "",
    current.updated_at ?? "",
    current.created_at ?? "",
    current.id,
  ].join("|");
  return candidateKey > currentKey;
}

function normalizeTagKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isInternalStageTag(value: unknown) {
  const tag = normalizeTagKey(value);
  return (
    INTERNAL_STAGE_TAGS.has(tag) ||
    tag.startsWith(normalizeTagKey(CUSTOM_STAGE_TAG_PREFIX))
  );
}

function isPendingConnectionStage(tags: TagRow[]) {
  const latestInternalTag = tags
    .filter((tag) => isInternalStageTag(tag.tag))
    .sort((left, right) => {
      const leftKey = `${left.updated_at}|${left.created_at}|${left.id}`;
      const rightKey = `${right.updated_at}|${right.created_at}|${right.id}`;
      return rightKey.localeCompare(leftKey);
    })[0];

  return (
    Boolean(latestInternalTag) &&
    normalizeTagKey(latestInternalTag?.tag) ===
      normalizeTagKey(PENDING_CONNECTION_TAG)
  );
}

function isAcceptedRecommendation(row: RecommendationRow) {
  const feedback = normalizeText(row.feedback).toLowerCase();
  const savedStage = normalizeText(row.saved_stage).toLowerCase();
  return (
    feedback === "like" ||
    feedback === "liked" ||
    feedback === "positive" ||
    feedback === "accepted" ||
    savedStage === "accepted"
  );
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

function deliveryIdempotencyKey(args: {
  email: string;
  group: WorkspaceNotificationGroup;
}) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        candidateIds: args.group.candidates.map((candidate) => [
          candidate.roleId,
          candidate.talentId,
          candidate.recommendationId,
        ]),
        email: args.email,
        kind: INTRO_TO_COMPANY_KIND,
        workspaceId: args.group.workspaceId,
      })
    )
    .digest("hex");
  return `auto-intro-to-company/${digest}`;
}

function parsePositiveInt(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1000);
}

function normalizeOptionalFilter(value: string | null | undefined) {
  return normalizeText(value) || null;
}

async function fetchAutoRoles(
  admin: AdminClient,
  filters: AutoIntroRunFilters
) {
  const autoRoleRows = await fetchAllRows<{ role_id: string }>((from, to) =>
    (admin.from("company_internal_roles" as any) as any)
      .select("role_id")
      .eq("is_auto", true)
      .order("role_id", { ascending: true })
      .range(from, to)
  );

  let roleIds = uniqueTexts(
    autoRoleRows.map((row) => normalizeText(row.role_id))
  );
  if (filters.roleId) {
    roleIds = roleIds.filter((roleId) => roleId === filters.roleId);
  }
  if (roleIds.length === 0) return [] as RoleRow[];

  const roles: RoleRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    const { data, error } = await (admin.from("company_roles" as any) as any)
      .select("role_id, company_workspace_id, name, status, is_expired")
      .in("role_id", roleIdChunk);
    if (error) throw new Error(error.message || "Failed to load auto roles");
    roles.push(...((data ?? []) as RoleRow[]));
  }

  return roles.filter((role) => {
    if (
      filters.workspaceId &&
      role.company_workspace_id !== filters.workspaceId
    ) {
      return false;
    }
    if (role.is_expired === true) return false;
    const status = normalizeText(role.status).toLowerCase();
    return status !== "deleted" && status !== "ended";
  });
}

async function fetchWorkspaces(admin: AdminClient, workspaceIds: string[]) {
  const rows: WorkspaceRow[] = [];
  for (const workspaceIdChunk of chunkValues(workspaceIds)) {
    const { data, error } = await (
      admin.from("company_workspace" as any) as any
    )
      .select("company_workspace_id, company_name")
      .in("company_workspace_id", workspaceIdChunk);
    if (error) throw new Error(error.message || "Failed to load workspaces");
    rows.push(...((data ?? []) as WorkspaceRow[]));
  }
  return rows;
}

async function fetchRecommendations(admin: AdminClient, roleIds: string[]) {
  const rows: RecommendationRow[] = [];
  for (const roleIdChunk of chunkValues(roleIds)) {
    rows.push(
      ...(await fetchAllRows<RecommendationRow>((from, to) =>
        (admin.from("talent_opportunity_recommendation" as any) as any)
          .select(
            "id, talent_id, role_id, feedback, saved_stage, recommended_at, created_at, updated_at"
          )
          .in("role_id", roleIdChunk)
          .order("recommended_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(from, to)
      ))
    );
  }
  return rows;
}

function getLatestRecommendations(rows: RecommendationRow[]) {
  const latestByRoleTalent = new Map<string, RecommendationRow>();
  for (const row of rows) {
    const key = `${row.role_id}:${row.talent_id}`;
    const current = latestByRoleTalent.get(key);
    if (!current || isNewerByTimestamps(row, current)) {
      latestByRoleTalent.set(key, row);
    }
  }
  return Array.from(latestByRoleTalent.values());
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

async function fetchExistingIntroProgressKeys(
  admin: AdminClient,
  roleIds: string[],
  talentIds: string[]
) {
  const keys = new Set<string>();
  for (const roleIdChunk of chunkValues(roleIds)) {
    for (const talentIdChunk of chunkValues(talentIds)) {
      const rows = await fetchAllRows<{
        role_id: string;
        talent_id: string;
      }>((from, to) =>
        (admin.from("talent_progress" as any) as any)
          .select("role_id, talent_id")
          .eq("kind", INTRO_TO_COMPANY_KIND)
          .in("role_id", roleIdChunk)
          .in("talent_id", talentIdChunk)
          .range(from, to)
      );
      for (const row of rows) {
        keys.add(`${row.role_id}:${row.talent_id}`);
      }
    }
  }
  return keys;
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
              "id, opportunity_id, talent_id, reason, score, label, last_evaluated_at, created_at"
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
    const current = latest.get(key);
    if (
      !current ||
      `${row.last_evaluated_at}|${row.created_at}|${row.id}` >
        `${current.last_evaluated_at}|${current.created_at}|${current.id}`
    ) {
      latest.set(key, row);
    }
  }
  return latest;
}

async function fetchTalents(admin: AdminClient, talentIds: string[]) {
  const rows: TalentRow[] = [];
  for (const talentIdChunk of chunkValues(talentIds)) {
    const { data, error } = await (admin.from("talent_users" as any) as any)
      .select("user_id, name, email")
      .in("user_id", talentIdChunk);
    if (error) throw new Error(error.message || "Failed to load talents");
    rows.push(...((data ?? []) as TalentRow[]));
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

function buildCandidate(args: {
  fit: FitRow | null;
  recommendation: RecommendationRow;
  role: RoleRow;
  talent: TalentRow | null;
  workspace: WorkspaceRow | null;
}) {
  const talentName =
    normalizeText(args.talent?.name) ||
    normalizeText(args.talent?.email) ||
    "후보자";
  const fitReason = normalizeMultiline(args.fit?.reason).slice(
    0,
    MAX_REASON_CHARS
  );

  return {
    companyName: normalizeText(args.workspace?.company_name) || "회사",
    fitId: args.fit?.id ?? null,
    fitReason: fitReason || "추천 이유가 아직 비어 있습니다.",
    recommendationId: args.recommendation.id,
    roleId: args.role.role_id,
    roleTitle: normalizeText(args.role.name) || "포지션",
    talentEmail: normalizeText(args.talent?.email) || null,
    talentId: args.recommendation.talent_id,
    talentName,
    workspaceId: args.role.company_workspace_id,
  } satisfies AutoIntroCandidate;
}

type AutoIntroRunFilters = {
  limit: number;
  roleId: string | null;
  workspaceId: string | null;
};

async function buildEligibleCandidates(
  admin: AdminClient,
  filters: AutoIntroRunFilters
) {
  const roles = await fetchAutoRoles(admin, filters);
  if (roles.length === 0) return [] as AutoIntroCandidate[];

  const roleIds = roles.map((role) => role.role_id);
  const recommendations = getLatestRecommendations(
    await fetchRecommendations(admin, roleIds)
  );
  if (recommendations.length === 0) return [] as AutoIntroCandidate[];

  const talentIds = uniqueTexts(
    recommendations.map((row) => normalizeText(row.talent_id))
  );
  const [tags, existingIntroKeys, fits, talents, workspaces] =
    await Promise.all([
      fetchTags(admin, roleIds, talentIds),
      fetchExistingIntroProgressKeys(admin, roleIds, talentIds),
      fetchFits(admin, roleIds, talentIds),
      fetchTalents(admin, talentIds),
      fetchWorkspaces(
        admin,
        uniqueTexts(
          roles.map((role) => normalizeText(role.company_workspace_id))
        )
      ),
    ]);

  const roleById = new Map(roles.map((role) => [role.role_id, role]));
  const tagsByKey = groupTagsByRoleTalent(tags);
  const talentById = new Map(talents.map((talent) => [talent.user_id, talent]));
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.company_workspace_id, workspace])
  );

  const candidates: AutoIntroCandidate[] = [];
  for (const recommendation of recommendations) {
    const role = roleById.get(recommendation.role_id);
    if (!role) continue;

    const key = `${recommendation.role_id}:${recommendation.talent_id}`;
    if (!isAcceptedRecommendation(recommendation)) continue;
    if (existingIntroKeys.has(key)) continue;
    if (!isPendingConnectionStage(tagsByKey.get(key) ?? [])) continue;

    candidates.push(
      buildCandidate({
        fit: fits.get(key) ?? null,
        recommendation,
        role,
        talent: talentById.get(recommendation.talent_id) ?? null,
        workspace: workspaceById.get(role.company_workspace_id) ?? null,
      })
    );
  }

  return candidates
    .sort((left, right) => {
      const companyOrder = left.companyName.localeCompare(
        right.companyName,
        "ko"
      );
      return (
        companyOrder ||
        left.roleTitle.localeCompare(right.roleTitle, "ko") ||
        left.talentName.localeCompare(right.talentName, "ko")
      );
    })
    .slice(0, filters.limit);
}

function groupCandidatesByWorkspace(candidates: AutoIntroCandidate[]) {
  const groups = new Map<string, WorkspaceNotificationGroup>();
  for (const candidate of candidates) {
    const current =
      groups.get(candidate.workspaceId) ??
      ({
        candidates: [],
        companyName: candidate.companyName,
        workspaceId: candidate.workspaceId,
      } satisfies WorkspaceNotificationGroup);
    current.candidates.push(candidate);
    groups.set(candidate.workspaceId, current);
  }
  return Array.from(groups.values());
}

async function fetchWorkspaceMemberEmails(
  admin: AdminClient,
  workspaceId: string
) {
  const { data: membershipRows, error: membershipError } = await (
    admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id, company_workspace_id")
    .eq("company_workspace_id", workspaceId);

  if (membershipError) throw membershipError;
  const memberIds = uniqueTexts(
    ((membershipRows ?? []) as MemberRow[]).map((row) =>
      normalizeText(row.company_user_id)
    )
  );
  if (memberIds.length === 0) return [];

  const users: CompanyUserRow[] = [];
  for (const memberIdChunk of chunkValues(memberIds)) {
    const { data, error } = await (admin.from("company_users" as any) as any)
      .select("user_id, email, name")
      .in("user_id", memberIdChunk);
    if (error) throw error;
    users.push(...((data ?? []) as CompanyUserRow[]));
  }

  return uniqueTexts(
    users
      .map((user) => normalizeText(user.email).toLowerCase())
      .filter(isValidEmailAddress)
  );
}

async function hasWorkspaceSlackIntegration(
  admin: AdminClient,
  workspaceId: string
) {
  const { data, error } = await (
    admin.from("company_slack_integrations" as any) as any
  )
    .select("company_workspace_id")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function defaultSubject(companyName: string) {
  return `[Harper] ${companyName} 추천 후보 제안드립니다`.slice(0, 180);
}

function buildFallbackBody(group: WorkspaceNotificationGroup) {
  const lines = [
    "안녕하세요, Harper입니다.",
    "",
    `${group.companyName}에 추천드리고 싶은 후보자를 공유드립니다.`,
    "",
    ...group.candidates.map((candidate) => {
      const reason = normalizeText(candidate.fitReason);
      return `- ${candidate.talentName}님은 ${candidate.roleTitle} 포지션 후보로 추천드립니다. ${reason} 이런 맥락에서 먼저 가볍게 만나보시기를 제안드립니다.`;
    }),
  ];
  return lines.join("\n");
}

function buildPrompt(group: WorkspaceNotificationGroup) {
  const candidateLines = group.candidates.map((candidate, index) =>
    [
      `${index + 1}.`,
      `name: ${candidate.talentName}`,
      `roleTitle: ${candidate.roleTitle}`,
      `fitReason: ${candidate.fitReason}`,
    ].join("\n")
  );

  return [
    "아래 입력만 사용해 회사 담당자에게 보낼 Harper 추천 메시지를 작성해 주세요.",
    "",
    "출력 규칙:",
    '- JSON만 반환하세요. 형식: {"subject":"...","body":"..."}',
    '- subject는 반드시 "[Harper]"로 시작해야 합니다.',
    "- body는 한국어만 사용하세요.",
    "- 첫 문장은 짧게 Harper가 추천 후보를 공유한다는 맥락을 말하세요.",
    "- 후보자마다 하이픈(-) bullet을 하나씩 쓰고, 각 bullet은 2문장 정도로 작성하세요.",
    "- 추천이유 전달이 목적입니다. 제공되지 않은 경력, 학력, 성과, 수치, 민감정보는 만들지 마세요.",
    "- 과장된 확신 대신 '추천드립니다', '만나보시기를 제안드립니다' 정도의 톤을 유지하세요.",
    "",
    `companyName: ${group.companyName}`,
    "",
    "candidates:",
    candidateLines.join("\n\n"),
  ].join("\n");
}

function parseGeneratedMessage(
  raw: string,
  group: WorkspaceNotificationGroup
): GeneratedWorkspaceMessage {
  const cleaned = normalizeMultiline(raw)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<
          string,
          unknown
        >;
      } catch {
        parsed = null;
      }
    }
  }

  const fallbackSubject = defaultSubject(group.companyName);
  const rawSubject = normalizeText(parsed?.subject);
  const subject = (
    rawSubject.startsWith("[Harper]")
      ? rawSubject
      : rawSubject
        ? `[Harper] ${rawSubject.replace(/^\[?Harper\]?\s*/i, "")}`
        : fallbackSubject
  ).slice(0, 180);
  const body =
    normalizeMultiline(parsed?.body) ||
    (parsed ? "" : cleaned) ||
    buildFallbackBody(group);

  return {
    body,
    model: CLAUDE_MODEL,
    raw,
    subject,
  };
}

async function generateWorkspaceMessage(
  group: WorkspaceNotificationGroup
): Promise<GeneratedWorkspaceMessage> {
  const raw = await runTalentAssistantCompletion({
    anthropicOverloadFallbackModel: CLAUDE_MODEL,
    fallbackModel: CLAUDE_MODEL,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content:
          "You write concise Korean company-facing recruiting recommendation notes for Harper. Return JSON only.",
      },
      {
        role: "user",
        content: buildPrompt(group),
      },
    ],
    primaryModel: CLAUDE_MODEL,
    temperature: 0.2,
    usageLabel: "ops/auto-intro-to-company:message",
  });
  return parseGeneratedMessage(raw, group);
}

async function claimCandidateProgressRows(args: {
  admin: AdminClient;
  group: WorkspaceNotificationGroup;
  message: GeneratedWorkspaceMessage;
}) {
  const claimed: AutoIntroCandidate[] = [];
  const now = new Date().toISOString();

  for (const candidate of args.group.candidates) {
    const { data: existing, error: existingError } = await (
      args.admin.from("talent_progress" as any) as any
    )
      .select("id")
      .eq("kind", INTRO_TO_COMPANY_KIND)
      .eq("role_id", candidate.roleId)
      .eq("talent_id", candidate.talentId)
      .limit(1);
    if (existingError) throw existingError;
    if ((existing ?? []).length > 0) continue;

    const metadata = {
      autoIntroToCompany: true,
      deliveryStatus: "pending",
      fitId: candidate.fitId,
      generatedAt: now,
      model: args.message.model,
      recommendationId: candidate.recommendationId,
      roleTitle: candidate.roleTitle,
      source: "auto_intro_to_company_cron",
      subject: args.message.subject,
      workspaceId: candidate.workspaceId,
    } satisfies Record<string, unknown>;

    const { error } = await (
      args.admin.from("talent_progress" as any) as any
    ).insert({
      id: progressIdForCandidate(candidate),
      kind: INTRO_TO_COMPANY_KIND,
      metadata: metadata as Json,
      recommendation_id: candidate.recommendationId,
      role_id: candidate.roleId,
      talent_id: candidate.talentId,
      text: `${candidate.talentName}님을 만나보시기를 제안드립니다.`,
      user_id: HARPER_WORKER_USER_ID,
    });

    if (error) {
      if ((error as { code?: string }).code === "23505") continue;
      throw error;
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
  const deliveryStatus =
    args.delivery.emailsSent > 0 || args.delivery.slackSent
      ? args.delivery.emailErrors.length > 0 || args.delivery.slackError
        ? "partial"
        : "sent"
      : "failed";

  for (const candidate of args.group.candidates) {
    const metadata = {
      autoIntroToCompany: true,
      deliveredAt: now,
      deliveryStatus,
      emailErrors: args.delivery.emailErrors,
      emailRecipients: args.delivery.emailRecipients,
      emailsSent: args.delivery.emailsSent,
      fitId: candidate.fitId,
      model: args.message.model,
      recommendationId: candidate.recommendationId,
      roleTitle: candidate.roleTitle,
      slackConnected: args.delivery.slackConnected,
      slackError: args.delivery.slackError,
      slackSent: args.delivery.slackSent,
      source: "auto_intro_to_company_cron",
      subject: args.message.subject,
      workspaceId: candidate.workspaceId,
    } satisfies Record<string, unknown>;

    const { error } = await (args.admin.from("talent_progress" as any) as any)
      .update({ metadata: metadata as Json })
      .eq("id", progressIdForCandidate(candidate));
    if (error) throw error;
  }
}

function assertEmailDeliveryConfigured() {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) throw new Error("RESEND_API_KEY is required");
  getDefaultResendFromEmail();
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sendWorkspaceMessage(args: {
  emailRecipients: string[];
  group: WorkspaceNotificationGroup;
  message: GeneratedWorkspaceMessage;
  slackConnected: boolean;
}): Promise<DeliveryOutcome> {
  const emailErrors: Array<{ email: string; error: string }> = [];
  let emailsSent = 0;

  for (const email of args.emailRecipients) {
    try {
      await sendResendEmail({
        html: renderEmailBodyHtml(args.message.body),
        idempotencyKey: deliveryIdempotencyKey({ email, group: args.group }),
        subject: args.message.subject,
        text: args.message.body,
        to: email,
      });
      emailsSent += 1;
    } catch (error) {
      emailErrors.push({ email, error: formatError(error).slice(0, 500) });
    }
  }

  let slackSent = false;
  let slackError: string | null = null;
  if (args.slackConnected) {
    try {
      slackSent = await sendOrgWorkspaceSlackMessage({
        text: args.message.body,
        workspaceId: args.group.workspaceId,
      });
    } catch (error) {
      slackError = formatError(error).slice(0, 500);
    }
  }

  return {
    emailErrors,
    emailRecipients: args.emailRecipients,
    emailsSent,
    slackConnected: args.slackConnected,
    slackError,
    slackSent,
  };
}

export async function runAutoIntroToCompanyNotifications(args?: {
  dryRun?: boolean;
  limit?: number;
  roleId?: string | null;
  workspaceId?: string | null;
}): Promise<AutoIntroToCompanyRunResult> {
  const admin = getSupabaseAdmin();
  const dryRun = args?.dryRun === true;
  const filters = {
    limit: args?.limit ?? DEFAULT_MAX_CANDIDATES,
    roleId: normalizeOptionalFilter(args?.roleId),
    workspaceId: normalizeOptionalFilter(args?.workspaceId),
  } satisfies AutoIntroRunFilters;

  const eligibleCandidates = await buildEligibleCandidates(admin, filters);
  const groups = groupCandidatesByWorkspace(eligibleCandidates);
  const result: AutoIntroToCompanyRunResult = {
    dryRun,
    eligibleCandidateCount: eligibleCandidates.length,
    groups: [],
    processedCandidateCount: 0,
    skippedNoChannelCount: 0,
    sentEmailCount: 0,
    sentSlackCount: 0,
  };

  for (const group of groups) {
    const [emailRecipients, slackConnected] = await Promise.all([
      fetchWorkspaceMemberEmails(admin, group.workspaceId),
      hasWorkspaceSlackIntegration(admin, group.workspaceId),
    ]);
    if (emailRecipients.length > 0 && !dryRun) {
      assertEmailDeliveryConfigured();
    }

    if (emailRecipients.length === 0 && !slackConnected) {
      result.skippedNoChannelCount += group.candidates.length;
      result.groups.push({
        candidateCount: group.candidates.length,
        companyName: group.companyName,
        emailRecipients,
        slackConnected,
        workspaceId: group.workspaceId,
      });
      continue;
    }

    const message = dryRun
      ? ({
          body: buildFallbackBody(group),
          model: "dry-run",
          raw: null,
          subject: defaultSubject(group.companyName),
        } satisfies GeneratedWorkspaceMessage)
      : await generateWorkspaceMessage(group);

    if (dryRun) {
      result.groups.push({
        candidateCount: group.candidates.length,
        companyName: group.companyName,
        emailRecipients,
        message,
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

    const claimedGroup = {
      ...group,
      candidates: claimedCandidates,
    } satisfies WorkspaceNotificationGroup;
    const deliveryMessage =
      claimedCandidates.length === group.candidates.length
        ? message
        : await generateWorkspaceMessage(claimedGroup);
    const delivery = await sendWorkspaceMessage({
      emailRecipients,
      group: claimedGroup,
      message: deliveryMessage,
      slackConnected,
    });
    await updateCandidateProgressMetadata({
      admin,
      delivery,
      group: claimedGroup,
      message: deliveryMessage,
    });

    result.groups.push({
      candidateCount: claimedCandidates.length,
      companyName: group.companyName,
      emailRecipients,
      message: deliveryMessage,
      slackConnected,
      workspaceId: group.workspaceId,
    });
    result.processedCandidateCount += claimedCandidates.length;
    result.sentEmailCount += delivery.emailsSent;
    result.sentSlackCount += delivery.slackSent ? 1 : 0;
  }

  return result;
}

export function parseAutoIntroToCompanyLimit(value: string | null | undefined) {
  return parsePositiveInt(value, DEFAULT_MAX_CANDIDATES);
}
