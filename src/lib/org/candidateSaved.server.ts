import { v5 as uuidv5 } from "uuid";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { OrgBoardItem } from "./server";

type Admin = ReturnType<typeof getSupabaseAdmin>;
export const ORG_CANDIDATE_SAVE_KIND = "org_candidate_saved";

/** A company bookmark is independent of the candidate's consent and hiring stage. */
export async function readOrgCandidateSaves(
  admin: Admin,
  workspaceId: string,
  items: OrgBoardItem[]
): Promise<OrgBoardItem[]> {
  if (!items.length) return items;
  const ids = items.map((item) => candidateSaveId(workspaceId, item));
  const records: Array<{ id: string; created_at: string; metadata: unknown }> =
    [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await admin
      .from("talent_progress")
      .select("id,created_at,metadata")
      .eq("kind", ORG_CANDIDATE_SAVE_KIND)
      .in("id", ids.slice(offset, offset + 100));
    if (error) throw error;
    records.push(...(data ?? []));
  }
  const byId = new Map(records.map((row) => [row.id, row]));
  return items.map((item) => {
    const row = byId.get(candidateSaveId(workspaceId, item));
    const metadata = row?.metadata as
      | { saved?: boolean; stage?: string }
      | undefined;
    return {
      ...item,
      savedAt:
        metadata?.saved === true && metadata.stage === item.stage
          ? row!.created_at
          : null,
    };
  });
}

export function candidateSaveId(
  workspaceId: string,
  item: Pick<OrgBoardItem, "roleId" | "talentId" | "recommendationId">
) {
  return uuidv5(
    `${ORG_CANDIDATE_SAVE_KIND}:${workspaceId}:${item.roleId}:${item.talentId}:${item.recommendationId}`,
    uuidv5.URL
  );
}
