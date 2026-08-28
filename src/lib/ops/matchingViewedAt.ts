import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const RECOMMENDATION_EMAIL_OPEN_QUERY_CHUNK_SIZE = 80;

type RecommendationEmailOpenRow = Pick<
  Database["public"]["Tables"]["career_email_messages"]["Row"],
  "metadata" | "talent_id"
>;

type RecommendationEmailOpenTarget = {
  discoveryRunId: string | null | undefined;
  talentId: string | null | undefined;
};

export function buildMatchingRecommendationDeliveryKey(
  talentId: string | null | undefined,
  discoveryRunId: string | null | undefined
) {
  const normalizedTalentId = String(talentId ?? "").trim();
  const normalizedDiscoveryRunId = String(discoveryRunId ?? "").trim();
  if (!normalizedTalentId || !normalizedDiscoveryRunId) return "";
  return `${normalizedTalentId}:${normalizedDiscoveryRunId}`;
}

export function getEarliestMatchingViewedAt(
  appViewedAt: string | null | undefined,
  emailViewedAt: string | null | undefined
) {
  const candidates = [appViewedAt, emailViewedAt]
    .map((value) => String(value ?? "").trim())
    .map((value) => ({ timestamp: Date.parse(value), value }))
    .filter(
      (candidate) =>
        candidate.value && Number.isFinite(candidate.timestamp)
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  return candidates[0]?.value ?? null;
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getJsonString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function chunkValues<T>(values: T[]) {
  const chunks: T[][] = [];
  for (
    let index = 0;
    index < values.length;
    index += RECOMMENDATION_EMAIL_OPEN_QUERY_CHUNK_SIZE
  ) {
    chunks.push(
      values.slice(index, index + RECOMMENDATION_EMAIL_OPEN_QUERY_CHUNK_SIZE)
    );
  }
  return chunks;
}

export async function fetchMatchingRecommendationEmailOpenedAtMap(args: {
  admin: SupabaseClient<Database>;
  targets: RecommendationEmailOpenTarget[];
}) {
  const deliveryTargetByKey = new Map<
    string,
    { discoveryRunId: string; talentId: string }
  >();
  for (const target of args.targets) {
    const talentId = String(target.talentId ?? "").trim();
    const discoveryRunId = String(target.discoveryRunId ?? "").trim();
    const deliveryKey = buildMatchingRecommendationDeliveryKey(
      talentId,
      discoveryRunId
    );
    if (!deliveryKey) continue;
    deliveryTargetByKey.set(deliveryKey, { discoveryRunId, talentId });
  }
  const deliveryTargets = Array.from(deliveryTargetByKey.values());
  const openedAtByDeliveryKey = new Map<string, string>();
  if (deliveryTargets.length === 0) return openedAtByDeliveryKey;

  const queryResults = await Promise.all(
    chunkValues(deliveryTargets).map((targetChunk) => {
      const talentIds = Array.from(
        new Set(targetChunk.map((target) => target.talentId))
      );
      const discoveryRunIds = Array.from(
        new Set(targetChunk.map((target) => target.discoveryRunId))
      );
      return args.admin
        .from("career_email_messages")
        .select("talent_id, metadata")
        .eq("direction", "outbound")
        .eq("mail_type", "opportunity_recommendation")
        .eq("status", "sent")
        .in("talent_id", talentIds)
        .in("metadata->>discoveryRunId", discoveryRunIds)
        .not("metadata->>resendFirstOpenedAt", "is", null);
    })
  );

  for (const result of queryResults) {
    if (result.error) {
      throw new Error(
        result.error.message ?? "Failed to load recommendation email opens"
      );
    }

    for (const row of (result.data ?? []) as RecommendationEmailOpenRow[]) {
      const metadata = parseJsonRecord(row.metadata);
      const discoveryRunId = getJsonString(metadata, "discoveryRunId");
      const emailOpenedAt = getJsonString(metadata, "resendFirstOpenedAt");
      const deliveryKey = buildMatchingRecommendationDeliveryKey(
        row.talent_id,
        discoveryRunId
      );
      if (!deliveryKey || !emailOpenedAt) continue;
      openedAtByDeliveryKey.set(
        deliveryKey,
        getEarliestMatchingViewedAt(
          openedAtByDeliveryKey.get(deliveryKey),
          emailOpenedAt
        ) ?? emailOpenedAt
      );
    }
  }

  return openedAtByDeliveryKey;
}
