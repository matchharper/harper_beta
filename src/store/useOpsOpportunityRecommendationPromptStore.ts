import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT } from "@/lib/opsOpportunityRecommendationPrompt";

type OpsOpportunityRecommendationPromptStoreState = {
  promptTemplate: string;
  resetPromptTemplate: () => void;
  setPromptTemplate: (value: string) => void;
};

export const useOpsOpportunityRecommendationPromptStore =
  create<OpsOpportunityRecommendationPromptStoreState>()(
    persist(
      (set) => ({
        promptTemplate: DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT,
        resetPromptTemplate: () =>
          set({
            promptTemplate: DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT,
          }),
        setPromptTemplate: (value) =>
          set({
            promptTemplate:
              String(value ?? "").trim() ||
              DEFAULT_OPS_TALENT_RECOMMENDATION_PROMPT,
          }),
      }),
      {
        name: "ops-opportunity-recommendation-prompt",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          promptTemplate: state.promptTemplate,
        }),
      }
    )
  );
