import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_CAREER_TEXT_CHAT_MODEL,
  isCareerTextChatModelId,
  type CareerTextChatModelId,
} from "@/lib/career/textChatModelConfig";

type CareerTextChatModelState = {
  model: CareerTextChatModelId;
  setModel: (model: CareerTextChatModelId) => void;
};

export const useCareerTextChatModelStore = create<CareerTextChatModelState>()(
  persist(
    (set) => ({
      model: DEFAULT_CAREER_TEXT_CHAT_MODEL,
      setModel: (model) => set({ model }),
    }),
    {
      name: "career-text-chat-model",
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persistedModel = (persistedState as { model?: unknown })?.model;
        return {
          ...currentState,
          ...(isCareerTextChatModelId(persistedModel)
            ? { model: persistedModel }
            : {}),
        };
      },
      partialize: (state) => ({ model: state.model }),
    }
  )
);
