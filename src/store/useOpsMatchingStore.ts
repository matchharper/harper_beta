import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type OpsMatchingStageTabId =
  | "active"
  | "all"
  | "harper_review"
  | "offered"
  | "archived";

export type OpsMatchingViewMode = "all_fits" | "role";

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeTags = (values: readonly string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    next.push(normalized);
  });
  return next;
};

const normalizeTab = (value: unknown): OpsMatchingStageTabId => {
  const normalized = normalizeText(value);
  if (
    normalized === "active" ||
    normalized === "all" ||
    normalized === "harper_review" ||
    normalized === "offered" ||
    normalized === "archived"
  ) {
    return normalized;
  }
  return "all";
};

const normalizeViewMode = (value: unknown): OpsMatchingViewMode => {
  const normalized = normalizeText(value);
  if (normalized === "all_fits") return "all_fits";
  return "role";
};

type OpsMatchingStoreState = {
  activeTab: OpsMatchingStageTabId;
  allCreatedFrom: string;
  allCreatedTo: string;
  allExcludeRecommended: boolean;
  allHumanLabelFilters: string[];
  allLlmLabelFilters: string[];
  allTagFilters: string[];
  collapsedReviewColumnIdsByRole: Record<string, string[]>;
  hasHydrated: boolean;
  reviewRecommendedFrom: string;
  reviewRecommendedTo: string;
  reviewTagFilters: string[];
  selectedCompanyId: string;
  selectedRoleId: string;
  setActiveTab: (tab: OpsMatchingStageTabId) => void;
  setAllCreatedDateRange: (from: string, to: string) => void;
  setAllExcludeRecommended: (excludeRecommended: boolean) => void;
  setAllHumanLabelFilters: (labels: string[]) => void;
  setAllLlmLabelFilters: (labels: string[]) => void;
  setAllTagFilters: (tags: string[]) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setReviewColumnCollapsed: (
    roleId: string,
    columnId: string,
    collapsed: boolean
  ) => void;
  setReviewRecommendedDateRange: (from: string, to: string) => void;
  setReviewTagFilters: (tags: string[]) => void;
  setSelectedCompanyId: (companyId: string) => void;
  setSelectedRoleId: (roleId: string) => void;
  setStateFromUrl: (state: Partial<OpsMatchingUrlState>) => void;
  setViewMode: (viewMode: OpsMatchingViewMode) => void;
  toggleReviewColumnCollapsed: (roleId: string, columnId: string) => void;
  viewMode: OpsMatchingViewMode;
};

export type OpsMatchingUrlState = {
  activeTab: OpsMatchingStageTabId;
  allCreatedFrom: string;
  allCreatedTo: string;
  allExcludeRecommended: boolean;
  allHumanLabelFilters: string[];
  allLlmLabelFilters: string[];
  allTagFilters: string[];
  reviewRecommendedFrom: string;
  reviewRecommendedTo: string;
  reviewTagFilters: string[];
  selectedCompanyId: string;
  selectedRoleId: string;
  viewMode: OpsMatchingViewMode;
};

function normalizeCollapsedColumnIds(values: readonly string[] | undefined) {
  return normalizeTags(values ?? []);
}

export const useOpsMatchingStore = create<OpsMatchingStoreState>()(
  persist(
    (set) => ({
      activeTab: "all",
      allCreatedFrom: "",
      allCreatedTo: "",
      allExcludeRecommended: false,
      allHumanLabelFilters: [],
      allLlmLabelFilters: [],
      allTagFilters: [],
      collapsedReviewColumnIdsByRole: {},
      hasHydrated: false,
      reviewRecommendedFrom: "",
      reviewRecommendedTo: "",
      reviewTagFilters: [],
      selectedCompanyId: "",
      selectedRoleId: "",
      viewMode: "role",
      setActiveTab: (tab) => set({ activeTab: normalizeTab(tab) }),
      setAllCreatedDateRange: (from, to) =>
        set({
          allCreatedFrom: normalizeText(from),
          allCreatedTo: normalizeText(to),
        }),
      setAllExcludeRecommended: (excludeRecommended) =>
        set({ allExcludeRecommended: Boolean(excludeRecommended) }),
      setAllHumanLabelFilters: (labels) =>
        set({ allHumanLabelFilters: normalizeTags(labels) }),
      setAllLlmLabelFilters: (labels) =>
        set({ allLlmLabelFilters: normalizeTags(labels) }),
      setAllTagFilters: (tags) => set({ allTagFilters: normalizeTags(tags) }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setReviewColumnCollapsed: (roleId, columnId, collapsed) =>
        set((state) => {
          const normalizedRoleId = normalizeText(roleId) || "global";
          const normalizedColumnId = normalizeText(columnId);
          if (!normalizedColumnId) return state;

          const current = normalizeCollapsedColumnIds(
            state.collapsedReviewColumnIdsByRole[normalizedRoleId]
          );
          const next = collapsed
            ? normalizeTags([...current, normalizedColumnId])
            : current.filter((id) => id !== normalizedColumnId);

          return {
            collapsedReviewColumnIdsByRole: {
              ...state.collapsedReviewColumnIdsByRole,
              [normalizedRoleId]: next,
            },
          };
        }),
      setReviewRecommendedDateRange: (from, to) =>
        set({
          reviewRecommendedFrom: normalizeText(from),
          reviewRecommendedTo: normalizeText(to),
        }),
      setReviewTagFilters: (tags) =>
        set({ reviewTagFilters: normalizeTags(tags) }),
      setSelectedCompanyId: (companyId) =>
        set({ selectedCompanyId: normalizeText(companyId) }),
      setSelectedRoleId: (roleId) =>
        set({ selectedRoleId: normalizeText(roleId) }),
      setStateFromUrl: (state) =>
        set({
          activeTab: state.activeTab ? normalizeTab(state.activeTab) : "all",
          allCreatedFrom: normalizeText(state.allCreatedFrom),
          allCreatedTo: normalizeText(state.allCreatedTo),
          allExcludeRecommended: Boolean(state.allExcludeRecommended),
          allHumanLabelFilters: normalizeTags(state.allHumanLabelFilters ?? []),
          allLlmLabelFilters: normalizeTags(state.allLlmLabelFilters ?? []),
          allTagFilters: normalizeTags(state.allTagFilters ?? []),
          reviewRecommendedFrom: normalizeText(state.reviewRecommendedFrom),
          reviewRecommendedTo: normalizeText(state.reviewRecommendedTo),
          reviewTagFilters: normalizeTags(state.reviewTagFilters ?? []),
          selectedCompanyId: normalizeText(state.selectedCompanyId),
          selectedRoleId: normalizeText(state.selectedRoleId),
          viewMode: normalizeViewMode(state.viewMode),
        }),
      setViewMode: (viewMode) => set({ viewMode: normalizeViewMode(viewMode) }),
      toggleReviewColumnCollapsed: (roleId, columnId) =>
        set((state) => {
          const normalizedRoleId = normalizeText(roleId) || "global";
          const normalizedColumnId = normalizeText(columnId);
          if (!normalizedColumnId) return state;

          const current = normalizeCollapsedColumnIds(
            state.collapsedReviewColumnIdsByRole[normalizedRoleId]
          );
          const next = current.includes(normalizedColumnId)
            ? current.filter((id) => id !== normalizedColumnId)
            : [...current, normalizedColumnId];

          return {
            collapsedReviewColumnIdsByRole: {
              ...state.collapsedReviewColumnIdsByRole,
              [normalizedRoleId]: next,
            },
          };
        }),
    }),
    {
      name: "ops-matching",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        activeTab: state.activeTab,
        allCreatedFrom: state.allCreatedFrom,
        allCreatedTo: state.allCreatedTo,
        allExcludeRecommended: state.allExcludeRecommended,
        allHumanLabelFilters: state.allHumanLabelFilters,
        allLlmLabelFilters: state.allLlmLabelFilters,
        allTagFilters: state.allTagFilters,
        collapsedReviewColumnIdsByRole: state.collapsedReviewColumnIdsByRole,
        reviewRecommendedFrom: state.reviewRecommendedFrom,
        reviewRecommendedTo: state.reviewRecommendedTo,
        reviewTagFilters: state.reviewTagFilters,
        selectedCompanyId: state.selectedCompanyId,
        selectedRoleId: state.selectedRoleId,
        viewMode: state.viewMode,
      }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);
