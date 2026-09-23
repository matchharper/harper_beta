import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";

const CAREER_COACHING_LIST_KO = `## 면접 연습과 스토리텔링

- **내 커리어 이야기 연습하기**: “경력을 소개해 주세요”라는 질문에 핵심 경험과 방향이 자연스럽게 이어지도록 답변을 다듬습니다.
- **어려운 행동 면접 질문 연습하기**: 가장 큰 실패나 갈등처럼 답하기 까다로운 질문을 STAR 방식으로 연습합니다.
- **채용 매니저 면접 연습하기**: 리크루터 스크리닝보다 깊은 2차 면접을 가정해 경험과 판단을 점검합니다.
- **모의 면접 진행하기**: 15분 안팎의 일반 면접을 진행하며 답변에서 드러나는 약점과 개선점을 찾습니다.
- **프로덕트 매니저 면접 연습하기**: Product Sense, Strategy, Behavioral 라운드 중 필요한 유형을 집중적으로 연습합니다.
- **컨설팅 면접 연습하기**: 케이스 인터뷰, 구두 시장 규모 추정, Personal Experience Interview를 연습합니다.
- **왜 이 회사이고 왜 이 역할인지 설명하기**: 특정 회사와 포지션에 지원하는 이유를 설득력 있게 정리하고 말해봅니다.
- **이직·직무 전환 배경 설명하기**: 짧은 재직, 공백기, 직무 전환처럼 추가 설명이 필요한 경력 흐름을 솔직하고 명확하게 전달합니다.

## 협상과 보상

- **연봉 협상 연습하기**: 실제 협상 전에 원하는 조건과 근거를 정리하고 중요한 대화를 반복 연습합니다.
- **낮은 제안에 대응하기**: 관계를 해치지 않으면서 낮은 연봉 제안에 근거를 들어 대응하는 방법을 연습합니다.
- **스톡옵션과 주식 보상 협상하기**: RSU, 옵션, 베스팅 조건을 이해하고 어떤 질문과 요구를 할지 준비합니다.
- **현재 회사에서 연봉 인상 요청하기**: 성과와 시장 근거를 정리하고 내부 인상 대화를 현실적으로 준비합니다.
- **여러 오퍼의 보상 비교하기**: 기본급, 보너스, 주식, 복지와 위험을 함께 놓고 실제 가치를 비교합니다.

## 커리어 전략과 성찰

- **다음 커리어 선택 설계하기**: 역할, 지역, 성장 가능성 같은 선택지의 장단점을 비교해 다음 움직임을 구체화합니다.
- **커리어 불안 다루기**: 뒤처진 느낌, 정체감, 조급함처럼 판단을 흐리는 감정을 풀어보고 실제 고민을 구분합니다.
- **구직 진행 상황 돌아보기**: 지금까지의 지원과 면접에서 무엇이 효과적이었고 무엇을 바꿔야 하는지 점검합니다.
- **커리어 목표 명확히 하기**: 어떤 환경과 문제에서 잘 일하는지 대화를 통해 자신에게 맞는 방향을 찾아봅니다.
- **새로운 직무나 산업으로 전환하기**: 현재 경험 중 무엇을 가져갈 수 있고 어떤 격차를 먼저 메워야 하는지 계획합니다.
- **두 가지 커리어 선택지 비교하기**: 서로 다른 역할, 회사 또는 진로 사이에서 결정 기준과 감수할 조건을 분명히 합니다.

## 면접 이후

- **힘든 면접이나 탈락에서 회복하기**: 아쉬움과 감정을 정리한 뒤 다음 면접에 적용할 수 있는 배움을 찾습니다.`;

const CAREER_COACHING_LIST_EN = `## Interview Practice & Storytelling

- **Practise telling your story**: Tighten your answer to “walk me through your CV” so your experience and direction connect naturally.
- **Practise tough behavioural questions**: Use the STAR method on difficult questions about failure, conflict, and hard decisions.
- **Practise the hiring manager screen**: Prepare for a second-round conversation that goes deeper than a recruiter call.
- **Take a mock interview**: Run a general 15-minute screen to find weaknesses and improve your answers.
- **Practise the product manager rounds**: Focus on Product Sense, Strategy, or Behavioural interviews.
- **Practise consulting interviews**: Work through case interviews, verbal market sizing, and Personal Experience Interviews.
- **Explain why this company and why this role**: Make your motivation for a specific company and position clear and convincing.
- **Explain a career transition or gap**: Tell an honest, coherent story about a short tenure, career break, or role change.

## Negotiation & Money

- **Practise negotiating your salary**: Prepare your target, evidence, and language before the real conversation.
- **Counter a lowball offer**: Practise pushing back with evidence without damaging the relationship.
- **Negotiate equity**: Understand RSUs, options, and vesting, then prepare the questions and requests that matter.
- **Ask for a raise at your current job**: Build a realistic internal case around your impact and market evidence.
- **Compare compensation across offers**: Weigh salary, bonus, equity, benefits, and risk to compare the offers’ real value.

## Career Strategy & Reflection

- **Plan your next career move**: Map the trade-offs across role, location, growth, and other options to choose a concrete direction.
- **Work through career anxiety**: Separate the real decision from feelings of being stuck, behind, or restless.
- **Reflect on search progress**: Review what has worked in your applications and interviews and what should change next.
- **Get clarity on career goals**: Use conversation to understand the problems, environment, and way of working that fit you.
- **Move into a new role or industry**: Identify the experience you can carry over and the gaps you should close first.
- **Choose between two career paths**: Make the decision criteria and acceptable trade-offs clear across roles, companies, or directions.

## Post-Interview

- **Recover from a tough interview or rejection**: Process the sting, then turn the experience into useful insight for the next interview.`;

export function readCareerCoachingListText(preferredLocale?: string | null) {
  return normalizeCareerPromptLocale(preferredLocale) === "en"
    ? CAREER_COACHING_LIST_EN
    : CAREER_COACHING_LIST_KO;
}
