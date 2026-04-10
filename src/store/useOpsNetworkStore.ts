import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const OPS_NETWORK_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export type OpsNetworkPageSize = (typeof OPS_NETWORK_PAGE_SIZE_OPTIONS)[number];

function normalizeOpsNetworkPageSize(value: unknown): OpsNetworkPageSize {
  const numeric = Number(value);

  if (OPS_NETWORK_PAGE_SIZE_OPTIONS.includes(numeric as OpsNetworkPageSize)) {
    return numeric as OpsNetworkPageSize;
  }

  return 25;
}

type OpsNetworkStoreState = {
  pageSize: OpsNetworkPageSize;
  setPageSize: (value: number) => void;
};

export const useOpsNetworkStore = create<OpsNetworkStoreState>()(
  persist(
    (set) => ({
      pageSize: 25,
      setPageSize: (value) =>
        set({
          pageSize: normalizeOpsNetworkPageSize(value),
        }),
    }),
    {
      name: "ops-network",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pageSize: state.pageSize,
      }),
    }
  )
);
