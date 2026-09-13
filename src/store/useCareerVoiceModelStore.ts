import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CareerVoiceModelOverride } from "@/lib/career/voiceModel";

type CareerVoiceModelState = {
  modelOverride: CareerVoiceModelOverride;
  setModelOverride: (modelOverride: CareerVoiceModelOverride) => void;
};

export const useCareerVoiceModelStore = create<CareerVoiceModelState>()(
  persist(
    (set) => ({
      modelOverride: null,
      setModelOverride: (modelOverride) => set({ modelOverride }),
    }),
    {
      name: "career-voice-model-override",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ modelOverride: state.modelOverride }),
    }
  )
);
