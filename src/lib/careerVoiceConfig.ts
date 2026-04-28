export type CareerCallTtsProvider = "elevenlabs" | "openai-realtime";

const normalizeCareerCallTtsProvider = (
  rawProvider: string | undefined
): CareerCallTtsProvider => {
  const provider = rawProvider?.trim().toLowerCase();

  if (
    provider === "openai" ||
    provider === "openai-realtime" ||
    provider === "realtime"
  ) {
    return "openai-realtime";
  }

  return "elevenlabs";
};

export const CAREER_CALL_TTS_PROVIDER = normalizeCareerCallTtsProvider(
  process.env.NEXT_PUBLIC_CAREER_CALL_TTS_PROVIDER
);

export const USE_ELEVENLABS_TTS =
  CAREER_CALL_TTS_PROVIDER === "elevenlabs";
