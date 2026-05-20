import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { CareerMessage } from "@/components/career/types";

type LatestAssistantMessage = {
  key: string;
};

type NoticeSnapshot = {
  initialized: boolean;
  lastSeenKey: string | null;
  promptKey: string | null;
  promptVisibleUntil: number | null;
  unreadKey: string | null;
};

const EMPTY_NOTICE_SNAPSHOT: NoticeSnapshot = {
  initialized: false,
  lastSeenKey: null,
  promptKey: null,
  promptVisibleUntil: null,
  unreadKey: null,
};

const DEFAULT_PROMPT_VISIBLE_MS = 4800;

const getLatestAssistantMessage = (
  messages: CareerMessage[]
): LatestAssistantMessage | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || message.typing) continue;
    if (!message.content.trim()) continue;

    return {
      key: String(message.id),
    };
  }

  return null;
};

class MobileChatNoticeStore {
  private snapshot = EMPTY_NOTICE_SNAPSHOT;
  private listeners = new Set<() => void>();

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  updateLatest(args: {
    latestKey: string | null;
    open: boolean;
    visibleMs: number;
  }) {
    const { latestKey, open, visibleMs } = args;

    if (!latestKey) {
      if (!this.snapshot.initialized) {
        this.setSnapshot({ ...this.snapshot, initialized: true });
      }
      return;
    }

    if (!this.snapshot.initialized) {
      this.setSnapshot({
        ...this.snapshot,
        initialized: true,
        lastSeenKey: latestKey,
      });
      return;
    }

    if (open) {
      this.setSnapshot({
        ...this.snapshot,
        lastSeenKey: latestKey,
        promptKey: null,
        promptVisibleUntil: null,
        unreadKey: null,
      });
      return;
    }

    if (latestKey === this.snapshot.lastSeenKey) return;

    this.setSnapshot({
      ...this.snapshot,
      lastSeenKey: latestKey,
      promptKey: latestKey,
      promptVisibleUntil: Date.now() + visibleMs,
      unreadKey: latestKey,
    });
  }

  markRead() {
    if (!this.snapshot.unreadKey && !this.snapshot.promptKey) return;

    this.setSnapshot({
      ...this.snapshot,
      promptKey: null,
      promptVisibleUntil: null,
      unreadKey: null,
    });
  }

  expirePrompt(promptKey: string) {
    if (this.snapshot.promptKey !== promptKey) return;

    this.setSnapshot({
      ...this.snapshot,
      promptKey: null,
      promptVisibleUntil: null,
    });
  }

  private setSnapshot(nextSnapshot: NoticeSnapshot) {
    if (
      this.snapshot.initialized === nextSnapshot.initialized &&
      this.snapshot.lastSeenKey === nextSnapshot.lastSeenKey &&
      this.snapshot.promptKey === nextSnapshot.promptKey &&
      this.snapshot.promptVisibleUntil === nextSnapshot.promptVisibleUntil &&
      this.snapshot.unreadKey === nextSnapshot.unreadKey
    ) {
      return;
    }

    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function useCareerMobileChatNotice(args: {
  messages: CareerMessage[];
  open: boolean;
  promptVisibleMs?: number;
}) {
  const { messages, open, promptVisibleMs = DEFAULT_PROMPT_VISIBLE_MS } = args;
  const store = useMemo(() => new MobileChatNoticeStore(), []);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  const latestAssistantMessage = useMemo(
    () => getLatestAssistantMessage(messages),
    [messages]
  );
  const latestKey = latestAssistantMessage?.key ?? null;

  useEffect(() => {
    store.updateLatest({
      latestKey,
      open,
      visibleMs: promptVisibleMs,
    });
  }, [latestKey, open, promptVisibleMs, store]);

  useEffect(() => {
    const promptKey = snapshot.promptKey;
    const visibleUntil = snapshot.promptVisibleUntil;
    if (!promptKey || !visibleUntil) return;

    const timeoutId = window.setTimeout(
      () => store.expirePrompt(promptKey),
      Math.max(0, visibleUntil - Date.now())
    );

    return () => window.clearTimeout(timeoutId);
  }, [snapshot.promptKey, snapshot.promptVisibleUntil, store]);

  const markRead = useCallback(() => {
    store.markRead();
  }, [store]);

  return {
    hasUnread: Boolean(snapshot.unreadKey),
    markRead,
    showPrompt: Boolean(snapshot.promptKey && snapshot.unreadKey),
  };
}
