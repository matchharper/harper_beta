import { extractCareerDocumentLinks } from "@/lib/career/documentLinks";
/** Keep response attachments next to their parent regardless of event arrival order. */
export function orderApplicationMessages<
  T extends {
    id: string | number;
    createdAt: string;
    applicationStartOffer?: { replyId?: number };
  },
>(messages: T[]): T[] {
  const loadedIds = new Set(messages.map((m) => String(m.id)));
  const sorted = messages
    .filter(
      (m) =>
        !m.applicationStartOffer?.replyId ||
        loadedIds.has(String(m.applicationStartOffer.replyId))
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const ids = new Set(sorted.map((m) => String(m.id)));
  const children = new Map<string, T[]>();
  for (const m of sorted) {
    const parent = m.applicationStartOffer?.replyId;
    if (parent && String(parent) !== String(m.id) && ids.has(String(parent))) {
      children.set(String(parent), [
        ...(children.get(String(parent)) ?? []),
        m,
      ]);
    }
  }
  const childIds = new Set(
    [...children.values()].flat().map((m) => String(m.id))
  );
  return sorted
    .filter((m) => !childIds.has(String(m.id)))
    .flatMap((m) => [m, ...(children.get(String(m.id)) ?? [])]);
}

/** Older saved replies predate the explicit form reference. Their exact document
 * link identifies the handoff without rewriting historical messages. */
export function attachSavedApplicationReview<T extends {
  id: string | number; role: string; content: string; createdAt: string;
  applicationReviewMessageId?: number;
}>(messages: T[], application: { messageId: number; resumeDocumentId: string; startedAt: string } | null): (T & { applicationReviewMessageId?: number })[] {
  if (!application || messages.some(message => message.applicationReviewMessageId === application.messageId)) return messages;
  const handoff = messages.find(message => message.role === "assistant"
    && Date.parse(message.createdAt) >= Date.parse(application.startedAt)
    && extractCareerDocumentLinks(message.content).documents.some(document => document.id === application.resumeDocumentId));
  return handoff ? messages.map(message => message === handoff
    ? { ...message, applicationReviewMessageId: application.messageId }
    : message) : messages;
}
