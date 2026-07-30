import { createHash } from "node:crypto";

export type CareerRealtimeProvider = "openai" | "xai";

export const CAREER_REALTIME_ROLLOUT_STARTED_AT = "2026-07-30T10:47:00.000Z";
// Set CAREER_REALTIME_PROVIDER_OVERRIDE=openai|xai only for an intentional
// environment-wide override; otherwise the rollout policy below applies.

type CareerRealtimeProviderAssignment = {
  providerOverride?: string | null;
  userCreatedAt?: string | null;
  userId: string;
};

function parseProviderOverride(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "openai" || normalized === "xai" ? normalized : null;
}

function getStableProviderBucket(userId: string) {
  return createHash("sha256")
    .update(`career-realtime-provider:${userId}`)
    .digest()[0];
}

export function resolveCareerRealtimeProvider({
  providerOverride = process.env.CAREER_REALTIME_PROVIDER_OVERRIDE,
  userCreatedAt,
  userId,
}: CareerRealtimeProviderAssignment): CareerRealtimeProvider {
  const override = parseProviderOverride(providerOverride);
  if (override) return override;

  const createdAtMs = Date.parse(userCreatedAt ?? "");
  const rolloutStartedAtMs = Date.parse(CAREER_REALTIME_ROLLOUT_STARTED_AT);

  if (
    !userId.trim() ||
    !Number.isFinite(createdAtMs) ||
    createdAtMs < rolloutStartedAtMs
  ) {
    return "openai";
  }

  return getStableProviderBucket(userId) < 128 ? "openai" : "xai";
}
