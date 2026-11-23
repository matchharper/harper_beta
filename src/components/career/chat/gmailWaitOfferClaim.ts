// The offer's once-a-day bookkeeping, apart from the card so it loads without the app's clients.
const OFFER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const storageKey = (userId: string) => `harper:career-gmail-wait-offer:${userId}`;
type OfferRecord = { replyId: string; shownAt: number };
// Used when the browser refuses storage, so one tab still offers at most once a day.
const memoryRecords = new Map<string, OfferRecord>();

export function readGmailWaitOffer(userId: string): OfferRecord | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "null");
    if (value && typeof value.replyId === "string" && typeof value.shownAt === "number") return value;
  } catch {
    // Unreadable storage falls back to this tab's record.
  }
  return memoryRecords.get(userId) ?? null;
}

function writeRecord(userId: string, record: OfferRecord) {
  memoryRecords.set(userId, record);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(record));
  } catch {
    // The in-memory record still limits this tab.
  }
}

/** One reply per 24 hours owns the offer; that reply keeps it across reloads. */
export function claimGmailWaitOffer(args: { userId: string; replyId: string; active: boolean; now: number }) {
  const record = readGmailWaitOffer(args.userId);
  if (record?.replyId === args.replyId) return args.now - record.shownAt < OFFER_INTERVAL_MS;
  if (!args.active) return false;
  if (record && args.now - record.shownAt < OFFER_INTERVAL_MS) return false;
  writeRecord(args.userId, { replyId: args.replyId, shownAt: args.now });
  return true;
}

/**
 * Whether this reply shows the offer, and whether that is a new exposure to record for the Gmail card test. A reply
 * that already owns the offer (a reload, the effect running again) is not recorded again; a person who can already
 * send through Gmail is offered nothing new.
 */
export function decideGmailWaitOffer(args: { userId: string; replyId: string; active: boolean; now: number; writeConnected: boolean }) {
  const owned = readGmailWaitOffer(args.userId)?.replyId === args.replyId;
  if (args.writeConnected && !owned) return { show: false, record: false };
  const show = claimGmailWaitOffer(args);
  return { show, record: show && !owned };
}
