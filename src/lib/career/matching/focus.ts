import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

/** The matching ID when it belongs to this user; otherwise null. */
export async function readOwnedMatchingId(owner: { admin: TalentAdminClient; userId: string }, id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data, error } = await (owner.admin.from("talent_matchings" as never) as any)
    .select("id").eq("talent_id", owner.userId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** The matching a successful tool call worked on, which becomes the matching this request works on. */
export function observedMatchingId(name: string, result: unknown): string | undefined {
  const row = object(result);
  // The executor reports the matching a linked search receipt belongs to.
  if (typeof row.researchMatchingId === "string") return row.researchMatchingId;
  if (["web_search", "open_url", "get_role_context", "read_companies", "search_connected_gmail"].includes(name)) return;
  if (name === "upsert_note" || name === "read_notes") return;
  if (!["read_matching", "upsert_matching", "search_opportunities", "upsert_opportunities"].includes(name)) return;
  const id = row.workNoteMatchingId ?? row.matching?.id ?? row.matchingId;
  return typeof id === "string" ? id : undefined;
}
