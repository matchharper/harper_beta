# 조사 전용 Sol medium과 수준 중심 Brief

2026-10-15 로컬 변경. 자동 실행·저장·발송·배포 없음.

사용자는 앞선 v2의 특정 회사·세부 팀 중심 기준을 정정했다. 특정 출신은 기대 수준의 예시이며,
다른 배경에서도 같은 수준이면 가산할 수 있어야 한다. 실제 관련 팀 구성이나 반복 판단 근거가
있는 특정 출신의 추가 가산은 일반적인 수준 판단과 구분한다.

## 구현

- `roleSearchResearch.server.ts`에서 조사 모델을 `gpt-6.1-sol`, reasoning을 `medium`으로 고정했다.
  caller의 일반 대화 모델을 받지 않으며 도구 조회와 최종 문서 작성에 같은 설정을 쓴다.
- 공통 loop에는 trusted caller의 선택적 reasoning override만 추가했다. 생략 시 기존 모델별
  기본값을 그대로 사용한다. 일반 대화의 Gemini 기본값과 다른 Sol 호출의 high는 바꾸지 않았다.
- 기존 OpenAI Responses adapter를 재사용하며 temperature는 전송하지 않는다. 공식
  [모델 문서](https://developers.openai.com/api/docs/models/gpt-6.1-sol)에서 medium과 도구 호출의
  Responses 경로를 확인했다. 새 provider·인증·fallback 경로는 추가하지 않았다.
- 공통 calibration 계약과 업무 지시에서 전이 가능한 수준 → 다른 배경의 비교 근거 → 관찰한
  출신 예시 순서로 작성하도록 정리했다. 특정 niche 뒤에 동급이라는 말만 붙이는 방식과 구별한다.
  관찰한 몇 명을 전체 관련 팀원의 대다수로 확대하지 않는다.

## 검증

[v3 입력·gold](../research-preview-gold-v3.md)는 사용자 정정 이후, 새 모델 호출 전에 고정했다.
v2 사례 원문은 유지하고 gold를 새 버전으로 작성했으며 기존 v2 통과 판정은 역사로 보존했다.
모델과 prompt를 함께 바꿨으므로 모델 단독의 품질 개선을 증명하는 비교가 아니다.

`20261015-role-research-sol-medium-v3-r1`, RSR04 한 건:

- 64.0초, 도구 9회, completion 4회. 실제 4회 요청 모두 Sol medium, 반환 모델 모두 Sol,
  네트워크는 OpenAI Responses HTTP 200이었다. 공개 근거와 내부 read는 frozen 합성 adapter다.
- 팀 소개에서 두 경력을 발견하고 각 프로필을 열람했다. Brief에 전문 엔지니어링 환경과 핵심 기능의
  개발·운영 책임 수준을 강한 가산으로 썼으며, 다른 회사·분산 저장·스트리밍 등 인접 분야에서도
  같은 수준을 비교할 근거를 설명했다. 회사·학교 이름은 관찰 예시로 구분했다.
- 관련 대학원 연구·구현 배경을 보조 가산으로 유지하고 다른 프로그램에서도 비교 가능하게 했다.
  관찰한 두 명이 전체 팀의 대다수라는 주장이나 특정 출신만의 추가 우대는 만들지 않았다.
- 원문 조건·가상 범위·미확인 이력의 경계를 유지했다. 전체 문서와 도구 근거를 대조한 작성자
  의미 검토는 선택 사례 1/1 통과다. 전체 v3 4/4 gate는 미확정이며, 출신 집중도가 실제로 높은
  별도 fixture와 운영 추천 성과는 이번에 검증하지 않았다.

기존 경계·prompt 구성 검사 7/7을 확인했다. 실제 여러 completion에 조사 전용 모델·medium이
유지되는 assertion을 기존 경계 테스트에 추가했다. 일반 기본 모델과 Sol high 기본값도 확인했다.
최종 runtime source와 run snapshot의 hash가 일치한다. Raw 출력·trace·review는 ignored
owner-only runs에만 보존하며, 본 문서는 생성 원문이나 개인 프로필을 복제하지 않는다.
