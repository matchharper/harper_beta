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
