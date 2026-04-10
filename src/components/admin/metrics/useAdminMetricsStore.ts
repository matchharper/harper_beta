import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_ADMIN_EXCLUDED_EMAILS } from "@/lib/adminEmailExclusions";
import { normalizeExcludedEmails } from "@/lib/adminMetrics/utils";

type AdminMetricsStoreState = {
  excludedEmails: string[];
  setExcludedEmails: (value: string[] | string) => void;
  resetExcludedEmails: () => void;
};

export const useAdminMetricsStore = create<AdminMetricsStoreState>()(
  persist(
    (set) => ({
      excludedEmails: DEFAULT_ADMIN_EXCLUDED_EMAILS,
      setExcludedEmails: (value) =>
        set({
          excludedEmails: normalizeExcludedEmails(value),
        }),
      resetExcludedEmails: () =>
        set({ excludedEmails: DEFAULT_ADMIN_EXCLUDED_EMAILS }),
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
