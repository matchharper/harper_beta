import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalizeExcludedEmails } from "@/lib/adminMetrics/utils";

type AdminMetricsStoreState = {
  excludedEmails: string[];
  setExcludedEmails: (value: string[] | string) => void;
  clearExcludedEmails: () => void;
};

export const useAdminMetricsStore = create<AdminMetricsStoreState>()(
  persist(
    (set) => ({
      excludedEmails: [],
      setExcludedEmails: (value) =>
        set({
          excludedEmails: normalizeExcludedEmails(value),
        }),
      clearExcludedEmails: () => set({ excludedEmails: [] }),
    }),
    {
      name: "admin-metrics-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        excludedEmails: state.excludedEmails,
      }),
    }
  )
);
