# 내부 기회 경험 검토할 목록

- 문서 기준: 2026-09-03
- 검토 대상: `harper_beta/`, `harper_worker/` 현재 로컬 작업 트리
- 검토 방식: 코드, SQL migration, prompt, 기존 test code를 읽는 정적 검토
- 이번 검토에서 실행하지 않은 것: 실제 LLM 대화, browser, production DB, worker 실행, migration 적용, E2E, deploy
- 주의: 아래 `[x]`는 현재 로컬 코드가 해당 경로를 갖췄다는 뜻이다. production 반영이나 실제 LLM 응답 품질을 증명하지 않는다.

표시 기준:

- `[x]`: 현재 코드가 합의된 동작을 충족한다.
- `[ ]`: 없거나, 일부 경로만 충족하거나, 반대 동작이 남아 있다.

## 1. 이번 검토의 결론

핵심 기반은 대부분 구현되어 있다. A/B/C 분리 평가, 후보자 공개 기준, Career/email의 matched 조회, 우선 검토, exact-role 재검토 등록, 같은 회사 역할의 정식 검토와 전환, 최종 수락 시 역할 가용성 검증은 모두 코드에 있다.

이번 보완으로 2차 평가의 회사별 주 역할 선택, 같은 회사 hold 질문 억제, 우선 검토의 과거 추천 상태 구분, 역할 거절 뒤 같은 회사 대안을 LLM 판단에 제공하는 경로까지 코드에 반영됐다.

email의 일반적인 내부 역할 `like`도 이제 별도 `connected` 저장을 하지 않고 기존 `accept_connection` 경로로 자동 위임한다. 따라서 어떤 email tool을 통해 긍정 반응이 들어오더라도 같은 2단계 확인, 역할 가용성 검증, 수락 transaction을 사용한다.

## 2. 확정된 제품 계약

### 2.1 후보자에게 공개 가능한 역할

후보자 공개 가능 여부는 다음 순서로 판단한다.

1. B=`unfit`이면 다른 신호와 관계없이 제외한다.
2. human label이 있으면 human decision이 우선이며 human `fit`만 통과한다.
3. human label이 없으면 아래 중 하나만 만족해도 공개할 수 있다.
   - `recommend=true`
   - 레거시 `label=fit`
   - A=`fit`이고 C=`fit`
4. 따라서 A 또는 C가 `fit`이 아니거나 C=`ambiguous`여도 `recommend=true` 또는 `label=fit`이면 공개할 수 있다.
5. 반대로 B=`unfit`은 `recommend=true`, `label=fit`, human `fit`보다 먼저 제외한다.

정식 기준 함수는 `talent_internal_role_is_candidate_visible_v1`이다.

### 2.2 상태의 의미

- 선택 맥락: `get_internal_roles(matchedOnly=true)`가 읽은 역할이다. LLM은 역할 요약과 비공개 A/B/C·판단 이유로 다음에 제안할 가치가 있는지 판단할 수 있지만, 후보자에게 역할명·상세·카드를 바로 풀어놓지 않는다.
- 정식 검토 추천: Positions/Jobs에서 상세 내용을 읽을 수 있다. 아직 수락이나 회사 공유가 아니다.
- 재검토 예정: 사용자가 제공한 새 정보를 exact role에 붙였고 worker가 나중에 다시 평가할 대상이다. 정식 추천이 아니다.
- 후보자 수락: 시스템상 이 순간에 회사 공유가 완료되는 것은 아니지만, 후보자에게는 Harper가 관련 경험과 역할 핏을 잘 정리해 적절한 타이밍에 회사에 소개·전달하겠다고 안내한다.
- 회사 연결: 별도 전달 경로에서 진행한다. 후보자에게 Harper 내부의 확인·handoff 과정을 설명하지 않는다.

### 2.3 fit row가 없는 우선 검토

fit row가 없으면 “아직 점검 중”으로 안내한다. queued/running/retrying/stalled/missing 같은 내부 queue 상태를 확인하거나 사용자에게 노출하지 않고, 오류나 부적합으로 추측하지 않는다.

### 2.4 재검토 범위

exact-role 재검토는 즉시 평가가 아니라 등록이다. 허용 범위는 다음과 같다.

- 자동 평가의 `hold`
- A=`fit`, C=`fit`, B=`middle`

B=`unfit`, human decision이 있는 역할, 이미 정식 추천된 역할, inactive/expired/test 역할은 이 재검토 등록 경로에서 제외한다. 같은 정보가 이미 등록돼 있으면 새 요청을 중복 생성하지 않고 `already_scheduled`로 응답한다.

## 3. 이상적인 전체 흐름

### 일반 내부 역할

1. worker가 A/B/C와 같은 회사의 실제 과거 추천·진행 이력을 함께 보고 역할을 평가한다.
2. 2차 평가에서 같은 회사의 여러 역할이 모두 추천할 만해도 지금 먼저 추천할 주 역할 하나에만 `recommend=true`를 둔다.
3. 다른 공개 가능한 역할은 후보자가 물어보거나 주 역할이 맞지 않을 때 쓸 대안으로 둔다.
4. 후보자가 대안을 물으면 아직 정식 추천하지 않은 역할의 상세를 꺼내지 않고, 추가로 검토해둔 연결 기회가 있다는 사실과 하나씩 신중하게 제안하는 방식을 설명한다.
5. 후보자가 특정 역할을 짚어 물어도 먼저 포지션 탭에 정식 검토 추천으로 추가할지 확인한다.
6. 후보자가 지금 보겠다고 명확히 선택하면 그 exact role을 정식 검토 추천으로 만들고, 그때부터 역할 범위·fit·tradeoff를 충분히 설명한다.
7. 후보자가 상세 내용을 확인한 뒤 다시 명시적으로 수락하면 그때 선택을 확정한다.
8. Harper가 소개 내용을 준비해 적절한 타이밍에 회사 연결 단계로 진행하며, 후보자에게는 내부 handoff가 아니라 소개 준비와 회사 일정 때문에 시간이 걸릴 수 있다고 안내한다.

### 같은 회사의 여러 역할

1. CTO가 주 추천이고 FDE가 대안이어도 최초 정식 추천은 CTO 하나다.
2. “FDE도 가능해?”에는 FDE를 이미 검토한 선택지로 확인했다면 상세 비교부터 하지 않고, 정식 검토 추천으로 추가해 같이 볼지 묻는다.
3. “FDE를 자세히 볼게요”에는 FDE를 정식 검토 추천으로 추가한 뒤 상세히 설명하되 CTO를 닫지 않는다. 후보자와 LLM에게 별도의 source/target 관계를 모델링하지 않는다.
4. 이후 “FDE로 진행해 주세요”라는 명시적 수락이 오면 시스템이 같은 회사의 기존 역할과 새로 선택한 역할을 확인해 한 transaction에서 반영한다.
5. CTO는 `dislike/closed/내부:아카이브`, FDE는 `like/connected/내부:수락`이 된다.
6. 이 전환도 회사 공유 완료 자체는 아니다. 다만 후보자에게는 내부 확인 단계를 설명하지 않고 Harper가 적절한 타이밍에 회사 소개를 진행한다고 안내한다.

### 우선 검토 요청

1. exact role의 기존 요청, fit, 정식 추천, 역할 가용성을 읽는다.
2. 이미 정식 추천됐으면 새 우선 검토를 만들지 않고 현재 추천 상태를 안내한다.
3. fit row가 없으면 점검 중이라고 안내한다.
4. A/C는 맞고 B만 `middle`이면 후보자 선호 차이를 설명하고, 새 정보가 있으면 재검토를 등록할 수 있다.
5. B=`unfit`이면 현재 명시적 선호와 강하게 충돌한다고 설명하고 공개 가능한 선택지처럼 제시하지 않는다.
6. `hold`에 후보자가 답할 수 있는 질문이 있으면 그 질문 하나만 한다.
7. 다른 불일치가 있고 요청 후 14일 전이면 아직 현재 연결 제안 대상은 아니며 조금 더 기다려 달라고 한다.
8. 14일 이상이면 회사의 현재 기준과 차이가 있었다는 점을 더 명시적으로 말하되, 비공개 기준을 추측하거나 후보자 문제로 표현하지 않는다.

## 4. 시나리오별 코드 검토

### A. 평가와 공개 기준

- [x] A=직무 적합, B=후보자 선호, C=회사 기준 가능성을 별도 필드로 저장한다.
  - 근거: `20260901121000_internal_fit_axes.sql`, `opp/utils/internal_fit.py`
- [x] B=`unfit`을 가장 먼저 제외하고, human label을 그다음에 우선하며, 나머지는 `recommend=true` 또는 `label=fit` 또는 A/C=`fit`으로 공개한다.
  - 근거: `talent_internal_role_is_candidate_visible_v1`, `isInternalRoleCandidateVisible`
- [x] C=`ambiguous`라도 `recommend=true`나 레거시 `label=fit`이면 공개할 수 있다.
- [x] Career matched 조회, email matched 조회, worker 대안 조회, formal review RPC가 동일한 SQL eligibility를 사용한다.
- [x] inactive, expired, 실제 만료 시각 경과, test-only 역할은 matched 조회와 정식 검토 대상에서 제외한다.

### B. 한 회사에서 주 역할 하나와 대안 역할

- [x] 한 번의 정기 발송에는 내부 주 역할을 하나만 넣는다.
  - 근거: `DETAILED_INTERNAL_LIMIT=1`
- [x] 한 이메일에 같은 회사 역할 두 개가 정식 추천으로 들어가면 delivery validator가 차단한다.
  - 근거: `opp/utils/new_delivery.py`의 `duplicate_company` 검증
- [x] 주 역할과 같은 회사의 candidate-visible sibling을 별도 대안 context로 조회한다.
  - 근거: `fetch_same_company_fit_alternative_cards`, `same_company_fit_alternatives`
- [x] 이메일에서는 대안의 이름·설명·링크 없이, 다른 방향도 검토해두었다는 사실만 최대 하나의 짧은 P.S.로 언급한다.
  - 근거: `V2_SAME_COMPANY_INTERNAL_ALTERNATIVES_INSTRUCTIONS`
- [x] 2차 evaluator prompt는 같은 회사에서 여러 역할이 추천할 만해도 가장 먼저 제시할 하나에만 `recommend=true`, 나머지에는 `recommend=false`를 두도록 안내한다.
  - DB unique constraint나 별도 source/target 상태는 만들지 않는다.
  - 이는 LLM 판단 계약이며 deterministic 사후 정규화는 아니다.
- [x] 같은 회사의 주 역할이 정해진 발송에서는 그 회사의 다른 hold 역할 질문을 후보에서 제외한다.
  - 현재 run에서 선택된 `company_workspace_id`만 제외하므로 다른 회사의 유용한 질문은 유지한다.

### C. 최초 추천 메일

- [x] 주 역할을 회사, 역할, 후보자와 맞는 이유, 다음 단계 중심으로 길게 설명한다.
- [x] 회사 비공개 요청과 내부 fit label/reason을 그대로 노출하지 않는다.
- [x] 대안은 공개 가능한 역할만 사용하며, 후보자가 원하면 다른 역할도 볼 수 있다는 여지만 준다.
- [x] 대안 언급만으로 정식 추천, 수락, 회사 공유 상태를 만들지 않는다.
- [x] 3일 cadence나 follow-up은 Harper의 재확인 안전망이고, 후보자의 즉시 질문·검토·전환을 막는 대기 시간이 아니다.

### D. “더 없어?”, “다른 역할은?”, “FDE도 가능해?”

- [x] Career와 email 모두 `matchedOnly=true`로 저장된 credible set을 읽을 수 있다.
- [x] `matchedOnly`는 B=`unfit`을 제외하고 확정 공개 기준을 만족하는 active 역할을 반환한다.
- [x] 재검토 예정 역할은 상태 확인을 위해 함께 읽을 수 있지만, 재평가 전에는 새 대안, 자동 추천, 정식 검토 추천, 수락으로 취급하지 않는다.
- [x] 단순 가능성 질문은 읽기만 하고 추천·수락·전환 상태를 바꾸지 않는다.
- [x] LLM에게 전체 결과를 읊지 않고, 아직 정식 추천하지 않은 역할의 존재와 Harper의 한 번에 하나씩 제안하는 방식만 말하도록 안내한다.
- [x] 결과 개수를 DB constraint나 hard result cap으로 강제하지 않는다.
- [x] 공개 가능한 역할이 없지만 답변 가능한 hold 질문이 있으면 Career/email의 private hold context를 통해 역할·회사 정보를 노출하지 않고 필요한 사실을 물을 수 있다.
- [x] 후보자가 never-formal matched 역할을 실제로 보고 싶다고 하면 active/non-expired/non-test와 eligibility를 다시 확인하고 정식 검토 추천으로 만들 수 있다.
- [x] 같은 회사 역할을 정식 검토로 추가하는 순간에도 기존 주 역할을 닫지 않는다.

### E. 우선 검토 요청

- [x] candidate×role 요청은 unique index와 upsert/재조회 처리로 idempotent하다.
- [x] fit row가 없으면 queue 상태를 찾지 않고 점검 중이라고 안내한다.
- [x] A/C=`fit`, B=`middle|unfit`인 경우 회사 기준 불일치가 아니라 후보자 선호 차이로 구분한다.
- [x] B=`middle`만 exact-role 재검토 가능성을 제시하고 B=`unfit`은 현재 공개 가능한 선택지처럼 제시하지 않는다.
- [x] `hold` 질문이 있으면 후보자가 답할 수 있는 질문 하나를 반환한다.
- [x] 일반 불일치는 요청 후 14일 전/후 안내를 구분한다.
- [x] 역할이 비활성·만료된 경우 계속 검토 중인 것처럼 안내하지 않는다.
- [x] Career와 email 모두 재검토 예정 상태를 읽고 같은 정보를 다시 묻지 않도록 안내한다.
- [x] Career와 email 우선 검토는 recommendation의 feedback, saved stage, 최신 internal process tag를 함께 읽는다.
  - 현재 미응답 추천은 `already_formally_recommended`, 이미 수락은 `already_accepted`, 후보자 거절은 `previously_declined`, 종료는 `previous_process_closed`로 구분한다.
  - 종료 상태를 현재 Positions/Jobs에서 답할 수 있는 추천처럼 안내하지 않는다.

### F. 후보자 정보·선호 변경 후 exact-role 재검토

- [x] 후보자가 실제 새 정보나 이번 역할 예외를 말하고 exact role 재검토를 요청할 수 있다.
- [x] 등록은 `reevaluation_criteria.new_information`을 저장하고 `reevaluation_checked_at=null`로 만든다.
- [x] 같은 정보가 이미 미처리 상태면 `already_scheduled`로 처리한다.
- [x] worker는 `hold` 또는 A/C=`fit`, B=`middle`이면서 새 정보가 있는 exact role을 후속 재평가 대상으로 조회한다.
- [x] Career 조회, email 조회, role context, 우선 검토 결과에서 `재검토 예정`을 다시 읽을 수 있다.
- [x] 재검토 등록을 즉시 평가, 정식 추천, 수락, 회사 공유라고 설명하지 않는다.

### G. 추천 거절과 같은 회사 대안

- [x] 사용자의 role/company 거절 반응과 이유를 추천 feedback/history에 저장할 수 있다.
- [x] same-company matched index와 조회 도구가 있어 LLM이 대안을 확인할 수 있다.
- [x] internal role 거절이 저장되면 Career chat tool result와 email tool result에 같은 회사의 다른 active candidate-visible 역할을 함께 제공한다.
- [x] Positions/Jobs의 internal dislike 후속 응답에도 같은 회사의 현재 reviewed role index를 읽기 전용 context로 제공한다.
- [x] prompt는 회사 거절인지 역할 거절인지와 대안의 실제 가치를 LLM이 판단하도록 열어 둔다.
  - 역할 자체에 대한 거절로 보이고 대안 하나가 정말 유용할 때만 자연스럽게 언급할 수 있다.
  - 자동 formal recommendation, 자동 수락, 자동 역할 변경은 하지 않는다.
  - 새 scenario 전용 tool, DB state, deterministic 분류 로직은 만들지 않는다.

### H. 같은 회사 역할의 정식 검토와 전환

- [x] “FDE도 가능해?”는 존재·검토 가능성을 확인하고 정식 검토로 추가할지 묻되, 추가 전에는 상세 설명이나 카드를 만들지 않고 기존 역할도 닫지 않는다.
- [x] “FDE를 살펴볼게요”는 FDE를 정식 검토 추천으로 만들 뿐 수락하지 않는다.
- [x] 후보자와 LLM에게 source/target 관계를 만들게 하지 않고, 회사의 여러 역할 중 하나를 비교·검토·선택하게 한다.
- [x] 선택한 역할이 active, non-expired, non-test, candidate-visible인지 transaction 안에서 다시 검증한다.
- [x] 같은 회사에서 이미 진행 중이거나 종료된 역할이 있으면 현재 DB 사실을 기준으로 안전하지 않은 자동 변경을 차단한다.
- [x] 명시적 수락 때 같은 회사의 기존 역할과 새로 선택한 역할을 transaction 안에서 식별하고 함께 반영한다.
- [x] 기존 역할은 `dislike/closed/내부:아카이브`, 새로 선택한 역할은 `like/connected/내부:수락`으로 기록한다.

### I. 과거 같은 회사 경험을 기억하는 평가

- [x] 같은 회사에서 실제로 정식 추천된 역할만 history에 넣는다.
- [x] 추천 시점, 후보자 반응과 이유, 현재 process stage, 같은 회사 역할 이동 정보를 bounded context로 제공한다.
- [x] 이 history를 prefilter와 최종 A/B/C·recommend 판단에서 사용할 수 있다.
- [x] 역할별 거절과 회사 전체에 적용할 수 있는 거절을 model이 구분하도록 안내한다.
- [x] 과거 회사 거절을 deterministic company-wide blacklist로 만들지 않는다.
- [x] 한국 FDE 거절, 회사 자체 거절, relocation 거절 뒤 다른 국가 역할처럼 서로 다른 사례를 같은 일반 history/context 계약으로 판단할 수 있는 구조다.
- [ ] 위 세부 판단의 실제 응답 품질은 정적 코드만으로 확인할 수 없다. 현재 구조적 capability는 있지만 frozen evaluation 결과는 이번 검토 근거에 포함하지 않았다.

### J. 독립 수락, email 수락, 회사 공유 경계

- [x] Career/chat의 독립 내부 역할 수락은 범용 `accept_talent_internal_role_recommendation_v1`을 사용한다.
- [x] 범용 수락 RPC는 recommendation, role, setting을 잠그고 onboarding, profile visibility, active, non-expired, 실제 만료 시각, non-test를 검증한다.
- [x] 같은 회사에 함께 반영할 기존 역할이 있으면 범용 RPC가 더 좁은 same-company transaction을 사용한다.
- [x] email의 명시적 `accept_connection` 최종 확인은 내부 API를 거쳐 같은 범용 수락 RPC를 사용한다.
- [x] 명시적 email 수락/전환과 `feedback_reason`, `email_acceptance_confirmation` 저장은 같은 DB transaction 안에서 처리된다.
- [x] 최종 확인 시점에 역할이 닫혔으면 409를 받고, worker는 수락이 기록되지 않았고 아무것도 회사에 공유되지 않았다는 안전한 결과를 반환한다.
- [x] email의 일반 `update_recommended_opportunity_feedback(feedback=like)`도 internal 역할이면 기존 `accept_connection` 구현으로 자동 위임한다.
  - 첫 긍정 반응은 `connected`를 직접 저장하지 않고 `confirmation_required`를 반환한다.
  - 이후 같은 확인 thread의 긍정 답장은 범용 acceptance RPC로 최종 수락을 처리한다.
  - external/public `like`와 internal `dislike`는 기존 feedback 동작을 유지한다.
- [x] 어떤 후보자 수락 경로도 그 transaction 자체에서 회사를 자동 공유하지 않으며 `companyShared=false`를 유지한다.
- [x] 후보자 수락과 실제 회사 전달은 별도 상태로 유지하되, 후보자 메시지에서는 내부 확인 과정을 노출하지 않고 Harper가 적절한 타이밍에 소개·전달하겠다고 안내한다.

### K. 일반 dislike 되돌리기

- [x] 같은 회사의 다른 역할을 선택하면서 archive된 이전 역할도 현재는 일반 dislike처럼 되돌릴 수 있게 둔다.
- [x] UI는 negative feedback 역할이 active이고 만료되지 않았을 때만 되돌리기를 노출한다.
- [x] API는 `change_internal_talent_opportunity_decision_v2`를 호출한다.
- [x] v2 RPC는 최종 transaction에서 active, `is_expired=false`, 실제 만료 시각 미경과, non-test를 다시 확인한다.
- [x] 오래 열린 UI 뒤 역할 상태가 바뀌어도 DB에서 차단하고 사용자에게 현재 이용 불가 메시지를 반환한다.

### L. 비공개 정보와 test-only 격리

- [x] 후보자용 role/company 정보는 public alias와 공개 가능한 역할 사실을 사용한다.
- [x] 비공개 회사 요청, hidden evaluation reason, score, label은 후보자용 fitReasons에 저장하거나 그대로 노출하지 않는다.
- [x] test-only 역할은 fit 조회, 대안, formal review, acceptance, revert에서 제외한다.

### M. 선택 맥락과 lifecycle의 채널 통일

- [x] Career와 email의 matched 결과가 `not_presented`, `unanswered`, `accepted`, `declined`, `closed`를 구분한다.
- [x] 전체 조회 행 수와 실제 새 선택지 수를 분리해, 과거 이력만 남은 결과를 “다른 기회가 있음”으로 오해하지 않는다.
- [x] 일반적인 “다른 역할” 후보에는 `not_presented`이면서 재검토 대기가 아닌 역할만 사용한다.
- [x] 현재 미응답 추천은 먼저 반응을 들을 대상으로, 수락·거절·종료 역할은 과거 이력으로, 재검토 예정 역할은 진행 상태로 다룬다.
- [x] 기본 prompt의 회사별 개수는 모든 active fit이나 과거 추천 수가 아니라 아직 정식 추천하지 않은 reviewed role 수만 센다.
- [x] email의 최근 internal 추천 회사명은 raw workspace name 대신 후보자 공개용 alias를 사용한다.
- [x] 애매한 “그 역할/회사/조건”은 검색이나 상태 변경으로 추측하지 않고 한 번 확인한다.
- [x] Career 수락 직후, email 최종 수락 답장, 이후 자동 follow-up 모두 Harper가 적절한 타이밍에 회사에 소개·전달하겠다고 안내한다. 아직 전달 완료라고 과장하지 않고 내부 확인·handoff 과정은 노출하지 않는다.

## 5. 반드시 해야 하는 것

- [x] **2차 평가에서 회사별 주 추천 하나를 선택하도록 prompt 계약 추가**
  - DB constraint나 deterministic 사후 정규화를 추가하지 않는다.
  - 한 회사에서 여러 역할이 추천할 만하면 가장 먼저 제시할 하나만 `recommend=true`로 판단한다.

- [x] **주 추천이 있는 같은 회사의 hold 질문 억제**
  - 현재 run에서 선택한 primary 회사는 held-role question 후보에서 제외하거나, orchestration에서 해당 회사 질문을 제거한다.
  - 다른 회사의 유용한 질문까지 전부 막는 전역 규칙은 만들지 않는다.

- [x] **email의 모든 내부 역할 positive 경로를 안전한 수락 경로로 통일**
  - `update_recommended_opportunity_feedback(feedback=like)`도 internal이면 `accept_connection`과 같은 구현으로 위임한다.
  - 첫 긍정 반응은 2단계 확인을 시작하고, 확인 뒤에만 범용 acceptance RPC를 거친다.
  - 일반 feedback 함수가 internal 역할을 직접 `connected`로 만들거나 별도 수락 알림을 보내지 않는다.

- [x] **우선 검토의 과거 정식 추천 상태 구분**
  - recommendation 존재 여부만 보지 말고 feedback, savedStage, current process stage를 함께 읽는다.
  - 현재 추천, 이미 수락, 후보자 거절, 회사/프로세스 종료를 각각 사실에 맞게 안내한다.

- [x] **역할 거절 뒤 same-company 대안 판단을 기존 도구에 연결**
  - 사용자의 반응이 회사 거절인지 역할 거절인지 불분명하고 같은 회사 credible sibling이 있으면, 기존 matched index와 조회 도구로 하나를 확인해 자연스럽게 비교한다.
  - 새 scenario 전용 tool이나 DB state는 만들지 않는다.

- [x] **미추천 역할의 단계적 공개 계약 통일**
  - matched 조회 시 LLM에는 요약과 비공개 A/B/C·reason만 선택 맥락으로 준다.
  - 후보자에게는 존재와 한 번에 하나씩 제안하는 방식만 설명한다.
  - 명시적 검토 선택 뒤 정식 추천을 생성하고, 그 다음에만 상세 설명·카드·Positions/Jobs 링크를 제공한다.

- [x] **재검토 예정 역할의 조기 재노출 차단**
  - 재평가가 끝날 때까지 자동 추천과 같은 회사 대안 후보에서 제외한다.
  - Career와 email의 정식 검토 추가도 재검토 완료 전에는 차단한다.

## 6. 완성된 것

- [x] A/B/C 분리 평가와 저장
- [x] B=`unfit` hard exclusion을 포함한 공개 기준 통일
- [x] Career/email/worker/formal review의 eligibility 통일
- [x] “더 없어?”와 같은 회사 대안 조회
- [x] 공개 가능한 never-formal role의 정식 검토 추천 전환
- [x] 가능성 질문, 정식 검토, 명시적 수락의 상태 분리
- [x] 우선 검토 idempotency와 14일 전/후 안내
- [x] fit row 없음의 단순 점검 중 안내
- [x] B mismatch와 회사/역할 기준 차이 구분
- [x] hold 또는 A/C=`fit`, B=`middle` exact-role 재검토 등록
- [x] 재검토 예정 상태의 Career/email/role context 노출
- [x] worker의 후속 exact-role 재평가 대상 연결
- [x] 실제 같은 회사 추천·진행 history를 평가 context로 제공
- [x] same-company formal review와 명시적 role switch transaction
- [x] 독립 수락과 same-company 수락의 범용 진입점
- [x] 명시적 email acceptance metadata atomicity
- [x] active/non-expired/non-test 역할만 dislike 되돌리기 허용
- [x] 후보자 수락과 실제 회사 전달의 상태 경계 유지 + 내부 handoff 비노출
- [x] 2차 평가의 회사별 단일 `recommend=true` prompt 계약
- [x] 주 추천 회사의 다른 hold 질문 억제
- [x] 우선 검토의 현재 추천/수락/거절/종료 상태 구분
- [x] internal role 거절 뒤 같은 회사 대안을 Career/email LLM context에 제공
- [x] email의 일반 internal `like`를 2단계 확인·범용 acceptance 경로로 통일
- [x] 미추천 역할의 존재 안내 → 명시적 검토 선택 → 상세 설명·카드 순서 통일
- [x] 과거 수락·거절·종료 추천과 재검토 예정 역할을 새 대안에서 제외
- [x] email 최근 internal 추천의 회사 alias 보호
- [x] 애매한 상대 지시가 새 외부 검색이나 잘못된 상태 변경으로 이어지지 않도록 prompt 계약 추가
- [x] 수락 뒤 회사 소개 약속·미완료 상태·내부 handoff 비노출을 Career/email/자동 follow-up에 통일

## 7. 개선해야 하는 것

필수 동작을 고친 뒤 품질과 검증 수준을 높이기 위한 항목이다.

- [ ] 과거 회사 거절, 역할 거절, relocation 거절 뒤 다른 국가 역할을 frozen evaluation으로 검증한다.
- [ ] matched 조회 → formal review → 명시적 수락 → Harper 확인의 Career/email 통합 test를 보강한다.
- [ ] 단계적 공개와 수락 후 회사 소개 메시지 계약을 반영한 frozen v3로 Career 실제 대화와 email reply를 각각 실행 검증한다.
- [ ] 새 acceptance/revert RPC가 `src/types/database.types.ts`에 반영되도록 DB type을 동기화한다.
- [ ] 현재 runtime과 충돌하는 과거 multi-role 설계 문서는 이 문서를 기준으로 정리한다.

## 8. 이번 목록에서 의도적으로 제외한 것

다음은 현재 요구사항이 아니다.

- candidate×company에서 formal role 하나만 허용하는 DB constraint
- 한 대화에서 반환할 역할 수를 결과 레벨에서 강제하는 hard cap
- fit row가 없을 때 내부 queue 상태를 조회하거나 노출하는 기능
- fit row 누락을 backend 오류로 간주해 즉시 재실행하는 기능
- 후보자 정보 변경 직후 동기적으로 fit을 다시 계산하는 기능
- C=`ambiguous`의 일괄 비공개
- 같은 회사의 다른 역할을 선택하며 archive된 이전 역할을 영구적으로 되돌릴 수 없게 만드는 기능

## 9. 정적 검토 한계

- 관련 Career/worker의 정적·단위 test와 Python compile은 실행했지만 실제 LLM 대화, DB 상태 전이, browser는 실행하지 않았다.
- SQL migration 파일과 호출 경로는 읽었지만 실제 DB 적용 여부는 확인하지 않았다.
- prompt와 context가 준비돼 있어도 LLM이 매번 기대한 판단과 문장을 내는지는 실행 또는 frozen evaluation 없이는 확정할 수 없다.
- 현재 변경은 로컬 feature branch와 미커밋 작업 트리 기준이다. production 동작이라고 간주하면 안 된다.
