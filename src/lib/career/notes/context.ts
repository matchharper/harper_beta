import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { listNotes, NOTE_LIST_SIZE, readMatchingWorkNotes } from "./store";
import { formatMatchingWorkNote, formatNoteIndex } from "./format";
import { readExplorationSummary } from "./exploration";

type Owner = { admin: TalentAdminClient; userId: string };

/** The notes index of the base context: the most recently edited notes and the total. */
export async function readNoteIndexContext(owner: Owner) {
  const page = await listNotes(owner.admin, { userId: owner.userId, limit: NOTE_LIST_SIZE });
  return formatNoteIndex(page);
}

/**
 * The work note of a matching this request continues and that matching's
 * exploration summary, so the request starts where the last one stopped.
 */
export async function readMatchingWorkNoteContext(owner: Owner, matchingId: string, options: { exploration?: boolean } = {}) {
  const [notes, exploration, matching] = await Promise.all([
    readMatchingWorkNotes(owner.admin, { userId: owner.userId, matchingId }),
    options.exploration === false ? undefined
      : readExplorationSummary(owner.admin, { userId: owner.userId, matchingId }).catch(() => undefined),
    (owner.admin.from("talent_matchings" as never) as any).select("title")
      .eq("id", matchingId).eq("talent_id", owner.userId).maybeSingle(),
  ]);
  return formatMatchingWorkNote({
    matchingId,
    matchingTitle: matching.data?.title ?? null,
    latest: notes.latest,
    others: notes.others,
    exploration,
  });
}
