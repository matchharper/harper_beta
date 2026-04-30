import {
  extractSection,
  fillPlaceholders,
  loadPrompt,
} from "@/lib/talentOnboarding/prompts";
import { TALENT_ONBOARDING_DONE_MARKER } from "@/lib/talentOnboarding/completion";
import { TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { registerLazyReset } from "@/lib/talentOnboarding/prompts/promptCache";
import { logger } from "@/utils/logger";

export type CareerPromptInsightItem = {
  key: string;
  label?: string;
  promptHint: string;
};

export type CareerPromptProfile = {
  resume_file_name?: string | null;
  resume_links?: string[] | null;
};

export type CareerTranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

export type CareerPromptBlock = {
  cacheable?: boolean;
  key: string;
  text: string;
};

export type CareerPromptChannel = "chat" | "voice";
export type CareerToolPolicyChannel = CareerPromptChannel;

export type CareerPromptPlan = {
  isOnboardingActive: boolean;
  promptBlocks: CareerPromptBlock[];
  toolPolicy: string;
};

export const CAREER_CALL_END_MARKER = "##END##";

let careerFirstVisitText: string | null = null;
export function getCareerFirstVisitText(): string {
  if (!careerFirstVisitText) {
    careerFirstVisitText = extractSection(
      loadPrompt("misc.md"),
      "firstVisitText"
    );
  }
  return careerFirstVisitText;
}

let careerInterruptHandlingPrompt: string | null = null;
export function getCareerInterruptHandlingPrompt(): string {
  if (!careerInterruptHandlingPrompt) {
    const miscMd = loadPrompt("misc.md");
    careerInterruptHandlingPrompt =
      "## Interrupt 처리\n" + extractSection(miscMd, "Interrupt 처리");
  }
  return careerInterruptHandlingPrompt;
}

let careerCallEndInstructionPrompt: string | null = null;
export function getCareerCallEndInstructionPrompt(): string {
  if (!careerCallEndInstructionPrompt) {
    careerCallEndInstructionPrompt =
      "## 통화 종료 시그널\n" +
      fillPlaceholders(
        extractSection(loadPrompt("misc.md"), "통화 종료 시그널"),
        { CALL_END_MARKER: CAREER_CALL_END_MARKER }
      );
  }
  return careerCallEndInstructionPrompt;
}

function resetCareerLazyPrompts(): void {
  careerFirstVisitText = null;
  careerInterruptHandlingPrompt = null;
  careerCallEndInstructionPrompt = null;
}

registerLazyReset(resetCareerLazyPrompts);

export const CAREER_CHAT_CAPABILITY_GUIDANCE = `
## Harper가 도울 수 있는 일
사용자가 회사, 포지션, 지원 가능성, 면접, 이직 준비, 채용공고에 대해 말하면 아래 기능 중 맥락에 가장 맞는 1가지를 자연스럽게 제안할 수 있다.
- 지원서 초안 작성: 지금까지의 대화, 이력서, 링크, 구조화된 프로필을 바탕으로 지원서 문항 답변이나 자기소개/지원동기 초안을 작성할 수 있다.
- 회사 리서치: 공개된 최신 정보와 채용 맥락을 조사해 회사의 사업, 팀, 포지션, 장점, 우려 지점, 확인할 질문을 한 장짜리 리포트처럼 정리할 수 있다. 사용자에게는 '뒷조사'가 아니라 '회사 리서치' 또는 '회사/포지션을 한번 정리해보기'처럼 부드럽게 표현한다.
- 맞춤 채용공고 탐색: 사용자의 선호, 경력, 제약조건을 바탕으로 맞을 만한 포지션/채용공고를 찾아볼 수 있다. 인터넷의 모든 Job Posting을 탐색해서 알려준다.
- 이미 실행한 것처럼 말하지 말고, 사용자가 원하면 도와줄 수 있다고 말한다. 사용자가 명확히 요청하면 바로 진행한다.
- 예: '원하면 제가 이 회사/포지션을 공개 정보 기준으로 정리해서 한 장짜리 리포트처럼 만들어드릴게요.'
`;

export const CAREER_ONBOARDING_CONVERSATION_PROMPT = `
### 현재 회원은 아직 가입 후 첫 기본 대화가 완료되지 않았다.
모든 회원은 처음에 가입 후 짧은 기본 대화를 Harper와 해야한다. 그래야 회원의 선호와 니즈와 역량을 파악하고, 좋아할만한 기회를 가져다 줄 수 있기 때문이다.
이 경우 Harper는 대화를 통해 회원에 대한 기본 정보를 얻어내야한다.

### Rules
- 매번 똑같은 형태로 반복해서 질문.말하지 마라.
  어떤 경우에는 내가 이해한게 맞는지 re-paraphrase해서 질문할 수도 있고, 어떤 경우에는 "좋아할만한 팀을 찾기위해서 꼭 중요한 질문이 있는데"를 앞에 붙일 수도 있다. 혹은 "아까 ~~라고 했는데, 좀 더 자세히 말해주실래요?", "부담갖지 마시고 편하게 대답해주세요. 이전 회사에서는 어떤 작업을 했나요?" 등
- 팔로업 질문 룰 : Follow-up 질문은 아래 3가지 중 하나를 만족해야 한다:
1. 구체화 (abstract → concrete)
2. 우선순위 명확화 (여러 개 중 무엇이 더 중요한지)
3. trade-off 확인 (A vs B)
- 새 질문 토픽 : 새 질문은 가능한 한 직전 답변의 핵심 단어 또는 의미와 연결되도록 하라.
  후보자가 방금 말한 내용과 무관한 새 주제로 갑자기 점프하지 마. 질문 전환이 필요하다면 짧게 연결 문장을 사용해.
- 후보자가 반복해서 사용하는 표현이나 가치 기준(startup, research, product, team, GPU 등)을 기억하고 이후 질문과 요약에 재사용하라.
  단, 같은 문구를 기계적으로 반복하지 말고 맥락에 맞게 자연스럽게 녹여 써야행
- 질문해야하는 사항이 얼마 남지 않았다면, 그 사실을 유저에게 알림으로써 심리적 부담이 적어지도록 해라.

### Optional question pool
아래 질문들은 insight coverage 질문이 아닌 optional 질문이다.
반드시 물어볼 필요는 없고, 대화 흐름상 자연스럽게 이어질 때만 한 번씩 사용해라. 끝까지 아껴두지 말고, 사용자의 최신 답변이나 프로필 맥락과 연결될 때 opportunistic하게 물어봐라.

사용 조건:
- 사용자의 최신 답변 또는 프로필 맥락에서 자연스럽게 이어질 때만 묻는다.
- 답이 필요하지 않다면 묻지 않는다. (ex. 이력에 공백이 없다면 공백 질문을 하지 않는다.)
- 질문은 짧은 문장으로 한다.
- 더 중요한 insight 질문 흐름이 자연스럽게 진행 중이면 optional 질문을 억지로 끼워 넣지 않는다.
- optional 질문은 전체 온보딩 중 최대 3개까지만 한다.

Optional question list:
- 최근 특정 중요한 경험에 대한 정보가 부족하다면(6개월짜리 이력이 있는데 정보가 거의 없다면), 가볍게 더 묻는다.
- 최근 회사/프로젝트는 적혀 있지만 직접적인 본인의 역할이 불명확하면, 직접 맡은 부분을 묻는다. (그 프로젝트에서 본인이 직접 기여한 핵심 부분은 어디였어요? 등)
- 최근 커리어 전환이 눈에 띄지만 이유가 불명확하면 혹은 현재 이직을 적극적으로 탐색하고 있다면, 전환 계기를 묻는다.
- 최근 프로필 이력에 3개월 이상 공백이 있거나 최근 3개월 공백이 보이면, 그 시기에 무엇을 했는지 가볍게 묻는다.

Goal is to gradually learn and update the following fields when enough evidence is available:
1. 지금 어떤 상태인지. 얼마나 취직/이직을 원하고, 만약 이직이라면 이직하고싶은 이유가 뭔지
2. 어떤 기회를 선호하는지. 직무일 수도 있고, 회사의 규모, 회사 분위기, 도메인일 수도 있고, 미국 이직을 원할 수도 있고. 원하는 팀 환경, 조건 등등. 강한 선호 조건, 강한 회피 조건 파악.
3. 위 Optional question pool은 insight와 별개로, 자연스러운 타이밍에만 참고한다.
4. 마지막에는 종료하기전에 "Did I capture your priorities accurately? Is there anything I missed?" 식으로 추가로 말하고 싶은게 있는지를 한번 물어본 뒤 종료해야함.

### 종료 규칙 
위 데이터가 충분히 수집되면 더 이상 새 insight coverage 질문은 하지 마라.
- 단, 사용자의 최신 답변이나 이력/경력 맥락에서 Optional question이 아주 자연스럽게 이어지고, 짧게 끝날 수 있다면 하나만 물을 수 있다.
- 필수적인 optional 질문이 없거나 이미 물었다면, 대화를 부드럽게 요약하고 기대감을 주며 종료하십시오.
- optional 질문에 답을 받았다면 새 주제로 확장하지 말고, 짧게 반영한 뒤 종료하십시오.
- 온보딩을 실제로 종료하는 마지막 답변의 맨 끝에는 반드시 ${TALENT_ONBOARDING_DONE_MARKER} 를 붙여라.
- 아직 온보딩을 끝내지 않을 답변, 추가 질문, 확인 질문, 중간 요약에는 절대 ${TALENT_ONBOARDING_DONE_MARKER} 를 붙이지 마라.
- ${TALENT_ONBOARDING_DONE_MARKER} 는 시스템 처리를 위한 마커다. 사용자에게 읽어주거나 설명하지 마라.

[채널별 턴(Turn) 수 제어]
- 만약 현재 채널이 [Voice]라면: 유저의 피로도를 고려하여 최대한 질문을 압축하고, 10~15턴 내외에서 자연스럽게 대화를 종료하십시오.
- 만약 현재 채널이 [Chat]이라면: 최대 18턴 내외를 마지노선으로 잡고 즉각적으로 요약 및 종료 멘트를 출력하십시오.

[종료 멘트 가이드 (그대로 읽지 말고 자연스럽게 변형할 것)]
"00님과 깊은 이야기를 나누다 보니 어떤 곳이 완벽한 핏일지 선명해졌습니다. 오늘 주신 기준을 바탕으로, 00님의 역량을 200% 환영할 만한 좋은 기회들을 저희가 선별해 보겠습니다. 조만간 00님과 핏이 아주 잘 맞는 곳에서 연락이 오면, 그때 추가적인 이야기를 나누기 위해 다시 찾아오겠습니다. 시간 내주셔서 감사합니다!"
`;

export const CAREER_CHAT_SYSTEM_PROMPT = `
You are a highly skilled recruiting conversation assistant, Harper - career partner.
Your role is to talk with candidates in a natural, warm, professional way and gradually learn the key information needed to understand them, their background, their interests, and what kinds of opportunities may fit them.
Your job is NOT to interrogate the candidate, dump a long questionnaire, or sound like a form. Your job is to make the conversation feel human, comfortable, and relevant while still collecting useful recruiting signals over time.

- Harper는 대화를 통해서 인재의 역량과 니즈와 선호를 파악하고, 거기에 맞게 원하는 정보를 찾아서 주기적으로 알려주거나 채용담당자와 직접 연결해준다. 혹은 인터넷의 모든 Job Posting을 탐색한뒤 선호할만한 공고만 알려주고, 새로운 기회를 발견하면 주기적으로 추가적인 사항들을 알려준다.
- Harper는 헤드헌터처럼 사용자가 가만히 있는 동안에도 뒤에서 여러 회사들과 계속 이야기하고, 별개로 추가적으로 좋은 기회가 있는지 항상 찾고 있다. 그러다가 정말 잘 맞는 기회가 나오면 그때 자연스럽게 가져다주는 역할도 한다.
- Harper에게 인재 채용(풀타임, 파트타임 등)을 요청하는 회사/스타트업들도 있기 때문에 그 경우 적합한 인재라고 판단되면 혹시 의사가 있는지 인재에게 물어본다. 만약 Harper가 판단했을 때 아주 적합한 기회라고 판단되면 회사에게 먼저 인재를 추천하고 프로필을 알려준다음 회사의 의향을 받아서 인재에게 회사의 제안을 수락할지 물어볼 수도 있다. 이렇게되면 사실 프로세스 한단계를 건너뛰고 2단계 스텝부터 시작하기 때문에 더 판단이 쉽다.
대신 이건 아주 적합한 기회에만 이루어지긴 하지만 프로필이 먼저 회사에 공개될 수 있기 때문에, 프로필 설정에서 Open to matches로 바꾸어야 가능하다.
- 채용담당자는 Harper가 먼저 적절한 회사와 연결된다음 제안할거기 때문에 시간이 좀 걸릴 수 있다. 하지만 빠른 이직을 원하면 알려주세요. 더 노력해보겠습니다.
- 찾고있는 기회를 말해주면 통화/대화가 끝난뒤 메일로 보내주고, 기회 탭에도 넣어준다.

## Current context
현재 후보자와 {channel_type}을 통해 소통하고 있습니다. (Voice Call or Text Chat)

## Response formatting
- 현재 채널이 [Text Chat]일 때는 markdown을 사용할 수 있다.
- 필요한 경우에만 짧은 제목, bullet list, numbered list, bold, link, inline code, fenced code block을 사용해 가독성을 높여라.
- markdown을 매 답변마다 억지로 쓰지 말고, 요약/정리/비교처럼 구조화가 도움이 될 때만 간결하게 사용하라.
- 모바일에서 읽기 쉽게 항목 수와 문장 길이를 짧게 유지하고, 과도한 중첩 목록이나 큰 표는 피하라.
- 현재 채널이 [Voice Call]일 때는 markdown 문법을 의식하지 말고 자연스럽게 말하듯 답하라.

## Negative constraints
1. [장황한 질문 금지 (핵심)]: AI 특유의 길고 복잡한 문장, 불필요한 수식어를 절대 피하십시오. 질문은 구어체로 사람처럼 짧고 명확하게 던지십시오. 맥락이나 예시를 줄 때만 길게 말하되, 상대방이 대답해야 할 핵심 질문 자체는 무조건 심플해야 합니다.
2. [딱딱한 용어 금지]: '파트너사', '구인기업', '고객사' 등의 B2B 용어를 절대 사용하지 마십시오. 무조건 '좋은 기회', '핏이 잘 맞는 곳', '다음 챕터' 등으로 부드럽게 지칭하십시오.
3. [역방향 질문 금지]: 대화의 흐름이 뒤죽박죽 섞여 기계처럼 보이지 않도록 하십시오. 현실적인 조건(보상, 이사 등)을 논의하다가 갑자기 비전이나 도메인 관련 질문으로 뜬금없이 되돌아가지 마십시오.
4. [규모 과장 및 면접관 톤 금지]: Harper의 규모를 과장하거나("수많은 기회"), 후보자를 평가하는 뉘앙스("증명해 보세요")를 금지합니다.

## Context analysis and threshold
대화시, 후보자의 프로필을 종합적으로 분석하여 페르소나를 아래 기준에 따라 분류하고 화법을 설정해라.
- 단순히 연차로만 재단하지 말고, 회사 규모와 실제 수행한 역할의 크기를 종합적으로 판단하십시오.
- [리더/시니어급]: Lead, Head, C-level, Founder, Manager 직함이 있거나, 연차가 짧더라도 프로젝트/팀을 주도적으로 리딩한 경험이 뚜렷한 경우. (방향: 전략, 0 to 1 세팅, 비즈니스 임팩트 중심)
- [실무/전문가급]: Software Engineer, Product Manager 등 직무 중심 타이틀을 가지며 본인의 직접적인 산출물에 집중해 온 경우. (방향: 직접적인 실무 기여도, 기술/직무적 뎁스 중심)

## Profile visibility guidance
후보자가 “스타트업에게 먼저 제안을 받고 싶다”, “좋은 회사에서 연락이 오면 좋겠다”, “매칭을 더 열어두고 싶다”처럼 회사/스타트업 쪽 선제 제안을 원한다고 말한 경우, 현재 Structured Talent Profile의 Profile visibility를 확인한다.

- Profile visibility가 "Open to matches"가 아니라면, 자연스럽게 다음 취지로 안내한다:
  "먼저 스타트업에게서 제안을 받고 싶다면 프로필 공개 수준을 'Open to matches'로 바꾸시면 좋아요."
- 이미 "Open to matches"라면 바꾸라고 말하지 말고, 이미 제안을 받을 수 있는 상태라고 알려준다.
- 사용자가 프로필 공개/개인정보/현직장 노출을 걱정하는 맥락이면 무리하게 권하지 말고, 차단 회사 설정이나 공개 범위를 먼저 설명한다.
- 매 답변마다 반복하지 말고, 사용자의 의도가 명확할 때만 1회성으로 짧게 말한다.

## Harper가 도울 수 있는 일
사용자가 회사, 포지션, 지원 가능성, 면접, 이직 준비, 채용공고에 대해 말하면 아래 기능 중 맥락에 가장 맞는 1가지를 자연스럽게 제안할 수 있다.
- 지원서 초안 작성: 지금까지의 대화, 이력서, 링크, 구조화된 프로필을 바탕으로 지원서 문항 답변이나 자기소개/지원동기 초안을 작성할 수 있다.
- 회사 리서치: 공개된 최신 정보와 채용 맥락을 조사해 회사의 사업, 팀, 포지션, 장점, 우려 지점, 확인할 질문을 한 장짜리 리포트처럼 정리할 수 있다. 사용자에게는 '뒷조사'가 아니라 '회사 리서치' 또는 '회사/포지션을 한번 정리해보기'처럼 부드럽게 표현한다.
- 맞춤 채용공고 탐색: 사용자의 선호, 경력, 제약조건을 바탕으로 맞을 만한 포지션/채용공고를 찾아볼 수 있다.
- 이미 실행한 것처럼 말하지 말고, 사용자가 원하면 도와줄 수 있다고 말한다. 사용자가 명확히 요청하면 바로 진행한다.
- 예: '원하면 제가 이 회사/포지션을 공개 정보 기준으로 정리해서 한 장짜리 리포트처럼 만들어드릴게요.'
`;

function buildCareerSharedSystemPrompt(
  channelType: "Text Chat" | "Voice Call"
) {
  return CAREER_CHAT_SYSTEM_PROMPT.replace(/\{channel_type\}/g, channelType);
}

function getCareerChannelType(channel: CareerPromptChannel) {
  return channel === "voice" ? "Voice Call" : "Text Chat";
}

function buildKnownInsightsSection(args: {
  content: Record<string, string> | null;
  maxPerValue: number;
  maxTotal: number;
  quoteKeys?: boolean;
}) {
  const { content, maxPerValue, maxTotal, quoteKeys = false } = args;
  if (!content || Object.keys(content).length === 0) return "";

  let section = "\n## 이미 알고 있는 정보 (재질문 금지, 더 깊은 질문에 활용)\n";
  let totalLen = section.length;
  const sortedEntries = Object.entries(content).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (const [key, value] of sortedEntries) {
    const truncated =
      value.length > maxPerValue ? `${value.slice(0, maxPerValue)}...` : value;
    const renderedKey = quoteKeys ? `"${key}"` : key;
    const renderedValue = quoteKeys ? `"${truncated}"` : truncated;
    const line = `- ${renderedKey}: ${renderedValue}\n`;
    if (totalLen + line.length > maxTotal) break;
    section += line;
    totalLen += line.length;
  }

  return section;
}

function buildExtractionKnownInsightsSection(
  content: Record<string, string> | null
) {
  if (!content || Object.keys(content).length === 0) return "";

  return (
    "\n## Currently Known Insights\n" +
    Object.entries(content)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 20)
      .map(
        ([key, value]) =>
          `- "${key}": "${value.length > 150 ? `${value.slice(0, 150)}...` : value}"`
      )
      .join("\n")
  );
}

function renderCareerPromptBlocks(blocks: CareerPromptBlock[]) {
  return blocks
    .map((block) => block.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function normalizeToolNames(toolNames?: readonly string[] | string) {
  if (Array.isArray(toolNames)) {
    return toolNames
      .map((name) => String(name ?? "").trim())
      .filter((name) => name.length > 0);
  }

  if (typeof toolNames === "string") {
    return toolNames
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  return [];
}

function buildProfileContextBlock(args: {
  profile: CareerPromptProfile | null;
  structuredProfileText: string;
}) {
  return [
    `Resume file: ${args.profile?.resume_file_name ?? "(none) - 유저에 대한 정보가 더 필요하지만 Resume가 없는 경우, 이력서를 올려달라고 가볍게 부탁해라."}`,
    "",
    args.structuredProfileText || "[Structured Talent Profile]\n(none)",
  ].join("\n");
}

function buildUncoveredInsightSection(args: {
  coverageRatio: number;
  isOnboardingActive: boolean;
  topUncovered: string;
}) {
  if (!args.isOnboardingActive) {
    return [
      "Onboarding is already completed. Do not restart the onboarding checklist.",
    ].join("\n");
  }

  if (args.topUncovered && args.coverageRatio < TALENT_INTERVIEW_MIN_COVERAGE) {
    return [
      "Prioritize naturally asking about these uncovered topics (one at a time):",
      args.topUncovered,
    ].join("\n");
  }

  return [
    "Insight coverage is sufficient. Stop asking new insight-coverage questions.",
    "Closing is allowed now, but do not force an immediate ending if one lightweight optional question naturally follows from the latest answer or career context.",
    "If no optional question clearly fits now, close the onboarding politely using the end marker rule above.",
  ].join("\n");
}

function buildCareerConversationPromptPlan(args: {
  callEndInstruction?: string;
  channel: CareerPromptChannel;
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  interruptHandling?: string;
  isOnboardingDone?: boolean;
  profile: CareerPromptProfile | null;
  recentConversationSection?: string;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
  totalInsightCount: number;
  uncoveredItems: CareerPromptInsightItem[];
  userTurnCount: number;
}): CareerPromptPlan {
  const channelType = getCareerChannelType(args.channel);
  const coverageRatio =
    args.totalInsightCount > 0 ? args.coveredCount / args.totalInsightCount : 1;
  const coverageThresholdPercent = Math.round(
    TALENT_INTERVIEW_MIN_COVERAGE * 100
  );
  const existingInsightsSection = buildKnownInsightsSection({
    content: args.currentInsightContent,
    maxPerValue: args.channel === "voice" ? 120 : 150,
    maxTotal: args.channel === "voice" ? 1500 : 2000,
    quoteKeys: args.channel === "chat",
  });
  const topUncovered = args.uncoveredItems
    .slice(0, 10)
    .map((item) => `- ${item.promptHint}`)
    .join("\n");
  const isOnboardingActive = !Boolean(args.isOnboardingDone);
  const profileContextBlock = buildProfileContextBlock({
    profile: args.profile,
    structuredProfileText: args.structuredProfileText,
  });
  const toolPolicy = isOnboardingActive
    ? ""
    : buildCareerToolPolicyPrompt({
        channel: args.channel,
        toolNames: normalizeToolNames(args.toolNames),
      });

  const dynamicStateLines = [
    `## Runtime context \n현재 후보자와 ${channelType}을 통해 소통하고 있습니다. (Voice Call or Text Chat) \n현재 시각 : ${new Date().toLocaleString()}`,
    `Insight coverage: ${args.coveredCount}/${args.totalInsightCount} items covered.`,
    `Completion threshold: ${coverageThresholdPercent}% coverage.`,
    existingInsightsSection,
    args.recentConversationSection ?? "", // voice 일 때만 들어감
    buildUncoveredInsightSection({
      coverageRatio,
      isOnboardingActive,
      topUncovered,
    }),
    `Current user turn count: ${args.userTurnCount}.`,
  ].filter((value) => value && value.trim().length > 0);

  const promptBlocks: CareerPromptBlock[] = [
    {
      key: "chat_core",
      text: buildCareerSharedSystemPrompt(channelType),
      cacheable: true,
    },
  ];

  if (isOnboardingActive) {
    promptBlocks.push({
      key: "onboarding_rules",
      text: CAREER_ONBOARDING_CONVERSATION_PROMPT,
      cacheable: true,
    });
  }

  if (args.channel === "voice") {
    const voiceRules = [
      args.interruptHandling,
      args.callEndInstruction,
      "## Voice Call Style\n질문은 짧게 하나씩만 하고, 사용자가 듣고 바로 답할 수 있는 자연스러운 구어체로 말하라. Markdown 문법, 긴 목록, 표 형식은 사용하지 마라.",
    ]
      .filter((value) => value && value.trim().length > 0)
      .join("\n\n");

    if (voiceRules) {
      promptBlocks.push({
        key: "voice_call_rules",
        text: voiceRules,
        cacheable: true,
      });
    }
  }

  if (toolPolicy) {
    promptBlocks.push({
      key: "tool_policy",
      text: toolPolicy,
      cacheable: true,
    });
  }

  promptBlocks.push({
    key: "profile_context",
    text: profileContextBlock,
    cacheable: true,
  });

  promptBlocks.push({
    key: "dynamic_state",
    text: dynamicStateLines.join("\n\n"),
  });

  return {
    isOnboardingActive,
    promptBlocks,
    toolPolicy,
  };
}

export function buildCareerChatPromptBlocks(args: {
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  isOnboardingDone?: boolean;
  profile: CareerPromptProfile | null;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
  totalInsightCount: number;
  uncoveredItems: CareerPromptInsightItem[];
  userTurnCount: number;
}): CareerPromptPlan {
  const plan = buildCareerConversationPromptPlan({
    ...args,
    channel: "chat",
  });

  logger.log("\n\n topUncovered : ", args.uncoveredItems);
  logger.log(
    "\n\n existingInsightsSection : ",
    buildKnownInsightsSection({
      content: args.currentInsightContent,
      maxPerValue: 150,
      maxTotal: 2000,
      quoteKeys: true,
    })
  );

  return plan;
}

export function buildCareerRealtimeRecentConversationSection(
  messages: Array<{ content: string; role: string }>
) {
  const recentMessages = messages.filter((message) => message.content.trim());
  if (recentMessages.length === 0) return "";

  const maxTotal = 2200;
  const maxPerMessage = 280;
  let section = "\n## 최근 대화 내역 (이전 흐름을 이어서 자연스럽게 대화)\n";
  let totalLength = section.length;

  for (const message of recentMessages) {
    const roleLabel = message.role === "assistant" ? "Harper" : "사용자";
    const normalizedContent = message.content.replace(/\s+/g, " ").trim();
    const truncatedContent =
      normalizedContent.length > maxPerMessage
        ? `${normalizedContent.slice(0, maxPerMessage)}...`
        : normalizedContent;
    const line = `- ${roleLabel}: ${truncatedContent}\n`;

    if (totalLength + line.length > maxTotal) break;
    section += line;
    totalLength += line.length;
  }

  section +=
    "위 대화의 마지막 맥락에서 이어서 말하고, 이미 한 소개나 질문을 처음부터 반복하지 마라.";
  return section;
}

export function buildCareerRealtimePromptPlan(args: {
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  interruptHandling: string;
  isOnboardingDone?: boolean;
  callEndInstruction: string;
  recentConversationSection: string;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
  totalInsightCount: number;
  uncoveredItems: CareerPromptInsightItem[];
  userTurnCount: number;
  profile: CareerPromptProfile | null;
}) {
  const plan = buildCareerConversationPromptPlan({
    callEndInstruction: args.callEndInstruction,
    channel: "voice",
    coveredCount: args.coveredCount,
    currentInsightContent: args.currentInsightContent,
    interruptHandling: args.interruptHandling,
    isOnboardingDone: args.isOnboardingDone,
    profile: args.profile,
    recentConversationSection: args.recentConversationSection,
    structuredProfileText: args.structuredProfileText,
    toolNames: args.toolNames,
    totalInsightCount: args.totalInsightCount,
    uncoveredItems: args.uncoveredItems,
    userTurnCount: args.userTurnCount,
  });

  return {
    ...plan,
    instructions: renderCareerPromptBlocks(plan.promptBlocks),
  };
}

export function buildCareerRealtimeInstructionsPrompt(
  args: Parameters<typeof buildCareerRealtimePromptPlan>[0]
) {
  return buildCareerRealtimePromptPlan(args).instructions;
}

export function buildCareerToolPolicyPrompt(args: {
  channel: CareerToolPolicyChannel;
  toolNames: readonly string[] | string;
}) {
  const toolNames = normalizeToolNames(args.toolNames);
  if (toolNames.length === 0) return "";

  const toolNameText = toolNames.join(", ");
  const hasCompanySnapshotTool = toolNames.includes("prepare_company_snapshot");
  const hasRecommendedOpportunitiesTool = toolNames.includes(
    "read_recommended_opportunities"
  );
  const hasJobPostingRecommendationTool = toolNames.includes(
    "recommend_job_postings"
  );
  const channelRule =
    args.channel === "voice"
      ? "- Voice mode: if a tool is needed, call it directly. The client may play a short tool-specific preamble, so do not add extra filler before tool use."
      : "- Chat mode: if a tool is needed, call it directly and then answer naturally in Korean using only the relevant findings.";

  return [
    "## Tool Use Policy",
    `Available tools: ${toolNameText}`,
    ...(args.channel === "voice"
      ? [
          "- Voice call limitation: UI-card tools are not available during a live voice call. Do not claim that you can show buttons or cards inside the call.",
          "- If the user asks for full company snapshot/research during voice, explain in Korean that you can help after ending the call in text chat, where Harper can create the relevant setup card and button.",
        ]
      : []),
    ...(hasCompanySnapshotTool
      ? [
          "- If the user directly asks you to investigate, research, or assess a specific company, call `prepare_company_snapshot`. This tool prepares a company-research setup UI; do not run or summarize research yourself after calling it.",
          "- If the user only says they are unsure whether a company is good, ask if they want you to investigate it. Call `prepare_company_snapshot` only after the company is clear and the user wants the investigation.",
        ]
      : []),
    ...(hasRecommendedOpportunitiesTool
      ? [
          "- Use `read_recommended_opportunities` when the answer depends on opportunities already recommended to this user, such as comparing them, recalling links, explaining recommendation reasons, or checking prior feedback.",
        ]
      : []),
    ...(hasJobPostingRecommendationTool
      ? [
          "- Use `recommend_job_postings` when the user asks you to find, recommend, or match new job postings, open roles, positions, companies, or opportunities. This includes requests with specific constraints like role family, LLM/AI domain, location, work mode, seniority, or company type.",
          "- After `recommend_job_postings`, answer in Korean using the tool's `answerDraft` and keep the ranked roles, reasons, concerns, and links visible. Do not replace it with generic advice.",
        ]
      : []),
    "- Use `web_search` only when the user needs current, factual, or web-dependent information.",
    "- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context.",
    "- After tool use, summarize only the useful findings. Do not dump raw JSON.",
    "- Mention source names or URLs only when they materially help the user.",
    channelRule,
  ].join("\n");
}

export function buildCareerInsightExtractionPrompt(args: {
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  totalCount: number;
  uncoveredItems: CareerPromptInsightItem[];
}) {
  const checklistLines = args.uncoveredItems
    .map((item) => `- "${item.key}": ${item.promptHint}`)
    .join("\n");
  const existingSection = buildExtractionKnownInsightsSection(
    args.currentInsightContent
  );

  return `You are an insight extraction assistant. Given a recent conversation window (up to 3 messages) between a user and Harper (an AI career counselor), extract structured career insights.

Insight coverage: ${args.coveredCount}/${args.totalCount} items covered.
${existingSection}

## Checklist (extract when mentioned)
${checklistLines}

You may also extract free-form insights as snake_case keys with Korean values.

## Response Format
Return a valid JSON object:
{
  "extracted_insights": {
    "key_name": { "value": "extracted value in Korean", "action": "new" | "update" }
  }
}

- "new": key has no existing value
- "update": user corrected or enriched a previously known insight (value = final integrated text)
- If nothing to extract, return: { "extracted_insights": {} }
- Only include keys where the user provided clear information.`;
}

export function buildCareerInsightExtractionOnlyPrompt(args: {
  coveredCount: number;
  currentInsightContent: Record<string, string> | null;
  insightMdOverride?: string;
  totalCount: number;
  uncoveredItems: CareerPromptInsightItem[];
}) {
  const checklistLines = args.uncoveredItems
    .map((item) => `- "${item.key}": ${item.promptHint}`)
    .join("\n");
  const existingSection = buildExtractionKnownInsightsSection(
    args.currentInsightContent
  );
  const md = args.insightMdOverride ?? loadPrompt("insight-extraction.md");

  return fillPlaceholders(extractSection(md, "extractionOnly"), {
    coveredCount: args.coveredCount,
    totalCount: args.totalCount,
    checklistLines,
    existingInsightsSection: existingSection,
  });
}

export function buildCareerCallWrapupPrompt(args: {
  durationLabel: string | null;
  isBrief: boolean;
  isOnboardingDone?: boolean;
  transcript: CareerTranscriptEntry[];
}) {
  const lines = args.transcript
    .map(
      (entry) => `${entry.role === "user" ? "User" : "Harper"}: ${entry.text}`
    )
    .join("\n");

  return `당신은 Harper, AI 커리어 어드바이저입니다. 방금 음성 통화가 종료되었습니다.

통화 길이 평가는 "${args.isBrief ? "짧은 대화" : "충분히 진행된 대화"}"입니다.
${args.durationLabel ? `통화 시간은 ${args.durationLabel}입니다.` : ""}

사용자에게 보낼 마지막 한마디만 자연스럽게 작성하세요.

규칙:
- 한국어 존댓말로 작성
- 1~2문장, 최대 120자 정도
- 제목, 불릿, 번호, 요약 섹션 금지
- "통화 요약", "정리하면" 같은 표현 금지
- 온보딩이 아직 끝나지 않았다면: 아직 온보딩이 덜 끝났다는 점을 부드럽게 전하고, 채팅으로 이어서 이야기하거나 다음에 다시 통화로 온보딩을 마무리한 뒤 좋은 기회를 찾아드릴 수 있다고 말하기
- 온보딩이 끝났고 너무 짧은 대화였다면: 오늘은 짧게 들었으니 다음에 더 이야기해 달라고 부드럽게 안내
- 온보딩이 끝났고 충분한 대화였다면: 좋은 정보를 알려줘서 고맙고, 만족하실 만한 기회를 가져오겠다고 자연스럽게 말하기
- 과한 확신, 과장, 딱딱한 상담 문구 금지
- 응답은 메시지 본문 텍스트만 출력

온보딩 완료 여부: ${args.isOnboardingDone ? "완료" : "미완료"}

아래는 방금 통화 transcript입니다:

${lines || "(대화 내용이 거의 없었음)"}`;
}

export function buildCareerCallWrapupFallbackFollowUp(args: {
  isBrief: boolean;
  isOnboardingDone?: boolean;
}) {
  if (!args.isOnboardingDone) {
    return "아직 온보딩이 조금 남아 있어요. 채팅으로 이어서 이야기하시거나 다음에 다시 통화로 마무리해주시면, 온보딩이 끝난 뒤 좋은 기회를 찾아드릴게요.";
  }

  if (args.isBrief) {
    return "오늘은 짧게 이야기 나눴네요. 다음에 편하실 때 조금만 더 들려주시면 그에 맞춰 더 잘 도와드릴게요.";
  }

  return "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 만족하실 만한 기회를 잘 골라서 가져와볼게요.";
}

export const CAREER_REENGAGEMENT_FALLBACK_MESSAGE =
  "다시 이어서 이야기해볼게요. 지금 기준으로 가장 우선순위가 높은 커리어 조건이나 달라진 점이 있다면 알려주실 수 있을까요?";

export function buildCareerReengagementSystemPrompt() {
  return [
    "You are Harper, an AI career agent for talent users.",
    "Always answer in Korean.",
    "The user reopened the chat after a long pause.",
    "Write one proactive assistant message that appears before the user speaks.",
    "Rules:",
    "- Write 2-3 natural Korean sentences.",
    "- Keep it concise, warm, and specific.",
    "- Use the recent conversation and profile context if helpful.",
    "- Ask exactly one focused follow-up question.",
    "- Do not use bullet points, markdown, or quotes.",
    '- Do not mention internal mechanics like "자동 메시지", "시스템", or "24시간 이상".',
    "- Do not sound like a first-visit greeting.",
    "- If prior context is weak, ask what changed most recently in the user's priorities.",
  ].join("\n");
}

export function buildCareerReengagementUserPrompt(args: {
  displayName: string;
  hoursSinceLastChat: number;
  profileSummary: string;
  recentConversation: string;
}) {
  return [
    `사용자 이름: ${args.displayName}`,
    `직전 chat 이후 경과 시간(시간): ${args.hoursSinceLastChat}`,
    `프로필 요약:\n${args.profileSummary}`,
    `최근 대화:\n${args.recentConversation}`,
  ].join("\n\n");
}

export const CAREER_KICKOFF_FALLBACK = {
  acknowledgement: "정보를 알려주셔서 감사합니다.",
  insight:
    "제출해주신 이력서/링크 기반으로 볼 때 강점이 분명해서 하퍼가 찾을 수 있는 기회 폭이 넓습니다.",
};

export function buildCareerKickoffOpeningMessage(displayName: string) {
  const normalizedName =
    String(displayName ?? "")
      .trim()
      .replace(/\s*님$/, "") || "회원";
  return `${normalizedName}님이 실제로 만족할만한 기회를 찾기위해서, 몇 가지만 먼저 여쭤보고 싶어요.
현재 상황에 대한 간단한 소개나 어떤 기회를 찾고계신지 알려주실 수 있나요?`;
}

export function buildCareerKickoffSystemPrompt() {
  return [
    "You are Harper, an AI talent agent onboarding assistant.",
    "Always write in Korean.",
    "Return JSON only.",
    "JSON format:",
    "{",
    '  "acknowledgement": "...",',
    '  "insight": "..."',
    "}",
    "Rules:",
    '- acknowledgement should greet user naturally (e.g. "안녕하세요 OO님.") and thank for sharing.',
    "- insight should mention one promising point from the submitted information in 1-2 natural Korean sentences.",
  ].join("\n");
}

export function buildCareerKickoffUserPrompt(args: {
  displayName: string;
  links: string[];
  networkApplicationDescription: string;
  preferencesDescription: string;
  resumeFileName?: string | null;
  resumeTextPreview: string;
}) {
  return [
    `이름: ${args.displayName}`,
    `이력서 파일명: ${args.resumeFileName || "(없음)"}`,
    `링크: ${args.links.join(", ") || "(없음)"}`,
    `network 신청 정보: ${args.networkApplicationDescription || "(없음)"}`,
    `현재 선호 정보: ${args.preferencesDescription || "(없음)"}`,
    `이력서 텍스트(일부): ${args.resumeTextPreview || "(없음)"}`,
  ].join("\n");
}

export const CAREER_ONBOARDING_DEFER_PROMPT_TEXT = [
  "알겠습니다. 지금은 우선 등록만 마쳐둘게요. 나중에 다시 들어와 주세요.",
  "",
  "대신 기본적인 상황만 먼저 알려주시면, 필요할 때 더 빠르게 이어갈 수 있습니다.",
  "",
  "현재 어떤 기회를 찾고 있는지 선택해 주세요. 여러 개 선택하셔도 됩니다.",
].join("\n");

export const CAREER_ONBOARDING_DEFER_FALLBACK_CLOSE_TEXT = [
  "알겠습니다. 지금 말씀해주신 상황으로 우선 등록을 마쳐둘게요.",
  "나중에 다시 들어오시면 이어서 더 자세히 도와드리겠습니다.",
  "원하시면 아래 버튼으로 지금 바로 계속 대화하셔도 됩니다.",
].join(" ");

export function buildCareerOnboardingDeferCloseSystemPrompt() {
  return [
    "You are Harper, an AI talent agent for career onboarding.",
    "Always answer in Korean.",
    "The user chose to postpone the main conversation and only shared their current opportunity preferences.",
    "Write a short closing message in 2-3 sentences.",
    "Rules:",
    "- Acknowledge the selected preferences.",
    "- Say that Harper will save the registration for now.",
    "- Say the user can come back later or continue now.",
    "- Do not ask a follow-up question.",
    "- Do not use bullet points.",
  ].join("\n");
}

export function buildCareerProfileIngestionSystemPrompt() {
  return [
    "You normalize and enrich a candidate profile from LinkedIn + resume text.",
    "Return JSON only, with no markdown.",
    "Never hallucinate uncertain facts. If uncertain, leave field null or skip.",
    "Use the LinkedIn data and resume information to generate a full consolidated output.",
    "Do not return only delta/additional rows. Return full arrays for all sections.",
    "If resume has less information, it is valid to keep LinkedIn-derived values.",
    "Preserve company_id from the current LinkedIn experience when the final row refers to the same company.",
    "Preserve company_link from the current LinkedIn experience when the final row refers to the same company.",
    "Never invent a company_id.",
    "talentExtras is an array for awards, projects, publications, volunteering, certifications, or other notable details.",
    "Date format must be YYYY-MM-DD or null.",
    "Output schema:",
    "{",
    '  "talentUserPatch": {',
    '    "name": string|null,',
    '    "headline": string|null,',
    '    "bio": string|null,',
    '    "location": string|null,',
    '    "profile_picture": string|null',
    "  },",
    '  "talentExperiences": [',
    "    {",
    '      "role": string|null,',
    '      "description": string|null,',
    '      "start_date": "YYYY-MM-DD"|null,',
    '      "end_date": "YYYY-MM-DD"|null,',
    '      "months": number|null,',
    '      "company_name": string|null,',
    '      "company_location": string|null,',
    '      "company_id": number|null,',
    '      "company_link": string|null,',
    '      "memo": string|null',
    "    }",
    "  ],",
    '  "talentEducations": [',
    "    {",
    '      "school": string|null,',
    '      "degree": string|null,',
    '      "description": string|null,',
    '      "field": string|null,',
    '      "start_date": "YYYY-MM-DD"|null,',
    '      "end_date": "YYYY-MM-DD"|null,',
    '      "url": string|null,',
    '      "memo": string|null',
    "    }",
    "  ],",
    '  "talentExtras": [',
    "    {",
    '      "title": string|null,',
    '      "description": string|null,',
    '      "memo": string|null,',
    '      "date": "YYYY-MM-DD"|null',
    "    }",
    "  ],",
    '  "notes": string|null',
    "}",
  ].join("\n");
}

export function buildCareerProfileIngestionUserPrompt(args: {
  profileForPrompt: unknown;
  resumeText: string;
}) {
  return [
    "[Current Structured LinkedIn Data]",
    JSON.stringify(args.profileForPrompt, null, 2),
    "",
    "[Resume Text]",
    args.resumeText.slice(0, 14000),
  ].join("\n");
}

export function buildCareerRefreshExtractionPrompt(args: {
  emptyKeys: Array<{ key: string; label: string; promptHint: string | null }>;
}) {
  const keyList = args.emptyKeys
    .map((item) => {
      const hint = item.promptHint ?? `Information about: ${item.label}`;
      return `- "${item.key}" (${item.label}): ${hint}`;
    })
    .join("\n");

  return `You are an expert talent analyst. Extract career insights from the provided data.

## Data Sources
You have access to:
1. The talent's full conversation history (provided as chat messages)
2. Their structured profile and resume

## Target Keys
Extract values ONLY for these keys. Return Korean text for values.
${keyList}

## Rules
- Only include a key if you found clear, specific information
- Use Korean for all values
- If information is ambiguous or not found, omit the key entirely (do NOT guess)
- Be concise but informative (1-3 sentences per key)
- Do NOT include keys that are not in the target list above

## Response Format
Return a valid JSON object with exactly one field:
{
  "extracted_insights": {
    "key_name": "extracted Korean value"
  }
}

If no information is found for any key, return:
{ "extracted_insights": {} }`;
}
