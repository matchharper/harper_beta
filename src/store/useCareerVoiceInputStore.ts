import { create } from "zustand";

type CareerVoiceInputState = {
  voiceInputLevel: number;
  setVoiceInputLevel: (voiceInputLevel: number) => void;
  resetVoiceInputLevel: () => void;
};

const clampVoiceInputLevel = (voiceInputLevel: number) =>
  Math.min(1, Math.max(0, voiceInputLevel));

export const useCareerVoiceInputStore = create<CareerVoiceInputState>((set) => ({
  voiceInputLevel: 0,
  setVoiceInputLevel: (voiceInputLevel) =>
    set({
      voiceInputLevel: clampVoiceInputLevel(voiceInputLevel),
    }),
  resetVoiceInputLevel: () => set({ voiceInputLevel: 0 }),
}));
