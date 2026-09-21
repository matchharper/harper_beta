import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { CareerMessage } from "@/components/career/types";

type LatestAssistantMessage = {
  key: string;
};

type NoticeSnapshot = {
  conversationKey: string | null;
  initialized: boolean;
  lastSeenKey: string | null;
  promptKey: string | null;
  promptVisibleUntil: number | null;
  unreadKey: string | null;
};

const EMPTY_NOTICE_SNAPSHOT: NoticeSnapshot = {
  conversationKey: null,
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

export class MobileChatNoticeStore {
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
    conversationKey: string | null;
    latestKey: string | null;
    open: boolean;
    pending: boolean;
    ready: boolean;
    visibleMs: number;
  }) {
    const { conversationKey, latestKey, open, pending, ready, visibleMs } =
      args;

    if (conversationKey !== this.snapshot.conversationKey) {
      this.setSnapshot({
        ...EMPTY_NOTICE_SNAPSHOT,
        conversationKey,
        initialized: ready,
        lastSeenKey: ready ? latestKey : null,
      });
      return;
    }

    if (!ready) return;

    if (!this.snapshot.initialized) {
      this.setSnapshot({
        ...this.snapshot,
        initialized: true,
        lastSeenKey: latestKey,
      });
      return;
    }

    if (open && latestKey) {
      this.setSnapshot({
        ...this.snapshot,
        lastSeenKey: latestKey,
        promptKey: null,
        promptVisibleUntil: null,
        unreadKey: null,
      });
      return;
    }

    // A streamed text segment can stop typing while the overall turn is still
    // running tools or preparing follow-up messages. Do not announce that
    // Harper answered until the whole response has settled.
    if (pending || !latestKey) return;

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
      this.snapshot.conversationKey === nextSnapshot.conversationKey &&
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
  conversationId: string | null;
  messages: CareerMessage[];
  open: boolean;
  pending: boolean;
  promptVisibleMs?: number;
  ready: boolean;
}) {
  const {
    conversationId,
    messages,
    open,
    pending,
    promptVisibleMs = DEFAULT_PROMPT_VISIBLE_MS,
    ready,
  } = args;
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
      conversationKey: conversationId,
      latestKey,
      open,
      pending,
      ready,
      visibleMs: promptVisibleMs,
    });
  }, [conversationId, latestKey, open, pending, promptVisibleMs, ready, store]);

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
    hasUnread: !pending && Boolean(snapshot.unreadKey),
    markRead,
    showPrompt: !pending && Boolean(snapshot.promptKey && snapshot.unreadKey),
  };
}
