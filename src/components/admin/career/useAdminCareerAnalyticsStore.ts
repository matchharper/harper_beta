import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AdminCareerAnalyticsDateRange = {
  endDate: string;
  startDate: string;
};

export const emptyAdminCareerAnalyticsDateRange: AdminCareerAnalyticsDateRange =
  {
    endDate: "",
    startDate: "",
  };

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateOnly = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : "";
};

const normalizeDateRange = (
  value: Partial<AdminCareerAnalyticsDateRange>
): AdminCareerAnalyticsDateRange => ({
  endDate: normalizeDateOnly(value.endDate),
  startDate: normalizeDateOnly(value.startDate),
});

type AdminCareerAnalyticsStoreState = {
  dateRange: AdminCareerAnalyticsDateRange;
  hasHydrated: boolean;
  resetDateRange: () => void;
  setDateRange: (value: AdminCareerAnalyticsDateRange) => void;
  setHasHydrated: (value: boolean) => void;
};

export const useAdminCareerAnalyticsStore =
  create<AdminCareerAnalyticsStoreState>()(
    persist(
      (set) => ({
        dateRange: emptyAdminCareerAnalyticsDateRange,
        hasHydrated: false,
        resetDateRange: () =>
          set({ dateRange: emptyAdminCareerAnalyticsDateRange }),
        setDateRange: (value) => set({ dateRange: normalizeDateRange(value) }),
        setHasHydrated: (value) => set({ hasHydrated: value }),
      }),
      {
        name: "admin-career-analytics-settings",
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
        partialize: (state) => ({
          dateRange: state.dateRange,
        }),
        storage: createJSONStorage(() => localStorage),
      }
    )
  );
