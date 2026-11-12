import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CareerRunSelection = {
  selectedUserIds: Partial<Record<string, string>>;
  selectUser: (operatorId: string, userId: string | null) => void;
};

export const useOpsCareerRunSelectionStore = create<CareerRunSelection>()(
  persist(
    (set) => ({
      selectedUserIds: {},
      selectUser: (operatorId, userId) =>
        set(({ selectedUserIds }) => {
          const next = { ...selectedUserIds };
          if (userId) next[operatorId] = userId;
          else delete next[operatorId];
          return { selectedUserIds: next };
        }),
    }),
    {
      name: "ops-career-run-selection",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ selectedUserIds }) => ({ selectedUserIds }),
    }
  )
);
