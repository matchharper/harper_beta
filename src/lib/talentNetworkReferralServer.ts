import crypto from "crypto";
import type { User } from "@supabase/supabase-js";
import { isInternalEmail } from "@/lib/internalAccess";

const REFERRAL_TOKEN_BYTES = 24;
const TOKEN_RETRY_LIMIT = 4;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAdminLike = any;

export type TalentNetworkReferralStats = {
  hires: number;
  signups: number;
  visits: number;
};

export type TalentNetworkReferralSummary = {
  createdAt: string | null;
  stats: TalentNetworkReferralStats;
  token: string;
};

function makeReferralToken() {
  return crypto.randomBytes(REFERRAL_TOKEN_BYTES).toString("base64url");
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

export function buildReferralUrl(args: {
  baseUrl: string;
  token: string;
}) {
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
  const normalized = String(value ?? "").trim();
  if (!normalized) return new Date().toISOString();

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new Error("hiredAt must be a valid date");
  }

  return new Date(timestamp).toISOString();
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

  const { data, error } = await args.admin
    .from("talent_network_referral_attributions")
    .select("referred_user_id, hired_at")
    .eq("token", link.token);

  if (error) {
    throw new Error(error.message ?? "Failed to read referral stats");
  }

  const rows = Array.isArray(data) ? data : [];

  return {
    createdAt: link.createdAt,
    token: link.token,
    stats: {
      hires: rows.filter((row) => Boolean(row?.hired_at)).length,
      signups: rows.length,
      visits: link.visitCount,
    },
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
