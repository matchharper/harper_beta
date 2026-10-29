# Career 추천 화면 preview — 조사와 갱신 정책

작성: 2026-10-28, 운영 집계 관측 약 19:48 KST.

`/dev/career-opportunities`에서 실행한다. production에서는 `notFound()`다.
기존 Career 화면을 그대로 구성하는 `CareerWorkspacePreview`에 가상 공고와 오른쪽 목록 내용을 주입한다.
이를 위해 `CareerWorkspacePreview.tsx`와 `CareerWorkspaceScreen.tsx`에 선택적인 preview 슬롯을 추가했다. 실제 서비스 호출부는 이 슬롯을 전달하지 않으므로 기존 화면 경로를 유지한다. 추천 엔진·DB·Worker는 변경하지 않았다.
추천·저장·지원·연결의 시연은 가상 공고와 브라우저 메모리 상태를 사용한다. 실제 데이터를 사용하는 `CareerWorkspacePage`나 `CareerFlowProvider`를 preview에 연결하지 않는다.
preview의 국가 분기, 상태 선택, 정렬 배열은 합성 시연용이다. 이를 production의 의미 판단 규칙으로 옮기지 않는다.

## 제안의 목적

추천 화면은 **제한된 범위에서 검토를 완료한 현재 추천 목록**을 보여준다.
최근 추천 날짜순 미응답 누적 목록은 추천 기록으로 접근한다. 전 세계 모든 공고나 기존 90개를 항상 새로 평가한 최적 순위라고 표현하지 않는다.

UI의 첫 화면 분량, 후보 retrieval 한도, 새 pair scoring 수, rerank 대상 수, 실제 발행 수는 서로 다른 수치다.
이 preview는 첫 화면 3개와 이미 검토된 다른 기회로 분량을 나눈다. 3개는 시각적 실험값이며 추천·DB·LLM schema의 상한이 아니다.

첫 화면에서 평가 범위 500개, scoring 예산 같은 내부 정보를 설명하지 않는다. 사용자에게 필요한 것은 현재 기준, 추천 이유·확인할 점, 업데이트 중/실패 여부, 이전 기록이다.

## UI 범위: 기존 Career 안에서 현재 방식과 제안 비교

별도의 추천 서비스처럼 보이는 새 shell을 만들지 않는다. 기존 Career의 왼쪽 메뉴, 왼쪽 채팅, 너비를 조절하는 분할 화면, 오른쪽 정보 패널과 제목을 그대로 사용한다. 제안은 `/career/history`의 새 기회 목록 안에서 순서·분량·갱신 상태를 바꾸는 것이다.

| 비교 대상 | 현재 방식 | 제안 방식 |
| --- | --- | --- |
| 전체 화면 | 실제 `CareerWorkspacePreview` → `CareerWorkspaceScreen` | 같은 화면·채팅·내비게이션 유지 |
| 공고 표현 | 기존 `NewOpportunityList`와 `OpportunityCard` | 같은 `OpportunityCard` 재사용, 목록 구성만 변경 |
| 목록 순서 | 추천 날짜 그룹, 최신 추천 우선 | 완료된 검토 결과의 순서; 오래된 추천도 앞에 올 수 있음 |
| 처음 보이는 분량 | 아직 피드백하지 않은 추천을 이어서 표시 | 소수 추천부터 표시하고 같은 검토 결과의 나머지를 펼침 |
| 기준 변경 | 과거 추천이 피드백 전까지 남을 수 있음 | 이전 기준 결과와 새 기준 검토 상태를 구분 |
| 과거 추천 | 현재 분류·저장·제외 경로 | 사용자의 결정과 추천 이력을 보존하며 이전 결과에 접근 |

현재/제안 비교는 **같은 가상 데이터와 같은 Career 화면 안에서** 한다. 현재 모드는 확인한 목록 동작을 재현하는 비교용이며 운영 사용자 세션을 불러오지 않는다. 제안 모드의 재정렬·갱신 완료는 합성 결과다. 현재 운영에 새 선정 정책이 적용됐다는 의미가 아니다.

컴포넌트 연결은 다음과 같다.

- `src/components/career/preview/CareerWorkspacePreview.tsx`: 기존 `CareerChatPanelProvider`와 `CareerSidebarProvider`, mock 사용자, 로컬 history 상태·동작을 재사용한다. `initialOpportunities?: CareerHistoryOpportunity[]`로 fixture를 받고 `historyContent?: ReactNode`를 화면에 전달한다. fixture 배열은 안정된 참조로 전달한다.
- `src/components/career/CareerWorkspaceScreen.tsx`: `historyContent`를 `CareerWorkspaceRoot` → `CareerWorkspaceContent`로 전달한다. 데스크톱에서는 기존 오른쪽 `CareerCanvas` 안에 렌더하며, 슬롯이 없으면 기존 `CareerHistoryPanel`을 렌더한다.
- 모바일에서는 같은 슬롯을 기존 `CareerMobileShell`·`CareerMobileTopBar` 안에 배치하고 `CareerMobileChatLauncher`를 유지한다. 새 모바일 shell이나 별도 채팅을 만들지 않는다.
- `src/components/career/history/OpportunityCard.tsx`: 회사·직무·조건·펼친 상세·행동의 실제 공통 카드를 재사용한다. preview만의 다른 카드 디자인으로 교체하지 않는다.

이 선택적 슬롯은 preview의 합성 데이터를 넣기 위한 구성 지점이다. 운영 추천 API·배치·사용자별 점수 정책을 우회하는 제품 기능이 아니다. 원래 `NewOpportunityList`는 날짜 그룹을 직접 구성하므로 제안의 순위 목록에 입력 배열만 바꿔 넣어서는 순서 변경을 시연할 수 없다. 제안 목록이 실제 `OpportunityCard`를 같은 패널 안에서 구성하도록 한다.

## 조사 범위와 증거 우선순위

- beta 로컬 HEAD `3a3afaaf`, Worker 로컬 HEAD `aad2478`와 기존 미커밋 작업을 읽었다.
- 운영 DB의 비식별 집계와 트리거/함수 존재를 읽기 전용 확인했다.
- 전체 운영 웹/Worker의 배포 revision과 환경변수는 확인하지 않았다. 코드 수치를 모두 운영 설정으로 단정하지 않는다.
- 원본 사용자 대화·이름·이메일·프로필은 읽거나 preview에 복사하지 않았다.
- 모델 평가나 벤치마크를 새로 실행하지 않았다. 운영 run metrics의 관측 집계다.
- 문서와 코드가 다르면 실행 코드를 우선했다. `docs/external-recommendations-v2-ko.md`의 web/daily 200·rerank 20 설명은 현재 V2 공통 엔진의 500·25와 다르다.

## 사용자 적체: 실제 관측

`talent_setting` 8,394명, 온보딩 완료 5,575명. 완료자의 status는 active 1,911 / passive 1,350 / stopped 2,314다. status는 방문 활성 사용자 지표가 아니다.

최근 30일 `talent_messages.role='user'` 메시지가 있고 추천 이력이 있는 **2,342명**을 대상으로 집계했다. 테스트 계정을 별도로 제외하지 않았으며 MAU/DAU가 아니다.

| 지표 | 관측값 |
| --- | ---: |
| new 추천 중앙값 | 21 |
| new 추천 p90 | 44 |
| 최대 | 141 |
| 50개 이상 사용자 | 149 |
| 90개 이상 사용자 | 14 |
| new 추천 합계 | 55,235 |
| 외부 / 내부 | 54,705 / 530 |
| 미열람 | 45,596 |

new의 집계 조건은 effective recommendation view에서 `feedback IS NULL AND saved_stage IS DISTINCT FROM 'hidden'`다.
만료 또는 non-active Role을 참조하는 4,395행도 포함됐다. 재방문 cleanup이 별도로 있어 이 수를 실제 화면 노출 개수로 단정하지 않는다.
90개 적체는 실제로 존재하지만 일반 사용자 모두의 대표 경험은 아니다. 첫 추천 0~3개 사용자, 장기 적체 사용자, passive 사용자 모두 작은 목록으로 진입할 수 있어야 한다.

## 실제 실행 비용의 대리 지표

최근 7일 `external_recommendation_runs` 완료 실행 집계:

| 경로 | 완료 실행 | 평균 후보 | 신규 scoring 중앙값 | 신규 scoring p90 | 평균 cache hit |
| --- | ---: | ---: | ---: | ---: | ---: |
| V2 Worker | 2,550 | 476.8 | 103 | 388.8 | 310.2 |
| V2 web | 142 | 468.2 | 114 | 330 | 314.3 |
| V2 daily | 1,160 | 223.4 | 0 | 0 | 209.7 |

Worker의 scoredCount 유효 실행은 2,547건. 신규 scoring 평균 157.6, 최대 500, early stop 142건.
Daily의 cacheOnly 실행은 1,036 / 1,160건이다.
Worker V2 전체 경과시간(`finished_at-created_at`) 중앙값 108.7초, p90 161.9초, 평균 반환 2.97개.
Control Worker 2,497건의 전체 경과시간 중앙값 207.3초, p90 346.8초. 실데이터에는 두 경로가 혼재한다.

이는 순수 scoring 시간이나 사용자 요청부터 최종 렌더까지의 지연이 아니다. 실제 청구 비용은 확인하지 않았다. 출력 token 0 등 전용 scorer 기록이 있어 일반 텍스트 모델 단가로 임의 환산하지 않는다.

## 현재 코드의 계약

| 항목 | 현재 동작 | 근거 |
| --- | --- | --- |
| new 분류 | 읽음과 무관하게 피드백 없는 추천이 남음 | `src/hooks/career/careerSessionData.ts:15` |
| 목록 순서 | created_at DESC 조회, recommendedAt 날짜 그룹 | `src/lib/talentOpportunity.ts:1254`, `NewOpportunityList.tsx:274` |
| 중립 숨김 | 이미 존재. 외부 무피드백 공고 saved_stage=hidden, dislike 아님 | `src/app/api/talent/opportunities/route.ts:787` |
| 내부 보류 | keep로 저장하고 나중에 결정 가능 | `src/lib/talentOpportunity.ts:3231` |
| dislike 효과 | 피드백 외 활동·대화·후속 반응 경로도 존재 | `src/app/api/talent/opportunities/route.ts:854` |
| 외부 만료 정리 | 재방문 때 중립 숨김, 원래 추천 보존 | `src/lib/talentOpportunity.ts:1322`, `session/reengagement/route.ts:372` |
| V2 web/Worker retrieval | 최대 500개 | `src/lib/externalRecommendationsV2/searchDefaults.ts:2`, `engine.ts:683` |
| daily | 캐시 최대 200개 먼저, 부족하면 500개 검색. 하루 사용자별 1개 작업 | `engine.ts:652`, `daily.ts:53,177` |
| V2 scoring | 10개/batch, 동시 최대 6개 | `scoringBatches.ts:20` |
| 조기 종료 | constraintPass>50이고 mutualFit≥60인 20개 및 ≥50인 50개 확보 시 새 batch 중단 | `scoringBatches.ts:1` |
| rerank | V2 상위 25개, 기본 선정 5개, Worker는 target_external_count 전달 | `engine.ts:503`, `opp/new_harper_agent_v2.py:1759` |
| legacy | 기본 후보 200개, 추가 검색 50개. V2와 점수 체계 다름 | `opp/new_config.py:285`, `daily.ts:108` |
| score 재사용 | 유효한 기존 평가를 입력 hash·나이·모델 변화만으로 무효화하지 않음 | `engine.ts:325`, `opp/utils/external_deepseek_selector.py:1049` |
| refreshFit | 엔진 내부 옵션은 있지만 제품 호출자가 전달하는 경로는 발견되지 않음 | `engine.ts:325`, `web.ts:81`, internal API `route.ts:15` |
| 과거 추천 제외 | 검색 SQL과 hydrate 모두 이미 추천한 ID/회사+직무를 제외 | `roleSql.ts:6`, `engine.ts:315`, `jobPostingRecommendations.ts:2511` |
| 방문 | Career mount가 daily POST; cached-only여도 최종 reranker LLM 사용 가능 | `CareerWorkspacePage.tsx:223`, `useDailyExternalRecommendations.ts:69` |
| 정기 주기 | 사용자 설정 기본 3일(1~7), passive 2배. 고정 매일 아님 | `harper_worker/opp/worker.py:2500,2660` |

V2의 현재 rankScore는 `0.65*mutualFit + 0.15*candidateInterest + 0.1*companyInterest + 0.1*roleFit`이며 constraintPass≤50이면 감점한다 (`contract.ts:59`). 여기서 나온 순위는 최종 사용자 목록 순서와 같다고 볼 수 없다. reranker는 현재 전체 Brief·request와 역할 근거를 다시 읽는다.

다만 예전 score가 낮아서 상위 25개 밖에 있는 역할은 최종 reranker가 보지 못한다. 기준 변경 후 점수 재사용만으로 ‘예전 목록 전체에서 지금 최선’을 보장할 수 없다.

### Brief 갱신의 실제 효과

`20261015112457_preserve_matching_selections_on_source_change.sql`은 source 수정 시 강제 만료·자동 input refresh·기존 작업 cancellation을 제거했다.
운영 DB에서 `invalidate_matching_source_v1`, `refresh_matching_after_brief_change_v1`, `enqueue_matching_input_refresh_v1`이 없음을 확인했다.
현재 `talent_contexts_behavior_context_change`는 behavior 관련 변경 근거를 기록하며 과거 추천 전수 재scoring을 직접 실행하지 않는다.
웹의 `mutate_talent_contexts` 뒤에는 embedding 갱신 예약이 있다 (`talentContexts.ts:900`, `tools.ts:4583`).
`tools.ts:4486`의 “Successful Brief changes automatically refresh matching” 설명은 실행 경로와 맞지 않는다. 이번 요청은 preview이므로 원본 prompt를 수정하지 않았다.

## 제안: 언제 scoring하고 목록이 바뀌는가

아래는 **새 제품 설계**이며 현재 운영 동작이라고 설명하지 않는다.

| 사건 | 계산 정책 | 사용자 화면 |
| --- | --- | --- |
| 접속 | 기존 하루 1회 cached-first 작업 유지. 목록 읽기가 추가 평가를 만들지 않음 | 마지막 완료 목록 즉시 표시 |
| 카드 열기 / 탭 / 더 보기 | 기존 결과 읽기만. pair scoring도 rerank도 추가 없음 | 현재 snapshot의 나머지 추천 표시 |
| 저장 / 숨기기 | 기존 결정 경로 활용. 이 동작 자체로 전체 재scoring하지 않음 | 저장·진행 또는 중립 숨김. 실행 취소 가능 |
| 정기 Worker | 기존 주기와 500개 후보 범위·cache·early stop 유지 | 새 결과 준비. 읽는 중에는 업데이트 알림 뒤 사용자가 적용 |
| 작은 Brief 수정 | 원본 LLM이 맥락에 맞게 저장. hash가 달라졌다는 이유로 자동 전수 평가하지 않음 | 새 기준과 기존 결과의 검토 시점을 구분; 다음 일반 실행에서 현재 Brief로 최종 판단 |
| 방향 변경 + 추천 재검토 요청 | 원본 LLM/명시적 UI 실행으로 bounded refresh 하나. 아래 공동 예산 | 이전 기준 결과를 기록으로 분리하고 새 기준 검토 중 표시 |
| 일회성 탐색 | 기존 대화 요청으로 explore. 기본 Brief를 자동 덮어쓰지 않음 | 요청 범위를 표시한 별도 결과, 기본 추천과 혼동하지 않음 |
| 공고 만료·접근불가·차단 | 기존 자격 검사. scoring 불필요 | 추천에서 제외, 관련 기록과 사용자 결정은 보존 |
| 정상 결과 0개 | 추가 숨은 재시도 없이 완료 | ‘이번 검토에서는 …’로 범위 한정 |
| 일부 실패 | 성공 결과만 사용. 오류를 낮은 적합 점수로 저장하지 않음 | 일부 결과와 재시도 안내 |
| 전체 실패 | 이전 snapshot과 기록 보존. 실패를 0개와 구분 | 오류·재시도, 이전 기록 접근 |

### 명시적 갱신의 후보 예산: 초기 제안

- 기존 500개 신규 검색에 과거 90개 재평가를 덧붙이지 않는다.
- 초기 실험안은 **한 번의 명시적 refresh 후보 총 200개**. 현재 노출 후보 + 새 검색 방향에서 다시 찾은 과거 추천 약 20개를 우선 확인하고 나머지는 신규 후보에 쓴다. 기존 20개가 없으면 그만큼 신규 쪽으로 사용할 수 있다.
- 200/20은 현재 운영 상수가 아니며 비용·회복률 검증 전의 설계 시작값이다. DB constraint, tool schema의 의미 상한으로 넣지 않는다. executor의 실제 예산 설정으로 관리한다.
- 이미 검토한 90개 모두를 scoring하지 않는다. 전체 과거 이력의 가벼운 retrieval에 현재 검색 계획을 적용해 과거 후보를 찾는다. 첫 화면 후보만 재검토하면 아래 묻힌 좋은 공고 문제를 놓치므로 과거 풀도 참여한다.
- 새 scoring·명시적 rescore는 같은 공동 예산을 소비한다. 동일 사용자/요청의 동시 중복 작업을 합치고 실패 재시도도 원래 작업의 진행과 남은 예산을 이어받는다. 재시도마다 새 200개 예산을 만들지 않는다.
- 이 예산은 고유 후보/사용자×공고 pair 수이며 API 호출 횟수나 금액 상한이 아니다. 같은 pair 재시도는 새 후보 슬롯을 쓰지 않지만 token 비용은 발생한다. 이미 시작한 동시 batch의 완료 비용도 측정해야 한다.
- 현재 엔진의 refreshFit은 전체 캐시 bypass이므로 이 설계에는 선택된 과거 ID에만 재평가를 적용하는 일반 실행 계약과 budget 인자가 필요하다.
- 문구 수정/단순 profile hash/읽음/무응답으로 semantic stale 여부를 코드가 판단하지 않는다. 의미 변화는 기존 원본 LLM과 사용자의 의도로 판단한다. 무효화 원장·별도 분류 LLM·시나리오별 상태 머신을 추가하지 않는다.
- 재사용한 score는 prior이지 최신 기준으로 다시 산출한 score라고 표시하지 않는다. input fingerprint는 출처와 동시 실행 판단용이며 일괄 invalidate 조건이 아니다.

### 최종 목록 작성과 재발송의 분리

1. 새 후보 검색의 기존 기추천 exclusion은 유지한다.
2. 별도의 일반 read로 현재 목록과 현재 검색 방향에 관련된 기존 recommendation ID를 가져온다. 기존 ID는 신규 추천/메시지 생성 단계로 보내지 않는다.
3. 예산 내 재평가 결과와 재사용 가능한 근거를 현재 Brief를 읽는 기존 rerank 단계에 제공한다. 오래된 score와 control/V2 raw 숫자를 같은 척도로 섞지 않는다.
4. 기존 rerank 후보 한도 25 안에서 현재 목록과 신규 후보가 경쟁한다. 초기안은 기존 목록/재검토 후보 약 10 + 신규 약 15이며 부족한 쪽의 자리를 채운다. 이것도 운영 최적값이 아니며 근거를 갖춘 bounded candidate 구성안이다.
5. 선정되지 않은 후보를 dislike나 부적합으로 기록하지 않는다. 아직 재검토하지 않은 과거 추천도 기록에서 계속 열 수 있다.
6. 완료 run에 노출 recommendation ID 순서와 기준 참조를 남기는 최소 projection을 검토한다. 기존 run artifact/metadata를 우선하며 transient LLM 판단용 새 테이블은 만들지 않는다. 이 projection은 전달 이력의 대체 원본이 아니다.
7. 일반 실행의 완료 결과는 다음 접속 때 최신 snapshot으로 보인다. 이미 읽는 중인 화면에서는 자동으로 카드를 이동하지 않고 ‘목록 업데이트’를 제공한다. 명시적 기준 재검토 화면은 완료 시 새 기준 결과로 전환한다.
8. 그 사이 사용자가 저장·숨김·지원하거나 공고가 마감되면 발행 직전 현재 사실을 다시 읽는다. 이전 run이 최신 사용자 결정이나 새 Brief에 기반한 run을 덮어쓰지 않게 한다. 이는 동시 수정 경계이며 의미 검열이 아니다.

## 지금 설계가 보장하지 않는 것

- 새 기준으로 전 공고 또는 과거 90개를 검토했다는 보장 없음. 이번 범위에서 좋은 후보를 찾는 방식이다.
- 더 보기에서 추가 scoring을 하지 않으므로, 준비된 추천을 다 봤으면 끝난다. 무한 로딩처럼 가장하지 않는다.
- 저장 안 한 공고가 읽음만으로 사라지지는 않는다. 새 snapshot에서 빠졌어도 추천 기록은 유지한다.
- 회사의 직접 요청과 내부 Harper 연결 제안·진행은 외부 공고 선정과 독립된 기존 동의/결정 흐름으로 보존한다. preview는 직접 요청 1건을 대표 사례로 보여주며 내부 제안 모든 상태를 복제하지 않았다.
- 이직 소극 사용자에게 응답 숙제를 강요하지 않고 기존 cadence를 유지한다. 빈 결과를 채우기 위한 추가 추천은 만들지 않는다.
- 실제 대화와 추천 엔진은 실행하지 않는다. 기존 Career preview의 예시 대화와 준비된 공고로 화면·상태 전환을 시연한다.

## 공식 레퍼런스와 채택 범위

- [Welcome to the Jungle: suggested jobs](https://help.welcometothejungle.com/en/activate-suggested-jobs-on-your-candidate-space): 유한한 추천, 저장/숨기기, 별도 지원 추적. 6개라는 타사 숫자를 Harper의 scoring 한도로 차용하지 않음. 다른 [공식 도움말](https://help.welcometothejungle.com/en/if-im-getting-fewer-results-how-can-i-make-sure-im-not-missing-anything-how-can-i-broaden-my-selection)과 제품 세대/범위가 섞여 있으므로 전수 검토 주장도 가져오지 않음.
- [LinkedIn: recommendations](https://www.linkedin.com/help/linkedin/answer/a512279/jobs-recommended-for-you?lang=en): 프로필과 설정한 preference 기반 추천 구분. Harper는 비동기 비용이 있으므로 즉시 새 결과를 가장하지 않음.
- [Indeed: results and recommendations](https://www.indeed.com/help/job-seekers/articles/about-search-results-and-recommendations?co=US&hl=en): 직접 검색과 추천 구분, 저장·숨김·조건 편집, 조건 간 tradeoff의 설명. Indeed의 thumbs-down=hide를 Harper의 중립 숨김과 동일한 의미로 구현하지 않음.
- [Teal: closing and archiving](https://help.tealhq.com/en/articles/9530103-closing-jobs-withdrawn-not-selected-no-response-archived): 현재 관리 목록과 과거 기록 분리. 무응답을 자동 거절로 추론하지 않음.
- [Google: recommendation pipeline](https://developers.google.com/machine-learning/recommendation/overview/types): retrieval, scoring, reranking의 비용·범위 분리. 전체 시장을 고비용 모델로 매 접속 평가하는 설계를 피함.

레퍼런스에서는 유한한 검토 단위, 저장과 발견의 구분, 기준 변경의 반영, 과거 기록 접근을 참고한다. 시각 구성은 타사 화면이나 새로 만든 shell 대신 실제 Harper Career의 배치와 `OpportunityCard`를 따른다. 날짜가 목록 전체 순서를 결정하지 않게 하는 제안과 카드의 기존 정보·행동 배치는 별개로 다룬다.

## 구현 전 확인해야 할 지표

- UI: 접속 후 첫 유의미한 상세/저장/지원까지 시간, 이전 추천 재발견, 기준 변경 뒤 이전 기준 카드 노출.
- 추천 품질: 현재 기준으로 재검토한 과거 공고 중 다시 선정된 비율, 신규 발견 비율, 부족/0개 비율.
- 비용: 사용자당 신규 score 수·refresh 수·rerank 입력량·일일 cacheOnly 비율·실제 과금. 200이라는 제안이 품질을 얼마나 줄이는지 함께 확인.
- 신뢰: 저장/진행/동의 상태 보존, 중복 알림 0건, 일부 실패와 정상 0개 구분, 과거 근거를 최신 평가처럼 표시하지 않기.

## 로컬 확인

기존 shell로 교체한 구성에서 2026-10-28 확인했다.

- 실제 Career 메뉴·채팅·너비 조절 패널·오른쪽 제목을 유지하며, 현재/제안 전환은 같은 fixture와 공통 카드를 사용한다. 현재 목록은 누적 공고, 제안 첫 화면은 내부 연결 1개와 외부 추천 3개다.
- 데스크톱에서 상세 열기·저장 후 기존 내 기회 이동, 중립 숨김 후 기존 보관함에서 재확인, 메뉴 왕복 시 숨김 유지, 되돌리기, 내부 연결의 수락 없는 보류를 확인했다. 보류는 `keep`, 숨김은 feedback을 추가하지 않는 `savedStage: hidden`으로 mock 상태에 남는다.
- 기준 변경 대기→완료, 이전 추천 검색, 새 추천을 적용하기 전·후 목록, 일부 완료 재요청 중 기존 2개 유지 전환을 확인했다.
- 모바일 390×844에서 기존 상단 메뉴·채팅 launcher와 카드, 보류·숨기기·되돌리기를 확인했다. 가로 넘침이 없고, toolbar 아래 scroll 영역이 viewport 안에 들어온다. 화면 캡처는 `output/playwright/career-opportunities-{desktop,mobile,current}.png`다.
- 예시 API를 로컬에서 차단한 뒤 공통 preview를 마운트한다. 확인한 저장·보류·숨기기·화면 이동 중 실제 `/api/` 네트워크 요청은 0건이었다. 실제 `/career`와 운영 데이터는 이 화면 확인에 사용하지 않았다.
- 새 dev 파일 lint 오류·경고 0개, 새 파일 및 두 연결 파일의 TypeScript 구문·의미 진단 0개. production 접근 차단은 page의 `NODE_ENV` 가드를 코드로 확인했으며 production 빌드·배포는 실행하지 않았다. 전체 저장소 테스트·실제 모델 평가·지원·발송도 실행하지 않았다.
