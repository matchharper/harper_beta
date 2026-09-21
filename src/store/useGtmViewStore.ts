import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SheetDefinition } from "@/lib/gtm/types";
export type GtmViewDraft = {
  name: string;
  definition: SheetDefinition;
  expectedVersion: number;
};
type State = {
  selected: Record<string, string>;
  drafts: Record<string, GtmViewDraft>;
  select: (account: string, id: string) => void;
  setDraft: (key: string, draft: GtmViewDraft) => void;
  clearDraft: (key: string) => void;
};
// Only view preferences live here. Business values and credentials never do.
export const useGtmViewStore = create<State>()(
  persist(
    (set) => ({
      selected: {},
      drafts: {},
      select: (account, id) =>
        set((state) => ({ selected: { ...state.selected, [account]: id } })),
      setDraft: (key, draft) =>
        set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
      clearDraft: (key) =>
        set((state) => {
          const drafts = { ...state.drafts };
          delete drafts[key];
          return { drafts };
        }),
    }),
    {
      name: "harper-gtm-views-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
    }
  )
);
