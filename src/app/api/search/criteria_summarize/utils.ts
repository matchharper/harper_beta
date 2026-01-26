import { xaiInference } from "@/lib/llm/llm";
import { logger } from "@/utils/logger";
import { buildSummary } from "@/utils/textprocess";

export const generateSummary = async (
  doc: string,
  criteria: string[],
  raw_input_text: string
) => {
  let information = "";
  try{
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

export const generateOneLineSummary = async (doc: string) => {
  const information = buildSummary(doc);

  const systemPrompt = `You are a helpful assistant.`;

  const userPrompt = `
나는 아래에 한 사람에 대한 정보를 길게 디테일하게 줄거야.
- 그걸 읽고, 이 사람이 어떤 사람인지 한 문장 혹은 두문장으로 요약해줘. 단어로는 60단어 이하.
- 보통 채용을 하는 사람들이 볼거기 때문에, 그걸 고려해서, 채용이란 단어를 쓰진 말고 어떤 정보를 한문장으로 요약하는게 좋을지 니가 판단해서 리턴해야해.
- 꼭 한글로 작성해줘. 지칭할 때는 직접 이름을 쓰지 말고 <name>님 이라고 태그와 name이라는 변수로 해줘.
- 적히진 않은 내용을 만들어내거나 지나치게 띄워주는 말은 하지마. 차세대 인재이자 리더라던가 등등 이런 과장된거 하지마. 적혀있으면 몰라도.
- 중요한 기술적 키워드 명사나 고유명사는 영어가 더 정확한 표현이라면 영어로 해도 됨. 그래도 최대한 한글로 적어줘.

## 예시
Information : 생략
Output: <name>님은 이미지 생성(Diffusion, GANs)과 이미지 탐지/분할 분야에 관심이 있는 Research Scientist로, 카이스트 전기전자공학부 학사를 졸업하고 4개의 회사에서 2년간 근무했습니다.

## 입력
Information : """${information}"""
\n\n
Output: 
`;

  const summary = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt
  );

  return summary;
};
