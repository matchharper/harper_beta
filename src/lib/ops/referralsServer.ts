import { setOpsMatchingReviewStage } from "@/lib/ops/matching";
import { getDefaultResendFromEmail, sendResendEmail } from "@/lib/email/send";
import {
  OPS_REFERRALS_PAGE_SIZE,
  type OpsReferralApplicationValues,
  type OpsReferralEditableField,
  type OpsReferralItem,
  type OpsReferralListResponse,
  type OpsReferralPayoutInformation,
  type OpsReferralPayoutNotification,
  type OpsReferralPerson,
  type OpsReferralStageOption,
} from "@/lib/ops/referrals";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  createReferralPayoutAccessToken,
  hashReferralPayoutAccessToken,
} from "@/lib/referralPayout/security";
import type { Database } from "@/types/database.types";

const READ_BATCH_SIZE = 1000;
const ID_CHUNK_SIZE = 150;
const MAX_TEXT_AMOUNT_LENGTH = 200;
const MAX_MEMO_LENGTH = 10_000;
const CUSTOM_STAGE_PREFIX = "custom:";
const PAYOUT_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type ReferralAttributionRow = {
  referred_user_id: string;
  token: string;
};

type ReferralLinkRow = {
  referrer_user_id: string;
  token: string;
};

type TalentUserRow = {
  created_at: string | null;
  email: string | null;
  headline: string | null;
  name: string | null;
  user_id: string;
};

type RecommendationWorkspaceRow = {
  company_name?: string | null;
  is_internal?: boolean | null;
};

type RecommendationRoleRow = {
  company_workspace?:
    | RecommendationWorkspaceRow
    | RecommendationWorkspaceRow[]
    | null;
  name?: string | null;
  role_id?: string | null;
  source_type?: string | null;
};

type RecommendationRow = {
  company_role?: RecommendationRoleRow | RecommendationRoleRow[] | null;
  created_at?: string | null;
  feedback?: string | null;
  id?: string | null;
  opportunity_type?: string | null;
  recommended_at?: string | null;
  role_id?: string | null;
  saved_stage?: string | null;
  talent_id?: string | null;
  viewed_at?: string | null;
};

type OpportunityTagRow = {
  opportunity_id: string;
  tag: string;
  talent_id: string;
  updated_at: string;
};

type CustomStageRow = {
  id: string;
  label: string;
  role_id: string;
  sort_order: number;
};

type ReferralApplicationRow =
  Database["public"]["Tables"]["talent_referral_application"]["Row"];

type ReferralPayoutInformationRow = Pick<
  Database["public"]["Tables"]["talent_referral_payout_information"]["Row"],
  | "access_token_expires_at"
  | "notification_history"
  | "referral_application_id"
  | "submitted_at"
>;

type ReferralPayoutInformationWriteRow = Pick<
  Database["public"]["Tables"]["talent_referral_payout_information"]["Row"],
  | "access_token_expires_at"
  | "access_token_hash"
  | "id"
  | "notification_history"
  | "submitted_at"
>;

const RECOMMENDATION_SELECT = `
  id,
  talent_id,
  role_id,
  opportunity_type,
  feedback,
  saved_stage,
  viewed_at,
  recommended_at,
  created_at,
  company_role:company_roles (
    role_id,
    name,
    source_type,
    company_workspace:company_workspace (
      company_name,
      is_internal
    )
  )
`;

const BUILT_IN_STAGE_BY_TAG = new Map<string, OpsReferralStageOption>([
  ["내부:수락", { id: "accepted", label: "수락" }],
  ["내부:아카이브", { id: "archived", label: "아카이브" }],
  ["내부:최종오퍼", { id: "final_offer", label: "최종 오퍼" }],
  ["내부:보류", { id: "hold", label: "보류" }],
  ["내부:연결대기", { id: "pending_connection", label: "연결 대기" }],
  ["내부:프로세스중단", { id: "process_stopped", label: "프로세스 중단" }],
  ["내부:거절", { id: "rejected", label: "거절" }],
]);

const PENDING_CONNECTION_STAGE = {
  id: "pending_connection",
  label: "연결 대기",
} satisfies OpsReferralStageOption;
const FINAL_OFFER_STAGE = {
  id: "final_offer",
  label: "최종 오퍼",
} satisfies OpsReferralStageOption;
const PROCESS_STOPPED_STAGE = {
  id: "process_stopped",
  label: "프로세스 중단",
} satisfies OpsReferralStageOption;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTag(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function getFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function chunkValues<T>(values: T[]) {
  const unique = Array.from(new Set(values)).filter(Boolean);
  const chunks: T[][] = [];
  for (let index = 0; index < unique.length; index += ID_CHUNK_SIZE) {
    chunks.push(unique.slice(index, index + ID_CHUNK_SIZE));
  }
  return chunks;
}

function buildApplicationKey(referredUserId: string, roleId: string) {
  return `${referredUserId}:${roleId}`;
}

function buildCustomStageTag(stageId: string) {
  return `내부단계:${normalizeText(stageId).replace(/-/g, "").toLowerCase()}`;
}

function buildCustomStageId(stageId: string) {
  return `${CUSTOM_STAGE_PREFIX}${stageId}`;
}

function isActiveApplicationStage(stageId: string) {
  return (
    stageId === PENDING_CONNECTION_STAGE.id ||
    stageId === FINAL_OFFER_STAGE.id ||
    stageId === PROCESS_STOPPED_STAGE.id ||
    stageId.startsWith(CUSTOM_STAGE_PREFIX)
  );
}

function isInternalRecommendation(row: RecommendationRow) {
  const role = getFirst(row.company_role);
  const workspace = getFirst(role?.company_workspace);
  const opportunityType = normalizeText(row.opportunity_type).toLowerCase();
  const sourceType = normalizeText(role?.source_type).toLowerCase();
  return (
    sourceType === "internal" ||
    workspace?.is_internal === true ||
    opportunityType === "internal_recommendation" ||
    opportunityType === "intro_request"
  );
}

function getRecommendationTimestamp(row: RecommendationRow) {
  const timestamp = Date.parse(row.recommended_at ?? row.created_at ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isMissingReferralApplicationTable(error: unknown) {
  const message = String(
    (error as { message?: unknown } | null)?.message ?? error ?? ""
  ).toLowerCase();
  return (
    message.includes("talent_referral_application") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("not found"))
  );
}

async function fetchAllAttributions(admin: TalentAdminClient) {
  const rows: ReferralAttributionRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin
      .from("talent_network_referral_attributions")
      .select("referred_user_id, token")
      .range(offset, offset + READ_BATCH_SIZE - 1);
    if (error) {
      throw new Error(error.message ?? "Failed to load referral attributions");
    }
    const page = (data ?? []) as ReferralAttributionRow[];
    rows.push(...page);
    if (page.length < READ_BATCH_SIZE) break;
    offset += READ_BATCH_SIZE;
  }
  return rows;
}

async function fetchLinksByTokens(admin: TalentAdminClient, tokens: string[]) {
  const rows: ReferralLinkRow[] = [];
  for (const chunk of chunkValues(tokens)) {
    const { data, error } = await admin
      .from("talent_network_referral_links")
      .select("token, referrer_user_id")
      .in("token", chunk);
    if (error)
      throw new Error(error.message ?? "Failed to load referral links");
    rows.push(...((data ?? []) as ReferralLinkRow[]));
  }
  return rows;
}

async function fetchUsersByIds(admin: TalentAdminClient, userIds: string[]) {
  const rows: TalentUserRow[] = [];
  for (const chunk of chunkValues(userIds)) {
    const { data, error } = await admin
      .from("talent_users")
      .select("user_id, name, email, headline, created_at")
      .in("user_id", chunk);
    if (error)
      throw new Error(error.message ?? "Failed to load referral users");
    rows.push(...((data ?? []) as TalentUserRow[]));
  }
  return rows;
}

async function fetchRecommendationsByTalentIds(
  admin: TalentAdminClient,
  talentIds: string[]
) {
  const rows: RecommendationRow[] = [];
  for (const chunk of chunkValues(talentIds)) {
    const { data, error } = await admin
      .from("talent_opportunity_recommendation")
      .select(RECOMMENDATION_SELECT)
      .in("talent_id", chunk)
      .order("recommended_at", { ascending: false, nullsFirst: false });
    if (error) {
      throw new Error(
        error.message ?? "Failed to load referral recommendations"
      );
    }
    rows.push(...((data ?? []) as RecommendationRow[]));
  }
  return rows;
}

async function fetchTagsByTalentIds(
  admin: TalentAdminClient,
  talentIds: string[],
  relevantRoleIds: ReadonlySet<string>
) {
  const rows: OpportunityTagRow[] = [];
  for (const chunk of chunkValues(talentIds)) {
    const { data, error } = await admin
      .from("talent_opportunity_tag")
      .select("talent_id, opportunity_id, tag, updated_at")
      .in("talent_id", chunk)
      .order("updated_at", { ascending: false });
    if (error)
      throw new Error(error.message ?? "Failed to load referral stages");
    rows.push(
      ...((data ?? []) as OpportunityTagRow[]).filter((row) =>
        relevantRoleIds.has(row.opportunity_id)
      )
    );
  }
  return rows;
}

async function fetchCustomStagesByRoleIds(
  admin: TalentAdminClient,
  roleIds: string[]
) {
  const rows: CustomStageRow[] = [];
  for (const chunk of chunkValues(roleIds)) {
    const { data, error } = await admin
      .from("ops_matching_role_stages")
      .select("id, role_id, label, sort_order")
      .in("role_id", chunk)
      .order("sort_order", { ascending: true });
    if (error) {
      throw new Error(error.message ?? "Failed to load referral custom stages");
    }
    rows.push(...((data ?? []) as CustomStageRow[]));
  }
  return rows;
}

async function fetchApplicationRows(
  admin: TalentAdminClient,
  referredUserIds: string[]
) {
  const rows: ReferralApplicationRow[] = [];
  for (const chunk of chunkValues(referredUserIds)) {
    const { data, error } = await admin
      .from("talent_referral_application")
      .select(
        "id, referred_user_id, role_id, recommendation_id, hired_at, settlement_completed_at, reward_due_at, reward_paid, reward_paid_at, amount, memo, created_at, updated_at"
      )
      .in("referred_user_id", chunk);
    if (error) {
      if (isMissingReferralApplicationTable(error)) return [];
      throw new Error(error.message ?? "Failed to load referral applications");
    }
    rows.push(...((data ?? []) as ReferralApplicationRow[]));
  }
  return rows;
}

function isMissingReferralPayoutInformationTable(error: unknown) {
  const message = String(
    (error as { message?: unknown } | null)?.message ?? error ?? ""
  ).toLowerCase();
  return (
    message.includes("talent_referral_payout_information") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("not found"))
  );
}

async function fetchPayoutInformationRows(
  admin: TalentAdminClient,
  applicationIds: string[]
) {
  const rows: ReferralPayoutInformationRow[] = [];
  for (const chunk of chunkValues(applicationIds)) {
    const { data, error } = await admin
      .from("talent_referral_payout_information")
      .select(
        "referral_application_id, access_token_expires_at, notification_history, submitted_at"
      )
      .in("referral_application_id", chunk);
    if (error) {
      if (isMissingReferralPayoutInformationTable(error)) return [];
      throw new Error(
        error.message ?? "Failed to load referral payout information"
      );
    }
    rows.push(...((data ?? []) as ReferralPayoutInformationRow[]));
  }
  return rows;
}

function parsePayoutNotificationHistory(
  value: ReferralPayoutInformationRow["notification_history"]
) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): OpsReferralPayoutNotification[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const sentAt = normalizeText(entry.sentAt);
    if (!sentAt || !Number.isFinite(Date.parse(sentAt))) return [];
    const sentByEmail = normalizeText(entry.sentByEmail) || null;
    return [{ sentAt, sentByEmail }];
  });
}

function toPayoutInformationValues(
  row: ReferralPayoutInformationRow | undefined
): OpsReferralPayoutInformation {
  return {
    accessTokenExpiresAt: row?.access_token_expires_at ?? null,
    notificationHistory: parsePayoutNotificationHistory(
      row?.notification_history ?? []
    ),
    submittedAt: row?.submitted_at ?? null,
  };
}

function escapeEmailHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKoreanDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

function toPerson(row: TalentUserRow | undefined, userId: string) {
  return {
    createdAt: row?.created_at ?? null,
    email: row?.email ?? null,
    headline: row?.headline ?? null,
    name: row?.name ?? null,
    userId,
  } satisfies OpsReferralPerson;
}

function buildRoleStageOptions(customStages: CustomStageRow[]) {
  return [
    PENDING_CONNECTION_STAGE,
    ...customStages
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((stage) => ({
        id: buildCustomStageId(stage.id),
        label: stage.label,
      })),
    FINAL_OFFER_STAGE,
    PROCESS_STOPPED_STAGE,
  ];
}

function getConnectionStage(args: {
  customStageByTag: ReadonlyMap<string, OpsReferralStageOption>;
  feedback?: string | null;
  savedStage?: string | null;
  tags: OpportunityTagRow[];
  viewedAt?: string | null;
}) {
  for (const tagRow of args.tags) {
    const tag = normalizeTag(tagRow.tag);
    const builtIn = BUILT_IN_STAGE_BY_TAG.get(tag);
    if (builtIn) return builtIn;
    const custom = args.customStageByTag.get(tag);
    if (custom) return custom;
  }

  const feedback = normalizeText(args.feedback).toLowerCase();
  const savedStage = normalizeText(args.savedStage).toLowerCase();
  if (
    feedback === "like" ||
    feedback === "positive" ||
    savedStage === "accepted"
  ) {
    return { id: "accepted", label: "수락" };
  }
  if (feedback === "dislike" || feedback === "negative") {
    return { id: "rejected", label: "거절" };
  }
  return {
    id: "recommended",
    label: args.viewedAt ? "제안 확인 · 응답 전" : "추천된 사람",
  };
}

function toApplicationValues(
  row: ReferralApplicationRow | undefined
): OpsReferralApplicationValues {
  return {
    amount: row?.amount ?? null,
    applicationId: row?.id ?? null,
    hiredAt: row?.hired_at ?? null,
    memo: row?.memo ?? null,
    rewardDueAt: row?.reward_due_at ?? null,
    rewardPaid: row?.reward_paid ?? false,
    rewardPaidAt: row?.reward_paid_at ?? null,
    settlementCompletedAt: row?.settlement_completed_at ?? null,
  };
}

function matchesSearch(item: OpsReferralItem, query: string) {
  if (!query) return true;
  const searchable = [
    item.referred.name,
    item.referred.email,
    item.referrer.name,
    item.referrer.email,
    item.roleName,
    item.companyName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return searchable.includes(query.toLocaleLowerCase());
}

function buildFilterStageOptions(items: OpsReferralItem[]) {
  const customOptions = new Map<string, OpsReferralStageOption>();
  for (const item of items) {
    for (const option of item.stageOptions) {
      if (option.id.startsWith(CUSTOM_STAGE_PREFIX)) {
        customOptions.set(option.id, option);
      }
    }
  }
  return [
    PENDING_CONNECTION_STAGE,
    ...Array.from(customOptions.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "ko")
    ),
    FINAL_OFFER_STAGE,
    PROCESS_STOPPED_STAGE,
  ];
}

async function buildReferralApplicationItems(admin: TalentAdminClient) {
  const attributions = await fetchAllAttributions(admin);
  if (attributions.length === 0) return [];

  const referredUserIds = attributions.map((row) => row.referred_user_id);
  const [links, recommendations] = await Promise.all([
    fetchLinksByTokens(
      admin,
      attributions.map((row) => row.token)
    ),
    fetchRecommendationsByTalentIds(admin, referredUserIds),
  ]);
  const linkByToken = new Map(links.map((row) => [row.token, row]));
  const attributionByUserId = new Map(
    attributions
      .filter((row) => linkByToken.has(row.token))
      .map((row) => [row.referred_user_id, row])
  );

  const latestRecommendationByApplication = new Map<
    string,
    RecommendationRow
  >();
  for (const row of recommendations) {
    if (!isInternalRecommendation(row)) continue;
    const talentId = normalizeText(row.talent_id);
    const role = getFirst(row.company_role);
    const roleId = normalizeText(row.role_id ?? role?.role_id);
    if (!talentId || !roleId || !attributionByUserId.has(talentId)) continue;
    const key = buildApplicationKey(talentId, roleId);
    const existing = latestRecommendationByApplication.get(key);
    if (
      !existing ||
      getRecommendationTimestamp(row) > getRecommendationTimestamp(existing)
    ) {
      latestRecommendationByApplication.set(key, row);
    }
  }

  const applicationRecommendations = Array.from(
    latestRecommendationByApplication.values()
  );
  if (applicationRecommendations.length === 0) return [];
  const roleIds = applicationRecommendations
    .map((row) =>
      normalizeText(row.role_id ?? getFirst(row.company_role)?.role_id)
    )
    .filter(Boolean);
  const relevantRoleIds = new Set(roleIds);
  const referrerUserIds = links.map((row) => row.referrer_user_id);
  const [tags, customStages, applicationRows, users] = await Promise.all([
    fetchTagsByTalentIds(admin, referredUserIds, relevantRoleIds),
    fetchCustomStagesByRoleIds(admin, roleIds),
    fetchApplicationRows(admin, referredUserIds),
    fetchUsersByIds(admin, [...referredUserIds, ...referrerUserIds]),
  ]);
  const payoutInformationRows = await fetchPayoutInformationRows(
    admin,
    applicationRows.map((row) => row.id)
  );

  const tagsByApplication = new Map<string, OpportunityTagRow[]>();
  for (const tag of tags) {
    const key = buildApplicationKey(tag.talent_id, tag.opportunity_id);
    const current = tagsByApplication.get(key) ?? [];
    current.push(tag);
    tagsByApplication.set(key, current);
  }
  const customStagesByRoleId = new Map<string, CustomStageRow[]>();
  for (const stage of customStages) {
    const current = customStagesByRoleId.get(stage.role_id) ?? [];
    current.push(stage);
    customStagesByRoleId.set(stage.role_id, current);
  }
  const customStageByTag = new Map<string, OpsReferralStageOption>();
  for (const stage of customStages) {
    customStageByTag.set(normalizeTag(buildCustomStageTag(stage.id)), {
      id: buildCustomStageId(stage.id),
      label: stage.label,
    });
  }
  const applicationRowByKey = new Map(
    applicationRows.map((row) => [
      buildApplicationKey(row.referred_user_id, row.role_id),
      row,
    ])
  );
  const payoutInformationByApplicationId = new Map(
    payoutInformationRows.map((row) => [row.referral_application_id, row])
  );
  const userById = new Map(users.map((row) => [row.user_id, row]));

  return applicationRecommendations.flatMap((row): OpsReferralItem[] => {
    const recommendationId = normalizeText(row.id);
    const referredUserId = normalizeText(row.talent_id);
    const role = getFirst(row.company_role);
    const roleId = normalizeText(row.role_id ?? role?.role_id);
    const workspace = getFirst(role?.company_workspace);
    const attribution = attributionByUserId.get(referredUserId);
    const link = attribution ? linkByToken.get(attribution.token) : undefined;
    if (!recommendationId || !referredUserId || !roleId || !link) return [];

    const key = buildApplicationKey(referredUserId, roleId);
    const applicationRow = applicationRowByKey.get(key);
    const stage = getConnectionStage({
      customStageByTag,
      feedback: row.feedback,
      savedStage: row.saved_stage,
      tags: tagsByApplication.get(key) ?? [],
      viewedAt: row.viewed_at,
    });
    if (!isActiveApplicationStage(stage.id)) return [];

    return [
      {
        ...toApplicationValues(applicationRow),
        companyName: normalizeText(workspace?.company_name) || "회사명 없음",
        currentStage: stage.id,
        currentStageLabel: stage.label,
        recommendationId,
        recommendedAt:
          row.recommended_at ?? row.created_at ?? new Date(0).toISOString(),
        referred: toPerson(userById.get(referredUserId), referredUserId),
        referrer: toPerson(
          userById.get(link.referrer_user_id),
          link.referrer_user_id
        ),
        roleId,
        roleName: normalizeText(role?.name) || "포지션명 없음",
        payoutInformation: toPayoutInformationValues(
          applicationRow
            ? payoutInformationByApplicationId.get(applicationRow.id)
            : undefined
        ),
        stageOptions: buildRoleStageOptions(
          customStagesByRoleId.get(roleId) ?? []
        ),
      },
    ];
  });
}

export async function fetchOpsReferralsPage(args: {
  limit?: number;
  offset?: number;
  query?: string;
  rewardPaid?: string;
  stage?: string;
}): Promise<OpsReferralListResponse> {
  const admin = getTalentSupabaseAdmin();
  const limit = Math.min(
    OPS_REFERRALS_PAGE_SIZE,
    Math.max(1, Math.floor(args.limit ?? OPS_REFERRALS_PAGE_SIZE))
  );
  const offset = Math.max(0, Math.floor(args.offset ?? 0));
  const query = normalizeText(args.query);
  const stage = normalizeText(args.stage);
  const rewardPaid = normalizeText(args.rewardPaid).toLowerCase();
  const allItems = (await buildReferralApplicationItems(admin)).sort(
    (left, right) =>
      Date.parse(right.recommendedAt) - Date.parse(left.recommendedAt)
  );
  const stageOptions = buildFilterStageOptions(allItems);
  const filtered = allItems.filter((item) => {
    if (!matchesSearch(item, query)) return false;
    if (stage && item.currentStage !== stage) return false;
    if (rewardPaid === "true" && !item.rewardPaid) return false;
    if (rewardPaid === "false" && item.rewardPaid) return false;
    return true;
  });

  return {
    items: filtered.slice(offset, offset + limit),
    limit,
    offset,
    stageOptions,
    total: filtered.length,
  };
}

function normalizeDateOnly(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("유효한 날짜를 입력해 주세요.");
  }
  return value;
}

function normalizeEditableValue(
  field: OpsReferralEditableField,
  value: unknown
) {
  if (
    field === "hiredAt" ||
    field === "rewardPaidAt" ||
    field === "settlementCompletedAt"
  ) {
    return normalizeDateOnly(value);
  }
  if (field === "rewardPaid") {
    if (typeof value !== "boolean")
      throw new Error("rewardPaid must be boolean");
    return value;
  }
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  const maxLength = field === "memo" ? MAX_MEMO_LENGTH : MAX_TEXT_AMOUNT_LENGTH;
  if (normalized.length > maxLength) {
    throw new Error(
      field === "memo"
        ? "메모는 10,000자 이하로 입력해 주세요."
        : "금액은 200자 이하로 입력해 주세요."
    );
  }
  return normalized || null;
}

async function validateReferralRecommendation(args: {
  admin: TalentAdminClient;
  recommendationId: string;
  referredUserId: string;
  roleId: string;
}) {
  const [attributionResult, recommendationResult] = await Promise.all([
    args.admin
      .from("talent_network_referral_attributions")
      .select("referred_user_id")
      .eq("referred_user_id", args.referredUserId)
      .maybeSingle(),
    args.admin
      .from("talent_opportunity_recommendation")
      .select("id")
      .eq("id", args.recommendationId)
      .eq("talent_id", args.referredUserId)
      .eq("role_id", args.roleId)
      .maybeSingle(),
  ]);
  if (attributionResult.error || !attributionResult.data) {
    throw new Error("Referral attribution not found");
  }
  if (recommendationResult.error || !recommendationResult.data) {
    throw new Error("Referral recommendation not found");
  }
}

export async function updateOpsReferralApplication(args: {
  field: OpsReferralEditableField;
  recommendationId: string;
  referredUserId: string;
  roleId: string;
  value: unknown;
}) {
  const recommendationId = normalizeText(args.recommendationId);
  const referredUserId = normalizeText(args.referredUserId);
  const roleId = normalizeText(args.roleId);
  if (!recommendationId) throw new Error("recommendationId is required");
  if (!referredUserId) throw new Error("referredUserId is required");
  if (!roleId) throw new Error("roleId is required");

  const admin = getTalentSupabaseAdmin();
  await validateReferralRecommendation({
    admin,
    recommendationId,
    referredUserId,
    roleId,
  });
  const columnByField: Record<OpsReferralEditableField, string> = {
    amount: "amount",
    hiredAt: "hired_at",
    memo: "memo",
    rewardPaid: "reward_paid",
    rewardPaidAt: "reward_paid_at",
    settlementCompletedAt: "settlement_completed_at",
  };
  const value = normalizeEditableValue(args.field, args.value);
  const payload = {
    recommendation_id: recommendationId,
    referred_user_id: referredUserId,
    role_id: roleId,
    [columnByField[args.field]]: value,
  };
  const { data, error } = await admin
    .from("talent_referral_application")
    .upsert(payload, { onConflict: "referred_user_id,role_id" })
    .select(
      "id, referred_user_id, role_id, recommendation_id, hired_at, settlement_completed_at, reward_due_at, reward_paid, reward_paid_at, amount, memo, created_at, updated_at"
    )
    .single();
  if (error) {
    if (isMissingReferralApplicationTable(error)) {
      throw new Error(
        "talent_referral_application 테이블이 없습니다. 최신 migration을 적용해 주세요."
      );
    }
    throw new Error(error.message ?? "Failed to update referral application");
  }
  return toApplicationValues(data as ReferralApplicationRow);
}

export async function updateOpsReferralStage(args: {
  actorEmail?: string | null;
  referredUserId: string;
  roleId: string;
  stage: string;
}) {
  const referredUserId = normalizeText(args.referredUserId);
  const roleId = normalizeText(args.roleId);
  const stage = normalizeText(args.stage);
  if (!referredUserId) throw new Error("referredUserId is required");
  if (!roleId) throw new Error("roleId is required");
  if (!stage) throw new Error("stage is required");

  const admin = getTalentSupabaseAdmin();
  const customStages = await fetchCustomStagesByRoleIds(admin, [roleId]);
  const allowedStages = new Set(
    buildRoleStageOptions(customStages).map((option) => option.id)
  );
  if (!allowedStages.has(stage)) {
    throw new Error("이 레퍼럴 application에서 선택할 수 없는 stage입니다.");
  }
  await setOpsMatchingReviewStage({
    actorEmail: args.actorEmail,
    roleId,
    stage,
    talentId: referredUserId,
  });
  return stage;
}

export async function sendOpsReferralPayoutInformationRequest(args: {
  actorEmail?: string | null;
  baseUrl: string;
  recommendationId: string;
  referredUserId: string;
  roleId: string;
}) {
  const recommendationId = normalizeText(args.recommendationId);
  const referredUserId = normalizeText(args.referredUserId);
  const roleId = normalizeText(args.roleId);
  if (!recommendationId) throw new Error("recommendationId is required");
  if (!referredUserId) throw new Error("referredUserId is required");
  if (!roleId) throw new Error("roleId is required");

  const admin = getTalentSupabaseAdmin();
  await validateReferralRecommendation({
    admin,
    recommendationId,
    referredUserId,
    roleId,
  });

  const { data: attribution, error: attributionError } = await admin
    .from("talent_network_referral_attributions")
    .select("token")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();
  if (attributionError) throw attributionError;
  if (!attribution) throw new Error("Referral attribution not found");

  const { data: link, error: linkError } = await admin
    .from("talent_network_referral_links")
    .select("referrer_user_id")
    .eq("token", attribution.token)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) throw new Error("Referral link not found");

  const { data: referrer, error: referrerError } = await admin
    .from("talent_users")
    .select("email, name")
    .eq("user_id", link.referrer_user_id)
    .maybeSingle();
  if (referrerError) throw referrerError;
  const recipientEmail = normalizeText(referrer?.email).toLowerCase();
  if (!recipientEmail || !recipientEmail.includes("@")) {
    throw new Error("초대한 사람의 유효한 이메일이 없습니다.");
  }

  const { data: application, error: applicationError } = await admin
    .from("talent_referral_application")
    .upsert(
      {
        recommendation_id: recommendationId,
        referred_user_id: referredUserId,
        role_id: roleId,
      },
      { onConflict: "referred_user_id,role_id" }
    )
    .select("id, amount, reward_due_at")
    .single();
  if (applicationError) {
    if (isMissingReferralApplicationTable(applicationError)) {
      throw new Error(
        "talent_referral_application 테이블이 없습니다. 최신 migration을 적용해 주세요."
      );
    }
    throw applicationError;
  }

  const { data: existingData, error: existingError } = await admin
    .from("talent_referral_payout_information")
    .select(
      "id, access_token_hash, access_token_expires_at, notification_history, submitted_at"
    )
    .eq("referral_application_id", application.id)
    .maybeSingle();
  if (existingError) {
    if (isMissingReferralPayoutInformationTable(existingError)) {
      throw new Error(
        "talent_referral_payout_information 테이블이 없습니다. 최신 migration을 적용해 주세요."
      );
    }
    throw existingError;
  }
  const existing = existingData as ReferralPayoutInformationWriteRow | null;
  if (existing?.submitted_at) {
    throw new Error("이미 지급정보 제출이 완료되었습니다.");
  }

  const accessToken = createReferralPayoutAccessToken();
  const accessTokenHash = hashReferralPayoutAccessToken(accessToken);
  const accessTokenExpiresAt = new Date(
    Date.now() + PAYOUT_LINK_TTL_MS
  ).toISOString();
  let payoutInformationId: string;

  if (existing) {
    const { error } = await admin
      .from("talent_referral_payout_information")
      .update({
        access_token_expires_at: accessTokenExpiresAt,
        access_token_hash: accessTokenHash,
      })
      .eq("id", existing.id);
    if (error) throw error;
    payoutInformationId = existing.id;
  } else {
    const { data, error } = await admin
      .from("talent_referral_payout_information")
      .insert({
        access_token_expires_at: accessTokenExpiresAt,
        access_token_hash: accessTokenHash,
        referral_application_id: application.id,
        referrer_user_id: link.referrer_user_id,
      })
      .select("id")
      .single();
    if (error) throw error;
    payoutInformationId = data.id;
  }

  const payoutUrl = new URL("/referral-payout", args.baseUrl);
  payoutUrl.hash = new URLSearchParams({ token: accessToken }).toString();
  const rewardDueAt = formatKoreanDate(application.reward_due_at);
  const amountText = normalizeText(application.amount);
  const referrerName = normalizeText(referrer?.name) || "추천인";
  const expiryText = formatKoreanDate(accessTokenExpiresAt);
  const amountLine = amountText ? `세전 보상금: ${amountText}\n` : "";
  const dueLine = rewardDueAt ? `지급 예정일: ${rewardDueAt}\n` : "";
  const text = `${referrerName}님, 안녕하세요.

Harper 레퍼럴 보상 지급 대상이 되어 안내드립니다.
${amountLine}${dueLine}지급에 필요한 본인·세무·계좌정보를 아래 보안 링크에서 입력해 주세요. 보상금은 관련 세금을 원천징수한 뒤 본인 명의 계좌로 지급됩니다.

지급정보 입력하기: ${payoutUrl.toString()}
입력 기한: ${expiryText ?? "메일 수신 후 14일 이내"}

입력 정보는 원천징수, 지급명세서 작성 및 보상금 송금 목적으로만 사용됩니다. 링크를 다른 사람에게 전달하지 마세요.

문의가 있거나 국내 세법상 비거주자·법인에 해당한다면 chris@matchharper.com으로 메일해 주세요.

Harper 드림`;
  const detailsHtml = [
    amountText
      ? `<div style="margin:0 0 8px;"><strong style="font-weight:500;">세전 보상금</strong> ${escapeEmailHtml(amountText)}</div>`
      : "",
    rewardDueAt
      ? `<div style="margin:0;"><strong style="font-weight:500;">지급 예정일</strong> ${escapeEmailHtml(rewardDueAt)}</div>`
      : "",
  ].join("");
  const html = `<div style="margin:0 auto;max-width:560px;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;line-height:1.65;">
    <p style="margin:0 0 20px;">${escapeEmailHtml(referrerName)}님, 안녕하세요.</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:500;line-height:1.35;">레퍼럴 보상 지급정보를 입력해 주세요</h1>
    <p style="margin:0 0 20px;">Harper 레퍼럴 보상 지급 대상이 되어 안내드립니다. 지급에 필요한 본인·세무·계좌정보를 아래 보안 링크에서 입력해 주세요.</p>
    ${detailsHtml ? `<div style="margin:0 0 24px;padding:16px;border-radius:10px;background:#f5f5f5;font-size:14px;">${detailsHtml}</div>` : ""}
    <a href="${escapeEmailHtml(payoutUrl.toString())}" style="display:inline-block;margin:0 0 20px;padding:12px 18px;border-radius:8px;background:#171717;color:#fff;text-decoration:none;font-weight:500;">지급정보 입력하기</a>
    <p style="margin:0 0 8px;font-size:13px;color:#666;">입력 기한: ${escapeEmailHtml(expiryText ?? "메일 수신 후 14일 이내")}</p>
    <p style="margin:0 0 20px;font-size:13px;color:#666;">보상금은 관련 세금을 원천징수한 뒤 본인 명의 계좌로 지급됩니다. 링크를 다른 사람에게 전달하지 마세요.</p>
    <p style="margin:0;font-size:13px;color:#666;">문의가 있거나 국내 세법상 비거주자·법인에 해당한다면 <a href="mailto:chris@matchharper.com" style="color:#171717;text-decoration:underline;">chris@matchharper.com</a>으로 메일해 주세요.</p>
  </div>`;

  let sendResult: { id?: string };
  try {
    sendResult = await sendResendEmail({
      from: getDefaultResendFromEmail(),
      html,
      idempotencyKey: `referral-payout:${application.id}:${accessTokenHash.slice(0, 24)}`,
      subject: "[Harper] 레퍼럴 보상 지급정보를 입력해 주세요",
      text,
      to: recipientEmail,
    });
  } catch (error) {
    if (existing) {
      await admin
        .from("talent_referral_payout_information")
        .update({
          access_token_expires_at: existing.access_token_expires_at,
          access_token_hash: existing.access_token_hash,
        })
        .eq("id", existing.id);
    } else {
      await admin
        .from("talent_referral_payout_information")
        .delete()
        .eq("id", payoutInformationId);
    }
    throw error;
  }

  const { data: latestData, error: latestError } = await admin
    .from("talent_referral_payout_information")
    .select("notification_history")
    .eq("id", payoutInformationId)
    .single();
  if (latestError) throw latestError;
  const sentAt = new Date().toISOString();
  const history = Array.isArray(latestData.notification_history)
    ? [...latestData.notification_history]
    : [];
  history.push({
    providerMessageId: sendResult.id ?? null,
    sentAt,
    sentByEmail: normalizeText(args.actorEmail).toLowerCase() || null,
  });
  const { error: historyError } = await admin
    .from("talent_referral_payout_information")
    .update({ notification_history: history })
    .eq("id", payoutInformationId);
  if (historyError) throw historyError;

  return {
    accessTokenExpiresAt,
    notificationHistory: parsePayoutNotificationHistory(history),
    submittedAt: null,
  } satisfies OpsReferralPayoutInformation;
}
