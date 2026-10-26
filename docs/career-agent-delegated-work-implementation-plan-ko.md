# Career 지속 업무 에이전트 구현 계획

기준일: 2026년 10월 22일  
범위: 로컬 `harper_beta`와 `harper_worker`를 바탕으로 한 구현 설계. 아래의 새 테이블·함수·경로는 구현할 계약이다.  
관련 문서: [지속 업무와 연락의 제품 설계](career-agent-delegated-work-design-ko.md)

**일일 검토와 사건 기반 실행을 맡는 공통 Career 실행기를 beta에 만든다. 기존 Python Opportunity Worker는 검색·매칭 능력으로 분리하고, 후보자에게 연락할지를 결정하는 최상위 위치에서는 단계적으로 내린다.** 웹·이메일·백그라운드가 같은 Career 판단 계약과 도구를 사용하게 한다.

3일을 1일로 바꾸는 대상은 사용자를 다시 살피는 운영 주기다. 전체 검색, fit 평가, Gmail 본문 분석, 이메일 발송을 모두 하루마다 하지는 않는다. 각각의 실행 시점과 비용을 독립적으로 관리한다. 이 결정은 앞 제품 설계의 “추천의 기존 3일 검토 유지”보다 구체화한 선택이다. 기존 추천 연락 주기와 active/passive 정책은 별도의 계약으로 보존한다.

아키텍처의 중심은 **하나의 Career LLM 도구 루프**다. 이 말은 모든 일을 한 번의 API 응답으로 끝낸다는 뜻이 아니다. 필요한 정보를 읽은 뒤 다시 추론하는 호출은 필요하다. 별도 분류 모델 → 계획 모델 → 업무 모델 → 알림 판단 모델을 매 사건마다 직렬 호출하는 구조를 피한다는 뜻이다.

## 1 현재 코드에서 실제로 바꿔야 하는 부분

확인 기준은 beta `296269eb`, worker `d7c220e` 위의 로컬 작업 트리다. 두 저장소에 다른 미커밋 변경이 있으므로 배포 상태로 해석하지 않는다.

| 현재 구현 | 확인한 코드 | 구현에 주는 제약 |
| --- | --- | --- |
| 정기 검토 간격은 3일이며 indexed scheduler state를 전진시킨다 | [worker.py](../../harper_worker/opp/worker.py)의 `SCHEDULER_PERIODIC_CHECK_INTERVAL_DAYS`, `_advance_scheduler_state` | 상수 하나를 1로 바꾸면 기존 큰 조회와 실행도 더 자주 발생한다. 새로운 가벼운 일일 검토 경로로 교체해야 한다. |
| 외부 추천 간격과 검토 간격이 따로 존재한다 | 같은 파일의 `periodic_interval_days`, active/passive 계산 | 일일 검토가 외부 추천의 3일·6일 기본 간격과 무반응 누적을 바꾸지 않게 해야 한다. |
| orchestration은 고정된 연락 action을 고른다 | [orchestration.py](../../harper_worker/opp/agentic/orchestration.py), [types.py](../../harper_worker/opp/agentic/types.py) | `should_contact=false`이면 검색과 최종 생성도 중단한다. 조용한 조사·예약 변경·자료 준비를 일반적으로 표현할 수 없다. |
| orchestration 전에 이미 다른 LLM 비용이 발생할 수 있다 | [current_state.py](../../harper_worker/opp/agentic/current_state.py)의 `ensure_behavior_context`, `select_delivery_cards`, `contact_information`; 일부 trigger의 fit refresh | “일단 매일 orchestration만 부르자”도 지금 loader를 쓰면 가벼운 실행이 아니다. 작은 조회용 context builder를 따로 분리해야 한다. |
| 내부 추천은 일부 조건에서 forced action이다 | [rules.py](../../harper_worker/opp/agentic/rules.py) | action 목록만 늘리면 기존 강제 연락과 새 알림 정책이 충돌한다. 생산할 자료와 실제 연락 결정을 분리해야 한다. |
| 웹과 일반 이메일 답장은 이미 같은 turn을 사용한다 | [chatTurn.ts](../src/lib/career/chatTurn.ts), [email/runtime/reply.ts](../src/lib/email/runtime/reply.ts) | 같은 능력과 prompt를 재사용할 좋은 기반이다. 다만 현재 adapter는 실제 user message를 요구한다. 백그라운드를 가짜 사용자 발화로 넣어서는 안 된다. |
| 기능을 필요할 때 로드하는 runtime이 있다 | [capabilities/runtime.ts](../src/lib/career/capabilities/runtime.ts), [registry.ts](../src/lib/career/capabilities/registry.ts) | 새로운 최상위 의도 분류기를 만들 필요가 없다. 공통 도구 목록과 추가 로딩을 확장한다. |
| 이메일 실행은 DB 작업과 Queue 발행을 분리한다 | [email/runtime/queue.ts](../src/lib/email/runtime/queue.ts), [consumer.ts](../src/lib/email/runtime/consumer.ts) | DB에 저장한 뒤 발행하고 dispatcher가 복구하는 패턴을 재사용한다. 메일 job을 모든 종류의 업무 저장소로 바꾸지는 않는다. |
| 추천 메일에도 durable payload와 멱등 키가 있다 | [new_delivery_transport.py](../../harper_worker/opp/utils/new_delivery_transport.py) | 이를 버리지 않고 공통 전달 조정기에 연결한다. 기존 추천 저장과 전달 완료 callback을 보존해야 한다. |
| 회사 follow-up은 별도 저장되어 있으나 정기 scheduler에 묶여 있다 | [scheduled_company_followups.py](../../harper_worker/opp/utils/scheduled_company_followups.py), [migration](../supabase/migrations/20261014180746_company_talent_followup_schedules.sql) | 기존 due/revision/source 검증을 재사용한다. 후보자의 사적 위임을 이 테이블에 넣으면 회사 공개 범위가 섞인다. |
| 진행 중인 일 조회는 화면용 fallback과 축약을 포함한다 | [reengagementPendingActions.server.ts](../src/lib/career/reengagementPendingActions.server.ts) | 개별 reader는 재사용하되, 실패를 `[]`로 바꾸거나 같은 Role이라는 이유로 합치는 결과를 실행 판단의 정본으로 사용하지 않는다. |
| Gmail 검색과 정확한 thread fetch adapter가 있다 | [gmail.ts](../src/lib/integrations/gmail.ts), [composio.ts](../src/lib/integrations/composio.ts) | 소유권과 읽기 권한 검증은 재사용한다. 지속 수집, 페이지 복구, 완전한 본문·첨부 읽기는 추가한다. |
| beta에 일일 외부 추천 결과를 준비하는 별도 경로도 있다 | [externalRecommendationsV2/daily.ts](../src/lib/externalRecommendationsV2/daily.ts) | 같은 사용자에게 새 에이전트와 별도 검색을 중복 시작하지 않도록 기존 run 조회와 캐시를 함께 읽어야 한다. 이름이 daily라고 새로운 중심 runtime으로 삼지는 않는다. |

## 2 세 가지 대안과 채택안

| 대안 | 장점 | 그대로 선택하지 않는 이유 |
| --- | --- | --- |
| 기존 Worker 전체를 매일 실행하고 action enum을 늘린다 | 가장 빠른 단기 수정 | 사전 context 비용, 연락 중심 분기, Python과 웹의 판단 분리가 유지된다. 업무마다 action·CurrentState 필드·final delivery 분기가 늘어난다. |
| 모든 사용자·모든 메일마다 큰 Career LLM을 호출한다 | 구조가 겉으로 단순하다 | 변화 없는 사람도 context를 재독해한다. 메일이 많은 사람의 실행량이 폭증하고 같은 사용자의 동시 실행과 중복 연락이 생긴다. |
| 기술적인 수집·예약·중복 제거 후 공통 Career 도구 루프를 실행한다 | 필요한 순간에 일반 도구로 일할 수 있다. 비싼 검색과 연락을 독립시킬 수 있다 | 공통 실행·권한·전달 계약을 먼저 구축해야 한다. 이번 구현의 채택안이다. |

사건의 “커리어적 의미”를 싼 분류 모델이나 키워드로 먼저 걸러내는 계층은 추가하지 않는다. 코드가 걸러낼 수 있는 것은 이미 처리한 동일 원본, 변하지 않은 thread, 아직 오지 않은 예약, 해지된 연결, 현재 허용되지 않는 행동 같은 기술적 사실이다.

## 3 책임을 여섯 계층으로 분리한다

```text
사용자 대화 / 내부 원본 변경 / 이메일 수신 / 약속한 시각
                         ↓
수집 adapter ── 원본 참조와 변경 사실을 DB 사건함에 저장
                         ↓
dispatcher ── 실행할 사용자 선택, 중복 묶기, Queue 발행
                         ↓
Career 실행기 ── 작은 context → 같은 LLM → 일반 read/write 도구
                    ↓                     ↓
             무거운 업무 요청         변경·연락 실행
                    ↓                     ↓
        기존 검색·매칭·문서 runtime    권한·revision·멱등 실행 경계
                    ↓                     ↓
              완료 사건 반환          공통 전달 조정기와 기존 운송 계층
```

| 계층 | 소유하는 것 | 소유하지 않는 것 |
| --- | --- | --- |
| 원본 adapter | Gmail 변경 읽기, 내부 사건 연결, 소유 사용자 확인 | 중요도·답장 필요성·위임 목적 판단 |
| scheduler와 dispatcher | due 조회, 실행 용량, 재발행, 같은 사용자 사건 묶기 | 메일 내용 작성, 상황별 업무 순서 |
| Career 실행기 | 사용자 목적의 해석, 도구 선택, 조용한 작업, 다음 확인과 전달 판단 | 권한 우회, 외부 발송 성공 추정 |
| 전문 실행 능력 | 기존 검색·fit·브라우저 작업 등 비용이 큰 실행 | 후보자에게 별도로 연락할지 결정 |
| 실행 경계 | 소유권, 실제 허용 대상, 최신 revision, 중복 side effect 방지 | 자연어 문체와 의미를 키워드로 판정 |
| 전달 조정기 | 후보자별 발송 한도, 발송 시각, 실제 receipt, domain 완료 반영 | 임의의 긴급 점수, 별도 알림 판단 LLM |

beta에 판단 중심을 두는 이유는 이미 Career prompt·기능 로더·도구·웹·이메일이 여기에 있기 때문이다. Python으로 같은 계약을 다시 복제하지 않는다. Python Worker의 수집·매칭 역량은 서비스 능력으로 계속 사용한다.

## 4 하루 주기를 정확히 무엇에 적용하는가

### 네 개의 시계를 분리한다

| 시계 | 초기 구현값 | 실제 하는 일 |
| --- | --- | --- |
| dispatcher | 1분마다 | 기한이 된 DB 사건·예약, 유실된 Queue 발행, 만료 lease를 조회한다. 대상이 없으면 LLM을 호출하지 않는다. |
| 사용자별 일일 점검 | 하루 1회, 시간대를 분산 | 원본 연결·미처리 사건·약속 누락·추천 검토 가능 여부를 확인한다. 업무의 의미 판단이 필요할 때만 실행 사건을 만든다. |
| 맡은 일의 재실행 | 원본 사건 또는 저장된 정확한 시각 | 금요일 문의, 면접 전 준비, 결과 변경을 처리한다. 일일 점검 시간을 기다리지 않는다. |
| 무거운 탐색과 연락 | 기존 추천 설정 또는 위임별 합의 | 외부 추천 검색, 일일 캐시 재사용, 실제 이메일 전달을 각 계약에 맞게 수행한다. |

일일 점검의 대상은 삭제되지 않은 계정 중 추천 또는 지속 업무가 활성화된 사용자다. `profile_visibility != dont_share`를 전체 Career 실행 조건으로 재사용하지 않는다. 회사에 프로필을 공개하지 않는 사람도 사적인 오퍼 비교를 맡길 수 있다. 반대로 전체 연락 철회는 새 runtime에서도 지킨다.

### LLM 호출 없이 끝낼 수 있는 경우

1. 이전 점검 이후 새 원본 사건이 없다.
2. 실행 시각이 된 위임·재검토·미전달 결과가 없다.
3. 추천 탐색의 다음 검토 시각도 아직 오지 않았다.
4. 확인 경로의 상태와 권한에 변화가 없다.

이 네 조건이 모두 성립하면 운영 점검만 완료한다. “중요해 보이지 않는다”는 코드 판정은 없다. 반대로 지속 탐색의 재검토 시각이 왔으면 입력 내용이 같아도 LLM을 부른다. 새 수요를 찾아보는 일이 목적이므로 “새 메일 없음”으로 탐색을 영구 중단하지 않는다.

외부 추천 기본값은 현재의 `periodic_interval_days`와 active/passive 계약을 먼저 유지한다. 일일 점검은 다음 탐색·전달 기회를 더 정확히 잡는 것이며 사용자 설정을 1일로 덮어쓰지 않는다. 프로필 제출 직후의 3일 cooldown도 일반 일일 점검과 별도로 보존한다.

### 기존 scheduler를 바꾸는 순서

새 사용자가 아니라 **사용자별 실행 소유자**를 전환한다. 기존 대상은 `legacy`, 전환한 대상은 `career_agent`가 담당한다. 이는 모델 실험 cohort가 아니라 중복 실행을 막는 이관 상태다.

전환한 사용자는 기존 `fetch_due_scheduler_check_targets`와 `run_periodic_scheduler_cycle`의 일반 추천 연락 생성에서 제외한다. 기존 내부 fit 갱신·이미 시작한 검색·명시적 추천 요청은 계속 처리하되 결과를 새 실행기에 반환한다. 최종적으로 기존 정기 orchestration의 일반 연락 역할을 제거한다. 단순히 두 scheduler를 같이 켜지 않는다.

### 사건을 묶는 실제 기준

이미 위임에 연결된 새 사건은 최초 사건을 기준으로 30초의 고정 수집 창을 두어 합친다. 새 사건이 계속 온다고 이 창을 계속 뒤로 미루지 않는다. 사용자 직접 요청과 약속한 실행 시각은 이 대기를 적용하지 않는다. `not_after`를 넘기는 수집 대기도 허용하지 않는다.

관련성이 아직 확인되지 않은 Gmail 발견은 계정별 다음 시간 단위 묶음으로 들어온다. 한 실행에 preview 50개까지 처리하고 나머지는 다음 continuation에 남긴다. 메일 500개가 들어왔다고 500개의 전체 Career 호출을 만들지 않는다. 다른 due 업무가 기다리면 page 사이에서 실행권을 반납한다. 지연 범위는 “즉시 감지”라고 표시하지 않고 사용자의 실제 확인 계약에 반영한다.

## 5 하나의 LLM 중심 실행을 실제로 구성하는 방법

### 현재 turn에서 추출할 공통 부분

`runCareerChatTurn` 전체를 background에서 호출하지 않는다. 다음 세 부분을 먼저 분리한다.

- **context 생성:** 사용자 Profile·전체 Brief·관련 Memory, 도구 인식, 현재 업무와 원본을 읽는다.
- **모델과 도구 실행:** 기존 `runCareerChatAssistant`와 `CareerCapabilityRuntime`의 provider·기능 로딩을 재사용한다.
- **대화 및 전달 adapter:** 웹은 streaming과 대화 저장, 이메일 답장은 기존 thread 전달, background는 위임 변경과 선택적인 연락을 담당한다.

새 공통 함수는 `runCareerAgentTurn`으로 둔다. 입력의 시작점만 `user_message`, `source_events`, `scheduled_review`로 구분한다. 이것은 의도 분류가 아니라 실제 실행 출처다. background에는 사용자 메시지가 없어도 정상이다.

현재 모델 경로의 “빈 텍스트면 복구하여 답변 만들기”는 사용자 답변 adapter에만 유지한다. background는 도구로 일을 마친 뒤 외부 텍스트 없이 종료할 수 있어야 한다. 문자열 `NO_MESSAGE`를 판정하여 동작을 취소하는 방식은 사용하지 않는다.

### 한 번의 실행 순서

```text
1. 사용자 단위 실행권을 잡고 이번에 처리할 event ID들을 확정한다.
2. 새 사용자 발화·권한·원본·최근 전달을 읽어 context를 만든다.
3. 같은 Career LLM을 호출한다.
4. LLM의 read tool은 필요한 원문을 추가한다.
5. write 또는 외부 행동은 명령을 영속 기록한 뒤 실행한다.
6. 비싼 작업은 기존 runtime에 맡기고 결과 사건을 기다린다.
7. 다음 확인이 필요하면 예약을 기록한다.
8. 전달할 내용이 있으면 공통 전달 경로를 사용한다.
9. 실제로 처리한 event ID만 완료하고 실행권을 반납한다.
```

처리 결과가 “아직 기다린다”여도 해당 사건을 검토한 사실은 완료될 수 있다. 위임 자체는 열린 상태로 남는다. 사건 처리 완료, 업무 완료, 결과 전달 완료를 하나의 `done`으로 합치지 않는다.

처음에는 일반 도구 8회, 단일 함수의 작업 시간 240초를 연속 실행 예산의 출발값으로 둔다. 이는 업무 종료 조건이 아니다. 한도에 가까워지면 실행 checkpoint를 저장하고 다음 실행으로 넘긴다. 무거운 검색을 기다리면서 함수와 사용자 lease를 점유하지 않는다. 실제 값은 현 runtime 제한과 측정값으로 조정한다.

모델 출력 토큰을 작게 잘라 비용을 맞추지 않는다. 호출·원문 읽기·외부 작업의 수용량으로 비용을 관리한다. 순환 호출은 trace와 반복된 동일 도구 입력으로 관측하되, 문체나 의미를 휴리스틱으로 수정하지 않는다.

## 6 orchestration 앞에 넣을 context

### 아무것도 모르고 판단하게 하지 않되 모든 자료를 넣지도 않는다

기본 context는 아래처럼 서버가 원본을 투영한 사실이다. 별도 LLM 요약 호출을 하지 않는다.

| 블록 | 처음 제공할 내용 | 추가 읽기 |
| --- | --- | --- |
| 사용자 | 간결한 Profile, 전체 Search Brief, 현재 대화에 관련된 Memory | 기존 공통 context read tool |
| 실행 이유 | 이번 event ID, 발생 시각, 원본 종류와 짧은 사실, 확인 범위 | exact source 조회 |
| 맡은 일 | 열린 위임의 제목·지시·관련 대상·권한·다음 예약 인덱스 | 특정 work ID 상세 |
| 즉시 다루는 업무 | 이번 사건과 직접 연결된 위임의 원래 사용자 요청과 최근 결과 | 이전 연락·문서·원문 |
| 외부 연결 | Gmail 연결 revision, 마지막 정상 수집·해석, 미확인 범위 | 계정·thread 확인 |
| 행동의 결과 | 아직 진행 중인 검색과 기존 실행 receipt | 기존 run 조회 |
| 전달 | 최근 24시간 횟수, 다음 가능 시각, 최근 전달 5건의 원본 참조와 요지 | exact 메시지 읽기 |
| 다른 기회 | 추천 가능 후보·진행 중인 요청의 작은 인덱스와 원본 ID | 일반 기회/회사 조회 |

기본 업무 인덱스는 최대 20개와 추가 개수를 표시한다. 이번 사건에 연결된 업무와 마감이 가까운 실제 예약은 먼저 포함하고, 나머지는 cursor로 읽는다. Gmail 발견은 한 번에 미리보기 최대 50개를 입력 단위로 삼으며 나머지 page는 미처리 상태로 남긴다. 이 수치는 context paging의 초기값이지 중요도 판정이나 DB 저장 개수 제한이 아니다.

source reader의 공통 결과는 `items`, `nextCursor`, `coverage`, `observedAt`, `unavailableSources`를 제공한다. `coverage`는 완전 조회인지 일부 조회인지에 대한 기계적 사실이다. 조회 실패를 빈 목록으로 바꾸지 않는다. “답장이 없다”는 조건부 실행은 해당 thread의 필요한 범위를 정상 조회한 뒤에만 가능하다.

Career 실행기에는 매번 Behavior Context를 만들게 하지 않는다. Profile·Brief·Memory와 위임 원본이 판단 근거다. 검색·매칭을 실제 요청했을 때 기존 Worker가 Profile + 전체 Brief + 동일 version의 Behavior Context를 준비하여 단계마다 재사용한다. Behavior 실패로 금요일 회사 문의까지 중단되어서는 안 된다.

### 기본 입력 예시

```text
실행 이유: Gmail thread T17에 메시지 M42가 추가됨. 10:04 수집.
맡은 일 W12: A사 면접 일정과 준비 관리. 금요일 10:00까지 실질 답이 없으면 담당자에게 문의.
권한: 요청한 담당자에게 진행 문의 가능. 새 회사 지원과 조건 합의는 포함하지 않음.
현재 확인: M42의 제목·발신자만 확인. 본문과 첨부는 아직 읽지 않음.
다음 예약: 금요일 10:00 재확인 E81.
최근 실행: 월요일 위임 생성. 아직 회사 문의 전달 없음.
연락: 오늘 자발적 연락 1회. 다음 일반 묶음은 내일 18:00.
약속: 일정이 정해지면 준비 지원. 원래 사용자 요청 U301을 조회할 수 있음.
```

LLM은 M42를 읽어야 하는지 판단하고 같은 루프에서 읽는다. 먼저 “일정메일 분류기”를 호출하고 그 결과로 다른 “면접 에이전트”를 실행할 필요가 없다.

## 7 새 저장 구조와 기존 저장 구조의 경계

새 저장은 공통 실행에 필요한 **5개 테이블과 Gmail 수집용 1개 테이블**로 한정한다. 이름은 아래를 기준으로 구현한다. 외부 기회별 상태 머신, 알림 중요도 판단표, 별도 Career Timeline, 전체 Memory 복제본은 만들지 않는다.

### 기존 저장을 계속 사용하는 것

| 기존 원본 | 계속 소유할 사실 |
| --- | --- |
| `talent_contexts` | Brief와 확인된 Memory |
| `talent_messages`, `career_email_messages` | 실제 사용자 대화와 Harper가 주고받은 이메일 |
| 추천·fit·company request·meeting 원본 | 해당 domain의 실제 상태와 공개 범위 |
| `company_talent_followups` | 회사가 설정한 후속 연락 시각·revision·원본 |
| `opportunity_discovery_run`, `external_recommendation_runs` | 검색 입력·실행·결과와 기존 provenance |
| 기존 delivery·contact·email reply outbox | domain별 기존 전송 결과와 완료 callback |
| 기존 tool usage·LLM usage | 호출량, 비용, 운영 trace |

`career_email_messages`에 연결된 개인 Gmail 전체를 복사하지 않는다. 이 테이블은 Harper 통신을 읽는 기존 consumer가 있으므로 개인 수신함을 섞으면 의미와 공개 범위가 달라진다.

### A career_work_items

저장해야 하는 독립적인 사실은 **사용자가 무엇을 계속 맡겼고 어떤 행동을 허용했는가**다. 실행기, 예약 조회, 사용자 화면이 읽는다.

| 필드 | 계약 |
| --- | --- |
| `id`, `talent_id` | 소유 위임의 식별자 |
| `instruction` | 합의한 목적과 조건의 자연어. 실행 계획 JSON이 아님 |
| `source_refs` | 사용자 요청, 관련 thread·지원·문서의 typed reference 목록 |
| `authority` | 원본 요청 참조와 실제 허용 tool·상대·문서 범위. 인증된 사용자 경로만 확장 가능 |
| `revision` | 수정·취소의 compare-and-swap 기준 |
| `created_at`, `updated_at`, `closed_at`, `close_reason` | 책임의 시작·변경·종료 사실 |

`interview_waiting`, `offer_negotiating` 같은 업무별 state는 만들지 않는다. 다음 실행 시각도 이 테이블과 큐에 이중 저장하지 않는다. 아래 사건함의 활성 예약에서 조회한다.

### B career_agent_events

저장하는 사실은 **아직 처리하지 않은 원본 변화 또는 실제 재실행 약속**이다. dispatcher와 실행기가 읽는다. 원본 사건함과 시간 예약 큐를 이 테이블 하나로 표현한다.

| 필드 | 계약 |
| --- | --- |
| `id`, `talent_id` | 사건 식별자와 사용자 |
| `source_key` | 같은 원본 변경 또는 같은 예약의 중복 등록 방지 키 |
| `source_ref`, `source_version`, `payload` | 원본 위치와 실행에 필요한 최소 사실 |
| `work_id`, `work_revision` | 특정 위임에 연결된 경우의 참조. 단순 원본 변경은 null 가능 |
| `available_at` | 다음으로 실행 가능한 시각. 미래 예약도 같은 필드 |
| `not_after` | 원본 또는 사용자 약속에서 확인한 시각 제한. 모델의 긴급 점수 아님 |
| `claimed_run_id`, `processed_at`, `cancelled_at` | 어느 실행이 맡았고 처리·취소됐는지 |
| `attempts`, `last_error`, `next_attempt_at` | 기술적 재시도 사실 |

예: `gmail:<account-generation>:<message-id>:added`, `work:<id>:<revision>:<schedule-id>`, `search:<run-id>:completed`. 키의 prefix는 원본 주소 체계이며 상황별 의미 분류가 아니다.

한 위임에 여러 예약을 둘 수 있다. “금요일 문의”와 “면접 전날 준비”가 필요하면 서로 다른 schedule ID를 사용한다. 다음 시각을 하나만 저장해 이전 약속을 덮어쓰지 않는다. 위임 수정 시 예약의 유지·취소·추가를 같은 transaction에서 반영한다.

### C career_agent_state

저장하는 사실은 **현재 이 사용자를 누가 실행 중이며 어느 사용자 입력까지 반영했는가**다. 같은 사용자의 실행·발송 경쟁을 막는 runtime row다.

| 필드 | 계약 |
| --- | --- |
| `talent_id` | 사용자당 한 행 |
| `runtime_owner` | 이관 중 legacy 또는 career_agent의 실행 소유권 |
| `active_run_id`, `lease_token`, `lease_until` | 짧은 실행권과 fencing |
| `user_input_revision` | 인증된 새 사용자 발화·설정 변경 때 증가 |
| `source_revision` | 연결된 domain 사실이 실제로 변경됐을 때 증가 |
| `next_daily_scan_at` | 가벼운 운영 점검 시각. 업무 예약의 정본은 아님 |

새 사용자 메시지가 들어오면 그 내용을 분류하기 전에 `user_input_revision`을 올린다. 기존 background가 이전 지시로 발송하지 않게 하는 구조다. “취소”라는 단어를 코드가 찾아야 할 필요가 없다. 대화 LLM이 새 요청을 반영한 후 남은 일을 다시 실행한다.

### D career_agent_runs

저장하는 사실은 **실행이 어느 도구 명령까지 수행됐는가**다. crash 복구와 비용 추적에 필요하다.

| 필드 | 계약 |
| --- | --- |
| `id`, `talent_id`, `event_ids` | 이번 실행에 포함한 정확한 사건 목록 |
| `user_input_revision`, `source_revision` | context를 읽은 기준 |
| `started_at`, `finished_at`, `status` | 실행 수명 |
| `checkpoint` | 저장한 assistant tool call·tool result·현재 step. 모델의 숨은 추론은 저장하지 않음 |
| `usage_ref`, `error` | 기존 usage와 실패 연결 |

일반 audit trace만으로는 다음 도구 실행의 중복 여부를 확정할 수 없으므로 checkpoint가 필요하다. 재시작 때 모델을 처음부터 다시 호출하지 않고, 이미 저장한 도구 명령을 먼저 복구한다. 민감 원문이 포함된 checkpoint는 접근 제한과 정해진 보존·삭제 정책을 적용한다.

### E career_agent_effects

저장하는 사실은 **실행을 시작한 외부 행동의 정확한 명령과 결과**다. 공통 전달 예약·receipt와 새 외부 이메일의 outbox 역할도 한다.

| 필드 | 계약 |
| --- | --- |
| `id`, `talent_id`, `run_id`, `tool_call_id` | 실제 명령과 발생 실행. legacy outbox 연결의 `run_id`는 null 가능 |
| `operation_key` | 재시도해도 유지되는 한 행동의 키 |
| `kind`, `target_ref`, `source_refs` | 실행 능력, 대상, 근거 |
| `authority_ref`, `expected_work_revision`, `expected_user_input_revision` | 실행 시 확인할 권한과 최신성 |
| `expected_source_versions` | 서버가 원문 조회 때 발급한 참조별 version. 조건부 행동 전 원본 변경 확인 |
| `available_at`, `notification_contract_ref` | 발송 가능 시각과 사용자 알림 약속의 근거 |
| `payload`, `payload_hash`, `started_at` | 최종 실행 입력. 시작한 뒤에는 불변 |
| `status`, `provider_id`, `result_ref`, `error` | 예약·실행·확인된 결과·불명확한 결과 |
| `merged_into_effect_id` | 아직 시작하지 않은 여러 알림 요청을 한 실제 발송으로 묶었을 때의 참조 |

기존 outbox가 있는 연락은 본문을 이 테이블에 다시 복제하지 않고 `target_ref`로 가리킨다. 그 outbox와 effect 중 누가 provider를 호출하는지는 이관 단계에서 하나로 정한다. **effect는 발송 조정·멱등 실행의 정본, 기존 domain outbox는 해당 기능의 기록**이 된다. 서로 다른 두 발신자가 같은 건을 독립 소비하지 못한다.

일반 DB 수정은 기존 domain transaction과 멱등 계약을 재사용한다. 모든 read와 단순 Memory 쓰기마다 이 effect row를 강제하지 않는다. 되돌리기 어려운 발송·지원 제출·별도 장기 run 시작에 우선 적용한다.

source read tool은 조회한 ID·version·시각을 서버 측 read receipt로 남긴다. 외부 행동 도구는 그 참조를 사용한다. 모델이 임의로 “최신 메일 확인 완료”를 써서 재확인을 통과할 수 없다. 원본이 바뀌었으면 도구는 `source_changed`와 새 원본 참조를 반환하여 같은 LLM이 판단을 갱신하게 한다.

### F talent_mailbox_sync

저장하는 사실은 **어느 연결의 어느 범위까지 수집했고 다음 기술 동기화가 언제인가**다. Gmail adapter가 읽는다.

`talent_id`, `provider`, `account_id`, `connection_generation`, `access_scope_ref`, `cursor`, `page_checkpoint`, `next_sync_at`, `last_success_at`, `last_error`, `lease_token`, `lease_until`을 둔다. 현재 `talent_integrations`에는 cursor·lease가 없으므로 연결 상태와 수집 상태를 분리한다.

Composio polling의 cursor와 Gmail 직접 연동의 historyId는 provider adapter가 해석한다. 수집 완료 위치와 LLM이 처리한 사건 목록을 하나의 cursor로 합치지 않는다. 계정 재연결 시 generation을 바꿔 구 연결의 늦은 webhook과 작업이 새 계정에 적용되지 않게 한다.

### 필요한 인덱스와 제약

- `career_work_items(talent_id, updated_at)` 중 미종료 행: 사용자별 열린 업무 조회.
- `career_agent_events(available_at, id)` 중 미처리·미취소 행: due 처리. 사용자별 조회용 `(talent_id, available_at, id)`도 둔다.
- `(talent_id, source_key)` unique: 같은 원본 전달과 예약의 중복 등록 차단.
- `career_agent_effects(operation_key)` unique: 동일 외부 행동의 중복 시작 차단.
- `career_agent_effects(talent_id, started_at)`과 예약 시각 인덱스: 사용자별 발송 한도 및 due delivery 조회.
- `career_agent_state(talent_id)` PK, mailbox의 계정 generation 키: 실행 소유권과 연결 소유권의 정본.

상태 text의 값 목록 CHECK, 업무별 순서·개수 제약은 추가하지 않는다. 참조 소유권과 변경 revision은 실행 RPC에서 검증한다. 새 public 테이블은 RLS를 켜고 일반 클라이언트의 write 권한을 주지 않는다. 읽기는 기존 인증된 서버 경로로 제공하고, 내부 RPC의 실행 권한을 필요한 service role로 제한한다.

### 원문 보존과 증가량

첫 구현의 완료 run checkpoint는 종료 후 7일에 원문·tool 본문을 지우고 실행 ID·원본 참조·usage·receipt만 남기는 정책으로 시작한다. 처리한 Gmail 사건의 preview도 7일 뒤 제거한다. source key와 처리 시각은 가벼운 중복 방지 기록으로 남겨 과거 webhook이 다시 왔을 때 재처리하지 않는다. 미해결 사건·외부 발송이 불명확한 effect·열린 위임은 이 cleanup으로 종료하지 않는다.

실제 Harper 통신의 기존 보존 정책은 그대로 사용하고 중복 본문을 새 테이블에 쌓지 않는다. 계정 삭제는 원문·checkpoint·위임·예약과 검색 가능한 파생 자료를 함께 정리한다. 테이블 전체를 매분 scan하지 않으며 pending partial index와 사용자별 조회를 사용한다. 사건 행 증가량과 인덱스 크기를 측정하기 전부터 별도 이벤트 저장소나 partition 시스템을 도입하지 않는다.

## 8 도구 계약

### 원본 LLM에게 보일 도구

| 능력 | 재사용 또는 변경 | 필요한 입력과 효과 |
| --- | --- | --- |
| 사용자 이해 읽기·쓰기 | 기존 `read_talent_context`, `write_talent_context` | Brief·Memory 계약 유지 |
| 진행 중인 일 읽기 | 기존 activity read를 확장 | `workIds`, `sourceRefs`, `cursor`로 위임·원본·예약·실행 receipt 조회 |
| 위임 변경 | 새 `manage_career_work` | `changes[]`로 목적·원본·권한·예약을 생성·수정·종료. 기존 ref와 expected revision 사용 |
| 메일 읽기 | 기존 Gmail 도구 확장 | 검색과 exact thread/message 읽기를 분리. `cursor`, `includeContent`, attachment ref 제공 |
| 회사 연락 | 기존 `contact_company` | 확인된 상호 연결과 기존 즉시 전달 계약 유지 |
| 외부 이메일 | 새 외부 발송 능력 | 검증한 recipient ref, work ref, 본문, 공유 가능한 문서 ref. 서버가 발신자와 reply alias 결정 |
| 검색·조사 | 기존 추천·회사 조사·브라우저 도구 | 장기 실행이면 기존 run receipt를 반환하고 완료 사건을 등록 |
| 후보자에게 전달 | 새 공통 `deliver_career_update` | 사실 참조와 알림 계약, 지금 전달 가능한 경우의 본문. 한도 미충족이면 같은 요청을 예약 |
| 실행 종료 | 내부 `complete_career_turn` | 처리한 event ID 목록만 확정. 사용자에게 보여줄 텍스트는 필수 아님 |

도구의 신규 기준은 실제 새 지속 효과다. `decide_followup`, `review_interview`, `classify_urgency` 같은 판단 전용 도구를 만들지 않는다.

### 위임 생성 예시

```json
{
  "changes": [{
    "op": "add",
    "instruction": "A사 면접 진행을 관리한다. 일정이 정해지면 준비를 돕고 금요일까지 실질적인 답이 없으면 기존 담당자에게 진행 상황을 문의한다.",
    "sourceRefs": ["user_message:301", "gmail_thread:T17"],
    "allowedActions": [{"tool": "send_external_email", "targetRef": "mail_participant:P9"}],
    "schedules": [{"at": "2026-10-23T10:00:00+09:00", "instruction": "최신 대화를 확인하고 아직 실질 답이 없으면 승인된 문의를 실행한다."}]
  }]
}
```

형식은 machine contract의 예시다. 회사 이름이나 금요일을 위한 전용 branch를 만들지 않는다. `talent_id`, 원본 요청의 실제 소유자, 현재 execution ID는 모델이 넣지 않고 서버가 결정한다. 권한의 의미는 원본 대화 LLM이 해석하되, background와 외부 이메일은 새로운 상대나 문서 공유 권한을 확대할 수 없다.

`manage_career_work`는 내부에서 LLM을 다시 호출하지 않는다. 위임 저장과 예약 사건 생성이 모두 성공해야 성공을 반환한다. “저장은 됐지만 예약은 안 됐다”는 성공 결과를 허용하지 않는다.

### silent 실행과 연락을 분리한다

`deliver_career_update`를 호출하지 않아도 자료 저장·다음 예약·회사 문의·업무 종료가 가능하다. 도구가 성공했다고 자동으로 후보자에게 별도 메일을 보내지 않는다. 직접 요청한 회사 연락의 성공 답장은 현재 대화 adapter가 처리하며 추가 자발적 이메일을 만들지 않는다.

background의 read·write 권한은 위임과 기존 제품 설정에서 얻는다. 현재 `chat` 도구의 `userMessageId`를 임의의 마지막 메시지로 채우지 않고, 공통 tool context에 실제 `authorizationSourceRef`, `workId`, `runId`를 추가한다. 온보딩의 별도 extraction은 그대로 두고 일반 업무로 확장하지 않는다.

## 9 Gmail 수집을 모델 실행과 분리하는 상세 계약

### 첫 구현은 현재 Composio 계정으로 시작한다

현재 계정 연결과 소유권 검증을 재사용한다. 첫 출시 범위는 사용자가 맡긴 정확한 thread 추적과 Harper에게 전달된 대화다. 전체 수신함 발견은 다음 단계에 붙인다. Gmail 직접 OAuth와 Pub/Sub를 동시에 새로 구축하는 것을 첫 단계의 의존성으로 두지 않는다.

`executeComposioGmailFetchThread`를 실행 경계 밖의 일반 read adapter로 확장한다. source identity와 연결 revision을 검증한 후 원문을 읽고, 본문·첨부가 생략됐는지 명시한다. 현재 검색 응답의 메시지당 4,000자·전체 20,000자 제한은 미리보기 계약으로 유지할 수 있지만 조건부 발송의 최종 확인은 완전한 관련 원문을 읽어야 한다.

### 확인 주기

| 대상 | 첫 구현에서의 동작 |
| --- | --- |
| Harper 전용 주소의 새 메일 | 기존 수신 webhook에 위임 alias routing을 추가하고 즉시 사건 저장 |
| 연결한 Gmail의 알려진 thread | 우선 Composio의 수신 trigger 사용 가능 범위를 확인하고, 발신까지 포함하는 보완 polling을 운영 |
| polling 보완 | 추적이 활성화된 계정만 기본 1시간마다. 더 짧은 지연을 합의한 업무만 범위를 좁혀 간격 조정 |
| 정확한 조건부 발송 | 예약 시각에 대상 thread를 즉시 다시 읽음. 1시간 polling 결과만으로 실행하지 않음 |
| 넓은 신규 발견 | 허용한 계정에서 새 메시지의 metadata를 묶어 처리. 개별 메시지마다 LLM을 호출하지 않음 |
| 연결이 없는 사용자 | Gmail 확인은 0회. 내부 사건·직접 전달 메일·시간 예약만 사용 |

[Composio 공식 문서](https://docs.composio.dev/docs/triggers)는 Gmail을 polling trigger로 설명하고 managed auth에서 약 15분까지 지연될 수 있다고 명시한다. 수신 trigger가 발신까지 알려준다고 가정하지 않는다. 연동 확인 작업의 산출물은 실제 지원 trigger, 발신 포함 여부, pagination 인자, 원문 및 첨부 범위, 과금 단위다.

발신 이벤트가 제공되지 않으면 알고 있는 thread를 직접 읽는 보완을 사용한다. thread 수가 늘면 계정 단위 변경 목록을 한 번 읽고 실제 변한 thread만 조회하는 경로로 전환한다. 이 경로를 현재 provider 계약으로 충족할 수 없다면 Gmail 직접 연동 adapter를 추가한다. Composio가 보유한 인증 정보를 곧바로 직접 Gmail watch에 쓸 수 있다고 가정하지 않는다.

### 수집 transaction과 복구

1. `talent_mailbox_sync`의 계정 lease를 획득한다.
2. 연결 generation과 지속 읽기 허용 범위를 확인한다. 읽기 OAuth가 있다는 사실만으로 지속 감시 동의를 만들지 않는다.
3. 마지막 완료 cursor 이후의 변경을 한 page 읽는다. 수신과 발신을 모두 포함한다.
4. 새 message ID와 변경 version에 대해 사건을 upsert한다. 본문 전체 대신 원본 참조와 필요한 preview를 저장한다.
5. 사건 저장과 page checkpoint 전진을 같은 DB transaction으로 확정한다.
6. 모든 page 저장이 끝난 뒤 완료 cursor를 전진시킨다. Queue 발행은 이후 실패해도 dispatcher가 복구한다.

시간 기반 polling만 가능하면 겹치는 시간 범위를 다시 읽고 source key로 중복을 제거한다. 단순히 마지막 수신 메일의 시각을 cursor로 쓰면 늦게 도착한 과거 날짜의 메일을 놓칠 수 있으므로 정기 reconciliation이 필요하다. 이 방식은 Gmail history 기반 동기화와 동등한 완전성을 보장하지 않는다.

직접 Gmail adapter를 도입하면 push는 wake 신호이고 history가 실제 변경 원본이다. watch 갱신·history 만료 복구를 adapter 내부에서 처리한다. [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push)와 [동기화 계약](https://developers.google.com/workspace/gmail/api/guides/sync)에 맞춰 구현한다. 초기·복구 동기화의 과거 자료는 현재 현황을 구성하며, 과거 결과를 새 소식처럼 전부 발송하지 않는다.

### 수집 후 모델 처리

정확한 thread가 위임과 연결돼 있으면 해당 사용자 사건에 바로 연결한다. 새 thread의 관련성은 Career LLM이 metadata와 필요시 본문을 읽어 판단한다. 제목 키워드나 발신 회사 목록으로 의미를 확정하지 않는다. 신규 발견을 끈 사용자의 미연결 메일은 처리 범위 밖이라는 사실을 유지한다.

읽음·라벨 변경만 있고 내용과 실행 관련 사실이 같으면 동일 메시지를 새 내용으로 재분석하지 않는다. 반대로 발신·본문·실제 일정 변경은 처리한다. email ID가 같다는 이유로 본문 변경까지 버리지 않도록 제공자가 주는 내용 version 또는 수집한 내용 fingerprint를 사용한다.

기존 `automaticEmailReason`은 자동 메일에 다시 답하여 루프가 생기는 것을 막는 데 사용할 수 있다. **관찰할 자료를 버리는 필터로 사용하지 않는다.** ATS 일정 안내와 부재중 회신도 업무에 필요한 증거다. 관찰·해석과 자동 회신 허용은 별개다.

외부 담당자의 메일은 위임 alias로 소유 사용자를 찾되 인증된 사용자 요청으로 승격하지 않는다. 수신 webhook 서명은 provider가 전달했다는 증거이며 발신자가 후보자의 권한을 가졌다는 증거는 아니다. 외부 본문은 tool 결과의 자료로만 주입한다.

### 외부 문의의 발신과 회신

첫 외부 문의는 후보자의 Gmail 쓰기 권한을 추가 요구하지 않고 기존 Resend의 Harper 발신자로 보낸다. 사용자를 돕는 Harper라는 관계를 밝히고, 위임에 연결한 reply alias로 회신을 받는다. 후보자를 자동 CC하여 회사 문의마다 알림을 하나 더 만들지는 않는다.

기존 `email_reply_aliases`에 nullable `career_work_id`와 허용 routing 범위를 추가한다. 일반 후보자 답장 alias의 sender 검증은 유지한다. 위임 alias에 들어온 외부 담당자 메일은 `resolveEmailIdentity`의 일반 후보자 대화로 넘기지 않고 자료 사건을 만든다. 주소를 아는 것만으로 업무 내용 전체를 조회하거나 새 명령을 내릴 수 없다.

현재 [sendResendEmail](../src/lib/email/send.ts)은 본문·CC·reply-to·header·멱등 키를 지원하지만 attachment 입력은 없다. 첨부 전송은 이 transport를 [Resend attachment 계약](https://resend.com/docs/api-reference/emails/send-email)에 맞게 확장해야 한다. 모델에는 임의의 외부 URL을 fetch해 전송하는 권한을 주지 않고, 소유권과 공유 허용을 검증한 문서 ref만 받는다. 첨부가 준비되지 않았으면 본문만 보낸 뒤 첨부까지 전달했다고 기록하지 않는다.

## 10 발송 여부와 실제 발송을 연결하는 구체적인 구조

### 먼저 발송 경로를 한 곳에서 관측하게 한다

현재 producer가 만든 domain payload를 보존하면서 공통 effect 등록과 예약을 거치게 한다. 여기부터 연결하지 않으면 새 에이전트에 아무리 좋은 prompt를 넣어도 다른 Worker가 독립적으로 메일을 보내 총량을 통제할 수 없다.

| 발송 원본 | 연결할 실제 코드 | 처리 |
| --- | --- | --- |
| 정기 추천·내부 follow-up | worker `new_delivery_transport.py::deliver_email` | 기존 outbox를 effect에 연결. 새 runtime 사용자는 provider 직접 호출을 전달 조정기로 넘김 |
| 명시적으로 요청한 비동기 검색 결과 | `onDemandJobSearch.ts`의 run 계약과 Worker 완료 경로 | 원래 사용자 요청의 전달 약속을 보존하고 같은 effect로 완료 |
| 회사 질문·면접 초대·연결 안내 | `email/runtime/contact.ts`와 대응 legacy contact consumer | 기존 request/meeting 검증과 링크를 보존하고 후보자별 정책 통과 |
| 일반 이메일 답장 | `email/runtime/reply.ts` | 인증된 inbound 답장에 연결된 reply로 기록. 자발적 연락 한도로 대화를 막지 않음 |
| 새 지속 업무 알림·외부 문의 | 새 delivery adapter | 동일한 effect·receipt와 기존 Resend transport 사용 |
| CRM 등 후보자에게 가는 별도 연락 | 해당 `contact_queue` type | 후보자 연락 총량에 포함할 producer를 명시적으로 연결. 임의로 transactional 예외 처리하지 않음 |

로그인 코드 같은 계정 인증 메시지는 Career 자발적 연락 범위와 별도다. 회사 사용자에게 보내는 메일도 후보자별 한도와 섞지 않는다. 같은 이메일 주소라는 이유만으로 서로 다른 수신 목적의 원장을 합치지 않는다.

### 알림 정책의 기계적 집행

후보자의 시간대·조용한 시간·묶음 시각·자발적 연락 한도는 `talent_setting`의 새 `career_notification_preferences` JSON에 둔다. 설정 writer가 schema version과 필요한 타입을 검증하고, 잘못된 timezone은 실행 전에 설명 가능한 오류로 반환한다. 업무별 선호를 enum에 가두지 않는다.

초기값은 제품 설계의 최근 24시간 일반 묶음 1회, 비약속 자발적 연락 총 2회다. 기존 연락 설정이 더 제한적이면 이를 우선한다. 연락 한도를 모델이 출력하는 `priority`로 바꿀 수 없게 한다.

예외의 근거는 다음 두 가지뿐이다.

- 현재 인증된 사용자 발화에 대한 직접 답장.
- 원래 사용자가 허용한 특정 시각·조건의 전달 약속. 위임 또는 기존 비동기 요청에 연결된 불변 authority ref가 필요하다.

회사가 요청한 follow-up은 후보자 자신의 알림 약속이 아니다. 회사 요청을 예외로 분류하면 회사 수만큼 제한이 무력화된다. 합의한 시간 약속을 실제로 여러 개 준 사용자는 여러 알림을 받을 수 있으므로, 설정에서 무조건 총 2회라고 설명하지 않는다.

`reserve_delivery_slot`은 `career_agent_state`의 사용자 row를 잠그고 이미 시작했거나 예약한 effect를 읽는다. 사용 가능한 슬롯·조용한 시간·약속을 계산하여 하나의 effect에 할당하고 commit한다. 두 Worker가 동시에 같은 마지막 슬롯을 가져갈 수 없다. 예약이 미래로 밀리면 그 시각의 wake event도 함께 남긴다.

발송 직전 `begin_career_effect`는 그 effect의 기존 예약을 다시 확인한다. 같은 effect에 슬롯을 한 번 더 차감하지 않는다. 실제 발송 시각이 달라져 최근 24시간 조건과 충돌하면 새 가능 시각으로 재예약하며 사건을 보존한다.

후보자에게 가는 외부 연락만 이 한도에 계산한다. 담당자에게 보내는 승인된 문의는 같은 실행 receipt를 사용하되 후보자의 메일 횟수로 세지 않는다. 같은 발송의 재시도도 새 횟수로 세지 않는다. 시작하지 않은 예약의 취소는 슬롯을 반환하고, provider 접수가 불명확한 건은 결과가 확인될 때까지 사용한 슬롯으로 취급한다.

### 미래 알림은 본문을 미리 확정하지 않는다

`deliver_career_update`를 호출했지만 지금 발송할 수 없으면 source refs와 전달 책임만 남긴다. 해당 시각에 같은 Career LLM이 최신 사건·사용자 답장·취소·이미 전달된 내용을 읽고 메시지를 만든다. 별도 알림 작성 모델을 두지 않는다.

재진입할 때 기존 `deliveryRef`를 tool 입력으로 받아 동일한 요청을 완성한다. 매번 새 알림 effect를 생성하지 않는다. 여러 미시작 요청을 묶는 경우 실제 발송용 effect 하나에 source refs를 모으고 나머지는 `merged_into_effect_id`로 연결한다. 최종 receipt는 묶인 요청들의 domain finalize를 모두 처리하며 연락 횟수는 대표 effect만 센다. 시작한 발송은 뒤늦게 다른 묶음에 합치지 않는다.

발송이 가능한 실행에서는 LLM이 이미 본문을 작성했으므로 다시 writer를 호출하지 않는다. 서버가 최신 revision·원본·한도를 확인하고 payload를 고정한 뒤 발송한다. 생성 후 원본이 바뀌면 고정 전에 재검토한다. 고정하여 외부 호출을 시작한 payload는 retry 도중 바꾸지 않는다.

같은 묶음에 들어갈 사항은 source refs로 연결한다. 추천 카드·회사의 원문 요청·면접 응답 링크는 domain renderer를 재사용하고, Career LLM이 쓴 주변 설명과 함께 전달한다. 기존 링크의 만료·권한 확인을 잃은 채 이메일 본문을 문자열로 이어 붙이지 않는다.

### 보냈다는 사실의 전파

provider 접수 receipt를 먼저 보존한다. 그 뒤 `talent_opportunity_delivery`, `contact_queue`, `company_talent_followups` 등 원본에 맞는 finalize callback을 멱등 실행한다. callback 실패는 기록 복구 대상이지 새 이메일 생성 이유가 아니다.

한 번의 묶음으로 여러 domain 항목을 전달했어도 후보자의 외부 연락 횟수는 1회다. 각 domain 항목에는 같은 delivery effect를 참조하는 실제 전달 사실을 남긴다. UI에만 먼저 표시됐다고 외부 전달 완료로 기록하지 않는다. 기존 정상 후보자→회사 연락의 “전달했습니다” UX는 유지하며 상대의 열람·답변까지 주장하지 않는다.

연락 한도와 추천 lifecycle의 무반응 횟수는 다른 계산이다. 면접 준비·자료 전달 메일 때문에 active 사용자가 passive/stopped로 바뀌면 안 된다. 기존 run의 `affectsExternalCadence`와 실제 추천 source refs를 유지하고, 공통 연락 횟수를 기존 무반응 추천 횟수에 그대로 대입하지 않는다. 묶음에 포함된 원본을 기준으로 해당 domain의 완료·cadence만 반영하며 메일 문장의 키워드로 재분류하지 않는다.

### 이관 시 기존 24시간 이력

새 한도를 켜기 전에 최근 발송을 기존 outbox와 `career_email_messages`에서 읽어 실제 provider ID 또는 동일 원본 delivery ID로 중복을 제거해 연결한다. 두 테이블에 같은 메일이 있다고 두 번 세지 않는다. 정확한 연결이 안 되는 기록은 근거와 함께 이관 검토 대상으로 남기며 모든 과거 발송을 재실행하지 않는다.

## 11 Python Worker와 무거운 검색의 재사용 경계

최상위 Career 실행기가 `request_opportunity_search`에 해당하는 기존 능력을 호출하면 기존 검색 run을 등록한다. 호출 시 “사용자에게 보낼 메일”을 함께 작성시키지 않고 결과 artifact를 요구한다.

새 mode의 계약은 다음과 같다.

```text
입력: 사용자, 자연어 탐색 목적, 기존 권한, context version, operation key
진행: 기존 retrieval → scoring → rerank 및 cache
출력: 선택된 실제 role ID, 근거와 tradeoff, coverage, 원본 run ID
종료: career_agent_events에 run 완료를 한 번 기록
```

출력 mode는 새로운 커리어 상황이 아니라 결과를 누가 공개할지에 대한 executor 계약이다. `artifact_only`와 기존 `legacy_delivery`를 이관 동안 구분한다. 사용자 소유권과 결과 공개 권한은 서버가 결정한다.

주의할 점은 현재 추천 Worker가 이메일 직전에 추천 행과 chat을 저장할 수 있다는 것이다. **`send_email`만 끄는 것으로 조용한 검색이 되지 않는다.** 새 mode에서는 후보자에게 보이는 recommendation·chat 생성까지 분리해야 한다. private run의 기존 결과 필드에 후보 artifact를 보관하고, 공개하기로 결정한 실행에서 기존 domain commit 함수를 호출한다.

이미 사용자에게 공개된 추천은 유지한다. `artifact_only` 도입을 이유로 기존 추천을 숨기거나 stage를 되돌리지 않는다. 기존 수동 추천과 회사의 명시적 Intro 요청도 실행 의무·권한·test-only 격리를 유지하며 일반적인 선택 사항으로 조용히 바꾸지 않는다.

기존 `load_current_state` 전체를 가벼운 Career context loader로 재사용하지 않는다. Profile·Brief·Behavior 구성, fit와 selection은 검색 도구 내부로 옮긴다. 일일 점검은 기존에 저장된 후보 결과와 dirty/version만 읽는다. 새로운 평가가 필요하면 그때 전문 run을 시작한다.

기존 beta 일일 외부 추천 run이 같은 context로 만들어둔 결과가 있으면 이를 일반 read tool로 읽는다. 새 검색이 반드시 필요한지 원본 LLM이 판단한다. 서버는 동일 operation key의 중복 run을 막고, 오래된 결과는 생성 시각과 기준 version을 숨기지 않는다.

Python과 beta 사이의 연결은 기존 내부 API 인증 경로와 DB run을 사용한다. 완료 결과의 webhook 한 번에 의존하지 않는다. 완료 run과 미발행 사건을 읽는 dispatcher가 복구한다. 회사에 새 자연어 소식을 전달해야 하는 실제 domain 결과는 기존 `enqueueCompanyUpdate` 경로를 유지한다.

## 12 실행권과 실패 복구

### 같은 사용자의 실행권

DB claim RPC는 짧은 transaction 안에서 다음을 수행한다.

1. 실행 후보 사용자 row를 `FOR UPDATE SKIP LOCKED`로 선택한다.
2. 유효한 lease가 있으면 새 background 실행을 만들지 않는다.
3. 만료한 lease의 실행이 있으면 그 run의 checkpoint를 복구 대상으로 잡는다.
4. 그렇지 않으면 due event의 정확한 ID 목록으로 run을 생성한다.
5. 새 lease token과 만료 시각을 기록하고 commit한다.

LLM이나 Gmail을 기다리는 동안 DB transaction을 열어두지 않는다. 초기 lease는 120초, 실행 중 30초마다 갱신하는 값으로 시작하고, 모든 write와 외부 행동 직전에 token을 다시 검증한다. lease를 잃은 구 프로세스는 새 행동을 시작할 수 없다.

모든 사용자 입력을 긴 background 뒤에 줄 세우지 않는다. 인증된 입력을 저장할 때 revision을 올려 background의 남은 side effect를 막는다. UI는 입력을 접수하고 기존 웹 응답 경로가 새 revision으로 실행한다. 이미 시작된 외부 요청은 따로 결과를 회수한다. 이 전환에서 두 실행이 자유롭게 동시에 write하지 않도록 claim RPC에 interactive takeover 계약을 둔다.

takeover는 사용자 row lock 아래에서 구 lease를 폐기하고 구 run을 중단 상태로 남긴다. 이미 완료한 도구 receipt는 보존하고, 아직 처리하지 않은 event만 다시 실행 가능하게 한다. 새로운 사용자 요청을 먼저 처리한 뒤 background가 최신 context로 남은 event를 이어받는다. 폐기한 lease로 나중에 도착한 LLM 응답은 write를 수행하지 않는다.

외부 요청의 결과 기록은 별도다. 이미 `started_at`이 있는 effect와 정확히 일치하는 operation key·payload hash의 provider receipt는 구 실행이 반환하더라도 보존할 수 있어야 한다. 이것은 새 행동 권한이 아니라 이미 시작한 행동의 결과 회수다. receipt를 버리면 새 실행이 같은 문의를 다시 보낼 수 있다.

### DB transaction으로 묶을 정확한 단위

| 서버 함수 또는 RPC | 같은 transaction 안에서 확정할 것 |
| --- | --- |
| `change_career_work` | 권한·expected revision 확인, 위임 변경, 예약 추가·취소 |
| `ingest_career_source_page` | source key upsert, page checkpoint와 연결 generation 확인 |
| `claim_career_turn` | 사용자 lease, run 생성·복구, 정확한 event ID claim |
| `record_career_tool_command` | assistant tool call checkpoint와 필요한 effect 등록 |
| `begin_career_effect` | lease·사용자 입력 revision·위임·원본 version·대상 권한 확인, payload 봉인, 발송 슬롯 예약과 시작 |
| `record_career_effect_receipt` | 정확한 effect의 provider/result receipt 저장. 구 lease의 새 행동은 허용하지 않음 |
| `finish_career_turn` | 처리한 ID 완료, 남은 continuation 등록, 현재 lease 조건부 반납 |

Gmail 재조회와 provider 발송은 이 transaction 밖에서 수행한다. 원격 메일이 마지막 조회 직후 도착하는 경쟁은 DB lock으로 없앨 수 없다. 마지막 정상 조회 시각을 기록하고 중복 문의가 확인되면 그 사실을 회복 가능한 다음 맥락으로 남긴다. “발송과 Gmail 수신이 하나의 원자적 작업”이라는 보장은 하지 않는다.

### crash 위치별 복구

| 끊긴 위치 | 복구 동작 |
| --- | --- |
| DB 사건 저장 후 Queue 발행 전 | dispatcher가 같은 사건을 다시 발행 |
| LLM 응답 후 tool 명령 저장 전 | LLM 재호출 가능. 아직 side effect 없음 |
| tool 명령 저장 후 실제 실행 전 | 저장한 명령과 operation key로 실행 |
| 외부 발송 접수 후 DB 결과 기록 전 | 같은 payload·키로 provider 결과를 확인. 새로운 본문이나 새 키를 만들지 않음 |
| receipt 저장 후 domain finalize 전 | finalize만 재시도 |
| 일부 event 완료 후 새 event 도착 | 완료한 ID만 처리 완료. 새 event는 다음 실행 |
| 긴 검색 시작 후 실행기 종료 | 기존 run이 완료 사건을 반환. parent 함수가 기다릴 필요 없음 |
| 시간 예산 종료 | checkpoint와 continuation event를 저장하고 정상 양보 |

`processed_through_id=1234`처럼 숫자 cursor 하나로 모든 사건을 완료시키지 않는다. transaction commit 순서와 ID 생성 순서가 다를 수 있고, 같은 시각에 들어온 다른 사건을 건너뛸 수 있다. 실제 claim한 ID와 처리한 ID만 갱신한다.

도구 명령의 operation key는 runtime이 저장한 `run_id + tool_call_id`에서 만든다. 모델이 retry마다 새 UUID를 내게 하지 않는다. 동일 사건의 crash 복구는 같은 run을 이어간다. 서로 다른 원본이 의미상 같은 연락을 유도하는 문제는 원본 연결·기존 receipt를 context에 제공하여 판단하며, 텍스트 유사도만으로 업무를 삭제하지 않는다.

### 실제 발송의 불명확한 성공

[Resend의 멱등 키 보존 기간은 24시간](https://resend.com/docs/dashboard/emails/idempotency-keys)이다. 따라서 DB unique key만으로 외부 발송을 무기한 정확히 한 번 보장한다고 말할 수 없다.

외부 요청을 시작할 때 `first_attempt_at`과 고정 payload를 보존한다. 같은 키를 쓸 수 있는 시간 안에 재시도하고, provider ID를 확보했으면 그 ID로 조회한다. receipt가 없고 보존 기간도 지난 불명확한 건은 자동 새 발송으로 전환하지 않는다. `delivery_unknown` 상태로 운영 복구에 남기고 실제 발송 증거를 찾는다.

취소와 발송 시작은 같은 위임 revision을 기준으로 transaction에서 순서를 정한다. 취소가 먼저 확정되면 시작하지 않는다. 외부 호출이 시작된 뒤의 취소는 전달 철회를 보장하지 않는다. 이 잔여 한계를 사용자에게 실제 결과로 설명한다.

### 자기 자신이 만든 변경으로 무한히 깨지 않게 한다

사건에는 원본 변경과 `origin_run_id`를 남긴다. 현재 실행이 방금 저장한 예약·Memory·발송 기록은 그 실행이 이미 알고 있는 결과이며 다시 같은 작업을 깨우지 않는다. 다른 사용자 발화, 외부 답장, 비동기 업무의 실제 완료는 새로운 사건이다.

`updated_at`이 바뀌었다는 이유만으로 모든 테이블 변경을 에이전트 사건으로 만들지 않는다. 의미를 키워드로 분류하는 대신 실제 domain mutation 경로에서 원본 version과 효과를 발행한다. label 읽음 같은 기술 변경과 새로운 본문을 구분하는 것은 provider 계약으로 처리한다.

동기화 실패도 retry마다 새로운 사용자 사건을 만들지 않는다. 같은 연결 generation의 동일 장애 구간에 하나의 사건을 두고 기술 재시도만 갱신한다. 정상 복구 또는 필요한 조치가 달라졌을 때 새 사실로 전달한다. source가 계속 고장난 동안 “연결을 확인해 주세요” 메일이 반복되는 것을 막는다.

## 13 비용 계산과 수용량

### 호출을 줄일 위치

가장 먼저 줄일 비용은 별도 모델의 단가가 아니라 불필요한 시작과 반복 입력이다.

| 비용 | 줄이는 방법 | 줄이면 안 되는 것 |
| --- | --- | --- |
| 아무 일 없는 사용자의 호출 | 일일 기술 점검에서 due와 실제 변경만 확인 | 맡긴 재검토 시각 |
| 메일 수만큼 생기는 호출 | 계정·사용자별 변경 묶음, page 단위 preview | 넓은 발견을 맡긴 범위의 미처리 page |
| 긴 공통 입력 | 안정적인 prefix, 작은 원본 인덱스, 정확한 추가 읽기 | 현재 Brief와 행동에 필요한 권한·원문 |
| 사전 매칭 모델 | 검색 도구를 요청한 경우에만 기존 fit·Behavior·rerank 실행 | 실제 검색 run의 같은 version 계약 |
| 최종 writer 재호출 | 즉시 보낼 때 같은 Career 루프의 본문 사용 | 오래 기다린 draft의 최신성 재검토 |
| 재시도 비용 | tool checkpoint·receipt 복구 | 불명확한 발송의 결과 확인 |

### 비교 가능한 입력량 예시

운영 실측이 아닌 계산 예시다. 사용자 10,000명, 첫 호출 입력 8,000 tokens, 추가 읽기 후 호출 입력 10,000 tokens, 35%의 실행에서 추가 호출 1회를 가정한다. 8,000에는 system·tool·사용자 context를 모두 포함한다.

| 방식 | 하루 첫 호출 | 추가 호출 | 하루 입력량 |
| --- | --- | --- | --- |
| 전원 하루 한 번 LLM 검토 | 10,000 | 3,500 | 약 1억 1,500만 tokens |
| 20%가 변경·due로 실행되고 추가 사건 묶음 600회 | 2,600 | 910 | 약 2,990만 tokens |

후자의 계산은 `2,600 × 8,000 + 910 × 10,000`이다. 여기에 출력·추론, 검색·매칭의 별도 호출, 첨부, 도구 API, Queue와 저장 비용을 더해야 한다. 기존 3일 Worker와의 총비용 비교에는 현재 사전 모델·검색·writer 비용까지 포함해야 하며 위 표로 기존 대비 절감률을 주장하지 않는다.

Gmail도 별도로 계산한다. 추적 사용자 1,000명, 사용자당 thread 2개를 매시간 직접 읽으면 하루 48,000회다. 15분마다면 192,000회다. 모델을 부르지 않아도 이 비용은 남는다. 그래서 provider trigger와 계정 단위 변경 수집을 우선하고, exact thread 재확인은 실제 행동 직전에 집중한다. provider별 실제 과금은 연동 확인 단계에서 대입한다.

### 모델 선택

첫 구현에서는 웹·이메일에서 쓰는 Career 모델 계약을 재사용하고 usage label만 `career/background`로 분리한다. 현재 Worker orchestration과 writer는 서로 다른 모델을 쓰므로, 통합이 자동으로 더 싸다고 가정하지 않는다. 같은 runtime이라도 background 모델 설정은 명시적으로 관측할 수 있게 둔다.

저가 모델을 추가하더라도 일반 대화 뒤에 숨은 의도 분류기나 Memory extractor를 붙이지 않는다. 먼저 context와 실행량을 측정한다. 모델 비교는 별도 평가 작업으로 수행하며 재사용 평가를 만들 경우 기존 evaluation registry 계약을 따른다.

### 큐 용량과 지연

새 background consumer는 기존 Opportunity 6개 슬롯을 쓰지 않고 beta의 별도 Queue와 동시 실행 한도로 시작한다. 초기 전역 동시 실행은 4, 사용자별은 1로 둔다. 이는 시작 설정이며 운영 수용량 보장이 아니다. 평균 실행 20초라면 이론상 하루 약 17,280회, 60초면 약 5,760회이므로 실제 도구 대기와 peak를 측정해야 한다.

부하 우선순위는 근거 있는 `not_after`, 사용자 직접 요청, 오래 기다린 순서로 조정한다. 장기 신규 탐색이 시간 약속을 밀어내지 않도록 별도 전문 run으로 분리한다. 예산 초과 시 신규 넓은 발견을 조절하고 열린 약속을 조용히 폐기하지 않는다. 처리 가능한 지연을 넘으면 신규 위임을 받아놓고 무기한 방치하는 대신 범위를 명확히 조정한다.

## 14 A사 요청의 실제 데이터와 호출 순서

가정: 사용자의 Gmail이 연결돼 있고 담당자 P9와 thread T17을 확인했다. 외부 문의는 Harper 명의의 위임 주소로 전달할 수 있다. 금요일 10:00은 사용자 시간대로 합의한 실행 시각이다.

| 순서 | LLM과 도구 | DB 또는 외부 결과 |
| --- | --- | --- |
| 월요일 사용자 요청 U301 | 기존 Career 대화가 thread와 권한을 확인하고 `manage_career_work` 호출 | W12와 금요일 예약 E81을 같은 transaction으로 생성. 실제 사용자 요청을 authority로 연결 |
| 수집 설정 | 서버 adapter가 thread 구독·poll 범위를 갱신 | mailbox sync에 기술 확인 시각 등록. 업무용 LLM 추가 호출 없음 |
| 수요일 일정 메일 M42 수집 | 기술 수집만 실행 | `gmail:...:M42:added` 사건 1개. 메일 본문 전체를 Memory에 자동 저장하지 않음 |
| Career 실행 R10 | 작은 context에서 T17 원문 읽기 | 실제 일정 확정과 준비에 필요한 자료 확인 |
| 같은 실행 R10 | `manage_career_work`로 금요일 무응답 예약 취소, 실제 준비 시각 추가. 필요한 문서 능력 호출 | W12 revision 증가, E81 취소, 준비 문서 또는 별도 run 연결 |
| 전달 | 약속과 알림 한도를 확인해 `deliver_career_update` | 즉시 보낼 수 있으면 한 번 작성·전달. 묶음이면 사실 참조만 예약 |
| 사용자가 직접 Gmail 답장 M43 | 다음 수집에서 발신 사건 등록 | 이전 draft에 “답장해 주세요”가 남아 있으면 실제 발송 전에 재작성 |
| 금요일에 답이 없었던 다른 경우 | E81이 due. T17 최신 원문을 재조회한 뒤 외부 이메일 도구 호출 | 고정 operation key의 문의 effect 생성, provider receipt 보존, 다음 확인 예약 |
| 문의 뒤 담당자가 회신 | 위임 reply alias가 외부 자료를 W12에 연결 | 같은 Career 실행기로 재진입. 외부 발신자를 사용자로 인증하지 않음 |
| 면접 결과가 명시적으로 종료 | 원본을 확인하고 W12의 남은 준비·문의 예약 정리, 전달 책임 등록 | 결과의 감정 방향과 무관하게 허용된 시점에 전달. 무응답과 구별 |

아무 변화 없는 화·목요일은 기술 동기화와 예약 조회만으로 끝날 수 있다. 금요일 조건 확인은 당일 LLM을 실행한다. 일정 메일이 오면 일일 점검 시각까지 기다리지 않는다. 이것이 “매일 모든 일을 추론”과 “3일 동안 아무것도 못 함” 사이에서 선택한 구체적인 실행 방식이다.

## 15 구현 단위와 순서

앞 단계의 완료 조건을 충족해야 다음 단계의 자동 발송 범위를 연다. 각 단계는 별도 검토 가능한 변경으로 나눈다. 구현·검증 후 운영 전환은 별도의 명시적 배포 요청을 받아 수행한다.

| 단계 | 수정할 영역 | 산출물과 완료 조건 |
| --- | --- | --- |
| 0 현재 실행과 비용의 기준점 | existing usage, scheduler, delivery readers | 실제 사전 LLM 수·context tokens·producer 목록·24시간 중복 이력 연결을 코드와 제한된 로그로 확인. 계정 전체 데이터를 수집하지 않음 |
| 1 공통 발송 조정 경계 | 새 state/effects + 기존 Python·TS 발송 adapter | 같은 후보자에게 두 producer가 동시에 보내도 한도를 초과하지 않음. 기존 domain finalize가 같은 receipt로 한 번만 반영됨. 아직 검토 주기는 바꾸지 않음 |
| 2 위임과 정확한 예약 | work/events + `manage_career_work` | 사용자 요청으로 위임 생성·변경·취소, 여러 예약, due wake가 동작. 공개 범위가 회사 follow-up과 섞이지 않음 |
| 3 공통 Career 실행 core | chatTurn 추출, background runner, runs checkpoint | 가짜 user message 없이 실행. 조용한 도구 작업 후 종료 가능. 웹·이메일의 현재 응답 계약 유지 |
| 4 내부 사건으로 완결 | company request·meeting·결과·검색 완료 adapter | 원본 변경에서 다음 실행까지 연결. 부정적 결과 prompt 수정과 미전달 책임을 함께 연결 |
| 5 알려진 Gmail 대화와 외부 문의 | mailbox sync, exact read, alias·외부 발송 | 수신·발신·첨부·연결 해제·최종 재확인·회신 routing을 확인. 이 시점에 외부 A사 요청을 실제로 완결할 수 있음 |
| 6 하루 검토와 기존 Worker 분리 | daily scan, worker artifact mode, ownership cutover | 전환 사용자에게 legacy 연락 run이 새로 생기지 않음. 기존 진행 중 run 보존. 무거운 검색과 외부 추천 cadence가 독립적임 |
| 7 넓은 Gmail 발견과 범위 확대 | 계정 단위 변경·paging, 기존 일반 조사 능력 | 새 ATS thread 발견, page 누락 복구, 사용자당 비용 확인. 파트타임·자문 등도 같은 위임 계약으로 처리 |

단계 1에서 새 조정기의 일반 발송 제한을 적용하기 전에 producer가 통제 경로에 모두 들어오는지 확인한다. 일부만 연결한 상태에서 “하루 최대 두 번”을 사용자에게 약속하지 않는다. 기존 명시적 요청의 결과를 단순 차단하여 발송량만 줄인 것을 성공으로 보지 않는다.

### 파일별 변경 계획

| 위치 | 구체적인 변경 |
| --- | --- |
| `src/lib/career/chatTurn.ts` | 웹 입력·대화 저장과 공통 context/모델 실행 분리. 기존 외부 API 응답 모양 유지 |
| 새 `src/lib/career/agent/context.server.ts` | 작은 기본 context, source별 coverage, 일반 조회 확장 |
| 새 `src/lib/career/agent/turn.server.ts` | 공통 `runCareerAgentTurn`, silent 종료, checkpoint 도구 실행 |
| 새 `src/lib/career/agent/work.server.ts` | 위임·권한·예약 transaction과 공통 read/write 구현 |
| 새 `src/lib/career/agent/events.server.ts` | 원본 사건·미래 예약 등록, 정확한 ID ack |
| 새 `src/lib/career/agent/queue.server.ts`와 `consumer.server.ts` | 기존 email queue 패턴을 사용하는 발행·claim·lease·복구 |
| 새 `src/lib/career/agent/delivery.server.ts` | 후보자별 예약·한도·effect·기존 outbox adapter·finalize |
| `src/lib/career/capabilities/registry.ts`, `llmTools.ts`, `talentOnboarding/tools.ts` | 새 지속 효과 능력과 background 실행 context 추가. 기존 일반 도구 재사용 |
| `src/lib/career/llm.ts` | provider/tool loop 재사용, background의 빈 응답 복구 분리, continuation 계약 |
| `src/lib/career/prompts/rawPrompts.ts`, `conversationPlan.ts` | 중요한 결과의 사실 기반 전달, 실행 출처·미확인 범위·업무 인덱스 제공 |
| `src/lib/integrations/gmail.ts`, `composio.ts`와 새 `gmailSync.ts` | exact read, provider paging, 계정별 수집 lease와 generation |
| 기존 이메일 inbound·alias routing | 위임 주소 수신을 일반 사용자 reply 처리와 구분. 외부 발신은 자료 사건으로 연결 |
| 새 `/api/internal/career-agent/dispatch`, `/api/queues/process-career-agent` | 인증된 dispatcher와 Queue consumer. `vercel.json` 등록 |
| `opp/worker.py` | 새 runtime 소유자 제외, legacy 진행 중 작업 보존, daily scan과 분리 |
| `opp/new_harper_agent_v2.py`, `agentic/current_state.py` | artifact 전용 경로에서 연락 orchestration과 사전 연락 selection 분리 |
| `opp/utils/new_delivery_transport.py` | 공통 effect와 전달 gateway 연결. 기존 receipt·domain 기록 유지 |
| `opp/utils/scheduled_company_followups.py` | due를 3일 scheduler gate 없이 사건으로 연결. 기존 revision/source 검증 재사용 |
| DB migration과 `database.types.ts` | 실제 적용할 새 구조·RPC·권한·인덱스. 이 문서의 예시를 migration 실행으로 취급하지 않음 |

구현 중 함수 분리만으로 당장 모든 기존 웹·음성·이메일 경로를 새 방식으로 전환하지 않는다. 공통 core의 작은 추출부터 기존 adapter가 같은 함수를 쓰도록 옮기고, 각 adapter의 저장·응답 계약을 확인한다. 온보딩은 기존 경로를 유지한다.

## 16 배포 전환과 되돌리기

1. 새 구조와 writer를 먼저 추가하되 자동 사건 소비는 끈다. 기존 동작과 공개 상태는 그대로다.
2. 공통 발송 effect를 기존 producer에 연결한다. 실제 발송 담당자는 하나로 지정하고 provider ID와 domain 기록을 대조한다.
3. 새 실행기를 지정한 테스트 계정에서 실행한다. 원본 호출과 발송은 capture 경계로 제한한다.
4. 사용자 전환 시 기존 active Opportunity run과 메일 전달을 확인한다. 진행 중 작업은 끝내고 source receipt를 연결한다.
5. 같은 DB transaction으로 실행 소유자를 바꾸고 필요한 미래 예약을 등록한다. 전환 이전 사건을 전체 재생하지 않는다.
6. 전환한 사용자부터 일일 점검을 켠다. 사건 backlog·마감 지연·중복 발송·비용을 보고 범위를 넓힌다.

새 runtime을 중단할 때는 새로운 discretionary 실행을 멈추되 이미 접수한 provider 결과와 domain finalize는 회수한다. 위임·미전달 책임·예약을 삭제하지 않는다. legacy가 이해하지 못하는 위임이 있으므로 단순히 `runtime_owner=legacy`로 돌리는 것만으로 복구가 끝나지 않는다. 맡은 예약을 처리할 호환 consumer를 유지하거나 해당 업무의 한계를 사용자에게 알려야 한다.

Opportunity의 기존 one-job pool과 실행 중 release 보존 계약은 그대로 따른다. 새 설계를 적용한다는 이유로 여섯 슬롯을 동시에 재시작하거나 기존 run을 실패 처리하지 않는다.

## 17 기술 경계에서 보장할 것과 남는 한계

**권한 없는 대상 발송, 동일 명령의 중복 실행, 취소된 예약의 새 실행, 조회 실패를 빈 결과로 반환하는 문제는 코드와 저장 계약으로 막는다.** 반면 메일 의미를 항상 정확히 이해하는 것, 모든 관련 새 thread를 발견하는 것, 외부 제공자의 불명확한 응답에서 발송 여부를 무조건 알아내는 것은 이 구조만으로 보장할 수 없다.

부작용이 없다고 선언하는 대신, 부작용이 생길 경계를 작게 만들고 실행 전 재확인·receipt·회복 가능한 예약으로 통제한다. 잘못 판단한 경우에도 어떤 원본·권한·시점으로 행동했는지 찾을 수 있어야 한다. 이 기록은 모델의 숨은 추론이 아니라 실제 입력 참조와 실행 사실이다.

검증은 변경 경로별 짧은 실행 확인과 아래의 경계 사례로 나눈다. 전체 저장소 테스트와 광범위한 모델 benchmark를 기본 절차로 추가하지 않는다. 의미 판단 품질을 평가하는 재사용 LLM 평가를 실제로 만들 때는 [evaluation registry](evaluation/README.md)에 먼저 등록한다.

기술 근거: [Vercel Queues의 중복 전달과 복구 계약](https://vercel.com/docs/queues), [Resend 멱등 키](https://resend.com/docs/dashboard/emails/idempotency-keys), [Composio trigger](https://docs.composio.dev/docs/triggers), [Gmail 변경 수집](https://developers.google.com/workspace/gmail/api/guides/push), [Gmail 동기화](https://developers.google.com/workspace/gmail/api/guides/sync), [PostgreSQL row lock](https://www.postgresql.org/docs/current/explicit-locking.html).

## 18 구현 완료 점검표

| 확인할 상황 | 통과를 확인할 구체적인 근거 |
| --- | --- |
| 하루 점검이 아무 일 없는 사람에게 LLM을 호출하지 않는다 | due·변경이 없는 계정에서 dispatcher/scan 기록은 있고 LLM usage는 0건 |
| 하루 점검이 기존 3일·6일 추천 계약을 바꾸지 않는다 | 같은 설정과 발송 이력에서 추천 due 계산은 유지되고 검사 시각만 달라짐 |
| background가 연락 없이도 실제 일을 한다 | 문서 생성·예약 수정 receipt는 있지만 candidate delivery effect는 없음 |
| 새 사건마다 전체 matching을 실행하지 않는다 | 면접 답장 사건에서 Behavior builder·fit·rerank 호출이 없음 |
| 세 producer가 동시에 메일을 만들지 않는다 | 실제 후보자 슬롯 예약이 원자적이며 일반·추가 연락 총량을 넘지 않음 |
| 여러 알림을 묶고 재진입한다 | 기존 deliveryRef를 완성하고 대표 effect에 한 번만 발송. 각 원본의 완료 callback은 모두 반영 |
| 새 업무 메일이 추천 상태를 바꾸지 않는다 | 자료·면접 연락은 추천 무반응 횟수에 포함되지 않고 기존 cadence source 계약을 유지 |
| 사용자 약속이 알림 한도 때문에 사라지지 않는다 | authority에 연결된 예약은 유지되고 해당 시각에 실행·전달 또는 확인 가능한 실패가 남음 |
| 자기 생성 변경이 무한 실행을 만들지 않는다 | 동일 run의 write 결과가 새 추론을 반복 유발하지 않음 |
| 같은 webhook이 두 번 와도 한 번 처리한다 | 동일 source key 한 행, 동일 operation key 한 effect |
| 실행 중 들어온 사건을 잃지 않는다 | claim한 event ID만 완료되고 나중 사건은 다음 실행에서 처리됨 |
| 회사 문의 직전 사용자가 취소한다 | 새 입력 revision으로 구 실행이 막히고 취소가 먼저 확정된 effect는 시작되지 않음 |
| 외부 요청이 이미 시작된 뒤 취소한다 | 전달 철회 성공을 주장하지 않고 실제 결과 회수. 추가 문의는 생성하지 않음 |
| provider 성공 후 DB 기록에 실패한다 | 같은 payload·키로 복구하고 domain finalize만 재수행. 새 메일 생성 없음 |
| provider 결과가 불명확한 채 24시간이 지난다 | 새 키로 자동 재발송하지 않고 복구 대상으로 남음 |
| 대화는 읽었지만 관련 첨부를 못 읽었다 | reader가 coverage를 표시하고 그 첨부가 필요한 조건부 실행은 보류 |
| Gmail 연결이 실행 중 교체된다 | generation 불일치의 구 작업이 읽기·쓰기·발송 근거로 사용되지 않음 |
| 사용자가 Gmail에서 직접 답장했다 | 발신을 확인하고 묶음 발송 직전 불필요한 답장 요청을 제거 |
| ATS 자동 메일과 부재중 회신이 온다 | 자동 회신은 막을 수 있어도 관찰 사건은 남아 Career LLM이 판단 |
| Gmail 또는 DB reader가 실패한다 | 빈 목록이 아니라 unavailable 사실이 context에 들어가며 무응답 조건을 임의로 확정하지 않음 |
| 웹을 열지 않고 A사 업무를 맡긴다 | 예약→최신 원문 확인→허용 문의→회신 연결→준비/결과 전달이 같은 work를 이어감 |
| 중요한 부정적 결과가 온다 | 실제 종료 사실과 전달 책임이 연결되고 일반 prompt가 이를 숨기지 않음 |
| 회사가 개인 오퍼 정보를 요구한다 | 후보자 위임·Memory가 company context로 노출되지 않고 허용된 projection만 전달 |
| `stopped`와 프로필 비공개를 바꾼다 | 추천·공유·사적 위임·전체 연락의 각 범위를 지키며 기존 소개 이력을 삭제하지 않음 |
| 조용한 검색을 수행한다 | private artifact만 생성되고 recommendation/chat/email은 공개 commit 전 생기지 않음 |
| 기존 일일 외부 추천과 동시에 실행된다 | 기존 run·결과를 읽고 동일 operation의 중복 search를 만들지 않음 |
| 구 Worker에서 새 실행기로 전환한다 | 진행 중 run은 보존되고 전환 후 일반 연락의 실행 소유자가 하나임 |
| 새 runtime을 중단한다 | 열린 위임·예약·불명확한 발송 결과가 남고 recovery 경로가 작동함 |
