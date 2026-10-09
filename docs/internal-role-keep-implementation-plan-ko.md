# 내부 역할 저장 기능 구현 계획

문서 기준: 2026-10-08. [매칭 통합 계획](unified-talent-role-matching-implementation-plan-ko.md)의 상세 계약이다. 제품 구현·migration 적용·배포는 수행하지 않았다. 현재 DB에 대한 아래 설명은 운영 DB의 제약·함수 정의를 **읽기 전용**으로 확인한 범위다. 후보자 데이터는 조회하거나 수정하지 않았다.

**후보자가 내부 역할을 보고도 지금 결정하지 않으려면 `저장`을 선택한다. 기존 ‘관심 있음’ 목록에서 다시 찾을 수 있고, 수락·회사 전달·면접 동의는 발생하지 않는다.** 시스템은 명시적 저장 반응과 반응이 없는 상태를 구분한다. 저장한 역할을 계속 미응답으로 재촉하지 않는다.

## 1. 제품 의미와 명칭

| 선택 | 사용자 뜻 | Harper가 기록할 사실 | 발생하지 않는 일 |
| --- | --- | --- | --- |
| 수락 | 해당 역할로 진행을 원함 | 기존 명시 수락·동의 | 회사의 채용 수락을 추정하지 않음 |
| 저장 | 다시 볼 목록에 남기고 지금 결정하지 않음 | 이 역할을 명시적으로 저장했다는 반응 | 지원·회사 공유·회사 관심·일반 선호 변경 |
| 거절 | 이 역할의 제안을 진행하지 않음 | 기존 명시 거절 | 같은 회사/직무 전체를 자동 차단하지 않음 |
| 아무 반응 없음 | 알 수 없음 | 아직 명시 반응을 받지 못함 | 안 읽었음·관심 없음·거절로 확정하지 않음 |

버튼은 **저장**, 상태는 **저장됨 · 결정 전**을 기본 표현으로 쓴다. `keep`은 내부 machine value다. `보류`는 기존 회사/진행의 hold와 혼동되고 `보관`은 현재 숨김 보관함과 겹치므로 새 버튼 이름으로 쓰지 않는다.

저장은 후보자가 역할을 선택해 반응했다는 증거다. 상세 JD를 끝까지 읽었거나 면접 의사가 있다는 증거는 아니다. `viewed_at`은 실제 상세 열람 이벤트, `feedback_at`은 명시 반응 시각으로 각각 유지한다.

## 2. 현재 DB와 앱은 어디까지 허용하는가

| 확인한 계층 | 현재 상태 | 결론 |
| --- | --- | --- |
| 실제 DB `talent_opportunity_recommendation` | feedback/saved_stage에 값 enum CHECK 없음. text 컬럼 | `keep` 문자열 자체를 막는 테이블 제약은 없음 |
| 실제 RPC `update_talent_role_feedback_v1` | feedback은 `like`, `dislike`, null만 허용. saved_stage는 feedback이 like일 때만 유지 | 현재 정상 저장 경로로 keep을 쓸 수 없음 |
| 앱 API `/api/talent/opportunities` | positive/negative/null 검증. 내부 positive는 connected로 처리 | saved_stage=saved만 보내 기존 수락 흐름을 우회하면 안 됨 |
| 공통 feedback handler | 내부 positive에 `acceptInternalRoleRecommendation` 실행, Intro는 accept/decline 경로 | 저장을 positive/like로 구현하면 수락 부작용 발생 가능 |
| Reader `normalizeFeedback` | like→positive, dislike→negative, 나머지→null | keep을 쓰기만 하면 미응답으로 오해 |
| 새 추천/저장 목록 query | new는 feedback null, saved는 주로 like | keep row가 목록/집계에서 빠질 수 있음 |
| Career LLM tool | `review`, `like`, `dislike`만 있음 | keep 추가 필요 |
| 이메일 LLM | 저장·긍정을 like로 연결하는 prompt와 tool 계약이 있음 | “일단 저장해주세요”를 수락 확인으로 보내는 기존 해석을 바꿔야 함 |
| Opportunity worker | 일부 follow-up/정리 경로가 알려진 like/dislike 외 값을 미응답으로 취급 | 새 keep을 재촉하거나 장기 무응답 거절로 바꿀 수 있어 함께 수정 필요 |
| 기존 활동 원장 | talent_progress와 legacy talent_role_activity 모두 실제 테이블. legacy activity를 progress로 mirror하는 경로 존재 | 새 저장 반응은 canonical progress에 한 번만 기록. 두 원장에 중복 작성하지 않음 |

따라서 **테이블 컬럼이나 새 테이블을 추가해야 저장할 수 있는 상태는 아니지만, RPC·API·LLM·reader·worker를 함께 바꿔야 기능이 성립한다.** 이 문서는 direct DB update로 우회하는 구현을 허용하지 않는다.

주요 코드 근거:

- `src/lib/talentOpportunity.ts`: feedback 타입/normalizer, history/count 조회, 수락 dispatcher.
- `src/app/api/talent/opportunities/route.ts`: request 검증과 내부 positive 처리.
- `src/lib/talentOnboarding/tools.ts`: `update_recommended_opportunity_feedback`, 기존 `review` 기능.
- `src/hooks/career/careerSessionData.ts`: new/saved/archived bucket.
- `src/components/career/history/savedOpportunityStatus.ts`: saved=관심 있음, hidden=보관함.
- `harper_worker/opp/worker.py`, `opp/new_harper_agent.py`: internal follow-up과 장기 무응답 처리.
- `harper_worker/email_reply/tools.py`, `email_reply/prompt.py`: 메일 답변 해석·tool 계약.

## 3. 저장할 데이터

현재 상태는 기존 **`talent_opportunity_recommendation`**에 둔다.

```json
{
  "feedback": "keep",
  "saved_stage": "saved",
  "feedback_at": "2026-10-07T03:00:00Z",
  "feedback_reason": null
}
```

시각은 서버가 생성한다. 예시의 시각을 모델이 쓰는 계약이 아니다. 최초 keep에 이유를 필수로 묻지 않는다. 후보자가 스스로 말한 이유가 있으면 기존 feedback_reason에 저장한다.

| 값 | 저장 원칙 |
| --- | --- |
| feedback=keep | 수락/거절과 별개의 현재 반응 |
| saved_stage=saved | 기존 관심 있음 목록의 위치. internal like/connected와 구분 |
| feedback_at | 실제 마지막 반응 변경 시각. 같은 keep 재시도는 갱신하지 않음 |
| viewed_at/clicked_at | 해당 실제 행동이 관측될 때만 변경. keep으로 상세 열람을 조작하지 않음 |
| processed_stage·내부 진행 tag | keep 때문에 수락/연결/hold로 변경하지 않음 |
| email_acceptance_confirmation | 아직 확정하지 않은 같은 역할의 acceptance 확인이 있다면 keep 시 해제/종결. 이미 확정한 수락은 취소하지 않음 |

같은 keep의 재시도나 반복 클릭은 no-op이다. 이후 사용자가 새 사유를 직접 덧붙이면 기존 feedback_reason/메모 계약으로 원문 근거를 보존하되 새로운 저장 클릭으로 중복 집계하지 않는다. 인자를 생략한 재시도가 이전 사유를 null로 지우지 않게 한다.

새로운 `kept_roles` 테이블, 별도 role 관심 Memory, role별 질문 상태를 만들지 않는다. 반응이 바뀌어도 과거 저장 사실은 남아야 하므로 기존 `talent_progress`에 **범용 `candidate_opportunity_feedback_changed` 사건**을 한 번 기록한다.

Progress에는 recommendation/role/talent ID, 변경 전·후 feedback, source(web/chat/email), 원본 user message 또는 요청 identity, 시각을 남긴다. 코드가 직접 생성하며 LLM에게 자유롭게 이전 상태를 쓰게 하지 않는다. `open_to_talent=true`, `open_to_company=false`로 audience 계약을 명시적으로 추가한다. Legacy activity mirror를 동시에 호출하지 않는다.

이 사건은 새로운 중간 판단 state가 아니라 후보자가 실제 반응을 바꾼 사실이다. Reader는 후보자 이력·Behavior builder·Ops 반응 지표다. 회사 공유 이벤트나 회사에게 보낼 메모로 재활용하지 않는다.

## 4. 허용할 상태 전환

| 현재 상태 | 요청 | 결과 |
| --- | --- | --- |
| 미응답 | 저장 | keep/saved. 새 추천·일반 결정 task에서 빠지고 관심 있음으로 이동 |
| 저장 | 다시 저장 | no-op. 시각·이력·알림 중복 없음 |
| 저장 | 수락 | 현재 역할·동의·Intro 상태를 재검증해 기존 수락 경로 실행 |
| 저장 | 거절 | 기존 거절 경로. 회사 수락/공유가 선행하지 않은 상태에서만 일반 거절 처리 |
| 수락/연결 진행 | 저장 | 거부하고 현재 진행 상태 반환. 기존 수락 취소/진행 중단 경로를 사용해야 함 |
| 거절 | 저장 | 먼저 기존 거절 되돌리기 계약으로 복구. keep이 거절 취소를 몰래 수행하지 않음 |
| 이메일 수락 확인 대기, 아직 실제 수락 전 | 저장 | keep 기록, 미완료 확인 해제. 이후 오래된 확인에 대한 짧은 회신으로 자동 수락되지 않게 원본 version 검증 |
| 일반 추천이 회사 Intro로 대체됨 | 옛 추천에서 저장 | 옛 row에 반영하지 않음. 현재 Intro 카드와 상태를 반환해 현재 대상에서 처리 |
| 역할 마감/만료, 후보자에게 이미 보였던 역할 | 저장 | 개인 목록 관리로 허용. 새 지원/연결은 실행하지 않음 |
| 권한이 없거나 testOnly 접근 금지 | 저장 | 차단. 목록 관리도 권한 경계를 우회하지 않음 |

최초 버전의 대상은 **이미 정식으로 제시된 내부 역할 추천**이다. 검색 결과에만 있는 역할을 저장해 달라고 하면, 해당 역할이 기존 `review` 계약으로 후보자에게 제시 가능한지 확인하고 기존 도구로 목록에 추가한 뒤 저장한다. 아직 공개할 수 없는 company-first ready의 존재를 keep을 통해 노출하지 않는다. 이 사용자 요청에 따른 목록 추가를 자동 추천 성과로 집계하지 않는다.

### 원자성과 동시 클릭

같은 recommendation을 lock한 뒤 현재 effective recommendation과 반응을 다시 읽는다. 수락과 keep이 동시에 도착해도 **수락 뒤 늦은 keep이 수락을 취소하지 않는다.** keep이 먼저 처리되고 명시적 수락이 뒤따르면 기존 수락을 정상 처리할 수 있다.

API/tool은 읽은 row의 `updated_at`을 기대 version으로 연결하고 달라졌다면 현재 상태를 반환한다. 서버는 stale 명령을 현재 사용자 의사로 임의 재실행하지 않는다. 같은 request/message identity의 재시도는 idempotent하게 재사용한다. 읽기 이벤트 때문에 version이 바뀐 경우에도 현재 반응을 확인한 뒤 필요한 재시도만 수행한다.

저장한 역할은 바로 수락하거나 거절한다. 별도 저장 취소 행동은 제공하지 않으며, 일반 feedback=null 요청으로 저장·수락·진행 상태를 지우는 우회를 막는다. 기존 24시간 수락 되돌리기와 진행 중단의 계약을 그대로 적용한다.

## 5. 웹·모바일에서 어디에 보이는가

**별도 최상위 keep 탭을 만들지 않고 기존 `관심 있음` 목록을 사용한다.** 그 안의 내부 역할에는 `저장됨 · 결정 전`을 표시해 외부 공고 관심 표시·내부 수락 후 진행과 구분한다.

| 화면 | 변경 |
| --- | --- |
| 새 포지션의 내부 역할 카드 | 수락·저장·거절 3개 행동. 저장은 중립적인 보조 버튼 |
| 역할 상세 modal/preview | 같은 3개 행동과 현재 반응 표시 |
| 저장 직후 | 카드가 관심 있음으로 이동. 짧은 완료 feedback과 그 목록으로 이동할 방법 제공 |
| 관심 있음 카드 | `저장됨 · 결정 전`, 바로 수락·거절 가능 |
| 보관함(hidden) | 기존 숨김 의미 유지. keep을 hidden으로 넣지 않음 |
| Tasks | 일반 내부 추천의 결정 요청 badge에서 제외. 관심 있음으로 갈 수 있는 기존 진입점 유지 |
| 실제 Intro를 저장함 | 관심 있음에서 회사 요청·실제 기한을 계속 표시. 회사 수락/연결 진행 tab으로 이동하지 않음 |
| 만료한 저장 역할 | 관심 있음에 보존하되 `채용 종료` 표시, 수락 비활성화. 자동 거절로 바꾸지 않음 |
| 모바일 | desktop과 같은 bucket·count·행동 계약. 새 전용 메뉴 체계를 만들지 않음 |

현재 savedStage label이 관심 있음이므로 이를 제품 전체에서 무조건 ‘저장’으로 바꾸지 않는다. 내부 keep 카드의 상태와 버튼만 명확히 구분한다. 데스크톱 board·모바일 list·server pagination·client optimistic count가 같은 predicate를 공유해야 한다.

목록 계약:

- new: 기존 미응답 중 숨김/대체되지 않은 현재 추천.
- saved bucket: 기존 긍정 반응/보관 항목 **+ keep**.
- saved stage 탭: 기존 saved 항목 **+ keep/saved**.
- archived: 실제 dislike. keep을 여기에 넣지 않음.
- keep인 역할의 마감은 역할 상태로 표시한다. 진행한 적 없는 역할을 자동으로 ‘진행 종료’로 옮기는 handler가 있다면 keep에서는 개인 저장 위치를 보존한다.

`feedback`이 null인지 여부만으로 모든 UI를 나누지 않는다. `hasExplicitReaction`, `hasFinalDecision`, `isKept`는 현재 저장 사실을 읽는 공통 projection으로 제공한다. 이는 LLM의 의미 추론을 상태 머신으로 옮기는 것이 아니라 사용자 버튼 결과의 표현이다.

저장 클릭 후 이유 입력 modal이나 “왜 저장했나요?” 대화를 자동으로 띄우지 않는다. 기존 feedback-followup LLM을 모든 keep 클릭에 실행하지 않는다. 클릭은 DB 변경과 UI feedback으로 끝내고, 후보자가 이어서 대화할 때 원본 LLM이 현재 상태를 읽는다.

## 6. LLM tool과 prompt 변경

새 keep 전용 도구를 만들지 않는다. 기존 **`update_recommended_opportunity_feedback`**를 확장한다.

DB 값은 `keep`, 앱/API의 feedback union은 `positive | negative | keep | null`, LLM command는 아래 값이다. 새로운 `saved`/`hold`/`maybe` alias를 여러 layer에 만들지 않는다. 기존 `toTalentOpportunityFeedback`처럼 `like`가 아니면 negative로 보내는 이진 변환도 명시적 switch로 바꿔 keep이 거절로 변하지 않게 한다. 알 수 없는 machine value는 거절/미응답으로 보정하지 않고 구조 오류로 반환한다.

| command | 의미 |
| --- | --- |
| review | 현재처럼 내부 역할을 정식 목록에 제시. 저장·수락 아님 |
| like | 내부 역할은 명시 수락, 외부 공고는 기존 긍정 반응 |
| dislike | 명시 거절 |
| keep | 내부 역할을 저장하고 지금 결정하지 않음 |

예시 target 호출:

```json
{
  "feedback": "keep",
  "opportunityId": "current-recommendation-id"
}
```

기존 opportunityId/roleId resolver와 권한 검증을 재사용한다. 모델이 동일 역할의 오래된 recommendation ID를 쓴 경우, 현재 source가 바뀌었다는 결과를 주고 실제 현재 내용을 읽게 한다. 서버가 숨은 company Intro를 대신 선택해 저장하지 않는다.

도구가 반환할 최소 사실은 현재 추천·역할 참조, 실제 반영된 feedback/위치, 중복 여부, 현재 연결 진행 상태다. 저장에 성공하면 원본 LLM이 사용자 맥락에 맞춰 짧게 설명한다. 모델에 내부 queue·SQL·raw enum을 최종 문구로 말하게 하지 않는다.

### 원본 LLM이 알아야 할 문맥

최근 추천 index와 `read_recommended_opportunities`, `get_role_context`에 `keep/저장됨·결정 전`과 최근 변경 시각을 포함한다. `none`이나 `accepted`로 뭉개지 않는다. 조회 tool에는 현재 feedback 또는 저장 여부로 목록을 좁히는 일반 filter를 추가해 “저장해둔 내부 역할 보여줘”를 처리한다.

Prompt는 다음 의미를 공통으로 적용한다.

> 후보자가 특정 내부 역할을 저장하거나 나중에 검토하겠다고 명시하면 keep으로 기록한다. 긍정적인 평가만으로 연결 수락이나 저장을 만들어내지 않는다. 이미 수락한 역할을 keep으로 바꿔 진행을 취소하지 않는다. 저장된 역할은 명시 반응이지만 아직 최종 결정은 아니다. 후보자의 사유가 있으면 그 말만 기록하고 사유가 없으면 묻지 않는다. 역할별 반응과 지속적인 선호 변경은 별개이며, 후자는 사용자가 명시했을 때만 기존 Brief/Memory writer를 사용한다.

| 발언 예시 | 기대 처리 |
| --- | --- |
| “이건 일단 저장해둘게” | 식별된 내부 역할에 keep |
| “관심은 있는데 지금은 결정 못 하겠어. 나중에 볼게” | 대화 맥락에서 보관 의사가 분명하면 keep. 회사 공유 없음 |
| “괜찮아 보이네” | 그 자체로 수락/keep을 자동 기록하지 않음. 현재 대화에 맞춰 이어감 |
| “그 회사로 연결해주세요” | 기존 명시 수락 경로 |
| “저장해둔 것 중 A는 진행할게” | 저장된 현재 A를 읽고 기존 수락 경로 |
| “저장한 A는 진행하지 않을게” | 저장된 현재 A를 읽고 기존 거절 경로 |
| “B는 저장하고 A는 거절” | 정확히 식별한 각 추천에 기존 도구 호출. 부분 실패 시 성공한 쪽을 재실행하지 않음 |
| “저장한 게 많으니 더 보내지 마” | 기존 역할 keep은 유지. 연락 중지 요청은 기존 설정 tool 계약으로 별도 처리 |

예시 문장을 regex/keyword routing으로 만들지 않는다. `좋아요`, `저장` 같은 단어를 무조건 like로 바꾸던 기존 prompt 지시를 실제 의미 계약으로 교체한다.

### 이메일·음성까지 같은 효과

이메일 worker의 같은 이름 tool enum·handler·prompt도 함께 바꾼다. 현재 “저 포지션 저장해줘 → like → 수락 확인” 경로를 제거한다. Keep은 이메일의 2단계 수락 확인을 시작하지 않는다. 기존 수락 확인 대기 중 keep이 오면 그 미완료 확인만 끝내며 이미 완료한 공유를 되돌렸다고 주장하지 않는다.

이메일의 별도 `update_internal_opportunity_response`를 통해 keep을 우회 처리하지 않는다. 기본 반응은 일반 feedback tool로 통일하고 기존 accept/decline/stop의 책임만 유지한다. 음성에서 해당 feedback 도구가 노출되지 않는 경로는 같은 executor를 노출하도록 연결한다. 아직 호출할 수 없는 채널에서 “저장했습니다”라고 말하는 prompt만 먼저 배포하지 않는다.

## 7. 추천 메일에서 어떻게 알릴 것인가

**내부 역할 추천 메일에는 저장 선택지를 한 문장 정도로 알려준다.** 후보자가 기존의 수락/거절 이분법만 알고 있으면 새 버튼을 찾아 누르기 어렵기 때문이다. 우리 지표를 위해 답변을 요구하는 설명보다, 결정 부담 없이 다시 볼 수 있다는 효용을 먼저 말한다.

문구 방향의 예시:

> 바로 결정하기 어렵다면 저장해 두고 나중에 다시 보셔도 돼요. 저장만으로 회사에 프로필이 전달되지는 않아요.

추천 개선을 덧붙일 필요가 있는 경우:

> 수락·저장·거절로 남겨주신 반응은 다음 추천을 고를 때 참고할게요.

두 문장을 매번 모두 넣거나 모든 역할 카드마다 반복하지 않는다. 한 메일의 선택 방법 안내에서 한 번이면 충분하다. “뭐라도 표시하면 더 좋은 역할을 더 많이 드린다”는 약속은 하지 않는다. 저장했다고 연락 수·추천 수를 자동 증가시키지 않으며, 반응하지 않은 사람을 불리하게 처리하지 않는다.

메일은 기존 역할 보기 링크로 열고 웹에서 수락·저장·거절을 선택하게 한다. 회신으로 “A는 저장해주세요”라고 해도 같은 tool로 처리한다. 첫 버전에서 이메일에 별도 GET 한 번으로 DB를 바꾸는 저장 링크를 추가하지 않는다. 이메일 링크 검사기가 자동으로 저장 처리하거나 전달된 링크로 다른 사람의 반응을 바꾸지 못하게 한다.

수신자 인증과 현재 추천 확인 후 실제 mutation은 POST로 실행한다. 로그인 복귀 시 role/recommendation 목적지를 보존한다. 오래된 링크는 현재 역할·Intro 상태를 보여주되, 로드만으로 저장을 완료하지 않는다.

실제 Intro 메일에서는 회사 요청이라는 본래 목적과 실제 기한을 먼저 설명한다. 저장해도 요청 기한이나 채용 자리를 예약해주는 것은 아니며, 존재하지 않는 기한을 만들어 재촉하지 않는다. 이 안내는 사용자가 지금 선택의 영향을 이해하는 데 필요할 때만 짧게 포함한다.

## 8. 저장 뒤 follow-up과 다음 추천

| 상황 | 처리 |
| --- | --- |
| 일반 내부 추천을 keep | 그 추천의 자동 무응답 follow-up을 중단. 매 3일 재수락 질문 없음 |
| keep 상태에서 새 역할이 발견됨 | 일반 전달 정책으로 검토. 저장 건수가 많다는 이유만으로 강제 차단/증가하지 않음 |
| keep의 명시 이유가 있음 | 기존 행동 원본으로 Behavior builder가 읽음. 사유가 명시된 장기 조건이면 원본 대화 LLM이 Brief에 별도로 반영 |
| keep 이유 없음 | 해당 역할을 저장한 사실만 사용. 해외/회사/직무 선호를 확정한 Memory 생성 금지 |
| keep 뒤 오래 지남 | 자동 수락·거절·회사 공유·3일 재촉으로 바꾸지 않음 |
| 후보자가 직접 “다음 주에 다시 얘기해줘”라고 함 | 실제 후속 연락 요청으로 기존 일반 일정/연락 기능에 연결. keep 자체에 임의 reminder 날짜를 만들지 않음 |
| 역할의 조건이 바뀜 | 역할/fit 변경 정책 적용. 실질적으로 가치 있는 새 내용이 있을 때 기존 전달 판단이 연락 여부 결정 |
| 회사가 실제 Intro 요청 | 새로운 회사 의사이므로 기존 keep과 구분해 즉시 안내. 과거 keep을 Intro 수락으로 복사하지 않음 |

Keep은 source 행동 사실이므로 기존 Behavior dirty 경로가 반영한다. **keep 클릭마다 Profile/Brief 변경이나 즉시 전체 matching refresh를 만들지 않는다.** Raw keep 사실은 rerank/전달이 현재 상태에서 바로 읽고, Behavior는 기존 재생성 정책을 따른다.

반응/후속 연락의 단위는 현재 effective recommendation 또는 실제 원본 request다. 과거 일반 추천의 keep이 새 회사 Intro에 대한 답변까지 대신하지 않는다. 이후 수락·거절로 바뀌어도 같은 추천에 저장 반응이 있었다는 사실은 과거 이력으로 보존한다.

### 실제 Intro도 저장할 수 있게 한다

내부 역할이라는 UI에서 저장 버튼이 어떤 카드에서는 갑자기 없어지는 혼란을 줄이기 위해 실제 회사 Intro에도 keep을 허용한다. 대신 `company_intro_candidates`의 상태는 **`awaiting_talent` 유지**, talent_decision_at은 비우고, accept/decline/connection RPC를 호출하지 않는다.

관심 있음 카드에는 실제 회사 요청이라는 사실과 있는 경우 실제 응답 기한을 계속 표시한다. 일반 결정 task의 반복 badge는 내려놓는다. 명시된 새 회사 연락이나 실제 기한에 따른 요청은 별도의 사실로 계속 전달할 수 있다.

일반 `internal_followup`의 “아직 답변을 못 받았다”는 자동 재촉은 keep에도 적용하지 않는다. 기존 `company_request_followup` 중 실제 요청의 기한·회사 요청에 근거한 연락은 유지하되, 원본 LLM에 keep을 알려 “결정 전” 맥락으로 작성한다. 둘이 같은 요청을 중복 재촉하지 않도록 기존 원본 request/delivery identity로 dedupe한다.

요청 기한이 지나 닫히면 `request_expired`라는 사실로 기록하며 dislike·후보자 거절로 바꾸지 않는다. Stored keep과 후보자의 과거 반응은 그대로 남는다. 회사에 보여주는 것은 “진행 의사 확인 중/요청 기한 종료”라는 현재 요청 상태이며 사적인 저장 사유는 아니다.

## 9. 회사에게 무엇을 보여줄 것인가

Keep은 기본적으로 후보자 개인 목록의 상태다. 회사의 ready 후보 목록이나 일반 후보자 피드에 “관심 있음/저장함”을 자동 공개하지 않는다. 회사가 관심을 확인했다고 오해할 수 있기 때문이다.

이미 회사가 실제 Intro를 요청한 경우에도 회사에는 수락·거절이 아직 결정되지 않았다는 상태를 보여준다. Company-side LLM이 “아직 결정 전”을 “아무 답변도 하지 않았다”로 바꾸지 않도록 compact 상태를 구분한다. 개인적인 저장 이유나 Brief 원문은 제공하지 않는다. 별도 회사 메일/Slack 알림은 keep만으로 발송하지 않는다.

후보자가 “일단 저장했고 다음 달에 보겠다고 회사에도 알려줘”라고 명시하면 기존 `contact_company`의 정상 연락 경로를 사용한다. 이 사용자 요청을 keep이라는 버튼 효과로 몰래 대체하거나 발송 대기 설명으로 끊지 않는다.

## 10. 지표는 네 가지 상태를 분리한다

| 관측 | 알 수 있는 것 | 알 수 없는 것 |
| --- | --- | --- |
| 전달 원장 성공 | 서비스가 해당 채널로 전달한 사실 | 사람이 읽었는지 |
| 실제 상세 열람 | 역할 상세를 열었다는 기록 | 충분히 읽고 결정했는지 |
| keep/수락/거절 | 명시 반응이 있었다는 사실 | keep에서 진행 의사를 추정할 수 없음 |
| 아직 명시 반응 없음 | 반응이 저장되지 않음 | 못 봄/저장하고 싶음/무관심 중 무엇인지 |

현재 DB에는 viewed_at/clicked_at이 있지만 이것만으로 미열람자를 확정하지 않는다. 전달·열람·명시 반응을 별도 차원으로 집계한다. 메일 열람 pixel을 추가하여 진짜 열람을 확정하는 설계를 이 작업에 끼워 넣지 않는다.

Ops 지표는 다음을 분리한다.

- 명시 반응률: 한 번이라도 keep/수락/거절을 남긴 unique recommendation / 실제 제시한 추천.
- 현재 저장률과 최초 반응이 저장인 비율.
- 저장 후 수락·거절까지 걸린 시간과 실제 연결 전환.
- 현재 결정 전인 추천 중 저장 반응 있음/상세 열람만 관측/열람 관측 없음.
- keep 후 잘못 발송된 무응답 follow-up, 수락 오처리, 회사 공유 발생 건수: 모두 0이어야 함.

Feedback 최신값만 세면 keep→수락에서 과거 keep을 잃는다. Progress의 실제 변경 사건을 사용하되 같은 request ID를 중복 집계하지 않는다. 역할이 Intro로 대체된 경우 recommendation 기준·pair 기준 지표를 분리해 같은 사람을 새 반응자로 두 번 계산하지 않는다.

## 11. 반드시 같이 바꿀 reader와 writer

| 영역 | 변경 사항 |
| --- | --- |
| RPC | update_talent_role_feedback_v1에 keep 처리, saved_stage 정책, 기대 version/현재 상태 검증, 사건 기록 원자성 |
| API | positive/negative에 keep 추가. keep 분기를 acceptInternalRoleRecommendation·decideTalentCompanyIntro보다 분리하고 직접 stage mutation 우회 차단 |
| TS/UI 타입 | TalentOpportunityFeedback, CareerHistoryOpportunityFeedback, DB mapper, count/bucket/optimistic cache |
| 목록 | effective recommendation view를 유지하면서 server new/saved/count와 mobile/desktop predicate를 일치 |
| 카드/상세/Tasks | 저장 버튼·상태, 저장 후 직접 수락/거절, 현재 actual Intro 표시, pending action 판단 |
| Career LLM | tool enum·실행 handler·read filter·최근 추천 context·toolPolicyPrompt |
| 이메일 | email_reply/tools.py, prompt.py, handler 연결, 미완료 수락 확인과 keep의 충돌 처리 |
| Opportunity follow-up | opp/worker.py, opp/new_harper_agent.py의 unknown-feedback/무응답 predicate에서 keep 제외 |
| Behavior | 현재 feedback을 정확히 읽고 soft evidence로 처리. keep을 like/dislike/null로 정규화하지 않음 |
| 기존 장기 무응답 정리 | keep을 dislike로 바꾸지 않음. 일반 무응답도 명시 거절과 구분하는 통합 계획의 lifecycle 계약 적용 |
| 운영 통계 | internalMatchingAnalytics, daily/weekly stats, feedback-followup, 반응률·수락률 분리 |
| 진행/공개 | progress audience, legacy mirror 중복, company reader projection, 기존 수락 trigger의 like 조건 유지 |

현재 `saveTalentPosting`과 외부 링크 import 경로는 like/saved를 사용한다. 내부 keep을 이 경로에 무조건 연결하지 않는다. 외부 공고의 기존 저장 의미·탭·지원 상태는 이 변경으로 다시 정의하지 않는다.

## 12. 이관과 rollback

1. Reader·feedback 타입·follow-up·통계가 keep을 이해하도록 먼저 호환시킨다. 기존 like/dislike/null 동작은 유지한다.
2. RPC/API의 원자적 keep과 실제 진행 guard를 연결한다. 새 상태가 이 시점까지는 사용자에게 노출되지 않아도 된다.
3. 웹·모바일·채팅·이메일이 같은 결과를 내는지 검증한 뒤 버튼과 메일 안내를 노출한다.
4. Old worker가 keep을 unknown/무응답으로 처리하는 인스턴스가 남아 있으면 기능을 켜지 않는다. 운영 release 시 기존 여섯 worker rolling 계약을 따른다.
5. 과거 like/saved를 일괄 keep으로 이관하지 않는다. 내부 like에는 실제 수락·진행이 포함된다. 원문이 분명한 개별 정정은 별도 검토이며 이 기능 이관의 전제가 아니다.
6. Rollback 시 새 keep writer/UI를 끌 수 있지만 이미 저장한 keep을 null/dislike/like로 변환하지 않는다. Keep을 보존하고 올바르게 읽는 compat reader와 follow-up 제외는 유지한다.

## 13. 검증할 반례

| 사례 | 기대 결과 |
| --- | --- |
| 미응답 일반 내부 역할 저장 | 관심 있음으로 이동, 연결·공유·수락 tag 0 |
| 같은 저장 버튼 연속 클릭/네트워크 재시도 | 현재 상태/시각/사건 중복 없음 |
| 앱을 다시 열거나 모바일로 전환 | server count와 카드 위치 유지 |
| 수락과 저장 동시 요청 | 저장으로 수락이 덮이지 않음 |
| 저장 후 거절/수락 | 기존 정확한 결정 경로, 과거 keep 이력 보존 |
| 이미 수락한 역할에 “일단 보관할게” | keep으로 진행 취소하지 않음 |
| 조건부 공유 동의만 있고 실행 전에 keep | 현재 의사를 반영해 미실행 동의 적용 중단. 실제 수락 완료 상태와 구분 |
| 메일 “저장해줘” | keep, 수락 확인 메일·회사 전달 없음 |
| 수락 확인 대기에서 keep | 미완료 확인 종료, 오래된 “네” 회신이 몰래 수락하지 않음 |
| 일반 추천 keep 후 회사 Intro 도착 | 새 실제 요청 안내, 이전 keep을 Intro 수락으로 복사하지 않음 |
| Intro keep | awaiting_talent 유지, 무응답 반복 대신 결정 전 맥락 |
| Intro가 만료되거나 역할이 닫힘 | 실제 종료 사실, keep을 dislike로 변환하지 않음 |
| keep 후 3일/수개월 경과 | keep 유지, 미응답 자동 재촉/자동 거절 없음 |
| 사유 없이 keep 여러 개 | 강제 Brief/Memory 선호 생성 없음 |
| 다른 후보자/숨긴 역할/옛 추천 token | 권한·effective 추천 검증, 상태 변경 없음 |
| 회사가 후보자 상태를 조회 | 수락/관심 과장·사적 저장 사유 노출 없음 |
| 구버전 client/worker가 남음 | keep writer 활성화 전 차단 또는 호환. 알 수 없는 값 삭제 금지 |

이 표는 구현 후 통합·회귀 검증의 입력이다. 이 문서 검토에서 실제 후보자에게 메일을 발송하거나 제품 흐름을 실행하지 않았다. LLM 평가를 만들거나 실행할 때는 기존 evaluation registry의 version·원문 보호 계약을 따른다.
