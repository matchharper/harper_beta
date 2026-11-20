import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { databaseError, resourceDb } from "./types";

export async function retireResourceCache(admin: TalentAdminClient) {
  const result = await resourceDb(admin).rpc(
    "career_retire_resource_cache_v1",
    {
      p_before: new Date(Date.now() - 30 * 86400_000).toISOString(),
      p_limit: 1000,
    }
  );
  databaseError(result.error);
  return result.data;
}
