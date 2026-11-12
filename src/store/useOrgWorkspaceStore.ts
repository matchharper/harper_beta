import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type OrgWorkspaceStoreState = {
  hasHydrated: boolean;
  lastWorkspaceId: string;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setLastWorkspaceId: (workspaceId: string) => void;
};

function normalizeWorkspaceId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const useOrgWorkspaceStore = create<OrgWorkspaceStoreState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      lastWorkspaceId: "",
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setLastWorkspaceId: (workspaceId) =>
        set({ lastWorkspaceId: normalizeWorkspaceId(workspaceId) }),
    }),
    {
      name: "org-workspace",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        lastWorkspaceId: state.lastWorkspaceId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const state =
          persistedState as Partial<OrgWorkspaceStoreState> | null;

        return {
          ...currentState,
          lastWorkspaceId: normalizeWorkspaceId(state?.lastWorkspaceId),
          sidebarCollapsed: state?.sidebarCollapsed === true,
        };
      },
    }
  )
);
