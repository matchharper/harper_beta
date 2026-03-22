import { xaiInference } from "@/lib/llm/llm";
import { logger } from "@/utils/logger";
import { buildSummary } from "@/utils/textprocess";

export const generateSummary = async (
  doc: any,
  criteria: string[],
  raw_input_text: string
) => {
  let information = "";
  try {
    information = buildSummary(doc);
    // logger.log("information for generating summary:", information);
  } catch (e) {
    logger.log("error for generating summary:", e);
    return "";
  }

  const systemPrompt = `You are a helpful assistant. Given a search query and criteria, generate a relevance-focused summary explaining whether this candidate matches the query or not.
Highlight especially important skills, experiences, or keywords by wrapping them with <strong> tags. 영어 단어가 들어가는건 상관없는데, 한글로 대답해줘.
List of string의 형태로 criteria의 순서에 맞게, 검색된 사람이 각 조건을 만족하는지/안하는지 이유를 대답해줘.`;

  const userPrompt = `
## 필수 : 출력은 criteria와 길이가 같고, 순서도 일치하는 List of string 이어야 한다.
리스트의 각 string은 항상 만족/모호/불만족 중 하나로 시작하고 뒤에 이유 혹은 추측을 붙여줘.

- 정보 : 미국 M7은 magnificient7 회사들을 의미한다. 

## 예시
search query: 생략
criteria: ["컴퓨터공학 전공자이며 석사 이상의 학위가 있는가", "대규모 트래픽 처리 경험이 있는가"]
information: 생략
output: ["만족, <strong>서울대학교 컴퓨터공학부</strong>를 졸업하고 동 대학원에서 <strong>석사 학위</strong>를 취득했습니다.", "모호, 직접적으로 설명이 적혀있지는 않지만 <strong>카카오 메신저 서버 개발 팀</strong>에서 근무했으며 카카오는 B2C 메신저로, 대규모 트래픽 처리를 필요로 하는 서비스입니다."]

## 예시
search query: 생략
criteria: ["자율주행 관련 학위가 있는가", "실제 자율주행 관련 업무 경험이 있는가"]
information: 생략
output: ["만족, 자율주행 인지 분야의 TOP 학회인 CVPR에 'Self-driving like a human driver' 논문 및 기타 학회에 자율주행 관련 논문 3편을 작성했습니다.", "만족, 테슬라 오토파일럿 팀에서 인턴으로 근무하며 데이터 파이프라인 구축에 참여했습니다. 직접 자율주행 핵심 알고리즘을 개발한지는 모르지만, 자율주행 관련 회사의 관련 팀에서 일한 적이 있습니다."]

## 입력
Search Query : ${raw_input_text},
Criteria : ${JSON.stringify(criteria)},
Information : ${information}
Output: 
`;

  const summary = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt
  );

  return summary;
};

export const generateOneLineSummary = async (doc: any) => {
  const information = buildSummary(doc);

  const systemPrompt = `You are a helpful assistant.`;

  const userPrompt = `
너는 채용 담당자가 10초 안에 후보자 적합도를 판단하도록 돕는 "프로필 하이라이트 추출기"다.

나는 아래에 한 사람에 대한 정보를 길게 줄 것이다.
너의 목표는 채용 판단에 도움이 되는 핵심 신호만 뽑아 불렛 포인트 최대 3개로 정리하는 것이다.

# 출력 형식
- 불렛 포인트 1~3개만 작성
- 정확히 아래 형식만 사용

- <bullet>
- <bullet>
- <bullet>

# 불렛 규칙
- 각 불렛은 **짧은 한 문장 (20단어 이하)**  
- **이름, 이메일 등 개인 식별 정보는 쓰지 마라**
- 회사/학교 단순한 나열은 금지
- 출력에는 **불렛만 작성** (설명 금지)
- 강하게 확실한 내용만 포함하기. 조금이라도 애매하면 포함하지 마라.
- 회사를 언급할 때면 가능한 N년 을 회사명 뒤에 붙여라(티맥스데이터에서 4년, 소프트웨어 정의 스토리지 개발 리드)

# 어떤 내용을 뽑을지 (채용 관점 우선순위)
다음과 같은 "신호"가 있으면 우선 선택한다.

1. 성과 / 임팩트
2. 희소한 기술 역량
- 특정 직무와 직접 연결되는 기술
- 중요한 기술 키워드는 영어 사용 가능 (PyTorch, CUDA 등)

3. 회사/학교
- 단순히 ~~ 재직 은 큰 의미 없다. 카카오, Krafton, Meta에서 리서처로 근무. 는 중요한 정보가 많은 좋은 요약이다.
- 특정 회사만 오래 다녔다면 "~~~에 3년간 재직" 이렇게 적어도 좋지. 이 사람의 커리어를 가장 잘 요약하는 문장이긴 하니까.

4. 특이한 커리어 신호
- AI 스타트업(YC 합격) 공동 창업 경험
- 당근 마켓 30명일 때 합류, 2년간 재직 후 퇴사

# 반드시 피할 것
- 단순 재직 회사, 학교 나열
- 기술 스택 단순 나열
- 근거 없는 칭찬
- 정보에 없는 내용 생성

- 군대는 안중요함.

# 선택 기준
좋은 불렛은 다음 질문에 답해야 한다.
"그래서 이 사람을 왜 뽑아야 하는가?"
정보가 부족하면 **1~2개만 작성**해도 된다.

---
# 예시 1
Information : 생략
Output:
- 48kHz neural audio codec을 개발하고 오픈소스로 공개, 1k+ star
- B2B analytics SaaS를 창업해 고객사 120곳을 확보하고 연 매출 약 3억 규모까지 성장
- 탑티어 학회 논문 제출 10회 이상

이유:
- 실제 산출물(오픈소스), 좋은 성과
- 이 사람의 가장 중요한 커리어
- 중요한 연구 성과, 한눈에 알 수 있게 요약

---
# 예시 2
Information : 생략
Output:
- 네이버에서 3개월간 DNN TTS system 인턴 경험
- 고려대학교에서 학사/석사 후 MIT에서 박사 과정 밟는중
- a16z speedrun 참여 AI 스타트업 공동 창업 2년, 현재 쉬는중

이유:
- 커리어가 많이 없다면, 인턴이라도 정확한 개월 수와 함께 언급. 네이버는 좋은 회사.
- 박사라면 학사/석사 어디서 했는지도 중요하고, 현재 박사 과정이라는건 가장 중요한 정보.
- 현재 쉬는 중이라는 것도 중요한 정보. 스타트업 공동 창업은 희귀한 경험.

---

오로지 한글로 출력해라.

# 실제 입력
Information : """${information}"""
Output:
`;
  // const userPrompt = `;
  // 나는 아래에 한 사람에 대한 정보를 길게 디테일하게 줄거야.
  // - 그걸 읽고, 이 사람이 어떤 사람인지 한 문장 혹은 두문장으로 요약해줘. 단어로는 60단어 이하.
  // - 건조한 이력서 요약처럼 쓰지 말고, 한 사람을 간결하게 소개하는 문장처럼 작성해라.
  // - 연대기적 나열(어디 → 어디 → 어디)을 하지 말고, 이 사람의 핵심 정체성을 먼저 정의해라.

  // - 다닌 모든 회사와 학교를 나열하는게 아니라, 이 사람이 딱 파악될 수 있게 중요한 정보를 강조하는게 중요해.
  // - 꼭 한글로 작성해줘. 지칭할 때는 직접 이름을 쓰지 말고 <name>님 이라고 태그와 name이라는 변수로 해줘.
  // - 적히진 않은 내용을 만들어내거나 지나치게 띄워주는 말은 하지마. 차세대 인재이자 리더라던가 등등 이런 과장된거 하지마. 적혀있으면 몰라도.
  // - 중요한 기술적 키워드 명사나 고유명사는 영어가 더 정확한 표현이라면 영어로 해도 됨. 그래도 최대한 한글로 적어줘.
  // - 한국의 대학교나 회사의 경우는 이름이 영어로 적혀있더라도 가능하면 한글로 말해줘. 회사의 규모가 작아서 유명하지 않고, 회사이름이 영어라면 그대로 영어로(Furiosa AI 등)
  // - 문장을 구분하고 싶으면 <br/> 태그를 사용해도 됨.

  // ## 예시
  // Information : 생략
  // Output: <name>님은 이미지 생성(Diffusion, GANs)과 이미지 탐지/분할 분야에 관심이 있는 Research Scientist입니다. 카이스트 전기전자공학부 학사를 졸업하고 4개의 회사에서 2년간 근무했습니다. <br />최근에는 VQA 벤치마크 논문으로 CVPR Oral Paper를 수상했습니다.

  // Information : 생략
  // Output: <name>님은 현재 잡코리아에서 해외알바 파트를 이끌고 있고, 이전에는 당근에 30번째 팀원으로 합류해 수익화, 해외진출 등으로 4년을 근무했어요. <br />또한 싱가폴의 Carousell에서 M&A도 경험했습니다.

  // ## 입력
  // Information : """${information}"""
  // \n\n
  // Output:
  // `;

  const summary = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt
  );

  return summary;
};
