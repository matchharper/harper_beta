import { createHmac, timingSafeEqual } from "node:crypto";
import { WorkspaceBillingError } from "./types";

export const EARLY_TEAM_PROMOTION = "early_teams_202610";
export const EARLY_TEAM_PRICE_LOOKUP = "harper_slot_early_teams_202610";
export const PROMOTION_COOKIE = "harper_billing_promotion";
export const PROMOTION_END = Date.parse("2026-11-15T00:00:00+09:00");

// A bearer invitation grants the offer, never workspace access or payment authority.
export function buildPromotionToken(invitationId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new WorkspaceBillingError("billing_unavailable", 503);
  const payload = `${EARLY_TEAM_PROMOTION}.${invitationId}`;
  return `${payload}.${createHmac("sha256", secret).update(`billing-promotion-v1:${payload}`).digest("base64url")}`;
}

export function readPromotion(token?: string | null, now = Date.now()) {
  if (!token) return null;
  const [campaign, invitationId, signature, extra] = token.split(".");
  if (campaign !== EARLY_TEAM_PROMOTION || !invitationId || !signature || extra !== undefined || now >= PROMOTION_END)
    throw new WorkspaceBillingError("billing_promotion_invalid", 400);
  const expected = Buffer.from(buildPromotionToken(invitationId).split(".")[2]);
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new WorkspaceBillingError("billing_promotion_invalid", 400);
  return { id: EARLY_TEAM_PROMOTION, endsOn: "2026-11-14" };
}
