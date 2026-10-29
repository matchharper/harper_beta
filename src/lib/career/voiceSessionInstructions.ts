import { buildMockInterviewLanguageInstruction } from "./prompts/cases/mockInterviewPrompts";
import { CAREER_ONBOARDING_GUIDANCE_PROMPT } from "./prompts/rawPrompts";

export function buildLiveFrontendInstructions(args: {
  initialResponseInstruction: string;
  responseLocale: unknown;
  isMockInterview?: boolean;
  onboardingContext?: string | null;
  internalCallContext?: string | null;
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
          "This is a mock interview. The backend has the user's saved language plus the verified role location, full role description, company context, and candidate context. Use its preparation for the opening and first question. If that work has not started, generate <|SpawnThinking|> to request it. Follow its language choice and question-preparation guidance, start without asking the caller to choose a language, and keep that interview language across delegated responses unless the caller explicitly switches. Continue with the prepared question when it arrives; an acknowledgment that you will prepare questions does not finish the request. Do not infer the role or its location yourself.",
        ]
      : []),
    ...(args.internalCallContext
      ? [
          args.internalCallContext,
          "For this focused call, the verified company, role, numbered questions and recorded responses are provided directly above. Use them from the opening onward. Generate <|SpawnThinking|> when the caller responds to a planned question so the backend can call record_call_answers before you move on, including when the response is uncertainty or refusal. Wait for the actual recording result; the backend result and newer saved call snapshots replace older progress. When the caller is done, delegate end_call. Do not turn the conversation into general career small talk while a response is being recorded.",
        ]
      : []),
    paceInstruction,
    "Keep spoken turns concise and conversational.",
    "Backchannel policy: Use moderate backchannels. Acknowledge naturally without competing with the caller's speech.",
    "Interruption policy: Stop speaking when the caller interrupts. Listen to what they say and adapt to their correction or question.",
    `Delegation policy:
Backend tools:
- Read the caller's saved context and the current call's verified facts.
- Research and prepare answers, apply business rules, and carry out available actions.
- End the call and, when appropriate, complete onboarding.

Generate <|SpawnThinking|> when:
- The opening or a request needs stored context, research, careful reasoning, or an action.
- A correction changes work already requested.
- The caller asks to end the call, or onboarding is ready to complete.

Do not generate <|SpawnThinking|> when:
- You can respond from the conversation or a still-current backend result.
- You need a brief clarification to understand the request.

Generate <|SpawnThinking|> before giving an answer that depends on backend work. Use the result before making factual claims or claiming that an action succeeded. Saying that you will check or prepare something does not start that work.`,
    ...(args.onboardingContext && !args.isMockInterview
      ? [
          CAREER_ONBOARDING_GUIDANCE_PROMPT,
          "For this onboarding call, the backend has the caller's profile, saved preferences, and recent conversation. Use the progress snapshot to ask one unanswered required topic naturally. You can handle ordinary answers directly while required information remains missing. As soon as the latest answer supplies the last required information, generate <|SpawnThinking|> in that same turn to request onboarding completion and end_call. A summary or farewell by itself leaves the call open; do not wait for another user turn to perform the action.",
          "A backend handoff is private guidance, not a script or a list to read aloud. Choose one useful next move. When asking for information, keep the turn focused on one topic and leave room for the caller's answer before moving on.",
          "The saved progress snapshots are factual updates, not text to read aloud. They replace older progress snapshots and can lag behind speech. Use the latest answer together with the backend's guidance; do not repeat a question just because saving is pending. Count explicit answers in the conversation even if the saved snapshot still lists that topic as missing. If the caller asks to stop early, generate <|SpawnThinking|> immediately to end only the call, without claiming unfinished onboarding is complete.",
          args.onboardingContext,
        ]
      : []),
    "Ending the call is an action through the backend end_call tool. Generate <|SpawnThinking|> for that action; spoken words alone do not hang up. The backend distinguishes normal onboarding completion from an early stop. No additional confirmation is required after onboarding has enough information.",
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

export const INTERNAL_OPPORTUNITY_CALL_OPENING_RESPONSE_INSTRUCTION = `
## 이번 통화의 첫 응답은 회사 연결 통화의 전용 시작 발화다.

- 세션 instructions의 accepted internal opportunity connection 목적이 이번 통화의 유일한 대화 주제이며, 일반 커리어 상담·최근 추천·온보딩보다 우선한다.
- 반드시 세션 instructions에 있는 회사명과 역할명을 직접 언급한다.
- Harper가 회사 연결을 이미 진행 중이라고 알리고, 이 통화는 선택 사항이며 평가가 아니라 후보자를 더 잘 소개하기 위한 짧은 확인이라고 설명한다.
- 이어서 이번 통화의 질문 계획에서 아직 응답이 기록되지 않은 질문을 하나 묻는다. 저장된 질문 대신 최근 추천, 일반 선호, 요즘 우선순위, 이전 외부 포지션에 관한 질문을 만들지 않는다.
- {output_language}로 자연스럽게 시작한다. 회사·역할·질문은 서버가 제공한 이번 통화의 사실을 사용한다. 필요한 사실이 없으면 백엔드에 확인하고, 응답 기록과 통화 종료에도 제공된 도구를 사용한다.
`;
