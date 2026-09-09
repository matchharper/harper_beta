import { createHash } from "node:crypto";
import { GMAIL_CAREER_HISTORY_ORIGIN_TYPE } from "@/lib/integrations/gmailCareerHistoryCore";
import type { GmailCareerMemoryEntry } from "@/lib/integrations/gmailCareerHistoryCore";
import type {
  TalentContextDirectChange,
  TalentContextRow,
} from "@/lib/talentOnboarding/talentContexts";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

const GMAIL_CAREER_MEMORY_SOURCE_REFS_FILTER = JSON.stringify([
  { type: GMAIL_CAREER_HISTORY_ORIGIN_TYPE },
]);

export function fetchLatestGmailCareerMemory(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  return (args.admin.from("talent_contexts" as never) as any)
    .select("updated_at")
    .eq("talent_id", args.talentId)
    .eq("collection", "memory")
    .is("deleted_at", null)
    .filter("source_refs", "cs", GMAIL_CAREER_MEMORY_SOURCE_REFS_FILTER)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function gmailCareerMemoryOriginId(company: string) {
  return createHash("sha256")
    .update(company.normalize("NFKC").trim().toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 40);
}

export function getGmailCareerMemoryOriginId(row: TalentContextRow) {
  return (
    row.source_refs.find(
      (source) =>
        source.type === GMAIL_CAREER_HISTORY_ORIGIN_TYPE && source.originId
    )?.originId ?? null
  );
}

export function buildGmailCareerMemoryChanges(args: {
  entries: GmailCareerMemoryEntry[];
  existingRows: TalentContextRow[];
}): TalentContextDirectChange[] {
  const existingByOriginId = new Map<string, TalentContextRow[]>();
  for (const row of args.existingRows) {
    const originId = getGmailCareerMemoryOriginId(row);
    if (!originId) continue;
    const rows = existingByOriginId.get(originId) ?? [];
    rows.push(row);
    existingByOriginId.set(originId, rows);
  }

  const changes: TalentContextDirectChange[] = [];
  const retainedIds = new Set<number>();
  for (const entry of args.entries) {
    const originId = gmailCareerMemoryOriginId(entry.company);
    const existing = existingByOriginId.get(originId)?.shift();
    if (!existing) {
      changes.push({
        collection: "memory",
        content: entry.content,
        importance: 2,
        op: "add",
        sourceRefs: [{ originId, type: GMAIL_CAREER_HISTORY_ORIGIN_TYPE }],
      });
      continue;
    }
    retainedIds.add(existing.id);
    if (existing.content !== entry.content || existing.importance !== 2) {
      changes.push({
        content: entry.content,
        expectedRevision: existing.revision,
        id: existing.id,
        importance: 2,
        op: "update",
      });
    }
  }

  for (const row of args.existingRows) {
    if (!retainedIds.has(row.id)) {
      changes.push({
        expectedRevision: row.revision,
        id: row.id,
        op: "delete",
      });
    }
  }
  return changes;
}
