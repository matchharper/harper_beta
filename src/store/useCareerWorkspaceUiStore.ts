import type { CareerConversationVersion } from "@/lib/career/conversationVersion";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CareerHistoryOpportunity } from "@/components/career/types";

export const CAREER_CHAT_PANEL_MIN_WIDTH_PCT = 34;
export const CAREER_CHAT_PANEL_MAX_WIDTH_PCT = 62;
export const CAREER_CHAT_PANEL_DEFAULT_WIDTH_PCT = 52;

const clampChatPanelWidthPct = (value: number) =>
  Math.min(
    CAREER_CHAT_PANEL_MAX_WIDTH_PCT,
    Math.max(CAREER_CHAT_PANEL_MIN_WIDTH_PCT, value)
  );

export const normalizeCareerChatPanelWidthPct = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return CAREER_CHAT_PANEL_DEFAULT_WIDTH_PCT;
  return Math.round(clampChatPanelWidthPct(numeric) * 100) / 100;
};

type CareerWorkspaceUiStoreState = {
  lastMyOpportunitiesTab: "saved" | "applied" | "hidden" | "archived";
  setLastMyOpportunitiesTab: (
    tab: "saved" | "applied" | "hidden" | "archived"
  ) => void;
  conversationVersion: CareerConversationVersion;
  setConversationVersion: (version: CareerConversationVersion) => void;
  chatPanelWidthPct: number;
  desktopSidebarCollapsed: boolean;
  companyJobsOpportunity: CareerHistoryOpportunity | null;
  companyJobsOnOpenChat: (() => void) | null;
  setCompanyJobsOpportunity: (
    item: CareerHistoryOpportunity | null,
    onOpenChat?: () => void
  ) => void;
  desktopRoleActionOpportunity: CareerHistoryOpportunity | null;
  desktopRoleActionScope: "role" | "company";
  setChatPanelWidthPct: (value: number) => void;
  setDesktopSidebarCollapsed: (collapsed: boolean) => void;
  setDesktopRoleActionOpportunity: (
    opportunity: CareerHistoryOpportunity | null,
    scope?: "role" | "company"
  ) => void;
};

export const useCareerWorkspaceUiStore = create<CareerWorkspaceUiStoreState>()(
  persist(
    (set) => ({
      lastMyOpportunitiesTab: "saved",
      setLastMyOpportunitiesTab: (lastMyOpportunitiesTab) =>
        set({ lastMyOpportunitiesTab }),
      conversationVersion: "professional",
      setConversationVersion: (conversationVersion) => set({ conversationVersion }),
      chatPanelWidthPct: CAREER_CHAT_PANEL_DEFAULT_WIDTH_PCT,
      desktopSidebarCollapsed: false,
      companyJobsOpportunity: null,
      companyJobsOnOpenChat: null,
      setCompanyJobsOpportunity: (item, onOpenChat) =>
        set({
          companyJobsOpportunity: item,
          companyJobsOnOpenChat: item ? (onOpenChat ?? null) : null,
        }),
      desktopRoleActionOpportunity: null,
      desktopRoleActionScope: "role",
      setChatPanelWidthPct: (value) =>
        set({ chatPanelWidthPct: normalizeCareerChatPanelWidthPct(value) }),
      setDesktopSidebarCollapsed: (collapsed) =>
        set({ desktopSidebarCollapsed: collapsed }),
      setDesktopRoleActionOpportunity: (opportunity, scope = "role") =>
        set({
          desktopRoleActionOpportunity: opportunity,
          desktopRoleActionScope: scope,
        }),
    }),
    {
      name: "career-workspace-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lastMyOpportunitiesTab: state.lastMyOpportunitiesTab,
        conversationVersion: state.conversationVersion,
        chatPanelWidthPct: state.chatPanelWidthPct,
        desktopSidebarCollapsed: state.desktopSidebarCollapsed,
      }),
      merge: (persistedState, currentState) => {
        const state =
          persistedState as Partial<CareerWorkspaceUiStoreState> | null;

        return {
          ...currentState,
          conversationVersion: state?.conversationVersion === "friendly" ? "friendly" : "professional",
          lastMyOpportunitiesTab:
            state?.lastMyOpportunitiesTab === "applied" ||
            state?.lastMyOpportunitiesTab === "hidden" ||
            state?.lastMyOpportunitiesTab === "archived"
              ? state.lastMyOpportunitiesTab
              : "saved",
          chatPanelWidthPct: normalizeCareerChatPanelWidthPct(
            state?.chatPanelWidthPct
          ),
          desktopSidebarCollapsed: state?.desktopSidebarCollapsed === true,
        };
      },
    }
  )
);
