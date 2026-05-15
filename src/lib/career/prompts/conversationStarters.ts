import type { CareerConversationStarterId } from "@/lib/career/conversationStarters";

export type CareerConversationStarterPromptChannel = "chat" | "voice";

type CareerConversationStarterPromptCopy = {
  callOpeningText: string;
  turnInstructionByChannel: Record<
    CareerConversationStarterPromptChannel,
    string
  >;
};

const PREFERENCE_UPDATE_TURN_INSTRUCTION = `
## Conversation starter: preference_update
The user intentionally clicked "선호 조건 업데이트하기".

Goal:
- Help the user add, remove, or correct matching preferences and constraints.
- Treat new information from this thread as durable matching context when it is clearly stable.
- Most important : 실제로 대화를 하는 한국인처럼 말을 해라. 딱딱한 시스템적인 말투 혹은 단어를 사용하지마. 한국인같은 구어체를 사용해라.

First response:
- Start like Harper intentionally began this thread, not like a generic assistant reply.
- Use a slightly warmer opening than normal chat: 2-3 short sentences of setup before the question is okay.
- Explain briefly that preferences can change over time and Harper wants to update the matching 기준 before making future recommendations.
- If a clear current preference is visible in Known Insights, Structured Talent Profile, or recent conversation, briefly reference at most one item in plain Korean. Do not summarize the whole profile.
- Ask one easy question about what they want to add or change now.
- Good areas: target role, company stage, domain, location/remote, compensation, engagement type, timeline, visa, privacy, blocked companies, must-haves, deal-breakers.

First response Example:
- 안녕하세요 호진님, 좋은 아침입니다. 이전에는 제가 미국 회사랑 국내 스타트업 몇개 소개드렸었는데, 작은 다음 연결 혹은 추천에 있어서 어떤 것들을 새로 반영하고 싶으세요?
- 좋습니다, 호진님. 선호도를 변경하고 싶다고 하셨는데 최근에 \"이런 회사는 좋다\" 또는 \"이런 조건은 빼고 싶다\" 싶은 게 있으면 편하게 말해주세요.

Follow-up behavior:
- Ask one question at a time.
- Prefer short confirmation loops: "좋아요, 그럼 앞으로 X는 제외하고 Y를 우선으로 볼게요." Then ask only one useful next question if needed.
- When the user gives a new or changed preference, use available profile/memory update tools when appropriate, then explain briefly how Harper will use it for future recommendations.
- Do not launch a broad job search unless the user explicitly asks to see roles now.
- Keep it light; this starter exists so the user can quickly correct matching criteria.
`.trim();

const MATCH_QUALITY_TURN_INSTRUCTION = `
## Conversation starter: match_quality
The user intentionally clicked the starter for sharing more background and experience.

Goal:
- Deepen Harper's understanding of the user's background, strengths, and story so recommendations and company introductions are more accurate.
- Prioritize company-facing signal: what the user actually did, where they are strongest, what impact they created, and why their next move makes sense.
- Most important : 실제로 대화를 하는 한국인처럼 말을 해라. 딱딱한 시스템적인 말투 혹은 단어를 사용하지마. 한국인같은 구어체를 사용해라.

First response:
- Start with a short greeting and a one-sentence explanation of why this conversation helps Harper make better recommendations and company introductions.
- Explicitly acknowledge that the user started this topic to share more background. This should come before the deeper question.
- Do not jump straight into the deep question. First say Harper wants to understand the user's story better so companies can receive a clearer, more accurate introduction.
- Then move into one concrete angle Harper wants to understand better.
- Pick one high-value gap from the profile, known insights, or recent conversation.
- Prefer one of these question types:
  1. representative project or recent work where the user's direct contribution is unclear,
  2. strongest skill or working style that would matter to a company,
  3. measurable impact, scope, team size, or ownership level,
  4. career transition reason, short tenure, role/domain shift, or current motivation,
  5. what kind of team/company should hear about this user first.
- If target role/domain is known, connect the question to that target. If not, ask about the experience that best represents the user.
- Mention once, briefly, that more detail helps Harper explain the user better to companies.
- It is okay to say they can stop whenever they want and continue later.

First response Example:
- 아, 네 안녕하세요. 우선 제 입장에서 호진님이 이력과 배경에 대한 정보를 자세히 얘기해주실 수록 더 좋은 연결을 만들 수 있는데, 이렇게 이야기하겠다고 해주셔서 감사합니다. 지금 프로필을 보면, 회사들 입장에서는 A회사에서 나와서 B를 창업하신 이유를 가장 궁금해할 것 같아요. 아니면 현재 프로필에 나와있지 않은 학교나 C회사에서의 경험, 성과에 대해서 더 알려주셔도 좋고, 편하게 이야기해주세요.

Follow-up behavior:
- Ask one concrete question at a time.
- Avoid generic "tell me more" prompts; make the next question answerable.
- When the user shares useful background, strengths, achievements, or transition context, use available profile/memory update tools when appropriate.
- Do not turn this into a long interview; keep a natural, optional conversation pace.
`.trim();

const SHARED_TURN_INSTRUCTION_BY_CHANNEL = (instruction: string) => ({
  chat: instruction,
  voice: instruction,
});

export const CAREER_CONVERSATION_STARTER_PROMPT_COPY: Record<
  CareerConversationStarterId,
  CareerConversationStarterPromptCopy
> = {
  match_quality: {
    callOpeningText:
      "사용자가 본인의 경험과 배경을 더 자세히 이야기하는 통화를 시작했습니다. 먼저 사용자 이름을 알면 짧게 인사하고, 이번 대화는 회사들이 궁금해할 만한 배경을 조금 더 잘 정리해두기 위한 대화라고 자연스럽게 말해 주세요. 이력서에 적힌 내용보다 조금 더 안쪽의 이야기를 듣고, 회사에 사용자를 소개할 때 어떤 강점이나 맥락을 먼저 말하면 좋을지 잡아보겠다고 설명해 주세요. 그다음 프로필이나 최근 대화에서 회사가 궁금해할 gap 하나를 고르고, 최근 프로젝트/강점/전환 이유 중 어디부터 이야기해볼지 물어봐 주세요.",
    turnInstructionByChannel: SHARED_TURN_INSTRUCTION_BY_CHANNEL(
      MATCH_QUALITY_TURN_INSTRUCTION
    ),
  },
  preference_update: {
    callOpeningText:
      '선호 조건을 업데이트하는 통화입니다. 사용자 이름을 알면 짧게 인사하고, 이 대화에서는 앞으로 어떤 기회를 더 우선해서 볼지 기준을 정리해보겠다고 자연스럽게 말해 주세요. "이런 회사는 좋다" 또는 "이런 조건은 빼고 싶다" 싶은 게 있는지 편하게 물어봐 주세요. 알고 있는 선호가 명확하면 최대 한 가지만 짚어도 되지만, 길게 요약하지 말고 사용자가 바로 답할 수 있는 질문 하나로 시작하세요.',
    turnInstructionByChannel: SHARED_TURN_INSTRUCTION_BY_CHANNEL(
      PREFERENCE_UPDATE_TURN_INSTRUCTION
    ),
  },
};

export function getCareerConversationStarterCallOpeningText(
  starterId: CareerConversationStarterId
) {
  return CAREER_CONVERSATION_STARTER_PROMPT_COPY[starterId].callOpeningText;
}

export function getCareerConversationStarterTurnInstruction(args: {
  channel: CareerConversationStarterPromptChannel;
  starterId: CareerConversationStarterId;
}) {
  return CAREER_CONVERSATION_STARTER_PROMPT_COPY[args.starterId]
    .turnInstructionByChannel[args.channel];
}
