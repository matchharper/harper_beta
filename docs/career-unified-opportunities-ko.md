# Career 기회 통합 설계와 구현

2026-11-17 사용자 지시로 정한 구조다. 같은 날 migration 2개를 운영 DB와 로컬 E2E DB에 적용했고, 웹·Worker는 2026-11-20에 배포했다. [적용 기록](agent-guidance/rollout-history.md)

## 목적

Career agent가 공고 ID라는 틀에 묶이지 않고 기회를 넓고 다양하게 찾게 한다. 공식 공고, 공개 채용 글, 회사 자체를 같은 방식으로 평가하고 같은 방식으로 추천한다. 회사 자체는 맞는 공고가 있든 없든 추천할 수 있다. 무엇을 찾고 추천할지는 agent가 판단한다.

## 결정

- **추천 기록은 `talent_opportunity_recommendation` 한 곳에만 남긴다.** 한 행은 `role_id` 또는 `company_workspace_id` 중 정확히 하나를 가리킨다. 회사 추천의 `opportunity_type`은 `company`다.
- **회사의 기준은 `company_workspace`다.** 추천·평가·목록·화면은 `company_workspace_id`로 회사를 식별한다. `company_db`는 기존처럼 회사 설명을 보강하는 자료로만 읽는다.
- **원본 저장 위치는 바꾸지 않는다.** 공식 공고와 LinkedIn·X 채용 글은 지금처럼 `company_roles`에 저장한다. 새로 찾은 채용 글도 `save_job_posting`으로 `company_roles`에 등록한 뒤 추천한다. `documents`에는 저장하지 않는다.
- **`career_opportunities`로 새 기회를 만들지 않는다.** 모델 도구의 `upsert`·`merge`를 없앴고, 이미 있는 기회 참조를 읽는 `read`만 남겼다. 운영 데이터는 0건이다. 추천마다 생기는 기존 wrapper(`career_wrap_legacy_opportunity_v1`)는 진행 중인 일·체크리스트가 쓰고 있어 이번에는 그대로 둔다.

## 평가: 공고·채용 글·회사를 한 경로로

`search_opportunities`에 `kinds`를 추가했다.

| kind | 대상 | 찾는 방법 |
| --- | --- | --- |
| `postings` | `company_roles`의 공식 공고 | `roleTitles`+`countries` 검색 또는 `roleIds` |
| `hiring_posts` | `information.hiringPost`가 있는 `company_roles` | 위와 같음 |
| `companies` | 회사 자체(`company_workspace`). 맞는 공고가 있어도 대상이 된다 | `companyWorkspaceIds`·`companyNames`를 직접 주거나, 검색으로 찾은 공고의 고용주 |

agent 도구에서 직무명·국가로 넓게 검색하면 세 종류를 모두 평가한다. 정확한 `roleIds`만 주면 공고와 채용 글만 평가한다. Worker 라우트와 준비 작업처럼 도구를 거치지 않는 호출은 예전처럼 공고와 채용 글만 평가한다.

- 세 종류 모두 같은 Decisions 기준(`fitQuestions.v4.json`)으로 채점한다. 기준 문구는 "공고, 채용 글, 회사 자체" 모두를 하나의 기회로 보도록 일반화했고, 2026-11-18에 `PROMPT_VERSION`을 `external-fit-questions-v11-company-itself`로 올렸다. 그래서 Career 검색의 기존 평가 cache는 한 번 새로 계산된다. Worker는 자체 기준을 써서 영향이 없다.
- 회사 후보는 공고 카드와 같은 회사 정보에, 그 회사에 열려 있는 공개 외부 공고 수와 최근 제목 20개를 더해 채점한다. 익명 internal Role은 넣지 않는다.
- 평가는 `talent_external_evaluations`에 같이 저장한다. 회사 평가는 `company_workspace_id`와 `input_fingerprint`로 cache한다.
- 결과는 한 목록에서 같은 가중치로 정렬된다. 모델은 공고에는 `roleId`, 회사에는 `companyWorkspaceId`를 받아 그대로 `upsert_opportunities`에 넘긴다.
- `evaluate_resources`는 agent가 직접 만든 다른 기준이 필요할 때 쓰는 별도 도구로 남는다. 추천 후보 평가의 기본 경로가 아니다.

## 추천과 목록

- `upsert_opportunities(action=add)`의 각 item은 `roleId`, `companyWorkspaceId`, `recommendationId` 중 하나를 받는다. `set_stage`도 `companyWorkspaceId`를 받는다.
- `write_career_opportunities`는 회사를 받으면 workspace가 있는지와 사용자가 차단한 회사인지를 확인한 뒤 추천을 만든다. 평가 ID를 넘기면 같은 회사의 평가인지 확인한다.
- `read_matching` 목록, 다음 대화의 최근 추천 context, 채팅의 기회 언급에서도 회사 기회가 `companyWorkspaceId`로 보인다.

## 기록 화면 `/career/history`

- 목록은 internal role(“답이 필요해요”)과 external(“직접 지원”) 두 묶음만 남는다. 따로 붙어 있던 `career_opportunities` 칸과 그 개수 합산은 없앴다.
- external은 모두 같은 카드를 쓴다. 출처에 따라 표시와 첫 버튼만 다르다.

| 출처 | 표시 | 첫 버튼 | 모달 |
| --- | --- | --- | --- |
| 공식 공고 | 직접 지원 | 지원하기 | 채용 페이지에서 지원 / Harper와 지원하기 |
| 채용 글 | 채용 글 | 연락해 볼래요 | 글 열기 / Harper와 연락 준비하기 / 직접 연락했어요 |
| 회사 | 회사 | 합류 방법 찾기 | 없음. 누르면 바로 Harper에게 요청한다 |

회사 카드의 버튼은 2026-11-23에 바꿨다(로컬). 예전 이름 "다가가 볼래요"만 봐서는 누르면 무슨 일이 생기는지 알 수 없었다. 모달을 거쳐 나가던 메시지도 "연락할 사람과 경로를 찾고 보낼 메시지를 준비해줘"로 방법을 정해 두었다. 운영 회사 추천 최근 25건 가운데 약 11건은 회사 채용 페이지에 맞는 자리가 열려 있었다.

- 이제 "합류 방법 찾기"를 누르면 회사를 저장하고 "{회사}에 합류하기 위해 지금 할 수 있는 가장 좋은 방법을 찾아서 준비해줘."를 보낸다. 공식 지원, 인재풀, 담당자 연락, 공고 기다리기 가운데 무엇을 할지는 Harper가 정한다.
- 사용자가 보내는 메시지와 버튼에는 "지원"이라는 말을 쓰지 않는다. 사용자를 을로 만든다는 지적이 있었다.
- 라벨 "회사 제안"은 회사가 먼저 제안한 internal 기회와 헷갈려 "회사"로 바꿨다.
- 회사 사이트는 상세의 회사 정보 링크로 연다. 직접 연락한 기록은 상세의 "지원함으로 이동"으로 남긴다.

- 화면의 `roleId`는 기회 대상 ID로 넓혔다. 공고면 `role_id`, 회사면 `company_workspace_id`이고 `targetKind`로 구분한다. 그래서 URL·상세·목록이 같은 흐름을 쓴다.

## DB 변경 (`20261117190000_career_company_opportunities.sql`, `20261117200000_career_company_opportunity_activity.sql`)

- `talent_opportunity_recommendation`, `talent_opportunity_memberships`, `talent_external_evaluations`: `role_id`를 선택값으로 바꾸고 `company_workspace_id`를 추가했다. 대상은 정확히 하나여야 한다.
- `external_recommendation_runs.candidate_company_workspace_ids`를 추가했다.
- 뷰 3개(`talent_external_evaluation_index`, `talent_opportunity_membership_index`, `talent_effective_opportunity_recommendations_v1`)에 `company_workspace_id`를 덧붙였다. 멤버십 뷰는 공고를 left join한다.
- 회사 추천에서 실패하던 trigger 3개(메모 복사, 피드백 이력, 활동 복사)는 Role이 있을 때만 `talent_progress`에 쓴다. 메모·피드백·단계 변경은 추천 행, `talent_role_activity`, decision 이력에 그대로 남는다.
- `career_company_blocked_v1`로 차단 회사 확인을 공고·회사 경로에서 같이 쓴다.

## 부작용 점검

- Worker와 회사 측 reader는 대부분 공고로 거르거나 공고와 join한다. 그래서 회사 추천은 그 경로에 나타나지 않는다.
- Worker의 외부 추천 주기 기준(`opp/worker.py` `last_recommendation_at`)은 회사 추천도 센다. 이 기준은 Career agent가 추천한 외부 공고도 이미 세고 있으니, 같은 agent의 회사 추천도 세는 편이 일관된다.
- 회사 추천에는 회사 측 agent 연락 경로가 없다. `agentContacts/store.ts`는 이 경우 명확한 오류를 낸다.
- 운영 통계는 회사 추천을 외부(비internal) 추천으로 센다.
- `src/types/database.types.ts`에는 `company_workspace_id`만 추가했다. `role_id`를 nullable로 바꾸면 Role 범위 쿼리 28곳의 타입이 깨지므로, migration을 적용한 뒤 타입을 다시 생성할 때 함께 정리한다.

## 남은 일

- 웹 배포 후 실제 Career 대화에서 `search_opportunities(kinds=[companies])` → `upsert_opportunities(companyWorkspaceId)` → 기록 화면 카드까지 이어지는 E2E.

## 회사 검색과 회사 참조 (`20261117201000_career_company_workspace_refs.sql`)

2026-11-17 운영 DB에 적용했다. 운영에서 `채널톡` 검색은 적용 전 118초, 적용 후 0.30초였다.

- 모델이 받는 회사 참조는 모두 `company_workspace`다. `search_resources(source=companies)`의 이름·설명·회사 자료·공개 원문 검색과 의미 검색 후보, `read_resources`의 이름·링크 확인 결과가 같은 규칙을 따른다.
- 디렉터리 회사(`company_db`)에 workspace가 없으면, Career가 그 회사를 처음 돌려줄 때 `career_company_workspaces_for_directory_v1`이 workspace를 찾거나 만든다. 회사 자료를 처음 쓸 때와 같은 home 선택·잠금·행 형태(`external_roles_enabled=false`, `is_internal=false`)를 쓴다. 운영 디렉터리 318,560곳 가운데 297,771곳은 아직 workspace가 없다. 미리 일괄 생성하지 않고, 모델에게 보여 줄 때만 만든다.
- 회사 검색 SQL은 조건마다 index를 타는 후보 집합을 따로 구한 뒤 합친다. 예전 SQL은 디렉터리 회사마다 공개 원문을 다시 훑었다. 그래서 로컬에서도 흔한 단어("company") 검색이 60초를 넘겼다. 새 쿼리는 운영 규모에서 같은 단어(17,669곳 일치)로 1.17초 걸렸다(읽기 전용 `EXPLAIN ANALYZE`). 공식 사이트 비교는 점(`.`)이 들어간 검색어에만 한다.
- 벡터 색인은 `company_db` 기준 그대로 두고, 결과 참조만 workspace로 바꾼다.


## 회사 자체를 기회로 (2026-11-18)

다른 세션의 반복 실험 14회에서 회사만 검색한 경우는 생겼지만, 회사 자체를 추천한 경우는 한 번도 없었다. 원인은 모델 입력에서 회사 기회를 "특정 공고 없이 다가가는 회사"로 정의한 데 있었다.
- 사례 B의 넓은 검색에서 1위는 토스라는 회사 자체였다(mutualFit 78.7, candidateInterest 93).
- 하지만 결과 문구는 "열린 공고 298개는 이 ID로 다시 평가하라"고 안내했다.
- 그래서 모델은 회사를 공고로 다시 쪼개 계열사 공고를 추천했다.

이 정의가 들어간 도구 설명, 탐색 지침, 채점 기준, 결과 문구, 최근 추천 맥락, 기록 화면 모달 문구를 "공고 유무와 상관없이 회사 자체"로 고쳤다. 공고로 되돌려 보내는 안내 문구는 지웠다. 회사의 열린 공고 수는 사실로 계속 보여 준다.
