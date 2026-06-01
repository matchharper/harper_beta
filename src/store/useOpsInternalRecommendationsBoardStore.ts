import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const normalizeBoardColumnId = (value: unknown) => String(value ?? "").trim();

const normalizeCollapsedColumnIds = (values: unknown) => {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  values.forEach((value) => {
    const columnId = normalizeBoardColumnId(value);
    if (!columnId || seen.has(columnId)) return;
    seen.add(columnId);
    normalized.push(columnId);
  });
  return normalized;
};

type OpsInternalRecommendationsBoardStoreState = {
  collapsedColumnIdsByUser: Record<string, string[]>;
  setColumnCollapsed: (
    userKey: string,
    columnId: string,
    collapsed: boolean
  ) => void;
  toggleColumnCollapsed: (userKey: string, columnId: string) => void;
};

export const useOpsInternalRecommendationsBoardStore =
  create<OpsInternalRecommendationsBoardStoreState>()(
    persist(
      (set) => ({
        collapsedColumnIdsByUser: {},
        setColumnCollapsed: (userKey, columnId, collapsed) =>
          set((state) => {
            const normalizedUserKey = userKey.trim() || "anonymous";
            const normalizedColumnId = normalizeBoardColumnId(columnId);
            if (!normalizedColumnId) return state;

            const current = normalizeCollapsedColumnIds(
              state.collapsedColumnIdsByUser[normalizedUserKey]
            );
            const next = collapsed
              ? Array.from(new Set([...current, normalizedColumnId]))
              : current.filter((id) => id !== normalizedColumnId);

            return {
              collapsedColumnIdsByUser: {
                ...state.collapsedColumnIdsByUser,
                [normalizedUserKey]: next,
              },
            };
          }),
        toggleColumnCollapsed: (userKey, columnId) =>
          set((state) => {
            const normalizedUserKey = userKey.trim() || "anonymous";
            const normalizedColumnId = normalizeBoardColumnId(columnId);
            if (!normalizedColumnId) return state;

            const current = normalizeCollapsedColumnIds(
              state.collapsedColumnIdsByUser[normalizedUserKey]
            );
            const isCollapsed = current.includes(normalizedColumnId);
            const next = isCollapsed
              ? current.filter((id) => id !== normalizedColumnId)
              : [...current, normalizedColumnId];

            return {
              collapsedColumnIdsByUser: {
                ...state.collapsedColumnIdsByUser,
                [normalizedUserKey]: next,
              },
            };
          }),
      }),
      {
        name: "ops-internal-recommendations-board",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          collapsedColumnIdsByUser: state.collapsedColumnIdsByUser,
        }),
      }
    )
  );
