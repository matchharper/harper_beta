import {
  AUTO_INTRO_PENDING_TAG,
  getLatestAutoIntroInternalStage,
} from "@/lib/ops/autoIntroToCompanyPolicy";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type TagRow = {
  created_at: string;
  id: string;
  opportunity_id: string;
  tag: string;
  talent_id: string;
  updated_at: string;
};

const CHUNK_SIZE = 80;
const PAGE_SIZE = 1000;

function chunks<T>(values: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    result.push(values.slice(index, index + CHUNK_SIZE));
  }
  return result;
}

async function readAll<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || "Failed to load rows");
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

function tagQuery(admin: Admin) {
  return admin
    .from("talent_opportunity_tag")
    .select("id, opportunity_id, tag, talent_id, created_at, updated_at");
}

/**
 * 연결 수락한 후보 for the given Roles: candidates whose latest internal stage
 * on the Role is 내부:연결대기, saved ones included (still undecided), deleted
 * candidates left out. The web To-do and the Slack Mon/Wed/Fri table both
 * count with this, so the two numbers are the same for the same Roles.
 */
export async function readPendingConnections(admin: Admin, roleIds: string[]) {
  const pairs = new Set<string>();
  /** When each candidate started waiting for the company, by `role:talent`. */
  const sinceByPair = new Map<string, string>();
  const countByRoleId = new Map<string, number>();
  const ids = Array.from(new Set(roleIds.filter(Boolean)));
  if (!ids.length) return { countByRoleId, pairs, sinceByPair };

  const pendingTags: TagRow[] = [];
  for (const roleChunk of chunks(ids)) {
    pendingTags.push(
      ...(await readAll<TagRow>((from, to) =>
        tagQuery(admin)
          .eq("tag", AUTO_INTRO_PENDING_TAG)
          .in("opportunity_id", roleChunk)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(from, to)
      ))
    );
  }
  if (!pendingTags.length) return { countByRoleId, pairs, sinceByPair };

  const talentIds = Array.from(
    new Set(pendingTags.map((tag) => tag.talent_id))
  );
  const tags: TagRow[] = [];
  const liveTalentIds = new Set<string>();
  for (const talentChunk of chunks(talentIds)) {
    const { data, error } = await admin
      .from("talent_users")
      .select("user_id")
      .in("user_id", talentChunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ user_id: string }>) {
      liveTalentIds.add(row.user_id);
    }
    for (const roleChunk of chunks(ids)) {
      tags.push(
        ...(await readAll<TagRow>((from, to) =>
          tagQuery(admin)
            .in("opportunity_id", roleChunk)
            .in("talent_id", talentChunk)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .range(from, to)
        ))
      );
    }
  }

  const tagsByPair = new Map<string, TagRow[]>();
  for (const tag of tags) {
    const key = `${tag.opportunity_id}:${tag.talent_id}`;
    tagsByPair.set(key, [...(tagsByPair.get(key) ?? []), tag]);
  }
  for (const [key, pairTags] of tagsByPair) {
    const [roleId, talentId] = key.split(":");
    if (!roleId || !talentId || !liveTalentIds.has(talentId)) continue;
    const latest = getLatestAutoIntroInternalStage(pairTags);
    if (
      String(latest?.tag ?? "")
        .replace(/\s+/g, " ")
        .trim() !== AUTO_INTRO_PENDING_TAG
    ) {
      continue;
    }
    pairs.add(key);
    sinceByPair.set(key, latest!.updated_at || latest!.created_at);
    countByRoleId.set(roleId, (countByRoleId.get(roleId) ?? 0) + 1);
  }
  return { countByRoleId, pairs, sinceByPair };
}
