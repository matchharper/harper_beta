import {
  extractSection,
  fillPlaceholders,
  loadPrompt,
} from "@/lib/talentOnboarding/prompts";
import { TALENT_ONBOARDING_DONE_MARKER } from "@/lib/talentOnboarding/completion";
import { TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX } from "@/lib/talentOnboarding/onboarding";
import { INSIGHT_CHECKLIST } from "@/lib/talentOnboarding/insightChecklist";
import { registerLazyReset } from "@/lib/talentOnboarding/prompts/promptCache";
import { logger } from "@/utils/logger";

export type CareerPromptProfile = {
  resume_file_name?: string | null;
  resume_links?: string[] | null;
};

export type CareerPromptPreferences = {
  engagementTypes?: string[] | null;
  preferredLocations?: string[] | null;
  careerMoveIntent?: string | null;
  careerMoveIntentLabel?: string | null;
  periodicIntervalDays?: number | null;
  recommendationBatchSize?: number | null;
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
  enabledToolNames: string[];
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

export const CAREER_ONBOARDING_CONVERSATION_PROMPT = `
### 현재 회원은 아직 가입 후 첫 기본 대화가 완료되지 않았다.
모든 회원은 처음에 가입 후 짧은 기본 대화를 Harper와 해야한다. 그래야 회원의 선호와 니즈와 역량을 파악하고, 좋아할만한 기회를 가져다 줄 수 있기 때문이다.
이 경우 Harper는 대화를 통해 회원에 대한 기본 정보를 얻어내야한다.
Harper가 온보딩 대화에서 해야할 것은 다음과 같다.
1. Insights 목록에서 아직 알지 못하는 항목이 있으면, 그걸 알아내기 위한 질문을 한다.
2. Insights가 충분히 수집되면 Additional questions phase로 넘어가고, insight가 아닌 추가 질문을 최소 2개, 최대 4개 묻는다.
3. Additional questions phase 이후에는 마지막 우선순위 확인 질문을 한다.
4. 사용자가 마지막 확인에 답하면 종료 규칙에 따라 대화를 종료한다.

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

Goal is to gradually learn and update the following fields when enough evidence is available:
1. 지금 어떤 상태인지. 얼마나 취직/이직을 원하고, 만약 이직이라면 이직하고싶은 이유가 뭔지
2. 어떤 기회를 선호하는지. 직무일 수도 있고, 회사의 규모, 회사 분위기, 도메인일 수도 있고, 미국 이직을 원할 수도 있고. 원하는 팀 환경, 조건 등등. 강한 선호 조건, 강한 회피 조건 파악.
3. 위 Additional questions는 insight와 별개다. insight 질문이 충분해진 뒤에는 새 insight 질문보다 Additional questions phase를 우선한다.
4. 마지막에는 종료하기전에 "Did I capture your priorities accurately? Is there anything I missed?" 식으로 추가로 말하고 싶은게 있는지를 한번 물어본 뒤 종료해야함.

### Onboarding phase order
반드시 아래 순서로 진행한다.
1. Insight collection: Known & Unknown Insights에서 현재 값이 비어 있거나 너무 얕은 핵심 항목을 자연스럽게 질문한다.
2. Additional questions phase: insight가 충분히 수집되면, 사용자의 프로필과 최근 대화를 보고 가장 중요한 확인 gap을 먼저 진단한 뒤 추가 질문을 최소 2개, 최대 4개 묻는다.
3. Final priority confirmation: additional 질문에 대한 답까지 받은 뒤, 우선순위를 짧게 요약하고 빠뜨린 것이 있는지 확인한다.
4. Closing: 사용자가 final priority confirmation에 답한 뒤, 더 물을 것이 없을 때만 종료한다.

### 종료 규칙 
- 충분한 insight 질문을 했더라도 Additional questions phase를 거치기 전에는 종료하지 마라.
- Additional questions는 온보딩 전체에서 최소 2개, 최대 4개다.
- select_additional_onboarding_question tool이 사용 가능하면, Additional questions phase의 질문을 직접 만들지 말고 반드시 그 tool을 먼저 호출한 뒤 tool 결과의 assistantMessage를 바탕으로 질문한다.
- 첫 번째와 두 번째 additional 질문은 필수다. 프로필/이력상 특이사항이 없어도 최근 역할, 대표 경험, 실제 기여도, 다음에 더 깊게 가져가고 싶은 업무 중 하나를 짧게 물어라.
- 세 번째와 네 번째 additional 질문은 조건부다. 사용자의 답변이 불명확하거나, 최근 이력/직무 맥락상 더 확인할 가치가 있을 때만 묻는다.
- core insight가 reasonably covered 된 뒤 필수 additional 질문 2개를 아직 채우지 못했다면, 다음 질문은 새 insight 질문이 아니라 additional 질문이어야 한다.
- final priority confirmation은 필수 additional 질문 2개에 대한 답변을 받은 뒤에만 한다.
- final priority confirmation에 대한 사용자 답변을 받기 전에는 종료하지 마라.
- 온보딩을 실제로 종료하는 마지막 답변의 맨 끝에는 반드시 ${TALENT_ONBOARDING_DONE_MARKER} 를 붙여라.
- 아직 온보딩을 끝내지 않을 답변, 추가 질문, 확인 질문, 중간 요약에는 절대 ${TALENT_ONBOARDING_DONE_MARKER} 를 붙이지 마라.
- ${TALENT_ONBOARDING_DONE_MARKER} 는 시스템 처리를 위한 마커다. 사용자에게 읽어주거나 설명하지 마라.

[종료 멘트 가이드 (그대로 읽지 말고 자연스럽게 변형할 것)]
"좋습니다. [name]님 정리해드리면...

[name]님은 지금 [recent_company]에서 [years]년 차 [role] 하시면서,
[active/passive 풀어서] 모드로 새 기회 보고 계세요.

핵심 방향성은 [target_role_description]인데, 특히 [persona_specific 포인트] 부분에
관심 많으신 것 같았어요.

회사 측면에선 [stage] 단계 + [location/remote 풀어서] 환경 원하시고,
보상은 base [min_comp_base]+ + equity [importance level],
[deal-breakers]는 절대 피하고 싶으시고요.

1-3년 후엔 [trajectory_description] 방향으로 가고 싶으세요.

특히 [proud_project 또는 last_job_positives 중 하나 reference] 얘기할 때
정말 흥미롭게 들었어요 — 거기서 [pattern observed] 같은 시그널 받았거든요.

이렇게 맞나요? 빠뜨린 거나 추가하실 거 있으세요?"
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
- 항상 존댓말로 해라

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

function getCareerChannelType(channel: CareerPromptChannel) {
  return channel === "voice" ? "Voice Call" : "Text Chat";
}

function renderInsightKey(key: string, quoteKeys: boolean) {
  return quoteKeys ? `"${key}"` : key;
}

function buildKnownInsightsSection(args: {
  content: Record<string, string> | null;
  quoteKeys?: boolean;
}) {
  const { content, quoteKeys = false } = args;
  const currentContent = content ?? {};
  const checklistKeys = new Set(INSIGHT_CHECKLIST.map((item) => item.key));
  const checklistLines = [...INSIGHT_CHECKLIST]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => {
      const value = currentContent[item.key]?.trim();
      return [
        // `- ${renderInsightKey(item.key, quoteKeys)} (${item.label})`,
        `- ${item.label}`,
        `  - topic: ${item.promptHint}`,
        `  - current value: ${value || "(아직 없음)"}`,
      ].join("\n");
    });
  const extraLines = Object.entries(currentContent)
    .filter(
      ([key, value]) => !checklistKeys.has(key) && value.trim().length > 0
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) =>
        `- ${renderInsightKey(key, quoteKeys)}\n  - 현재 값: ${value.trim()}`
    );

  return [
    `
## Additional questions
아래 질문들은 insight 질문이 아닌 추가 질문이다.
- 종료 전 필수 phase다. insight가 충분히 수집되면 반드시 최소 2개는 묻는다. 추가 질문은 전체 온보딩 중 최소 2개, 최대 4개까지만 한다.
- select_additional_onboarding_question tool이 사용 가능하면, additional 질문을 직접 고르지 말고 반드시 tool을 먼저 호출한다.
- 답이 필요하지 않은 질문은 묻지 않는다. (ex. 이력에 공백이 없다면 공백 질문을 하지 않는다.)
- 특정 조건에 해당되는 질문이 없다면 fallback additional question을 사용한다.
- 추가질문은 주로 유저의 프로필을 기반으로 과거 이력, 실제 기여도, 직무-specific 질문 등이다.
- 유저의 응답이 질문에 대한 충분한 정보를 주지 못한다면(대답이 너무 짧다면), 추가적으로 조금 더 디테일하게 물어본다.

### Additional question selection policy
Additional questions phase에 들어가면 질문을 바로 만들지 말고, 먼저 사용자의 프로필과 최근 대화를 보고 가장 중요한 확인 gap을 고른다.
스스로 이렇게 판단한다: "사용자가 '내 프로필을 봤을 때 꼭 해야 하는 추가 질문이 뭐예요?'라고 물었다면, 내가 가장 먼저 물을 질문은 무엇인가?"
그 질문을 실제 사용자에게 자연스럽게 한 문장으로 묻는다.

우선순위:
1. 최근/중요 경험은 있는데 사용자의 직접 기여도가 불명확한 경우
2. 짧은 재직, 전환, 공백, 역할 변화처럼 해석이 필요한 이력이 있는 경우
3. 프로필상 강점과 사용자가 원하는 다음 기회 사이에 불일치나 확인 gap이 있는 경우
4. 직무-specific depth가 불명확한 경우
5. 위 항목이 없을 때만 fallback additional question을 사용한다.

Additional question Examples:
- profile-gap 질문 예시
  - 최근 특정 중요한 경험에 대한 정보가 부족하다면(6개월짜리 이력이 있는데 정보가 거의 없다면), 가볍게 더 묻는다.
  - 최근 회사/프로젝트는 적혀 있지만 직접적인 본인의 역할이 불명확하면, 직접 맡은 부분을 묻는다. (그 프로젝트에서 본인이 직접 기여한 핵심 부분은 어디였어요? 등)
  - 최근 커리어 전환이 눈에 띄지만 이유가 불명확하면 혹은 현재 이직을 적극적으로 탐색하고 있다면, 전환 계기를 묻는다.
  - 최근 프로필 이력에 3개월 이상 공백이 있거나 최근 3개월 공백이 보이면, 그 시기에 무엇을 했는지 가볍게 묻는다.
- 직무-specific 질문 예시
  - Paid 채널 중에 어디 가장 깊이 운영해보셨어요? Meta, Google, TikTok, naver 등. 그리고 다음 기회에선 paid만? 아니면 organic도 같이 운영하는 hybrid 역할?
  - 제품 종류는 어떤 게 더 끌리세요? Consumer (B2C 앱), Enterprise (B2B SaaS), 또는 Internal tools / platform?
  - AI 쪽이면 지금까지는 application layer (제품에 AI 통합) 위주셨던 것 같은데, 앞으로도 그 방향이 좋으세요? 아니면 foundation model이나 infrastructure 쪽도 끌리세요?
- Fallback additional question:
  - 최근 역할이나 대표 경험 중에서, 밖에서 보기보다 실제로 본인이 더 많이 맡았던 부분은 어디였어요?
  - 최근 경험에서 본인이 직접 만든 변화나 결과를 하나만 꼽으면 뭐가 있을까요?

---
`,
    "## Known & Unknown Insights",
    "The list below is not a question order.",
    checklistLines.join("\n"),
    extraLines.length > 0
      ? ["## Other current insights", extraLines.join("\n")].join("\n")
      : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function buildExtractionInsightChecklistSection(
  content: Record<string, string> | null
) {
  const currentContent = content ?? {};
  const checklistKeys = new Set(INSIGHT_CHECKLIST.map((item) => item.key));
  const checklistLines = [...INSIGHT_CHECKLIST]
    .sort((left, right) => left.priority - right.priority)
    .map((item) => {
      const value = currentContent[item.key]?.trim();
      return `- "${item.key}" (${item.label}): ${item.promptHint}\n  current_value: ${value ? `"${value}"` : "null"}`;
    });
  const extraLines = Object.entries(currentContent)
    .filter(
      ([key, value]) => !checklistKeys.has(key) && value.trim().length > 0
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- "${key}": "${value.trim()}"`);

  return [
    "## Insight fields and current values",
    checklistLines.join("\n"),
    extraLines.length > 0
      ? ["## Other current insights", extraLines.join("\n")].join("\n")
      : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function buildKnownPreferencesSection(
  prefs: CareerPromptPreferences | null | undefined
) {
  if (!prefs) return "";

  const lines: string[] = [];
  const engagementTypes = Array.isArray(prefs.engagementTypes)
    ? prefs.engagementTypes.filter(
        (entry) => typeof entry === "string" && entry.length > 0
      )
    : [];
  const preferredLocations = Array.isArray(prefs.preferredLocations)
    ? prefs.preferredLocations.filter(
        (entry) => typeof entry === "string" && entry.length > 0
      )
    : [];

  lines.push(
    `- engagementTypes: ${engagementTypes.length > 0 ? engagementTypes.join(", ") : "(none)"}`
  );
  lines.push(
    `- preferredLocations: ${preferredLocations.length > 0 ? preferredLocations.join(", ") : "(none)"}`
  );

  const intentLabel =
    typeof prefs.careerMoveIntentLabel === "string" &&
    prefs.careerMoveIntentLabel.trim().length > 0
      ? prefs.careerMoveIntentLabel.trim()
      : typeof prefs.careerMoveIntent === "string" &&
          prefs.careerMoveIntent.trim().length > 0
        ? prefs.careerMoveIntent.trim()
        : "(미설정)";
  lines.push(
    `- careerMoveIntent: ${intentLabel} (read-only — 사용자가 직접 UI에서만 변경하므로 update_talent_profile에서는 절대 다루지 마라)`
  );

  if (
    typeof prefs.periodicIntervalDays === "number" &&
    Number.isFinite(prefs.periodicIntervalDays)
  ) {
    lines.push(`- periodicIntervalDays: ${prefs.periodicIntervalDays}`);
  }
  if (
    typeof prefs.recommendationBatchSize === "number" &&
    Number.isFinite(prefs.recommendationBatchSize)
  ) {
    lines.push(`- recommendationBatchSize: ${prefs.recommendationBatchSize}`);
  }

  return [
    "## 현재 talent_preferences (구조화 필드, update_talent_profile 호출 시 합집합/덮어쓰기 머지 기준)",
    ...lines,
  ].join("\n");
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

function buildCareerConversationPromptPlan(args: {
  additionalQuestionSelectionCount?: number | null;
  callEndInstruction?: string;
  channel: CareerPromptChannel;
  currentInsightContent: Record<string, string> | null;
  currentPreferences?: CareerPromptPreferences | null;
  interruptHandling?: string;
  isOnboardingDone?: boolean;
  profile: CareerPromptProfile | null;
  recentConversationSection?: string;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
}): CareerPromptPlan {
  const channelType = getCareerChannelType(args.channel);
  const insightGuidanceSection = buildKnownInsightsSection({
    content: args.currentInsightContent,
    quoteKeys: args.channel === "chat",
  });

  const existingPreferencesSection = buildKnownPreferencesSection(
    args.currentPreferences
  );
  const isOnboardingActive = !Boolean(args.isOnboardingDone);
  const profileContextBlock = buildProfileContextBlock({
    profile: args.profile,
    structuredProfileText: args.structuredProfileText,
  });
  const normalizedToolNames = normalizeToolNames(args.toolNames);
  const additionalQuestionSelectionCount =
    typeof args.additionalQuestionSelectionCount === "number" &&
    Number.isFinite(args.additionalQuestionSelectionCount)
      ? Math.max(0, Math.floor(args.additionalQuestionSelectionCount))
      : null;

  // During onboarding, suppress the standard tool policy block UNLESS the silent
  // profile-writer (update_talent_profile) is enabled — that one runs during
  // onboarding too and needs its policy/trigger rules in the system prompt.
  const allowToolPolicyDuringOnboarding =
    normalizedToolNames.includes("update_talent_profile") ||
    normalizedToolNames.includes("select_additional_onboarding_question");

  const toolPolicy =
    isOnboardingActive && !allowToolPolicyDuringOnboarding
      ? ""
      : buildCareerToolPolicyPrompt({
          channel: args.channel,
          toolNames: normalizedToolNames,
        });

  const dynamicStateLines = [
    `## Runtime context \n현재 후보자와 ${channelType}을 통해 소통하고 있습니다. (Voice Call or Text Chat) \n현재 시각 : ${new Date().toLocaleString()}`,
    isOnboardingActive && additionalQuestionSelectionCount !== null
      ? [
          "## Additional question runtime state",
          `- Additional questions already selected: ${additionalQuestionSelectionCount}/${TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX}`,
          additionalQuestionSelectionCount >=
          TALENT_ONBOARDING_ADDITIONAL_QUESTION_MAX
            ? "- The maximum has been reached. Do not ask another additional question; move to final priority confirmation instead."
            : "- Use the selector only if the next turn is truly in Additional questions phase.",
        ].join("\n")
      : "",
    insightGuidanceSection,
    existingPreferencesSection,
    args.recentConversationSection ?? "", // voice 일 때만 들어감
  ].filter((value) => value && value.trim().length > 0);

  const promptBlocks: CareerPromptBlock[] = [
    {
      key: "chat_core",
      text: CAREER_CHAT_SYSTEM_PROMPT.replace(/\{channel_type\}/g, channelType),
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

  promptBlocks.push({
    key: "profile_context",
    text: profileContextBlock,
    cacheable: true,
  });

  if (toolPolicy) {
    promptBlocks.push({
      key: "tool_policy",
      text: toolPolicy,
      cacheable: true,
    });
  }

  promptBlocks.push({
    key: "dynamic_state",
    text: dynamicStateLines.join("\n\n"),
  });

  return {
    enabledToolNames: normalizedToolNames,
    isOnboardingActive,
    promptBlocks,
    toolPolicy,
  };
}

export function buildCareerTextChatPromptBlocks(args: {
  additionalQuestionSelectionCount?: number | null;
  currentInsightContent: Record<string, string> | null;
  currentPreferences?: CareerPromptPreferences | null;
  isOnboardingDone?: boolean;
  profile: CareerPromptProfile | null;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
}): CareerPromptPlan {
  const plan = buildCareerConversationPromptPlan({
    ...args,
    channel: "chat",
  });

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
  additionalQuestionSelectionCount?: number | null;
  currentInsightContent: Record<string, string> | null;
  interruptHandling: string;
  isOnboardingDone?: boolean;
  callEndInstruction: string;
  recentConversationSection: string;
  structuredProfileText: string;
  toolNames?: readonly string[] | string;
  profile: CareerPromptProfile | null;
}) {
  const plan = buildCareerConversationPromptPlan({
    callEndInstruction: args.callEndInstruction,
    additionalQuestionSelectionCount: args.additionalQuestionSelectionCount,
    channel: "voice",
    currentInsightContent: args.currentInsightContent,
    interruptHandling: args.interruptHandling,
    isOnboardingDone: args.isOnboardingDone,
    profile: args.profile,
    recentConversationSection: args.recentConversationSection,
    structuredProfileText: args.structuredProfileText,
    toolNames: args.toolNames,
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
  const hasResearchCompanyTool = toolNames.includes("research_company");
  const hasLookupServiceHelpTool = toolNames.includes("lookup_service_help");
  const hasGetRecommendedJdTool = toolNames.includes("get_recommended_jd");
  const hasAddToRecommendationsTool = toolNames.includes(
    "add_to_recommendations"
  );
  const hasRecommendedOpportunitiesTool = toolNames.includes(
    "read_recommended_opportunities"
  );
  const hasJobPostingRecommendationTool = toolNames.includes(
    "recommend_job_postings"
  );
  const hasUpdateTalentProfileTool = toolNames.includes(
    "update_talent_profile"
  );
  const hasAdditionalQuestionSelectorTool = toolNames.includes(
    "select_additional_onboarding_question"
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
          "- If the user asks for full company snapshot/research during voice, explain in Korean that you can help after ending the call in text chat, where Harper can run real-time company research (5-15s delay).",
        ]
      : []),
    ...(hasResearchCompanyTool
      ? [
          "- Use `research_company` ONLY when the user genuinely wants to learn about a specific company (culture, funding, team, business model, hiring landscape). The tool first checks a 30-day snapshot cache: cache hit returns instantly; cache miss runs real-time web research (5-15 seconds) and returns a synthesized answer with citations. Do NOT call for passing company mentions, anecdotes about past experience at a company, comparison questions without genuine info-seeking intent, or JD/position questions (use `get_recommended_jd` instead).",
          "- If the user only says they are unsure whether a company is good, ask which company they mean before calling `research_company`.",
        ]
      : []),
    ...(hasLookupServiceHelpTool
      ? [
          "- Use `lookup_service_help` when the user asks about Harper's UI buttons, panels, features, or how to use the product (e.g., 'this star button on the right is what?', '이 버튼 뭐야?', 'How do I save a role?'). Pass the user's question verbatim. The tool returns top-K help chunks; cite `source_doc_title` only when it materially helps the user.",
        ]
      : []),
    ...(hasGetRecommendedJdTool
      ? [
          "- Use `get_recommended_jd` when the user asks about job postings, positions, or roles. Pass `company_name` if the user mentioned a specific company; omit it to get only the user's recommended roles. Use `role_filter` for role_name / type / seniority / work_mode constraints. Each result row has `is_recommended`. If the user shows interest in a non-recommended role, naturally ask whether to add it.",
        ]
      : []),
    ...(hasAddToRecommendationsTool
      ? [
          "- Use `add_to_recommendations` ONLY after the user explicitly confirms adding a specific role to their recommendations (e.g., '응 추가해줘', '맞아', '그거 넣어줘'). For weak signals like '관심 있어' alone, ask for confirmation first. Always pass `role_id` from a prior `get_recommended_jd` result.",
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
    ...(hasUpdateTalentProfileTool
      ? [
          "",
          "### update_talent_profile (background profile writer)",
          "- Purpose: update internal profile state with new info the user just shared: talent_preferences (engagementTypes, preferredLocations, periodicIntervalDays, recommendationBatchSize) and row memos. Eligible during onboarding AND after.",
          "- This tool does NOT update talent_insights. Do not send insight fields to this tool.",
          "- This tool is background-only from the user's perspective: never mention that you saved, updated, noted, or added anything. However, you MUST still produce a normal user-facing chat reply after the tool result. Do not return an empty assistant message, and do not return only an onboarding marker.",
          "- Trigger conditions: call ONLY when the user's latest statement directly maps to a writable field in this tool:",
          "  1) talent_preferences: engagementTypes, preferredLocations, periodicIntervalDays, recommendationBatchSize.",
          "  2) rowMemos: a short fact clearly tied to exactly one visible experience/education/extra row.",
          "- Do NOT call this tool for general onboarding answers that only update insight-like understanding, such as search intensity, desired next role, compensation, must-haves, deal-breakers, team style, environment preference, career-change reason, or optional-question answers. Those are handled outside this tool.",
          "- Do NOT call when:",
          "  - 사용자의 발화가 *질문*(예: '회사들이 보통 어떤 보상을 주나요?')이거나 *가정/추측*(예: '만약 연봉이 1억이면 좋겠죠')일 때.",
          "  - assistant 본인의 발언/요약/메타 멘트에 대해. 사용자가 새로 말한 정보에만 반응한다.",
          "  - 이미 같은 preference/memo 정보가 들어 있고 변동/보강할 게 없을 때 (중복 호출 금지).",
          "- Read-merge-write 규칙:",
          "  - talent_preferences 의 engagementTypes / preferredLocations 배열은 서버가 합집합으로 머지한다. 새로 추가할 항목만 보내면 된다.",
          "  - periodicIntervalDays / recommendationBatchSize 는 사용자가 명확한 숫자 선호를 말했을 때만 보내고, 보내면 그 값으로 덮어쓰기된다.",
          "- 절대 금지:",
          "  - careerMoveIntent 는 schema 에 없으며 어떤 경우에도 다루지 않는다 (변경 시 백그라운드 opportunity discovery job이 트리거되는 부수효과가 있어 사용자 UI 직접 변경만 허용).",
          "  - profileLinks(LinkedIn/GitHub/Scholar/X/개인 사이트), resume 파일은 채팅 발화에 등장해도 이 도구로 쓰지 않는다.",
          "  - 채팅 응답 텍스트에 'OO에 추가했어요', '프로필에 반영해뒀어요', 'I noted that' 류의 메타 멘트를 절대 쓰지 마라. 사용자는 평소 chat 흐름만 본다. 결과는 별도 profile/insight UI 에서 사용자가 직접 확인한다.",
          "- rowMemos (talent_experiences/educations/extras 의 'Harper의 메모' 박스):",
          "  - 사용자가 프로필의 *특정* role/school/extra 하나에 분명히 연결되는 declarative 발화를 했을 때만 사용한다 (예: '삼성에서 ML 모델 만들었어요' → 시스템 프롬프트의 Experiences 블록에서 company_name이 '삼성'인 행 하나).",
          "  - experiences/educations 는 시스템 프롬프트에 노출된 그 행의 RowID 값을 verbatim 으로 사용해라. 환각 금지. extras 는 동일 블록의 Title 을 정확히 사용한다.",
          "  - newInfo 에는 *새로 알게 된 정보 한 조각만* 짧은 한국어 자연 문장으로 적어라. 기존 memo 내용을 다시 적지 마라(서버가 자동 append + 2000자 cap).",
          "  - OMIT 규칙: (1) 후보 행이 두 개 이상 (예: '삼성' → Samsung Electronics + Samsung SDS 둘 다 존재) (2) 매칭되는 행이 없음 (3) 발화가 회사/학교 mention 없는 generic skill — 이런 케이스는 rowMemos 항목을 넣지 마라.",
          "  - 채팅 응답에 '~ 메모에 추가했어요' 같은 멘트는 절대 쓰지 마라. memo 갱신 사실은 말하지 않는다.",
          "- 한 turn 에 여러 필드가 동시에 갱신될 수 있으면 한 번의 호출에 preferences/rowMemos 를 같이 담아라 (turn 당 가능하면 1회).",
          "- After calling this tool, continue the conversation naturally in Korean: acknowledge the substance of what the user said, ask the next relevant question if onboarding is still active, or close naturally with the required marker if enough information has been collected.",
          "",
        ]
      : []),
    ...(hasAdditionalQuestionSelectorTool
      ? [
          "",
          "### select_additional_onboarding_question (onboarding additional question selector)",
          "- Purpose: choose the best next Additional questions phase question from the user's structured profile, recent conversation, and known insights.",
          "- Eligible only during onboarding. Use it when core insight collection is reasonably covered and the next step should be an additional onboarding question.",
          "- This tool may return either a profile-gap question OR a role-specific depth/preference question. If necessary, include one profile-gap question at least.",
          "- When this tool is available and you are in Additional questions phase, call it before asking the additional question. Do not invent the additional question yourself first.",
          "- Pass the user's latest message in `latestUserMessage` when available, especially in voice calls.",
          "- After the tool result, ask exactly one question using the returned `assistantMessage` naturally in Korean. Do not mention the tool, JSON, internal gap analysis, or selection rationale.",
          "- Do not close onboarding in the same response after this tool. Wait for the user's answer.",
          "",
        ]
      : []),
    "- Use `web_search` only when the user needs current, factual, or web-dependent information.",
    "- Do not use tools for the normal onboarding interview flow if you can continue from the existing conversation context. (Exceptions: `update_talent_profile` is the background state-writer above; `select_additional_onboarding_question` is required for Additional questions phase when available.)",
    "- After tool use, summarize only the useful findings. Do not dump raw JSON.",
    "- Mention source names or URLs only when they materially help the user.",
    channelRule,
  ].join("\n");
}

export function buildCareerInsightExtractionPrompt(args: {
  currentInsightContent: Record<string, string> | null;
}) {
  const insightChecklistSection = buildExtractionInsightChecklistSection(
    args.currentInsightContent
  );

  return `You are an insight extraction assistant. Given a recent conversation window (up to 3 messages) between a user and Harper (an AI career counselor), extract structured career insights.

${insightChecklistSection}

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
  currentInsightContent: Record<string, string> | null;
  insightMdOverride?: string;
}) {
  const insightChecklistSection = buildExtractionInsightChecklistSection(
    args.currentInsightContent
  );
  const md = args.insightMdOverride ?? loadPrompt("insight-extraction.md");

  return fillPlaceholders(extractSection(md, "extractionOnly"), {
    insightChecklistSection,
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
  preferencesDescription: string;
  resumeFileName?: string | null;
  resumeTextPreview: string;
}) {
  return [
    `이름: ${args.displayName}`,
    `이력서 파일명: ${args.resumeFileName || "(없음)"}`,
    `링크: ${args.links.join(", ") || "(없음)"}`,
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
