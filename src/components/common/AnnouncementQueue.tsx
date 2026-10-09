import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnnouncementCard,
  type AnnouncementCardAction,
} from "@/components/common/AnnouncementCard";
import {
  createAnnouncementQueue,
  MAX_ANNOUNCEMENTS_PER_VISIT,
  type AnnouncementEntry,
  type AnnouncementReceipts,
} from "@/lib/announcements/queue";
import { announcementReceipts } from "@/lib/announcements/receipts";

export type Announcement = AnnouncementEntry & {
  title: string;
  description: ReactNode;
  media?: ReactNode;
  action?: AnnouncementCardAction;
};

// A visit lasts for this browser document, including client-side navigation.
// These sets only change in client effects; durable account receipts live in DB.
const visitReceipts = new Map<string, Set<string>>();

export function AnnouncementQueue({
  userId,
  announcements,
  closeLabel,
  receipts = announcementReceipts,
}: {
  userId: string;
  announcements: readonly Announcement[];
  closeLabel: string;
  receipts?: AnnouncementReceipts;
}) {
  const [current, setCurrent] = useState<{ userId: string; id: string } | null>(
    null
  );
  const advanceRef = useRef<(() => void) | null>(null);
  // Locale/copy changes update the visible card without starting a new queue.
  const catalogRef = useRef(announcements);
  useEffect(() => {
    catalogRef.current = announcements;
  }, [announcements]);

  useEffect(() => {
    let cancelled = false;
    let advancing = false;
    let started = false;
    const shownThisVisit = visitReceipts.get(userId) ?? new Set<string>();
    visitReceipts.set(userId, shownThisVisit);
    if (shownThisVisit.size >= MAX_ANNOUNCEMENTS_PER_VISIT) return;

    const start = async () => {
      if (started || document.visibilityState !== "visible") return;
      started = true;
      try {
        const queue = await createAnnouncementQueue({
          announcements: catalogRef.current,
          userId,
          receipts,
          shownThisVisit,
        });
        if (cancelled) return;

        const advance = async () => {
          if (advancing || cancelled) return;
          advancing = true;
          setCurrent(null);
          try {
            const next = await queue.next();
            if (!cancelled && next) setCurrent({ userId, id: next.id });
          } catch (error) {
            console.warn("[announcements] Could not record view", error);
          } finally {
            advancing = false;
          }
        };
        advanceRef.current = () => void advance();
        await advance();
      } catch (error) {
        // Optional notices never block the rest of the workspace.
        console.warn("[announcements] Could not load notices", error);
      }
    };
    const onVisibilityChange = () => void start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    void start();
    return () => {
      cancelled = true;
      advanceRef.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [receipts, userId]);

  const announcement =
    current?.userId === userId
      ? announcements.find((item) => item.id === current.id)
      : undefined;

  return (
    <AnnouncementCard
      open={Boolean(announcement)}
      title={announcement?.title ?? ""}
      media={announcement?.media}
      action={announcement?.action}
      closeLabel={closeLabel}
      onClose={() => advanceRef.current?.()}
    >
      {announcement?.description}
    </AnnouncementCard>
  );
}
