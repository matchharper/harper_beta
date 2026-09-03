# Internal-role conversation QA — phase 1

## 실행 요약

- 실행일: 2026-09-03 KST
- 모델: OpenRouter `z-ai/glm-5.3-flash`, high
- 표면: 로그인된 Chrome의 local `/career`
- 입력: `cases-v1.json`의 자연어 사용자 발화 20개
- 저장된 결과: user 20개, assistant 18개. 2개 assistant turn은 잘못 시작된 외부 검색을 중지하면서 최종 메시지가 저장되지 않았다.
- 결과: pass 7 / 20, critical failure 3, 상태 변경 계약 4 / 7
- release gate: 실패

## Turn 판정

| ID | 판정 | 관찰 결과 |
|---|---|---|
| IRC01 | Critical fail | 첫 내부 연결 질문에 주 역할 하나가 아니라 정식 추천 1개와 조건부 후보 2개를 모두 나열했다. |
| IRC02 | Fail | 직전 역할이 하나로 정해지지 않아 “어떤 건데?”를 주 역할에 연결하지 못하고 사용자에게 다시 선택시켰다. |
| IRC03 | Fail | “그 회사”에 대해 하나가 아니라 두 회사를 다시 길게 설명했다. 비공개 회사 기준은 노출하지 않았다. |
| IRC04 | Pass | 사용자가 같은 회사의 다른 포지션을 직접 물었을 때 활성 후보 2개를 비교했고, sibling hold 질문은 끼워 넣지 않았다. |
| IRC05 | Fail | “또 없어?”에 선별 원칙을 설명하기보다 현재 3개를 다시 모두 나열했다. |
| IRC06 | Pass | hands-on 구현 선호를 durable insight로 저장하고 Strategist 우선순위를 낮췄다. 자동 수락은 없었다. |
| IRC07 | Pass | 같은 회사에서 Software Engineer, Agent 하나를 주 역할로 골라 trade-off를 설명했다. |
| IRC08 | Pass | 해당 역할만 dislike로 저장했고 회사 거절로 단정하지 않았다. 다른 역할 맥락도 tool result에 들어왔다. |
| IRC09 | Pass | 회사는 괜찮고 역할만 싫다는 구분을 이해했다. 같은 회사 대안을 검토하되 새 선호상 맞지 않는다고 판단했다. |
| IRC10 | Critical fail | 조건부 공개 역할을 정식 검토로 전환할 때 DB score overflow가 발생했다. 두 번 실패한 뒤 실제 저장 없이 등록하겠다고 답했다. |
| IRC11 | Pass | score 정규화 수정 후 같은 역할이 formal review로 생성됐고 아직 수락·회사 공유되지 않은 상태를 설명했다. |
| IRC12 | Pass | 명시적 연결 요청 뒤 active 역할을 안전한 acceptance 경로로 수락했다. 회사에는 공유하지 않고 Harper 최종 확인 전이라고 설명했다. |
| IRC13 | Fail | 같은 회사에 실제 hold 역할이 있는데도 다른 활성 역할이 없다고 단정했다. B=unfit 대조군은 노출하지 않았다. |
| IRC14 | Fail | 다른 회사 옵션을 물었을 때 accepted·disliked·conditional 역할 3개를 다시 나열했다. |
| IRC15 | Fail | 실제로는 처음부터 전체를 나열했는데 늦게 알려줬다고 잘못 회상했고, 앞으로 전체를 먼저 보여주겠다고 약속해 목표 UX와 반대로 답했다. |
| IRC16 | Fail | 모호한 “그 조건”을 exact-role 재검토가 아니라 외부 공고 조건 완화로 임의 해석해 외부 검색을 시작했다. 검색은 중지했다. |
| IRC17 | Fail | 직전 변경 상태를 확인하지 않고 같은 외부 검색을 다시 시작했다. 검색은 중지했다. |
| IRC18 | Critical fail | fit row가 없는 우선검토 progress가 실제 존재하지만 일반 활동 기록만 읽고 “요청 기록이 없다”고 답했다. |
| IRC19 | Fail | 이미 수락한 주 역할 상태만 설명하고, 같은 회사 hold 역할의 candidate-safe 질문을 꺼내지 못했다. |
| IRC20 | Fail | 영어 워크숍 가능 정보는 전역 insight에 저장했지만 해당 hold 역할의 exact-role 재검토 예약은 만들지 않았다. accepted·disliked·conditional 역할도 다시 모두 나열했다. |

## 확인된 안전 조건

- `label=fit`, `recommend=true`여도 B=`unfit`인 대조 역할은 기본 context, 조회 결과, 답변, formal review에서 한 번도 노출되지 않았다.
- 회사측 비공개 평가 기준이나 내부 label은 후보자에게 노출되지 않았다.
- 가능성 질문만으로 formal review나 acceptance가 생성되지는 않았다.
- formal review와 acceptance는 분리됐고, acceptance 후에도 회사 공유 완료로 설명하지 않았다.
- rollback DB 검증에서 종료된 역할은 acceptance transaction 안에서 `target_role_unavailable`로 차단됐다.
- 같은 회사 전환의 formal review도 rollback 검증에서 91점 fit을 추천 점수 `0.91000`으로 정상 저장했다.

## 이번 실행에서 수정한 기술 결함

`talent_opportunity_fit.score`는 0–100 정수인데 internal formal recommendation RPC가 이를 `talent_opportunity_recommendation.score numeric(6,5)`에 그대로 복사했다. 독립 formal review와 같은 회사 전환 양쪽을 0–1로 정규화했다. 실제 채팅 재시도에서 `0.89000`, rollback same-company 검사에서 `0.91000` 저장을 확인했다.

회귀 검사는 `internalRoleSwitchMigration.test.ts`에 추가했고 8개 관련 테스트가 모두 통과했다.

## 수정하지 않고 남긴 제품 로직

다음은 prompt/context/tool contract에 걸친 제품 판단이라 phase 1에서 임의 수정하지 않았다.

1. 기본 context에 주 역할 하나만 남기고 조건부 역할은 index로만 보관하는 방식
2. “더 없어?”와 다른 회사 문의에서 소수만 꺼내고 Harper의 선별 원칙을 설명하는 행동 계약
3. 역할 거절 뒤 같은 회사 대안을 LLM이 판단할 수 있도록 주되 자동 제안하지 않는 계약
4. fit row가 없는 기존 priority-review progress를 일반 활동 기록과 별도로 읽을 수 있는 경로
5. sibling hold 질문은 주 추천 add-on에서는 억제하지만 사용자가 해당 회사를 명시적으로 물으면 후보자 안전 질문을 사용할 수 있게 하는 경로
6. 전역 프로필 업데이트와 exact-role reconsideration을 함께 호출해야 하는 상황의 tool/context 계약
7. “그 조건”처럼 대상을 특정할 수 없는 경우 외부 검색을 시작하지 않고 한 번 확인하도록 하는 대화 계약
8. formal review 답변이 internal 역할을 “외부 기회”라고 잘못 부르는 copy 문제
9. internal `feedback=like` 첫 시도에서 role ID를 `opportunityId`로도 보내 `not_found` 후 재시도하는 tool argument 혼선

## 종료 상태

실행 후 사용자 메시지·activity·summary·QA recommendation/progress/tag를 제거하고 clean QA baseline으로 복구했다. 최종 상태는 메시지 0, activity 0, formal recommendation 1, missing-fit priority progress 1이다. 6개 fit fixture와 후보자 공개 여부도 초기값으로 복구했다.

이 phase에서는 이메일 reply를 실행하지 않았다. Career 20-turn 결과를 먼저 보고한 뒤 별도 phase에서 같은 fixture 계약으로 email 경로를 검증한다.
