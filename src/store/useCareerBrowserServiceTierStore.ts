import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_CAREER_BROWSER_SERVICE_TIER, resolveCareerBrowserServiceTier, type CareerBrowserServiceTier } from "@/lib/career/browserServiceTier";

export const useCareerBrowserServiceTierStore = create<{
  serviceTier: CareerBrowserServiceTier;
  setServiceTier: (serviceTier: CareerBrowserServiceTier) => void;
}>()(persist((set) => ({
  serviceTier: DEFAULT_CAREER_BROWSER_SERVICE_TIER,
  setServiceTier: (serviceTier) => set({ serviceTier }),
}), {
  name: "career-browser-service-tier",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ serviceTier: state.serviceTier }),
  merge: (persisted, current) => ({ ...current,
    serviceTier: resolveCareerBrowserServiceTier((persisted as { serviceTier?: unknown })?.serviceTier),
  }),
}));
