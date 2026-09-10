import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type OpsOfficialJobsStatusFilter = "all" | "published" | "draft";
export type OpsOfficialJobsLinkedinFilter = "all" | "published" | "unpublished";
export type OpsOfficialJobsLocationFilter =
  | "all"
  | "kr"
  | "jp"
  | "us"
  | "uk"
  | "sg"
  | "th"
  | "au";

export type OpsOfficialJobsStoredFilters = {
  jobFilter: OpsOfficialJobsStatusFilter;
  linkedinFilter: OpsOfficialJobsLinkedinFilter;
  locationFilter: OpsOfficialJobsLocationFilter;
  query: string;
};

type OpsOfficialJobsFilterStoreState = OpsOfficialJobsStoredFilters & {
  hasHydrated: boolean;
  setHasHydrated: (hasHydrated: boolean) => void;
  setJobFilter: (filter: OpsOfficialJobsStatusFilter) => void;
  setLinkedinFilter: (filter: OpsOfficialJobsLinkedinFilter) => void;
  setLocationFilter: (filter: OpsOfficialJobsLocationFilter) => void;
  setQuery: (query: string) => void;
};

const DEFAULT_FILTERS: OpsOfficialJobsStoredFilters = {
  jobFilter: "all",
  linkedinFilter: "all",
  locationFilter: "all",
  query: "",
};

function normalizeJobFilter(value: unknown): OpsOfficialJobsStatusFilter {
  if (value === "published" || value === "draft") return value;
  return "all";
}

function normalizeLinkedinFilter(
  value: unknown
): OpsOfficialJobsLinkedinFilter {
  if (value === "published" || value === "unpublished") return value;
  return "all";
}

function normalizeLocationFilter(
  value: unknown
): OpsOfficialJobsLocationFilter {
  if (
    value === "kr" ||
    value === "jp" ||
    value === "us" ||
    value === "uk" ||
    value === "sg" ||
    value === "th" ||
    value === "au"
  ) {
    return value;
  }
  return "all";
}

export function normalizeOpsOfficialJobsStoredFilters(
  value: Partial<OpsOfficialJobsStoredFilters> | null | undefined
): OpsOfficialJobsStoredFilters {
  return {
    jobFilter: normalizeJobFilter(value?.jobFilter),
    linkedinFilter: normalizeLinkedinFilter(value?.linkedinFilter),
    locationFilter: normalizeLocationFilter(value?.locationFilter),
    query: typeof value?.query === "string" ? value.query : "",
  };
}

export const useOpsOfficialJobsFilterStore =
  create<OpsOfficialJobsFilterStoreState>()(
    persist(
      (set) => ({
        ...DEFAULT_FILTERS,
        hasHydrated: false,
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
        setJobFilter: (jobFilter) =>
          set({ jobFilter: normalizeJobFilter(jobFilter) }),
        setLinkedinFilter: (linkedinFilter) =>
          set({ linkedinFilter: normalizeLinkedinFilter(linkedinFilter) }),
        setLocationFilter: (locationFilter) =>
          set({ locationFilter: normalizeLocationFilter(locationFilter) }),
        setQuery: (query) => set({ query }),
      }),
      {
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...normalizeOpsOfficialJobsStoredFilters(
            persistedState as Partial<OpsOfficialJobsStoredFilters> | null
          ),
        }),
        name: "ops-official-jobs-filters",
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
        partialize: (state) => ({
          jobFilter: state.jobFilter,
          linkedinFilter: state.linkedinFilter,
          locationFilter: state.locationFilter,
          query: state.query,
        }),
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    )
  );
