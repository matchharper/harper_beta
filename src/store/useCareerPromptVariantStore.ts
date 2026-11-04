import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isCareerPromptVariant, type CareerPromptVariant } from "@/lib/career/prompts/promptExperiment";

export const useCareerPromptVariantStore = create<{
  variant: CareerPromptVariant | null;
  setVariant: (variant: CareerPromptVariant | null) => void;
}>()(
  persist(
    set => ({ variant: null, setVariant: variant => set({ variant }) }),
    {
      name: "career-prompt-variant",
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ variant: state.variant }),
      merge: (saved, current) => {
        const variant = (saved as { variant?: unknown })?.variant;
        return { ...current, variant: isCareerPromptVariant(variant) ? variant : null };
      },
    },
  ),
);
