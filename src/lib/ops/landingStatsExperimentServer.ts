import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  LANDING_STATS_ABTEST_A,
  LANDING_STATS_ABTEST_B,
  LANDING_STATS_EXPOSURE,
} from "@/lib/landingStatsExperiment";
import type {
  LandingStatsLog,
  LandingStatsSignup,
} from "./landingStatsExperiment";

const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;

export async function fetchLandingStatsExperimentRows(
  admin: ReturnType<typeof getTalentSupabaseAdmin>,
  startIso: string,
  endIso: string
) {
  const exposures: (LandingStatsLog & { id: number })[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("landing_logs")
      .select("id,local_id,type,created_at,abtest_type")
      .in("abtest_type", [LANDING_STATS_ABTEST_A, LANDING_STATS_ABTEST_B])
      .eq("type", LANDING_STATS_EXPOSURE)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    exposures.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const localIds = [
    ...new Set(
      exposures.flatMap((row) => (row.local_id ? [row.local_id] : []))
    ),
  ];
  const rows: LandingStatsLog[] = [];
  const signups: LandingStatsSignup[] = [];
  for (let index = 0; index < localIds.length; index += ID_CHUNK_SIZE) {
    const ids = localIds.slice(index, index + ID_CHUNK_SIZE);
    await Promise.all([
      (async () => {
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await admin
            .from("landing_logs")
            .select("id,local_id,type,created_at,abtest_type")
            .in("local_id", ids)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if (!data || data.length < PAGE_SIZE) break;
        }
      })(),
      (async () => {
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await admin
            .from("logs")
            .select("id,user_id,created_at,meta_data")
            .eq("type", "career_signup_completed")
            .in("meta_data->>landingLocalId", ids)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(error.message);
          for (const row of data ?? []) {
            const metadata = row.meta_data;
            const localId =
              metadata &&
              typeof metadata === "object" &&
              !Array.isArray(metadata)
                ? metadata.landingLocalId
                : null;
            if (typeof localId === "string" && row.user_id) {
              signups.push({
                localId,
                createdAt: row.created_at,
                userId: row.user_id,
              });
            }
          }
          if (!data || data.length < PAGE_SIZE) break;
        }
      })(),
    ]);
  }
  return { rows, signups };
}
