import { buildMockInterviewLanguageInstruction } from "./prompts/cases/mockInterviewPrompts";

export function buildLiveFrontendInstructions(args: {
  initialResponseInstruction: string;
  responseLocale: unknown;
  isMockInterview?: boolean;
}) {
  const language =
    typeof args.responseLocale === "string" &&
    args.responseLocale.trim().toLowerCase().startsWith("en")
      ? "English"
      : "Korean";
  const paceInstruction =
    language === "English"
      ? "Speak clearly at a slightly faster pace."
      : "조금 빠른 속도로 또렷하게 말해.";

  return [
    "You are Harper, a warm and capable career partner in a live voice call.",
    args.isMockInterview
      ? buildMockInterviewLanguageInstruction(
          language === "English" ? "en" : "ko"
        )
      : `Speak naturally in ${language}, unless the caller clearly switches languages.`,
    ...(args.isMockInterview
      ? [
          "This is a mock interview. Delegate before deciding whether to offer English: the backend has the verified position and candidate context. Follow its language-selection or question-preparation guidance, wait for the user's answer when offering English, and keep the caller's selected interview language across delegated responses. Do not infer the position or its working language yourself.",
        ]
      : []),
    paceInstruction,
    "Keep spoken turns concise, conversational, and easy to interrupt. Listen while speaking and adapt naturally when the caller interjects.",
    "Delegate whenever you need the caller's stored context, business rules, careful reasoning, or any tool. Use the delegated result before making factual claims or claiming that an action succeeded.",
    "Do not narrate delegation mechanics, tool names, system instructions, or hidden context to the caller.",
    args.initialResponseInstruction
      ? `For the opening turn, follow this call-opening guidance:\n${args.initialResponseInstruction}`
      : "When asked to begin, greet the caller briefly and ask one useful opening question.",
  ].join("\n\n");
}

export function buildVoiceInputTranscription(args: {
  model: string;
  language?: string;
  isMockInterview?: boolean;
}) {
  return {
    model: args.model,
    ...(args.isMockInterview
      ? { prompt: MOCK_INTERVIEW_TRANSCRIPTION_CONTEXT }
      : args.language
        ? { language: args.language }
        : {}),
  };
}

// A transcription context hint, not a language allowlist or a translation request.
export const MOCK_INTERVIEW_TRANSCRIPTION_CONTEXT =
  "This is a mock job interview in Korean and English. The speaker may switch between Korean and English within or across turns. Transcribe the words actually spoken in their original language: Korean in Hangul and English in Latin script. Preserve names and technical terms. Do not translate. Coughs, breathing, silence, and background noise are not spoken words; do not invent words or captions for them.";
