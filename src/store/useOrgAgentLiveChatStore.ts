import { create } from "zustand";
import type {
  OrgAgentDraftSnapshot,
  OrgAgentQueuedMessage,
} from "@/lib/org/agent/chatQueue";
import type {
  OrgAgentMessage,
  OrgAgentMode,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";

export type OrgAgentLiveChat = {
  assistantStatus: "idle" | "pending" | "streaming";
  error: string | null;
  isStreaming: boolean;
  isCreatingRole: boolean;
  optimisticUserMessage: OrgAgentMessage | null;
  /** The team pressed stop and the request is being cancelled. */
  stopping: boolean;
  streamingText: string;
  thinkingLogs: OrgAgentThinkingLog[];
};

/** A short line in the conversation about a turn, shown on this screen only. */
export type OrgAgentChatNotice = {
  /** The last saved message when it happened; the line sits right after it. */
  afterMessageId: number | null;
  kind: "stopped";
};

export const EMPTY_ORG_AGENT_LIVE_CHAT: OrgAgentLiveChat = {
  assistantStatus: "idle",
  error: null,
  isStreaming: false,
  isCreatingRole: false,
  optimisticUserMessage: null,
  stopping: false,
  streamingText: "",
  thinkingLogs: [],
};

export const EMPTY_ORG_AGENT_QUEUE: OrgAgentQueuedMessage[] = [];
export const EMPTY_ORG_AGENT_RESTORES: OrgAgentDraftSnapshot[] = [];

export function getOrgAgentLiveChatKey(args: {
  mode: OrgAgentMode;
  roleId?: string | null;
  workspaceId?: string | null;
}) {
  const workspaceId = args.workspaceId?.trim() ?? "";
  const roleId = args.roleId?.trim() || "new";
  return `${args.mode}:${workspaceId}:${roleId}`;
}

type OrgAgentLiveChatStoreState = {
  chats: Record<string, OrgAgentLiveChat>;
  /** Messages waiting for the current reply to end, oldest first. Kept apart from `chats`, which a finished turn clears. */
  queues: Record<string, OrgAgentQueuedMessage[]>;
  /** Drafts handed back to the input (a send that never reached the conversation, a message taken back). */
  restores: Record<string, OrgAgentDraftSnapshot[]>;
  notices: Record<string, OrgAgentChatNotice | undefined>;
  finish: (key: string) => void;
  move: (fromKey: string, toKey: string) => void;
  patch: (key: string, patch: Partial<OrgAgentLiveChat>) => void;
  start: (key: string, optimisticUserMessage: OrgAgentMessage, isCreatingRole?: boolean) => void;
  enqueue: (key: string, item: OrgAgentQueuedMessage) => void;
  /** Removes and returns the oldest waiting message. */
  dequeue: (key: string) => OrgAgentQueuedMessage | undefined;
  /** Removes one waiting message; returns it if it was still waiting. */
  removeQueued: (key: string, id: string) => OrgAgentQueuedMessage | undefined;
  /** Removes and returns every waiting message. */
  takeQueue: (key: string) => OrgAgentQueuedMessage[];
  pushRestores: (key: string, drafts: OrgAgentDraftSnapshot[]) => void;
  /** Removes and returns the drafts waiting to go back to the input. */
  takeRestores: (key: string) => OrgAgentDraftSnapshot[];
  setNotice: (key: string, notice: OrgAgentChatNotice | null) => void;
};

function withoutKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export const useOrgAgentLiveChatStore = create<OrgAgentLiveChatStoreState>(
  (set, get) => ({
    chats: {},
    queues: {},
    restores: {},
    notices: {},
    finish: (key) =>
      set((state) => {
        const chat = state.chats[key];
        if (!chat) return state;
        if (!chat.error) {
          return { chats: withoutKey(state.chats, key) };
        }
        return {
          chats: {
            ...state.chats,
            [key]: {
              ...EMPTY_ORG_AGENT_LIVE_CHAT,
              error: chat.error,
              isCreatingRole: chat.isCreatingRole,
              optimisticUserMessage: chat.isCreatingRole ? chat.optimisticUserMessage : null,
            },
          },
        };
      }),
    move: (fromKey, toKey) =>
      set((state) => {
        if (fromKey === toKey || !state.chats[fromKey]) return state;
        const { [fromKey]: chat, ...chats } = state.chats;
        return { chats: { ...chats, [toKey]: chat } };
      }),
    patch: (key, patch) =>
      set((state) => ({
        chats: {
          ...state.chats,
          [key]: { ...(state.chats[key] ?? EMPTY_ORG_AGENT_LIVE_CHAT), ...patch },
        },
      })),
    start: (key, optimisticUserMessage, isCreatingRole = false) =>
      set((state) => ({
        chats: {
          ...state.chats,
          [key]: {
            ...EMPTY_ORG_AGENT_LIVE_CHAT,
            assistantStatus: "pending",
            isStreaming: true,
            isCreatingRole,
            optimisticUserMessage,
          },
        },
      })),
    enqueue: (key, item) =>
      set((state) => ({
        queues: { ...state.queues, [key]: [...(state.queues[key] ?? []), item] },
      })),
    dequeue: (key) => {
      const [next, ...rest] = get().queues[key] ?? [];
      if (!next) return undefined;
      set((state) => ({
        queues: rest.length
          ? { ...state.queues, [key]: rest }
          : withoutKey(state.queues, key),
      }));
      return next;
    },
    removeQueued: (key, id) => {
      const queue = get().queues[key] ?? [];
      const removed = queue.find((item) => item.id === id);
      if (!removed) return undefined;
      const rest = queue.filter((item) => item.id !== id);
      set((state) => ({
        queues: rest.length
          ? { ...state.queues, [key]: rest }
          : withoutKey(state.queues, key),
      }));
      return removed;
    },
    takeQueue: (key) => {
      const queue = get().queues[key] ?? [];
      if (queue.length) set((state) => ({ queues: withoutKey(state.queues, key) }));
      return queue;
    },
    pushRestores: (key, drafts) => {
      if (!drafts.length) return;
      set((state) => ({
        restores: {
          ...state.restores,
          [key]: [...(state.restores[key] ?? []), ...drafts],
        },
      }));
    },
    takeRestores: (key) => {
      const drafts = get().restores[key] ?? [];
      if (drafts.length) set((state) => ({ restores: withoutKey(state.restores, key) }));
      return drafts;
    },
    setNotice: (key, notice) =>
      set((state) => ({
        notices: notice
          ? { ...state.notices, [key]: notice }
          : withoutKey(state.notices, key),
      })),
  })
);
