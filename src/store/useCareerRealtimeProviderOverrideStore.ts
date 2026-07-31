import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CareerRealtimeProviderOverride = "openai" | "xai" | null;

type CareerRealtimeProviderOverrideState = {
  providerOverride: CareerRealtimeProviderOverride;
  setProviderOverride: (
    providerOverride: CareerRealtimeProviderOverride
  ) => void;
};

export const useCareerRealtimeProviderOverrideStore =
  create<CareerRealtimeProviderOverrideState>()(
    persist(
      (set) => ({
        providerOverride: null,
        setProviderOverride: (providerOverride) => set({ providerOverride }),
      }),
      {
        name: "career-realtime-provider-override",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          providerOverride: state.providerOverride,
        }),
      }
    )
  );
