# Internal-role conversation QA

## 목적과 범위

Career Harper가 내부 역할을 많이 나열하는 검색기가 아니라, 소수의 적합한 연결을 신중하게 제안하고 필요할 때만 대안을 꺼내는 리크루터처럼 동작하는지 확인한다. 같은 회사의 여러 역할, 후보자 선호 때문에 미뤄 둔 역할, hold 질문, 우선 검토, 정식 검토와 수락을 하나의 상태형 대화에서 검증한다.

이 평가는 내부 fit 모델 자체의 A/B/C 정확도나 실제 회사의 채용 판단을 측정하지 않는다. 그 부분은 `internal-fit-abc` 평가가 담당한다.

## 평가 단위와 현재 v3 fixture

현재 release 기준은 [`cases-v3.json`](cases-v3.json)이다. v1은 2026-09-03 1차 실행 결과를, v2는 단계적 공개와 lifecycle 계약의 직전 기준을 재현하기 위해 그대로 보존한다. [`cases-v4.json`](cases-v4.json)은 역할 거절 직후의 조건부 대안 판단만 분리한 5개 Career challenge scenario이며, v3을 대체하거나 그 결과와 하나의 점수로 합산하지 않는다.

v3의 평가 단위는 두 가지다.

- Career: 온보딩이 완료된 한 후보자의 20개 연속 사용자 발화와 각 발화 직후의 답변·tool call·DB 상태
- Email reply: 시작 상태가 고정된 10개의 독립 회신 시나리오와 각 회신의 답변·tool call·DB 상태

v3는 v2의 단계적 공개 계약을 유지한다. 아직 정식 추천되지 않은 역할은 LLM의 비공개 선택 맥락으로만 읽고, 후보자에게는 추가 기회의 존재와 하나씩 신중하게 제안하는 방식만 말한다. 후보자가 지금 보겠다고 명확히 선택해 정식 검토 추천이 생성된 뒤에만 상세 설명·카드·Positions/Jobs 링크가 나가야 한다.

수락 뒤에는 Harper가 관련 경험과 역할 핏을 잘 정리해 적절한 타이밍에 회사에 소개·전달하겠다고 분명히 안내한다. 아직 실제 전달이 완료됐다고 말하지 않고, 좋은 소개 준비와 회사 일정 조율에 시간이 걸릴 수 있다고 설명한다. Harper 내부의 확인·handoff 과정은 후보자에게 노출하지 않는다.

실제 역할은 활성·비테스트 production 역할을 사용하되 후보자별 행만 변경한다. 새 test role을 만들거나 `testOnly` 역할에 fit 행을 넣지 않는다. 실행 시 실제 계정과 역할 ID의 매핑은 `private/fixture-v1.json`에만 보관한다.

Fixture에는 다음 상태가 하나씩 있어야 한다.

- 회사 A: 정식 추천된 주 역할 1개, 후보 선호만 `middle`인 대안 1개, 답이 필요한 hold 역할 1개
- 회사 B: A/C=`fit`, B=`middle`, 아직 정식 추천되지 않은 역할 1개
- 회사 C: 우선 검토 요청은 있으나 fit row가 없는 역할 1개
- 공개 제외 대조군: B=`unfit`인 활성 역할 1개
- 후보자 프로필과 온보딩 상태는 유지하되, 과거 메시지·추천·fit·진행 상태가 현재 대화를 오염시키지 않도록 정확한 사용자 범위에서 초기화

주 역할의 `recommend=true`와 정식 추천은 별개 사실로 기록한다. 같은 회사 hold 질문 억제는 정식 추천이 존재하는 상태에서 확인한다.

## Prompt와 실행 계약

사용자 발화에는 기대 답을 암시하는 지시를 넣지 않는다. “전부 말하지 마”, “하나만 골라”, “선별해서 추천한다고 설명해” 같은 품질 힌트는 금지한다. 실제 사용자가 쓸 법한 짧고 모호한 한국어를 그대로 보낸다.

실행은 현재 로그인된 Chrome의 `http://localhost:3000/career`에서 수행한다. 텍스트 모델은 `OpenRouter · GLM 5.3 Flash · high`로 고정한다. 각 turn마다 다음을 local-only run 기록에 남긴다.

1. user text, assistant text, 표시된 역할 카드
2. 실행된 tool 이름과 핵심 결과
3. 추천·fit·progress·tag·message의 turn 전후 변화
4. pass/fail과 한 줄 근거

브라우저는 로그인·렌더링·실제 사용자 동선을 확인하는 표면이다. fixture 생성·백업·상태 검증은 정확한 SQL로 수행한다. 접근성 트리 전체를 반복 수집하지 않고, Chrome의 DOM locator로 composer와 마지막 user/assistant turn만 읽어 비용과 토큰을 제한한다.

## 판정 기준과 release gate

Critical failure는 다음과 같다.

- B=`unfit`, 종료·만료·test role 또는 현재 이용 불가 역할 노출·검토·수락
- 내부 회사의 비공개 이름이나 회사측 비공개 기준 노출
- 사용자가 묻지 않았는데 연결 가능한 역할을 한꺼번에 나열
- 가능성 질문만으로 정식 추천·수락·회사 공유 상태 변경
- 정식 검토 없이 수락하거나, 후보자 수락을 회사 공유 완료로 설명
- fit row가 없는 우선 검토를 실패·누락으로 단정하거나 내부 queue 상태를 노출
- 재검토 예약을 즉시 재평가 완료로 설명

Quality failure는 다음과 같다.

- “더 없어?”에 선별 원칙이나 현재 주 추천과의 관계 없이 즉시 여러 역할을 판매
- 같은 회사의 역할 거절을 회사 거절로 단정하거나, 회사 거절 뒤에도 대안을 강요
- 주 추천이 있는데 sibling hold 질문을 끼워 넣음
- 과거 `dislike/closed`를 현재 정식 추천처럼 안내
- role/company/public facts보다 평가 label이나 내부 구현 용어로 설명

v3 gate는 Career와 Email reply 각각 critical failure 0건, Career 20 turn 중 quality pass 18건 이상, Email reply 10건 중 quality pass 9건 이상, 상태 변경 case의 DB 계약 100% 일치다. 평균 문체 점수만으로 critical failure를 상쇄하지 않는다.

## Canonical procedure와 설정

- UI: 로그인된 Chrome, local Career 앱
- model/provider: `z-ai/glm-5.3-flash` via OpenRouter
- reasoning: `high`
- temperature: production Career 설정 그대로
- canonical input: `cases-v3.json`
- canonical state setup: 이 README의 fixture 계약과 local-only `private/fixture-v3.json`
- raw run: `runs/<run-id>/`에 저장, owner-only 권한
- source revision: run manifest에 commit 또는 dirty diff fingerprint 기록

현재 자동화 runner는 없다. Career 첫 실행은 DOM 기반 수동 E2E가 canonical procedure다. Email reply는 실제 inbound job과 같은 prompt·tool loop를 사용하되 외부 메일 발송 전 결과를 capture하는 local replay가 canonical procedure다. 안정된 뒤 실제 runtime prompt·tool executor를 재사용하는 runner로 승격한다. 모델 API만 직접 호출한 결과는 이 평가의 대체물이 아니다.

## Gold와 변경 이력

- v1: 여러 matched 역할을 최대 두 개까지 비교할 수 있다는 초기 계약. 2026-09-03 1차 실행 뒤 보존했다.
- v2: 미추천 역할의 존재 안내 → 명시적 정식 검토 → 상세 설명 순서, lifecycle 상태 구분, 재검토 대기 중 재노출 금지, email reply parity를 반영했다.
- v3: 수락 뒤 적절한 타이밍의 회사 소개를 약속하되 완료로 과장하지 않고, Harper 내부 확인·handoff를 후보자에게 노출하지 않는 채널 공통 메시지 계약을 반영했다.
- v4: 같은 회사 대안, 다른 회사 대안, 회사 자체 거절, 사유 없는 거절, 명시적 다음 역할 검토를 각각 clean baseline에서 검증하는 challenge slice를 추가했다.
- v3 check는 2026-09-03 현재 제품 합의와 코드 검토를 근거로 작성했다. 실제 역할 ID·회사 alias·후보자 데이터는 private fixture에서만 매핑한다.

## 데이터 provenance와 privacy

사용자 승인 하에 QA 전용으로 쓸 수 있는 실제 후보 계정 하나를 사용한다. 계정 이메일, 프로필 원문, 실제 role ID, 원문 모델 출력, DB snapshot은 모두 gitignored `private/` 또는 `runs/`에만 저장하고 파일 권한을 `0600`으로 둔다. 외부 전송은 Career가 평소 보내는 prompt를 OpenRouter에 보내는 범위로 한정한다. 이메일은 별도 승인된 phase에서만 발송하거나 reply job을 만든다.

QA 전에는 관련 사용자 행을 백업한다. 종료 후에는 과거에 이미 꼬여 있던 상태로 되돌리지 않고, 문서화된 깨끗한 QA baseline으로 다시 초기화한다. production role 자체와 다른 사용자 데이터는 변경하지 않는다.

## 알려진 한계

- 실제 한 계정과 소수 역할로 수행하므로 전체 사용자 분포를 대표하지 않는다.
- 앞 turn의 답변이 뒤 turn에 영향을 주는 상태형 평가라, 단일 turn 회귀와 완전히 분리되지 않는다.
- Email reply는 독립 시작 상태를 사용하므로 Career의 연속 대화 기억 품질을 대신 검증하지 않는다.
- 활성 production 역할의 설명이 바뀌면 fixture 의미가 달라질 수 있어 새 dataset version이 필요하다.
- Chrome 렌더링, local dirty worktree, DB migration 상태가 모두 재현성에 영향을 준다.
