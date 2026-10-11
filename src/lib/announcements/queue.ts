export const MAX_ANNOUNCEMENTS_PER_VISIT = 3;

export type AnnouncementEntry = {
  id: string;
  publishedAt: string;
};

export type AnnouncementReceipts = {
  listSeen: (userId: string) => Promise<ReadonlySet<string>>;
  /** Atomically returns true only for the first view by this account. */
  claim: (userId: string, announcementId: string) => Promise<boolean>;
};

export async function createAnnouncementQueue<T extends AnnouncementEntry>({
  announcements,
  userId,
  receipts,
  shownThisVisit,
  now = Date.now(),
}: {
  announcements: readonly T[];
  userId: string;
  receipts: AnnouncementReceipts;
  shownThisVisit: Set<string>;
  now?: number;
}) {
  const seen = await receipts.listSeen(userId);
  const candidates = announcements
    .filter(
      (item) =>
        Date.parse(item.publishedAt) <= now &&
        !seen.has(item.id) &&
        !shownThisVisit.has(item.id)
    )
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.publishedAt) - Date.parse(b.publishedAt) ||
        a.id.localeCompare(b.id)
    );
  let pending: Promise<T | null> | null = null;

  async function claimNext() {
    while (
      candidates.length > 0 &&
      shownThisVisit.size < MAX_ANNOUNCEMENTS_PER_VISIT
    ) {
      const next = candidates.shift()!;
      // Another tab/device may have displayed it since listSeen completed.
      if (await receipts.claim(userId, next.id)) {
        shownThisVisit.add(next.id);
        return next;
      }
    }
    return null;
  }

  return {
    next() {
      // Repeated close events cannot consume two notices at once.
      if (!pending) {
        pending = claimNext().finally(() => {
          pending = null;
        });
      }
      return pending;
    },
  };
}
