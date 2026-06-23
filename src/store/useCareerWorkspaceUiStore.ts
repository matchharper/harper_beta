import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CareerSavedHistoryDisplayMode = "list" | "board";

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

const normalizeSavedHistoryDisplayMode = (
  value: unknown
): CareerSavedHistoryDisplayMode => (value === "board" ? "board" : "list");

type CareerWorkspaceUiStoreState = {
  chatPanelWidthPct: number;
  savedHistoryDisplayMode: CareerSavedHistoryDisplayMode;
  setChatPanelWidthPct: (value: number) => void;
  setSavedHistoryDisplayMode: (value: CareerSavedHistoryDisplayMode) => void;
};

export const useCareerWorkspaceUiStore =
  create<CareerWorkspaceUiStoreState>()(
    persist(
      (set) => ({
        chatPanelWidthPct: CAREER_CHAT_PANEL_DEFAULT_WIDTH_PCT,
        savedHistoryDisplayMode: "list",
        setChatPanelWidthPct: (value) =>
          set({ chatPanelWidthPct: normalizeCareerChatPanelWidthPct(value) }),
        setSavedHistoryDisplayMode: (value) =>
          set({
            savedHistoryDisplayMode: normalizeSavedHistoryDisplayMode(value),
          }),
      }),
      {
        name: "career-workspace-ui",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          chatPanelWidthPct: state.chatPanelWidthPct,
          savedHistoryDisplayMode: state.savedHistoryDisplayMode,
        }),
        merge: (persistedState, currentState) => {
          const state =
            persistedState as Partial<CareerWorkspaceUiStoreState> | null;

          return {
            ...currentState,
            chatPanelWidthPct: normalizeCareerChatPanelWidthPct(
              state?.chatPanelWidthPct
            ),
            savedHistoryDisplayMode: normalizeSavedHistoryDisplayMode(
              state?.savedHistoryDisplayMode
            ),
          };
        },
      }
    )
  );
