# Free 실제 Workspace 열람 검증 — 2026-10-21

기존 테스트 조직을 Harper Free QA로 재사용했다. 운영 DB에 합성 후보 6명과
중단된 test-only Role 2개를 보존하고, 현재 로컬 `/org` 화면·인증된 API·실제
company-side LLM으로 검증했다. 웹/Worker 배포는 하지 않았다.

## 입력과 실행

- 동결 입력/gold: `free-views-live-v1.json`. 합성 기준별 평가로 상위 3명이 구분된다.
- Canonical procedure와 보조 runner: 상위 README 및 `scripts/freeCandidateViewsQa.mjs`.
- 모델: 제품 기본 `google/gemini-3.8-flash`, medium. 실제 provider/runtime metadata와
  원문은 ignored `runs/`에 저장했다. 브라우저에서 제출한 턴은 실제 company_messages와
  차감 원장을 함께 capture했다. DB·tool·모델 응답을 mock하지 않았다.
- 운영 식별자와 합성 fixture 원본은 ignored `private/free-views-v1/`에 보관한다.
  원문·manifest는 owner-only이며 공개 보고서에 실제 계정/조직 식별자를 넣지 않는다.

## 관찰 결과

| 경로 | 실제 결과 |
| --- | --- |
| 잠긴 목록/상세 API | 이름·학교·회사 경력 제외, 기준별 평가 유지, HTTP 200 |
| 브라우저에서 1명 열람 | 10→9, 선택한 후보의 실제 상세 공개 |
| 같은 pair를 다른 팀원이 재열람 | 9 유지, charged=false |
| 같은 후보를 다른 Role에서 조회/열람 | 처음에는 잠김, 열람 후 별도 1회 차감 |
| 깨끗한 대화: 열람 없이 상위 3명 비교 | 10→10, 신원 없이 네 가지 평가를 비교 |
| 이어서 “제일 적합한 3명 정보 자세히 알려줘.” | 10→7, 정확한 상위 3명만 열람하고 이름·경력·학력·프로필 링크 반환 |
| 이어서 같은 3명 재조회 | 7→7, 기존 정보 재조회, 추가 열람 없음 |
| 답변 속 후보자 링크 클릭 | 해당 Role과 후보를 유지해 실제 상세 프로필 표시 |
| 격리 확인 | 해당 Role의 fit 0, 일반 추천 0, 후보자 연락 요청 0 |

최종 깨끗한 대화는 `11-18-49-818Z-chat`, `11-22-13-873Z-capture`,
`11-21-45-284Z-chat`의 private 실행 기록으로 대조한다.
비교 약 25초, 3명 상세 약 50초, 재조회 약 26초였다. 앞선 실험 중 UI/API 병렬
열람이 있었던 실행의 before/after는 모델 차감으로 해석하지 않고 exact event로 구분했다.

## 발견해서 수정한 문제

1. test-only Role 열람이 matching fit 생성 방지 장치와 충돌했다. test-only에서는
   기존 열람 원장을 사용하고 fit은 생성하지 않도록 RPC를 수정해 운영 DB에 적용했다.
   일반 Role의 is_opened 저장과 서비스 전용 실행 권한은 유지한다.
2. fit이 없는 먼저 제안 후보의 평가가 목록에서 누락됐다. 현재 Role 기준과 일치하는
   발행된 presentation 평가를 읽도록 수정했다.
3. 최초 모델이 명시적 3명 상세 요청에 다시 동의를 물었다. 일반 read_talent 계약에
   한정된 후보 집합의 상세 요청이 열람 승인임을 명확히 하고 실제 모델로 재실행했다.
4. 영문 등급 반복과 평가를 넘어선 과한 단정이 있었다. 입력에 등급의 제품상 의미를
   제공하고, 평가 기준과 확인된 경력을 구분하도록 context/prompt를 수정했다.
5. 답변의 후보 링크가 역할 목록으로 이동했다. 현재 Role을 보존하는 상세 경로로
   수정하고 브라우저에서 실제 프로필까지 클릭해 확인했다.

출력 문장 치환·키워드 라우팅이나 사례별 orchestration은 추가하지 않았다.

## 범위와 인계

TypeScript 검사, 후보자 비공개 projection 2개, prompt formatter 65개,
navigation 7개 및 candidate views DB 계약 검증을 통과했다.
작은 합성 사례의 작성자 검토이며 전체 모델 품질이나 운영 분포를 보장하지 않는다.
Slack/메일 발송, 실제 후보자 연락, 결제는 이번 검증에 포함하지 않았다.

사용자가 직접 테스트할 수 있도록 실행 대화와 열람 원장을 먼저 private snapshot으로
보관한 뒤 해당 fixture 범위만 초기화했다. 남은 열람 10회, 열린 pair 0, 빈 대화로 인계한다.
Role은 paused·testOnly, 자동 검색/홍보 off, 합성 후보 추천 off를 유지한다.
보존은 이번 사용자의 명시적 요청에 따른 것으로 일반 일회성 E2E 정리 원칙의 예외다.
