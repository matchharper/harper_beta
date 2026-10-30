import { createHmac, timingSafeEqual } from "node:crypto";
import { WorkspaceBillingError } from "./types";

export const EARLY_TEAM_PROMOTION = "early_teams_202610";
export const EARLY_TEAM_PRICE_LOOKUP = "harper_slot_early_teams_202610";
export const PROMOTION_COOKIE = "harper_billing_promotion";
const DEFAULT_ENDS_ON = "2026-11-05";
export const PROMOTION_END = promotionEnd(DEFAULT_ENDS_ON);

export function promotionEnd(endsOn: string) {
  const end = Date.parse(`${endsOn}T00:00:00+09:00`) + 86400000;
  if (!Number.isFinite(end)) throw new WorkspaceBillingError("billing_promotion_invalid", 400);
  return end;
}

function signPromotion(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new WorkspaceBillingError("billing_unavailable", 503);
  return createHmac("sha256", secret).update(`billing-promotion-v1:${payload}`).digest("base64url");
}

// A bearer invitation grants the offer, never workspace access or payment authority.
export function buildPromotionToken(invitationId: string, endsOn?: string) {
  if (endsOn) promotionEnd(endsOn);
  const payload = `${EARLY_TEAM_PROMOTION}.${invitationId}${endsOn ? `.${endsOn}` : ""}`;
  return `${payload}.${signPromotion(payload)}`;
}

export function readPromotion(token?: string | null, now = Date.now()) {
  if (!token) return null;
  const parts = token.split(".");
  const [campaign, invitationId] = parts;
  const signature = parts.at(-1);
  if (campaign !== EARLY_TEAM_PROMOTION || !invitationId || !signature || (parts.length !== 3 && parts.length !== 4))
    throw new WorkspaceBillingError("billing_promotion_invalid", 400);
  const expected = Buffer.from(signPromotion(parts.slice(0, -1).join(".")));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new WorkspaceBillingError("billing_promotion_invalid", 400);
  const endsOn = parts.length === 4 ? parts[2] : DEFAULT_ENDS_ON;
  if (now >= promotionEnd(endsOn)) throw new WorkspaceBillingError("billing_promotion_invalid", 400);
  return { id: EARLY_TEAM_PROMOTION, endsOn };
}
