import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT = 28;
export const ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT = 72;
export const ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT = 42;

const clampChatPanelWidthPct = (value: number) =>
  Math.min(
    ORG_ROLE_CHAT_PANEL_MAX_WIDTH_PCT,
    Math.max(ORG_ROLE_CHAT_PANEL_MIN_WIDTH_PCT, value)
  );

export const normalizeOrgRoleChatPanelWidthPct = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT;
  return Math.round(clampChatPanelWidthPct(numeric) * 100) / 100;
};

type OrgRoleCreationUiStoreState = {
  chatPanelWidthPct: number;
  setChatPanelWidthPct: (value: number) => void;
};

export const useOrgRoleCreationUiStore = create<OrgRoleCreationUiStoreState>()(
  persist(
    (set) => ({
      chatPanelWidthPct: ORG_ROLE_CHAT_PANEL_DEFAULT_WIDTH_PCT,
      setChatPanelWidthPct: (value) =>
        set({ chatPanelWidthPct: normalizeOrgRoleChatPanelWidthPct(value) }),
    }),
    {
      name: "org-role-creation-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        chatPanelWidthPct: state.chatPanelWidthPct,
      }),
      merge: (persistedState, currentState) => {
        const state =
          persistedState as Partial<OrgRoleCreationUiStoreState> | null;

        return {
          ...currentState,
          chatPanelWidthPct: normalizeOrgRoleChatPanelWidthPct(
            state?.chatPanelWidthPct
          ),
        };
      },
    }
  )
);
