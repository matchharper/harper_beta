import crypto from "crypto";
import type { User } from "@supabase/supabase-js";
import { isInternalEmail } from "@/lib/internalAccess";

const REFERRAL_TOKEN_BYTES = 24;
const TOKEN_RETRY_LIMIT = 4;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAdminLike = any;

type ReferralAttributionIdRow = {
  referred_user_id: string | null;
};

type ReferralRewardApplicationRow = {
  amount: string | null;
  hired_at: string | null;
  id: string;
  referred_user_id: string;
  reward_due_at: string | null;
  reward_paid: boolean | null;
  role_id: string;
  settlement_completed_at: string | null;
};

type ReferralRewardProfileRow = {
  name: string | null;
  profile_picture: string | null;
  user_id: string;
};

type ReferralStageTagRow = {
  opportunity_id: string;
  tag: string;
  talent_id: string;
  updated_at: string | null;
};

export type TalentNetworkReferralStats = {
  hires: number;
  paid: number;
  signups: number;
  visits: number;
};

export type TalentNetworkReferralSummary = {
  createdAt: string | null;
  stats: TalentNetworkReferralStats;
  token: string;
};

export type TalentNetworkReferralListItem = {
  headline: string | null;
  hired: boolean;
  id: string;
  joinedAt: string | null;
  name: string | null;
  profilePicture: string | null;
};

export type TalentNetworkReferralListResponse = {
  items: TalentNetworkReferralListItem[];
  nextOffset: number | null;
  total: number;
};

export type TalentNetworkReferralRewardItem = {
  amount: string | null;
  hiredConfirmed: boolean;
  id: string;
  name: string | null;
  profilePicture: string | null;
  rewardDueAt: string | null;
  rewardPaid: boolean;
};

export type TalentNetworkReferralRewardListResponse = {
  items: TalentNetworkReferralRewardItem[];
  nextOffset: number | null;
  total: number;
};

function makeReferralToken() {
  return crypto.randomBytes(REFERRAL_TOKEN_BYTES).toString("base64url");
}

function makeReferralListItemId(token: string, referredUserId: string) {
  return crypto
    .createHash("sha256")
    .update(`${token}:${referredUserId}`)
    .digest("base64url")
    .slice(0, 22);
}

function makeReferralRewardItemId(token: string, applicationId: string) {
  return crypto
    .createHash("sha256")
    .update(`${token}:application:${applicationId}`)
    .digest("base64url")
    .slice(0, 22);
}

function normalizeStageTag(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

const FINAL_OFFER_STAGE_TAG = normalizeStageTag("내부:최종오퍼");
const BUILT_IN_STAGE_TAGS = new Set(
  [
    "내부:수락",
    "내부:아카이브",
    "내부:최종오퍼",
    "내부:보류",
    "내부:연결대기",
    "내부:프로세스중단",
    "내부:거절",
  ].map(normalizeStageTag)
);

function isMatchingStageTag(value: unknown) {
  const tag = normalizeStageTag(value);
  return BUILT_IN_STAGE_TAGS.has(tag) || tag.startsWith("내부단계:");
}

function isMissingReferralApplicationTable(
  error: {
    message?: string;
  } | null
) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("talent_referral_application") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("not found"))
  );
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key value violates unique constraint/i.test(error.message ?? "")
  );
}

export function normalizeReferralToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 256);
}

export function buildReferralUrl(args: { baseUrl: string; token: string }) {
  const url = new URL("/", args.baseUrl);
  url.searchParams.set("ref", args.token);
  return url.toString();
}

export function getRequestBaseUrl(req: Request) {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export function isInternalReferralUser(user: Pick<User, "email">) {
  return isInternalEmail(user.email);
}

function normalizeRequiredUuid(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid UUID`);
  }
  return normalized;
}

function normalizeHiredAt(value: unknown) {
  return normalizeTimestamp(value, "hiredAt");
}

function normalizePaidAt(value: unknown) {
  return normalizeTimestamp(value, "paidAt");
}

function normalizeTimestamp(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return new Date().toISOString();

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} must be a valid date`);
  }

  return new Date(timestamp).toISOString();
}

function isMissingPaidAtColumn(
  error: { code?: string; message?: string } | null
) {
  if (!error || !/paid_at/i.test(error.message ?? "")) return false;
  return error.code === "42703" || error.code === "PGRST204";
}

export async function getOrCreateTalentNetworkReferralLink(args: {
  admin: SupabaseAdminLike;
  referrerUserId: string;
}): Promise<{ createdAt: string | null; token: string; visitCount: number }> {
  const existing = await args.admin
    .from("talent_network_referral_links")
    .select("token, visit_count, created_at")
    .eq("referrer_user_id", args.referrerUserId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message ?? "Failed to read referral link");
  }

  if (existing.data?.token) {
    return {
      createdAt: existing.data.created_at ?? null,
      token: String(existing.data.token),
      visitCount: Number(existing.data.visit_count ?? 0),
    };
  }

  for (let attempt = 0; attempt < TOKEN_RETRY_LIMIT; attempt += 1) {
    const token = makeReferralToken();
    const inserted = await args.admin
      .from("talent_network_referral_links")
      .insert({
        referrer_user_id: args.referrerUserId,
        token,
      })
      .select("token, visit_count, created_at")
      .single();

    if (!inserted.error && inserted.data?.token) {
      return {
        createdAt: inserted.data.created_at ?? null,
        token: String(inserted.data.token),
        visitCount: Number(inserted.data.visit_count ?? 0),
      };
    }

    if (!isUniqueViolation(inserted.error)) {
      throw new Error(
        inserted.error?.message ?? "Failed to create referral link"
      );
    }

    const raced = await args.admin
      .from("talent_network_referral_links")
      .select("token, visit_count, created_at")
      .eq("referrer_user_id", args.referrerUserId)
      .maybeSingle();

    if (!raced.error && raced.data?.token) {
      return {
        createdAt: raced.data.created_at ?? null,
        token: String(raced.data.token),
        visitCount: Number(raced.data.visit_count ?? 0),
      };
    }
  }

  throw new Error("Failed to create a unique referral token");
}

export async function getTalentNetworkReferralSummary(args: {
  admin: SupabaseAdminLike;
  referrerUserId: string;
}): Promise<TalentNetworkReferralSummary> {
  const link = await getOrCreateTalentNetworkReferralLink(args);

  let { data, error } = await args.admin
    .from("talent_network_referral_attributions")
    .select("referred_user_id, hired_at, paid_at")
    .eq("token", link.token);

  if (error && isMissingPaidAtColumn(error)) {
    const fallback = await args.admin
      .from("talent_network_referral_attributions")
      .select("referred_user_id, hired_at")
      .eq("token", link.token);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message ?? "Failed to read referral stats");
  }

  const rows = Array.isArray(data) ? data : [];

  return {
    createdAt: link.createdAt,
    token: link.token,
    stats: {
      hires: rows.filter((row) => Boolean(row?.hired_at)).length,
      paid: rows.filter((row) => Boolean(row?.paid_at)).length,
      signups: rows.length,
      visits: link.visitCount,
    },
  };
}

export async function getTalentNetworkReferralList(args: {
  admin: SupabaseAdminLike;
  limit: number;
  offset: number;
  referrerUserId: string;
}): Promise<TalentNetworkReferralListResponse> {
  const link = await getOrCreateTalentNetworkReferralLink(args);
  const limit = Math.min(10, Math.max(1, Math.floor(args.limit)));
  const offset = Math.max(0, Math.floor(args.offset));

  const { data, count, error } = await args.admin
    .from("talent_network_referral_attributions")
    .select("referred_user_id, hired_at", { count: "exact" })
    .eq("token", link.token)
    .order("referred_user_id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message ?? "Failed to read referral list");
  }

  const rows = Array.isArray(data) ? data : [];
  const referredUserIds = rows
    .map((row) => String(row?.referred_user_id ?? "").trim())
    .filter(Boolean);

  const profilesById = new Map<
    string,
    {
      created_at: string | null;
      headline: string | null;
      name: string | null;
      profile_picture: string | null;
      user_id: string;
    }
  >();

  if (referredUserIds.length > 0) {
    const profiles = await args.admin
      .from("talent_users")
      .select("user_id, name, headline, profile_picture, created_at")
      .in("user_id", referredUserIds);

    if (profiles.error) {
      throw new Error(
        profiles.error.message ?? "Failed to read referral profiles"
      );
    }

    for (const profile of Array.isArray(profiles.data) ? profiles.data : []) {
      const userId = String(profile?.user_id ?? "").trim();
      if (!userId) continue;
      profilesById.set(userId, {
        created_at: String(profile?.created_at ?? "").trim() || null,
        headline: String(profile?.headline ?? "").trim() || null,
        name: String(profile?.name ?? "").trim() || null,
        profile_picture: String(profile?.profile_picture ?? "").trim() || null,
        user_id: userId,
      });
    }
  }

  const parsedTotal = Number(count ?? rows.length);
  const total = Number.isFinite(parsedTotal)
    ? Math.max(0, parsedTotal)
    : rows.length;
  const items = rows.map((row) => {
    const referredUserId = String(row?.referred_user_id ?? "").trim();
    const profile = profilesById.get(referredUserId);

    return {
      headline: profile?.headline ?? null,
      hired: Boolean(row?.hired_at),
      id: makeReferralListItemId(link.token, referredUserId),
      joinedAt: profile?.created_at ?? null,
      name: profile?.name ?? null,
      profilePicture: profile?.profile_picture ?? null,
    };
  });

  const nextOffset =
    offset + items.length < total ? offset + items.length : null;

  return {
    items,
    nextOffset,
    total,
  };
}

export async function getTalentNetworkReferralRewardList(args: {
  admin: SupabaseAdminLike;
  limit: number;
  offset: number;
  referrerUserId: string;
}): Promise<TalentNetworkReferralRewardListResponse> {
  const link = await getOrCreateTalentNetworkReferralLink(args);
  const limit = Math.min(10, Math.max(1, Math.floor(args.limit)));
  const offset = Math.max(0, Math.floor(args.offset));
  const attributionResult = await args.admin
    .from("talent_network_referral_attributions")
    .select("referred_user_id")
    .eq("token", link.token);

  if (attributionResult.error) {
    throw new Error(
      attributionResult.error.message ?? "Failed to read referral attributions"
    );
  }

  const attributionRows = (
    Array.isArray(attributionResult.data) ? attributionResult.data : []
  ) as ReferralAttributionIdRow[];
  const referredUserIds = attributionRows
    .map((row) => String(row?.referred_user_id ?? "").trim())
    .filter(Boolean);
  if (referredUserIds.length === 0) {
    return { items: [], nextOffset: null, total: 0 };
  }

  const applicationResult = await args.admin
    .from("talent_referral_application")
    .select(
      "id, referred_user_id, role_id, hired_at, settlement_completed_at, reward_due_at, reward_paid, amount"
    )
    .in("referred_user_id", referredUserIds)
    .or("hired_at.not.is.null,settlement_completed_at.not.is.null")
    .order("reward_due_at", { ascending: true, nullsFirst: false });

  if (applicationResult.error) {
    if (isMissingReferralApplicationTable(applicationResult.error)) {
      return { items: [], nextOffset: null, total: 0 };
    }
    throw new Error(
      applicationResult.error.message ?? "Failed to read referral applications"
    );
  }

  const applicationRows = (
    Array.isArray(applicationResult.data) ? applicationResult.data : []
  ) as ReferralRewardApplicationRow[];
  if (applicationRows.length === 0) {
    return { items: [], nextOffset: null, total: 0 };
  }

  const applicationTalentIds = Array.from(
    new Set(
      applicationRows
        .map((row) => String(row?.referred_user_id ?? "").trim())
        .filter(Boolean)
    )
  );
  const applicationRoleIds = Array.from(
    new Set(
      applicationRows
        .map((row) => String(row?.role_id ?? "").trim())
        .filter(Boolean)
    )
  );
  const [tagResult, profileResult] = await Promise.all([
    args.admin
      .from("talent_opportunity_tag")
      .select("talent_id, opportunity_id, tag, updated_at")
      .in("talent_id", applicationTalentIds)
      .in("opportunity_id", applicationRoleIds)
      .order("updated_at", { ascending: false }),
    args.admin
      .from("talent_users")
      .select("user_id, name, profile_picture")
      .in("user_id", applicationTalentIds),
  ]);

  if (tagResult.error) {
    throw new Error(
      tagResult.error.message ?? "Failed to read matching stages"
    );
  }
  if (profileResult.error) {
    throw new Error(
      profileResult.error.message ?? "Failed to read referral profiles"
    );
  }

  const currentStageTagByApplication = new Map<string, string>();
  const stageTagRows = (
    Array.isArray(tagResult.data) ? tagResult.data : []
  ) as ReferralStageTagRow[];
  for (const row of stageTagRows) {
    const talentId = String(row?.talent_id ?? "").trim();
    const roleId = String(row?.opportunity_id ?? "").trim();
    const tag = normalizeStageTag(row?.tag);
    const key = `${talentId}:${roleId}`;
    if (
      !talentId ||
      !roleId ||
      currentStageTagByApplication.has(key) ||
      !isMatchingStageTag(tag)
    ) {
      continue;
    }
    currentStageTagByApplication.set(key, tag);
  }

  const profileRows = (
    Array.isArray(profileResult.data) ? profileResult.data : []
  ) as ReferralRewardProfileRow[];
  const profileByUserId = new Map(
    profileRows.map((row) => [String(row.user_id ?? "").trim(), row])
  );
  const eligibleRows = applicationRows.filter((row) => {
    const key = `${String(row?.referred_user_id ?? "").trim()}:${String(
      row?.role_id ?? ""
    ).trim()}`;
    return currentStageTagByApplication.get(key) === FINAL_OFFER_STAGE_TAG;
  });
  const total = eligibleRows.length;
  const pageRows = eligibleRows.slice(offset, offset + limit);
  const items = pageRows.map((row): TalentNetworkReferralRewardItem => {
    const referredUserId = String(row?.referred_user_id ?? "").trim();
    const profile = profileByUserId.get(referredUserId);
    return {
      amount: String(row?.amount ?? "").trim() || null,
      hiredConfirmed: Boolean(row?.hired_at || row?.settlement_completed_at),
      id: makeReferralRewardItemId(link.token, String(row?.id ?? "")),
      name: String(profile?.name ?? "").trim() || null,
      profilePicture: String(profile?.profile_picture ?? "").trim() || null,
      rewardDueAt: String(row?.reward_due_at ?? "").trim() || null,
      rewardPaid: row?.reward_paid === true,
    };
  });

  return {
    items,
    nextOffset: offset + items.length < total ? offset + items.length : null,
    total,
  };
}

export async function recordTalentNetworkReferralVisit(args: {
  admin: SupabaseAdminLike;
  token: string;
  visitorUserId?: string | null;
}) {
  const token = normalizeReferralToken(args.token);
  if (!token) return null;

  if (!args.admin.rpc) {
    throw new Error("Referral visit RPC is unavailable");
  }

  const { data, error } = await args.admin.rpc(
    "record_talent_network_referral_visit",
    {
      p_token: token,
      p_visitor_user_id: args.visitorUserId || null,
    }
  );

  if (error) {
    throw new Error(error.message ?? "Failed to record referral visit");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    isSelfVisit: row.is_self_visit === true,
    referrerUserId: String(row.referrer_user_id ?? ""),
    token,
    visitCount: Number(row.visit_count ?? 0),
  };
}

export async function attributeTalentNetworkReferralSignup(args: {
  admin: SupabaseAdminLike;
  referredUser: Pick<User, "email" | "id">;
  token: string;
}) {
  const token = normalizeReferralToken(args.token);
  if (!token || isInternalReferralUser(args.referredUser)) {
    return { attributed: false, reason: "ignored" };
  }

  const { data: link, error: readError } = await args.admin
    .from("talent_network_referral_links")
    .select("referrer_user_id, token")
    .eq("token", token)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message ?? "Failed to read referral link");
  }
  if (!link) return { attributed: false, reason: "not_found" };

  if (String(link.referrer_user_id ?? "") === args.referredUser.id) {
    return { attributed: false, reason: "self_referral" };
  }

  const inserted = await args.admin
    .from("talent_network_referral_attributions")
    .insert({
      referred_user_id: args.referredUser.id,
      token,
    });

  if (!inserted.error) {
    return { attributed: true, reason: "created" };
  }

  if (isUniqueViolation(inserted.error)) {
    return { attributed: false, reason: "already_attributed" };
  }

  throw new Error(
    inserted.error.message ?? "Failed to attribute referral signup"
  );
}

export async function markTalentNetworkReferralHired(args: {
  admin: SupabaseAdminLike;
  hiredAt?: string | null;
  referredUserId: string;
}) {
  const hiredAt = normalizeHiredAt(args.hiredAt);
  const referredUserId = normalizeRequiredUuid(
    args.referredUserId,
    "referredUserId"
  );

  const { data: existing, error: readError } = await args.admin
    .from("talent_network_referral_attributions")
    .select("referred_user_id, hired_at, token")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message ?? "Failed to read referral attribution");
  }
  if (!existing) return { marked: false, reason: "not_attributed" };
  if (existing.hired_at) return { marked: false, reason: "already_marked" };

  const { error: updateError } = await args.admin
    .from("talent_network_referral_attributions")
    .update({ hired_at: hiredAt })
    .eq("referred_user_id", referredUserId)
    .is("hired_at", null);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to mark referral hired");
  }

  return { marked: true, reason: "marked", token: existing.token };
}

export async function markTalentNetworkReferralPaid(args: {
  admin: SupabaseAdminLike;
  paidAt?: string | null;
  referredUserId: string;
}) {
  const paidAt = normalizePaidAt(args.paidAt);
  const referredUserId = normalizeRequiredUuid(
    args.referredUserId,
    "referredUserId"
  );

  const { data: existing, error: readError } = await args.admin
    .from("talent_network_referral_attributions")
    .select("referred_user_id, hired_at, paid_at, token")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      errorMessage(readError, "Failed to read referral attribution")
    );
  }
  if (!existing) return { marked: false, reason: "not_attributed" };
  if (!existing.hired_at) return { marked: false, reason: "not_hired" };
  if (existing.paid_at) return { marked: false, reason: "already_marked" };

  const { error: updateError } = await args.admin
    .from("talent_network_referral_attributions")
    .update({ paid_at: paidAt })
    .eq("referred_user_id", referredUserId)
    .is("paid_at", null);

  if (updateError) {
    throw new Error(errorMessage(updateError, "Failed to mark referral paid"));
  }

  return { marked: true, reason: "marked", token: existing.token };
}

function errorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message ?? fallback;
}
