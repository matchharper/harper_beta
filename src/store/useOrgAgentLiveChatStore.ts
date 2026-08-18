import { create } from "zustand";
import type {
  OrgAgentMessage,
  OrgAgentMode,
  OrgAgentThinkingLog,
} from "@/lib/org/agent/types";

export type OrgAgentLiveChat = {
  assistantStatus: "idle" | "pending" | "streaming";
  error: string | null;
  isStreaming: boolean;
  optimisticUserMessage: OrgAgentMessage | null;
  streamingText: string;
  thinkingLogs: OrgAgentThinkingLog[];
};

export const EMPTY_ORG_AGENT_LIVE_CHAT: OrgAgentLiveChat = {
  assistantStatus: "idle",
  error: null,
  isStreaming: false,
  optimisticUserMessage: null,
  streamingText: "",
  thinkingLogs: [],
};

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
  finish: (key: string) => void;
  move: (fromKey: string, toKey: string) => void;
  patch: (key: string, patch: Partial<OrgAgentLiveChat>) => void;
  start: (key: string, optimisticUserMessage: OrgAgentMessage) => void;
};

export const useOrgAgentLiveChatStore = create<OrgAgentLiveChatStoreState>(
  (set) => ({
    chats: {},
    finish: (key) =>
      set((state) => {
        const chat = state.chats[key];
        if (!chat) return state;
        if (!chat.error) {
          const { [key]: _removed, ...chats } = state.chats;
          return { chats };
        }
        return {
          chats: {
            ...state.chats,
            [key]: { ...EMPTY_ORG_AGENT_LIVE_CHAT, error: chat.error },
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
    start: (key, optimisticUserMessage) =>
      set((state) => ({
        chats: {
          ...state.chats,
          [key]: {
            ...EMPTY_ORG_AGENT_LIVE_CHAT,
            assistantStatus: "pending",
            isStreaming: true,
            optimisticUserMessage,
          },
        },
      })),
  })
);
