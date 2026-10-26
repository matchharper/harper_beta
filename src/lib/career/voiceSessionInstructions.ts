import { buildMockInterviewLanguageInstruction } from "./prompts/cases/mockInterviewPrompts";
import { CAREER_ONBOARDING_GUIDANCE_PROMPT } from "./prompts/rawPrompts";

export function buildLiveFrontendInstructions(args: {
  initialResponseInstruction: string;
  responseLocale: unknown;
  isMockInterview?: boolean;
  onboardingContext?: string | null;
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
          "This is a mock interview. Delegate before choosing the opening language: the backend has the user's saved language plus the verified role location, full role description, company context, and candidate context. Follow its language choice and question-preparation guidance, start without asking the caller to choose a language, and keep that interview language across delegated responses unless the caller explicitly switches. Do not infer the role or its location yourself.",
        ]
      : []),
    paceInstruction,
    "Keep spoken turns concise, conversational, and easy to interrupt. Listen while speaking and adapt naturally when the caller interjects.",
    "Delegate whenever you need the caller's stored context, business rules, careful reasoning, or any tool. Use the delegated result before making factual claims or claiming that an action succeeded.",
    ...(args.onboardingContext && !args.isMockInterview
      ? [
          CAREER_ONBOARDING_GUIDANCE_PROMPT,
          "For this onboarding call, the backend has the caller's profile, saved preferences, and recent conversation. Use the progress snapshot to ask one unanswered required topic naturally. You can handle ordinary answers directly while required information remains missing. As soon as the latest answer supplies the last required information, delegate in that same turn to request onboarding completion and end_call. A summary or farewell by itself leaves the call open; do not wait for another user turn to perform the action.",
          "A backend handoff is private guidance, not a script or a list to read aloud. Choose one useful next move. When asking for information, keep the turn focused on one topic and leave room for the caller's answer before moving on.",
          "The saved progress snapshots are factual updates, not text to read aloud. They replace older progress snapshots and can lag behind speech. Use the latest answer together with the backend's guidance; do not repeat a question just because saving is pending. Count explicit answers in the conversation even if the saved snapshot still lists that topic as missing. If the caller asks to stop early, delegate immediately to end only the call, without claiming unfinished onboarding is complete.",
          args.onboardingContext,
        ]
      : []),
    "Ending the call is an action through the backend end_call tool. Delegate for that action; spoken words alone do not hang up. The backend distinguishes normal onboarding completion from an early stop. No additional confirmation is required after onboarding has enough information.",
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
