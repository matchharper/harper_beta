import { careerT } from "@/lib/career/translatedCareerMessage";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";

export const CAREER_CONVERSATION_STARTER_IDS = [
  "preference_update",
  "match_quality",
] as const;

export type CareerConversationStarterId =
  (typeof CAREER_CONVERSATION_STARTER_IDS)[number];

export type CareerConversationStarterMode = "chat" | "call";

export type CareerConversationStarterAction = {
  id: CareerConversationStarterId;
  chatMessage: string;
  callOpeningText: string;
  turnInstruction: string;
};

type LocalizedConversationStarterText = {
  en: string;
  ko: string;
};

type CareerConversationStarterPromptCopy = {
  chatMessage: {
    fallback: string;
    key: string;
  };
  callOpeningText: LocalizedConversationStarterText;
  turnInstruction: LocalizedConversationStarterText;
};

const default_opening =
  "## 참고할 통화 시작 내용\n아래 문구나 질문의 취지를 통화 첫 멘트에 자연스럽게 반영하세요. 그대로 읽기보다 위 지시와 최근 대화 맥락에 맞게 말하세요.";

const MATCH_QUALITY_CALL_OPENING_TEXT = `
## 현재 통화는 유저가 "더 이야기하고 더 좋은 연결 받기" 버튼을 클릭해서 시작되었다.

첫 응답의 자연스러운 흐름:
1. 가벼운 인사로 시작한다. (굿모닝, 오랜만이네요, 요즘 어때요, 다시 전화가 연결되었네요, 시간을 내주셔서 감사합니다 등)
2. 이번 통화에서는 {{name}}님을 회사에 소개할 일이 생겼을 때 같이 전달하면 좋을 정보를 들어보면 좋을 것 같아요.
3. 회사 측에 더 소개하고 싶은 내용이 있는지 물어보고, 뚜렷하게 없더라도 이 질문에 대답해주시면 도움이 될 것 같다고 하면서(이유와 함께) 질문을 하나 물어보면서 마무리한다. 편하게 이야기해주세요.를 안내해야함.
- 질문은 구체적이어야 한다. 대신 그다음에 해당 질문에 대한 대답이 아니더라도 사용자가 편하게 말할 수 있게 열어두면 좋다.
ex) 회사들 입장에서는 A회사에서 나와서 B를 창업하신 이유를 가장 궁금해할 것 같아요. 아니면 현재 프로필에 나와있지 않은 학교나 C회사에서의 경험, 성과에 대해서 더 알려주셔도 좋고, 편하게 이야기해주세요.
- 맥락을 언급하며 인사하면 자연스럽다. ex. 저번에 ~~를 좋다고 하셨는데, 보통 그런 곳은 ~~를 궁금해 해요. 혹은 오랜만에 이야기하네요, 새로 가입하셨는데 등등.

좋은 질문 주제:
1. 프로필에 적혀있지 않지만 공유하고 싶은 좋은 경험 혹은 더 자세하게 이야기 하고싶은 경험, 성과 등
2. 이직/전환/창업/짧은 재직 기간/비어있는 경력 기간의 이유
3. 개인적인 강점, 좋아하는/잘 아는 도메인, 일할 때의 태도, 평소에 직무 관련해서 하는 것들 등

First response Example:
- 안녕하세요 {{name}}님, 다시 전화 연결됐네요. 이번 통화에서는 나중에 {{name}}님을 회사에 소개할 일이 생겼을 때 같이 전달하면 좋을 정보들을 조금 들어보면 좋을 것 같아요. 회사 입장에서는 이력서에 적힌 회사명이나 직함도 보지만, 그 안에서 어떤 문제를 직접 맡았고 어떤 방식으로 풀었는지를 궁금해하는 경우가 많거든요. 혹시 최근 경험 중에 프로필에는 짧게 적혀 있지만 실제로는 더 설명하고 싶은 프로젝트나 성과가 있을까요? 꼭 이 질문이 아니어도, 회사에 더 잘 전달됐으면 하는 강점이나 경험부터 편하게 말씀해주셔도 좋아요.
- 안녕하세요 {{name}}님, 시간 내주셔서 감사합니다. 이번에는 {{name}}님을 회사에 소개하게 될 때 이력만으로는 잘 드러나지 않는 배경이나 강점을 같이 전달할 수 있게 조금 더 이야기 들어보고 싶어요. 예를 들어 회사들 입장에서는 이직이나 전환의 이유, 혹은 특정 역할에서 직접 만든 성과를 궁금해할 때가 많거든요. 지금까지의 경험 중에서 “이건 회사가 알면 좋겠다” 싶은 일이나, 프로필에 아직 충분히 담기지 않은 성과가 있을까요? 아니면 편하게 이야기하고 싶은 커리어 배경부터 말씀해주셔도 괜찮아요.
`;

const MATCH_QUALITY_CALL_OPENING_TEXT_EN = `${MATCH_QUALITY_CALL_OPENING_TEXT}`;

const PREFERENCE_UPDATE_CALL_OPENING_TEXT = `
## 현재 통화는 유저가 "선호 조건 업데이트하기" 버튼을 클릭해서 시작되었다.

첫 응답의 자연스러운 흐름:
1. 가벼운 인사로 시작한다. (굿모닝, 오랜만이네요, 다시 전화가 연결되었네요, 시간 내주셔서 감사합니다 등)
2. 선호 조건은 시간이 지나면서 바뀔 수 있고, 이번 통화에서는 앞으로 추천이나 연결을 볼 때 반영하면 좋을 기준을 업데이트하고 싶다고 말한다.
3. 현재 저장된 선호나 최근 대화에서 참고할 만한 맥락이 있으면 하나만 짧게 언급한다. 단, 프로필 전체를 요약하지 않는다.
4. 무엇을 새로 반영하거나 바꾸면 좋을지 쉬운 질문 하나로 마무리한다. 사용자가 특정 항목을 모르더라도 편하게 말할 수 있게 열어둔다.

좋은 질문 주제:
1. 앞으로 더 보고 싶은 역할, 도메인, 회사 규모/스테이지, 팀 문화
2. 이제는 제외하고 싶은 조건, 회사 유형, 산업, 일하는 방식
3. 위치, 리모트/하이브리드, 보상, 계약 형태, 시작 가능 시점 같은 현실적인 제약
4. 비자, 개인정보 노출, 현 직장 노출, 피하고 싶은 회사 같은 민감한 조건
5. 꼭 필요한 조건, 있으면 좋은 조건, 절대 안 되는 조건의 우선순위

First response Example:
- 안녕하세요 {{name}}님, 다시 전화 연결됐네요. 선호 조건은 시간이 지나면서 자연스럽게 바뀔 수 있으니까, 이번 통화에서는 앞으로 제가 추천이나 연결을 볼 때 어떤 기준을 새로 반영하면 좋을지 업데이트해보면 좋을 것 같아요. 최근에 “이런 회사는 더 보고 싶다”거나 반대로 “이런 조건은 이제 빼고 싶다” 싶은 게 있을까요? 역할, 회사 단계, 리모트 여부, 보상처럼 편한 것부터 말씀해주셔도 괜찮아요.

- 안녕하세요 {{name}}님, 시간 내주셔서 감사합니다. 이번 통화에서는 지금 기준에서 새로 중요해진 조건이나, 예전에는 괜찮았는데 이제는 피하고 싶은 조건이 있는지 이야기해주시면 좋을 것 같아요. 딱 정리되어 있지 않아도 괜찮고, 최근에 끌렸던 회사나 별로였던 조건부터 편하게 말씀해주셔도 좋아요.
`;

const PREFERENCE_UPDATE_CALL_OPENING_TEXT_EN = `${PREFERENCE_UPDATE_CALL_OPENING_TEXT}`;

const PREFERENCE_UPDATE_TURN_INSTRUCTION = `
## 현재 통화는 유저가 "선호 조건 업데이트하기" 버튼을 클릭해서 시작되었다.

Goal:
- Help the user add, remove, or correct matching preferences and constraints.
- Treat new information from this thread as durable matching context when it is clearly stable.
- Most important : 실제로 대화를 하는 한국인처럼 말을 해라. 딱딱한 시스템적인 말투 혹은 단어를 사용하지마. 한국인같은 구어체를 사용해라.

Scope:
- This is an active conversation mode, not a one-shot opening line.
- Keep follow-up questions inside preference update unless the user explicitly changes topic.
- Do not drift into generic onboarding or opportunity-intake questions like "어떤 기회를 찾고 계신지 알려주세요" unless the user asks to start a broad search.

Follow-up behavior:
- Ask one question at a time.
- Prefer short confirmation loops: "좋아요, 그럼 앞으로 X는 제외하고 Y를 우선으로 볼게요." Then ask only one useful next question if needed.
- When the user gives a new or changed preference, use available profile/memory update tools when appropriate, then explain briefly how Harper will use it for future recommendations.
- Do not launch a broad job search unless the user explicitly asks to see roles now.
- Keep it light; this starter exists so the user can quickly correct matching criteria.
- 유저가 이제 없어 / 그만하자 라는 식으로 말한다면 충분히 좋은 정보들을 받은 것 같아요. 감사합니다. 통화를 종료할까요? 라고 묻고, 수락하면 종료한다.
`.trim();

const PREFERENCE_UPDATE_TURN_INSTRUCTION_EN =
  `${PREFERENCE_UPDATE_TURN_INSTRUCTION}`.trim();

const MATCH_QUALITY_TURN_INSTRUCTION = `
## 현재 통화는 유저가 "더 이야기하고 더 좋은 연결 받기" 버튼을 클릭해서 시작되었다.

목표:
- 사용자의 이력 뒤에 있는 맥락, 강점, 성과, 선택의 이유를 더 잘 이해한다.
- 회사에 소개할 때 단순 이력 나열이 아니라 “왜 이 사람을 만나볼 만한지”가 자연스럽게 전달되도록 한다.
- 가장 중요: 실제 한국인이 말하듯이 자연스럽게 말한다. 딱딱한 상담원 말투, 제품 설명 말투, 시스템 메시지 같은 표현은 쓰지 않는다.
- Harper를 주어로 쓰지 말고, 필요하면 “제가”, “제 입장에서는”처럼 말한다.

좋은 질문 주제:
1. 프로필에 적혀있지 않지만 공유하고 싶은 좋은 경험 혹은 더 자세하게 이야기 하고싶은 경험, 성과 등
2. 이직/전환/창업/짧은 재직 기간/비어있는 경력 기간의 이유
3. 개인적인 강점, 좋아하는/잘 아는 도메인, 일할 때의 태도, 평소에 직무 관련해서 하는 것들 등

Follow-up behavior:
- Ask one concrete question at a time.
- Avoid generic "tell me more" prompts; make the next question answerable.
- This is an active conversation mode, not a one-shot opening line. The next assistant question after each user answer must continue the background/experience thread unless the user explicitly changes topic.
- Do not drift into generic onboarding or opportunity-intake questions like "어떤 기회를 찾고 계신지 알려주세요" unless the user asks to talk about target opportunities.
- When the user shares useful background, strengths, achievements, or transition context, use available profile/memory update tools when appropriate.
- Do not turn this into a long interview; keep a natural, optional conversation pace.
- 유저가 이제 없어 / 그만하자 라는 식으로 말한다면 충분히 좋은 정보들을 받은 것 같아요. 감사합니다. 통화를 종료할까요? 라고 묻고, 수락하면 종료한다.
`.trim();

const MATCH_QUALITY_TURN_INSTRUCTION_EN =
  `${MATCH_QUALITY_TURN_INSTRUCTION}`.trim();

export const CAREER_CONVERSATION_STARTER_PROMPT_COPY: Record<
  CareerConversationStarterId,
  CareerConversationStarterPromptCopy
> = {
  match_quality: {
    chatMessage: {
      key: "career.common.conversation_starters.1qmlix7",
      fallback: "제 정보와 경험을 조금 더 자세히 이야기할 수 있어요.",
    },
    callOpeningText: {
      en: MATCH_QUALITY_CALL_OPENING_TEXT_EN,
      ko: MATCH_QUALITY_CALL_OPENING_TEXT,
    },
    turnInstruction: {
      en: MATCH_QUALITY_TURN_INSTRUCTION_EN,
      ko: MATCH_QUALITY_TURN_INSTRUCTION,
    },
  },
  preference_update: {
    chatMessage: {
      key: "career.common.conversation_starters.1gwajda",
      fallback: "선호 조건을 업데이트하고 싶어요.",
    },
    callOpeningText: {
      en: PREFERENCE_UPDATE_CALL_OPENING_TEXT_EN,
      ko: PREFERENCE_UPDATE_CALL_OPENING_TEXT,
    },
    turnInstruction: {
      en: PREFERENCE_UPDATE_TURN_INSTRUCTION_EN,
      ko: PREFERENCE_UPDATE_TURN_INSTRUCTION,
    },
  },
};

export function getCareerConversationStarter(
  value: unknown,
  locale?: string | null
): CareerConversationStarterAction | null {
  if (
    typeof value !== "string" ||
    !CAREER_CONVERSATION_STARTER_IDS.includes(
      value as CareerConversationStarterId
    )
  ) {
    return null;
  }

  const starterId = value as CareerConversationStarterId;
  const copy = CAREER_CONVERSATION_STARTER_PROMPT_COPY[starterId];
  const promptLocale = normalizeCareerPromptLocale(locale);

  return {
    id: starterId,
    chatMessage: careerT(
      locale,
      copy.chatMessage.key,
      copy.chatMessage.fallback
    ),
    callOpeningText: copy.callOpeningText[promptLocale],
    turnInstruction: copy.turnInstruction[promptLocale],
  };
}
