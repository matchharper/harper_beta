import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const MAX_CAREER_DEV_SQL_PROMPT_HISTORY = 10;
const MAX_CAREER_DEV_SQL_PROMPT_CHARS = 1600;

function normalizeCareerDevSqlPrompt(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, MAX_CAREER_DEV_SQL_PROMPT_CHARS);
}

type CareerDevSqlPromptHistoryStoreState = {
  prompts: string[];
  addPrompt: (value: string) => void;
};

export const useCareerDevSqlPromptHistoryStore =
  create<CareerDevSqlPromptHistoryStoreState>()(
    persist(
      (set) => ({
        prompts: [],
        addPrompt: (value) =>
          set((state) => {
            const prompt = normalizeCareerDevSqlPrompt(value);
            if (!prompt) return state;

            return {
              prompts: [
                prompt,
                ...state.prompts.filter((item) => item !== prompt),
              ].slice(0, MAX_CAREER_DEV_SQL_PROMPT_HISTORY),
            };
          }),
      }),
      {
        name: "career-dev-sql-prompt-history",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          prompts: state.prompts,
        }),
      }
    )
  );
