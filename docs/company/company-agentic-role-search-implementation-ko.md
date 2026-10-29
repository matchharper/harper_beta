# Company-side 대화형 Role 검색 구현 계약

문서 기준: 2026-10-24. 이번 작업의 설계와 검증 정본이다. 운영 배포를 의미하지 않는다. 실제 실행 결과는 [평가 레지스트리](../evaluation/company-agentic-role-search/README.md)에 별도로 기록한다.

## 2026-10-28 Brief 자동 보완과 검색 완료 (로컬 수정·미배포)

대화의 `request_matching_search`와 정기 검색의 평가 접수는 기존 등급 설명(`signals`)·요약 자동 보완을 마친 뒤 검색 snapshot을 저장한다. 다른 요청이 이미 보완 중이면 기존 lease를 기다리며, session 값이 갱신된 시점이 아니라 평가용 Brief의 최종 저장까지 기다린다. 확인 화면의 20초 대기 제한을 검색 준비에 재사용하지 않는다.

회사 요청 검색 Worker는 완료 직전 Brief 버전이 달라졌다는 이유로 실패하지 않는다. 평가·카드 설명의 기준은 실행 당시 snapshot과 버전으로 보존하고, 완료 시점 버전은 `result.roleSearch.briefVersionAtCompletion`에 따로 남긴다. 결과 안내와 실행 상세는 두 버전을 구분하며 최신 기준으로 다시 평가했다고 설명하지 않는다. 평가만 요청했다면 기존 카드는 그대로 둔다.

기존 Worker 발행 경로도 Brief 변경 자체를 중복 검사로 거절하지 않는다. 후보자의 현재 공개 권한·원문, Role 실행 자격, lease와 교체할 미결정 목록의 동시 변경 검사는 유지한다. 검색 접수 후 시작 전에 기준이 바뀐 경우와 별도 웹 발행 명령의 현재 평가 확인은 이번 변경 범위가 아니다. 아래 과거 Worker 완료 시 Brief 불일치를 실패로 처리한다는 설명은 이 절로 대체한다.

검증: 웹의 준비 순서·검색 접수·결과 projection 48개, Worker 검색/발행 68개, 격리 로컬 PostgreSQL의 완료·발행 10개를 확인했다. 실제 모델 호출, 운영 데이터 변경, 기존 검색 재실행과 배포는 하지 않았다.

## 선정 조회의 모델 입력 형식

`get_more_data(kinds=["matching_runs"], matching.view="selection")`는 DB 평가 객체 전체를 모델에 보내지 않는다. 응답 앞에서 Brief·조회 범위·criteria 번호와 정의를 설명하고, 후보별 `talentId`, `info`(이름·headline·location), `joinedAt`, 문자열 목록인 `recentExperience`·`recentEducation`, fit 수치와 기준별 라벨을 담은 `assessment`를 제공한다. 평가 ID·실행 ID·기준 원문을 후보마다 반복하지 않는다. 기준별 세부 수치와 원문은 `view="evaluations"`로 조회한다.

신규 목록은 이미 신규 추천 자격을 적용했으므로 `currentCompanyRelationship` 내부 객체를 반복하지 않는다. 현재 미결정 추천은 별도 목록으로 표시하고 유지·설명 갱신 가능 여부, 이전 소개 기준을 보존한다. 과거 실행 조회에는 당시/현재 평가와 현재 추천 자격을 별도로 설명해 과거 점수를 현재 가능 여부로 오인하지 않게 한다. 원본 reader와 발행 권한·동시성 경계는 바꾸지 않는다. 공통 계약은 [도구 정보 설계 가이드](../company-side-tool-information-guide-ko.md)의 텍스트화 절을 따른다.

## 1. 목표와 범위

회사와 대화하는 원본 LLM이 현재 채용 기준, 저장된 평가, 후보 목록, 실제 피드백을 읽고 다음 작업을 선택한다. 새 검색만 반복하는 구조에서 벗어나 이미 평가한 후보를 더 소개하거나, 미평가 인원을 탐색하거나, 변경된 기준으로 다시 평가하거나, 충분한 표본의 병목을 설명할 수 있어야 한다.

이번 변경은 `/org`와 회사 대화에서 명시적으로 요청한 검색에 적용한다. 예약된 정기 검색, Career 온보딩과 Opportunity Worker의 기존 fit 계약은 유지한다. 회사측 추천은 회사의 검토 목록에 후보를 추가하거나 전체 재평가의 결과로 미응답 목록을 교체하는 효과다. 후보자에게 연락하거나 Intro를 요청하는 동의와 구별한다.

도구의 정보 배치는 [도구 정보 설계 가이드](../company-side-tool-information-guide-ko.md), Hiring Brief는 [작성 가이드](company-role-hiring-brief-authoring-guide-ko.md), 문체는 [UX writing 가이드](../company-side-ux-writing-guide-ko.md)를 따른다. 예시 대화를 production 분기·상태·키워드 규칙으로 옮기지 않는다.

### 2026-10-27 로컬 변경: 추가 발굴의 목적과 도구 입력

Run Search의 한국어·영어 발화는 현재 추천 목록 밖에서 적절한 사람을 찾아 목록에 추가하도록 요청한다. 로딩 전 `candidate_search` 기능 소개도 신규 발굴·추가 능력을 먼저 알린다. 상세 검색 정책은 저장된 미추천 평가를 재사용하고 필요하면 미평가 인원을 탐색한 뒤 `kind=add`로 발행하도록 한다. 기존 후보를 처음 설명하는 것은 신규 추천이 아니다. 실제 추가 결과, 조사한 범위의 적합 후보 없음, 또는 구체적 미완료 원인을 구분하며 별도 키워드 라우터·완료 심사기·강제 검색 호출은 추가하지 않는다. 후보자 Intro 발송은 별도 동의 계약이다. 운영 미배포다.

### 2026-10-27 로컬 변경: 선택한 후보의 동기 작성·저장

`publish_role_recommendations`는 이제 Worker 큐 대신 웹의 `src/lib/companyFirstSearch/publication/server.ts`를 직접 await한다. 인증된 `POST /api/org/role/recommendations/publish`도 같은 함수를 사용하며 `Idempotency-Key`를 요구한다. 채팅 API와 endpoint의 실행 시간 설정은 1800초다. 후보마다 하나의 작성 요청을 동시에 시작하고 모두 끝난 뒤 한 transaction으로 목록과 설명 이력을 저장한다. 완료 결과의 실제 추가·갱신·유지·제외 ID를 원본 회사 LLM에 텍스트로 제공한다. 채팅 완료 시 기존 query invalidation으로 목록을 다시 읽는다. 새 발행에는 queued/running 검색 행이나 별도 후속 알림을 만들지 않는다.

Worker의 **수동** writer를 기준으로 `gpt-6-luna`, reasoning `high`, temperature `0.3`, 출력 예산 기본 `128000`과 기존 환경변수 override를 유지한다. `scripts/syncCompanyPublicationPrompt.py`가 Worker의 실제 interactive 분기에서 시스템 프롬프트를 추출하며 `--check`로 일치를 확인한다. 전체 공개 Profile·경력·학력·허용 extras, 전체 Search Brief, 현재 Role 원문·criteria, 기존 criterion score/label을 전달한다. 후보 Memory·Behavior·비공개 fit 수치는 넣지 않는다. 회사 Behavior는 기존 writer의 참고 맥락이다. 날짜는 웹 공통 formatter와 Asia/Seoul 기준을 사용하고 회사 Behavior의 기존 임의 글자 제한은 새 경로에 복제하지 않는다.

출력은 `tldr`, `harper_note`, `recommendationReason`, `criteriaEvaluations[{criterionRef,content}]`다. 코드가 기존 score/label/distribution을 되붙이며 새 종합 적합성을 생성하지 않는다(`finalFit=null`, 기존 interactive Worker와 동일). 별도 심사·재선정·부족 인원 채우기를 하지 않는다. 구조화 출력 schema를 사용하며 Worker의 저장된 presentation cache나 구조 오류 재작성 루프는 이 동기 경로에 추가하지 않는다.

기존 SQL 연결과 테이블을 재사용하므로 새 DB migration은 없다. Free/paid, 실제 권한·팀 범위, test-only 격리, 공개 자격·회사 차단·기존 결정, 현재 Brief·공개 원문·선택한 평가 및 replace 목록 revision을 저장 직전에 다시 확인한다. Worker와 동일한 source/route advisory lock을 사용한다. 동일 요청 ID는 완료 결과를 재사용한다. 작성 하나라도 실패하면 모두 기다린 뒤 실패를 반환하고, 저장 중 실패는 전부 rollback한다. `add`의 기존 카드는 그대로 보존하며 `replace=[]`는 미결정 목록만 제외한다. 설명 완료와 목록 저장까지 기다리는 것이며 후보자 연락·Intro 발송은 포함하지 않는다.

검증: `publication/writer.test.ts`(Worker 프롬프트 일치·실제 provider 입력 projection·점수 보존), `publication/postgres.test.ts`(localhost 기존 snapshot의 폐기용 복제 DB, 모델 호출 없음), `org/agent/publicationContract.test.ts`(완료 결과 projection). DB 검증은 네 요청의 동시 시작·마지막 작성 대기·저장 직후 조회·멱등성·기존 카드 보존·replace·실패 rollback·공개 권한 변경·동시 목록 변경을 확인한다. 운영 배포·현재 운영 queued 요청의 취소/재실행·실제 모델 품질 평가는 이 변경에 포함하지 않았다.

## 2. 현재 구현에서 확인한 차이

| 항목 | 작업 시작 시 로컬 코드 | 목표 |
| --- | --- | --- |
| 검색 요청 | `request_matching_search(roleId)`로 기존 회사 검색 접수 | 평가 범위·시작 단계·수량·특정 후보를 원본 LLM이 선택 |
| 후보군 | SQL·FTS·벡터 후보군은 5,000명, 최종 평가 예산 100/150/200 | 요청별 기본 평가 예산 5,000명, 요청한 더 작은 범위도 지원 |
| 1·2차 | 공통 fit의 여러 pair batch, 낮은 공통 동시성 | 한 후보×한 역할씩 Decisions, 설정 가능한 높은 병렬성 |
| 1차 | 수행 범위·경력 방향 등 폭넓은 불일치도 배제 | 큰 직무 불일치와 확인된 실제 hard conflict만 배제 |
| 2차 | role/candidate/company fit | candidateFit, companyFit, mutualFit, 각 criteria 점수 |
| 이력 | 현재 fit upsert와 최근 일부 JSON history | 기준 version별 모든 요청 평가를 보존하고 조회 |
| 회사 메모리 | workspace/role 긴 문서 | company/team/role 범위의 자유로운 행 CRUD |
| 후보 링크 | 기존 추천 관계를 요구, 일부 mention은 클릭 불가 | 권한 있는 비추천 후보도 같은 badge와 오른쪽 profile preview |
| 긴 작업 | 30 tool call·누적 결과 예산 | 횟수 자체보다 실제 실행 시간·취소·컨텍스트를 관리 |

## 3. 원본 LLM의 판단과 실행기의 책임

LLM은 기준이 왜 바뀌었는지, 어느 단계부터 다시 볼지, 더 소개할 사람이 있는지, 새 사람을 몇 명 볼지, 조건 조정을 제안할지 판단한다. 같은 Brief에서 반복 평가하지 않는 것은 도구 policy의 경제적인 판단 원칙이며 DB 금지 조건이 아니다. 명시적인 재확인 요청·입력 수정 등 새로운 근거가 있다면 재평가할 수 있다.

코드는 현재 권한·역할 유효성·test-only 격리·후보자 공유 동의·차단·중복 전달·동시 수정·실제 저장 효과를 검증한다. 의미상 기준 변경 여부를 키워드나 휴리스틱으로 판정하지 않는다. 회사가 응답하지 않은 후보를 거절로 만들거나, 연락하지 않은 후보의 관심을 만들어내지 않는다.

## 4. 검색의 최소 실행 입력

기존 검색 도구를 확장한다. 개별 대화 상황을 위한 `more_candidates`, `relax_criterion`, `switch_role` 도구는 만들지 않는다.

| 입력 | 의미 |
| --- | --- |
| roleId | 현재 접근 가능한 정확한 역할 |
| scope | 미평가 후보, 신규 가입 미평가 후보, 전체 후보, 저장된 평가 후보 중 실행할 모집단 |
| startStage | 1차부터 평가하거나 기존 1차 결과를 바탕으로 2차부터 평가 |
| limit | 이번에 새로 평가할 인원; 기본 5,000, 양의 정수 |
| recommendCount | 약 10명의 유용한 추천을 위한 참고 목표. 대화 검색 자체는 항상 평가만 저장 |
| talentIds | 특정 후보를 평가할 때의 정확한 ID. 최종 추천은 별도 발행 도구에서 선택 |
| reason | 사용자의 목적과 이번 실행 범위를 설명하는 짧은 자연어 |

명시적 검색은 기존 durable `company_first_search_runs`를 재사용하고 새 계약 version으로 구분한다. 실행 옵션은 `request_options` JSON에 보존한다. 같은 요청의 재시도는 같은 실행을 반환하지만, 다른 범위·다른 후보·다른 기준의 요청을 단순히 같은 Role이라는 이유로 합치지 않는다. 실행 중인 작업을 중단하거나 5,000명의 평가를 HTTP 요청 수명에 묶지 않는다.

`scope=all, startStage=2`는 후보별 최신 1차 판정이 통과인 기존 집합을 현재 공유 자격·요청 ID·평가 예산에 맞춰 다시 평가한다. 새로운 discovery SQL과 교집합을 만들어 기존 통과자를 빠뜨리지 않는다. 회사의 Save/Pass/Intro 같은 결정은 평가 집합을 의미상 줄이는 기준이 아니라 기존 추천을 변경할 수 있는지의 발행 경계다. 1차 기록이 없는 후보까지 다시 검토하려면 1차부터 평가하는 범위를 선택한다. `unassessed`와 `new_members`는 새 평가 대상과 새 추천 비교 대상에 같은 모집단 범위를 적용하며, 이전 전체 평가를 추가로 추천하려면 `evaluated`를 사용한다.

조회와 변경의 역할을 구분한다. `get_more_data`의 매칭 조회는 통계·목록·후보 이력을 읽는다. 검색 요청은 실제 평가를 수행하고, 명시적 추천 발행 도구가 소개문 생성·미결정 목록 변경을 수행한다. 별도 `evaluate_candidates`는 추가하지 않는다. 동일 검색 도구에서 특정 talentIds와 recommendCount=0으로 충분하다.

## 5. 검색·평가 단계

### Retrieval과 공유 경계

대화 검색은 LLM이 현재 역할·Memory·실제 schema로 read-only SQL을 만든다. 관련 직무/수행 업무의 넓은 대안 근거를 WHERE로 조회하고 그 안에서 정렬한다. 일반 단어 또는 파생 선호만으로 전체 인재를 포함하거나, 관련성 없는 사람까지 예산을 채우도록 하지 않는다. 이는 planner prompt 계약이며 SQL 문자열 의미를 코드로 판정하는 규칙이 아니다. SQL의 hard boundary는 삭제·공유 동의·회사 차단·역할 접근·테스트 격리다. 문자열 직함·주소 일치로 직무 적합성이나 이동 의사를 결정하지 않는다. retrieval 순서는 평가 우선순위이지 탈락 근거가 아니다. 전체 풀, eligible 풀, 검색한 풀, 평가 완료 풀을 별도로 집계한다.

한 run에서 profile, 전체 후보 Brief, 같은 version의 Behavior Context와 관련 Memory를 준비해 두 단계에서 재사용한다. 후보 Memory는 이번 명시적 회사 검색의 private scoring 입력으로만 추가한다. 정기 Worker의 Behavior-only 계약은 유지한다. 후보의 원문 Memory·보상·사적 배경을 회사 대화 입력이나 공개 설명으로 그대로 보내지 않는다.

### 1차: 검토할 수 없는 충돌만 판정

한 API 호출에 후보 한 명과 역할 한 개를 넣는다. 직무의 큰 차이 또는 확인된 location/visa/work authorization 등 실제 비협상 조건의 충돌만 제외한다. 단순 선호 차이, 불확실한 정보, 부족한 서술, 이동 가능성의 미확인은 그 자체로 탈락 근거가 아니다. 현재 한국 거주와 미국 근무 의향이 함께 있으면 위치 문자열 불일치만으로 제외하지 않는다. 이 예시는 high-recall 원칙의 검증 사례이지 코드 분기가 아니다.

현재 거주·현재 보유 자격처럼 회사가 명시한 현재상태의 필수조건과 장래 근무지·이동 의사는 구분한다. 현재 사실이 명시 필수조건과 배타적이면 장래 이동 의사나 강한 업무 역량으로 충돌을 상쇄하지 않는다. 반대로 역할의 주소만으로 현재 거주 필수조건을 발명하지 않는다. 이후 원본이 현재 사실을 명시적으로 정정했는지도 함께 읽는다.

1차 결과는 통과 여부를 판단하는 Decisions의 구조적 답이다. 낮은 점수로 위장한 provider 실패를 만들지 않는다. 실패한 후보는 미평가로 남고 개별 재시도할 수 있다.

### 2차: 독립된 판단축

1차를 통과한 후보마다 기본 한 번 호출해 후보 입장에서의 적합성, 회사 입장에서의 적합성, 상호 적합성, 현재 criteria 각각의 점수를 받는다. 숫자의 의미는 공통 rubric으로 정의하고 회사를 위한 임의 총점 평균식이나 직군별 보정은 추가하지 않는다. criteria의 제목·설명은 해당 Brief version의 원문을 사용한다.

각 점수는 Decisions의 다섯 ordinal 수준을 0/25/50/75/100으로 표시한 확률가중평균이고, 라벨은 확률이 가장 큰 수준이다. 평균 점수의 순서와 대표 라벨의 순서는 다를 수 있다. 일반 reader는 이 의미를 점수와 함께 한 번 제공한다. 50점을 채용 가능성 50%나 합격선으로 해석하지 않으며, 다른 기준의 점수를 합쳐 새 순위 공식을 만들지 않는다.

Decisions API는 predicate/choice/score를 반환하며 자유 서술 이유를 생성하지 않는다. 따라서 점수를 과거 모델의 설명처럼 제시하지 않는다. 점수 상세 조회는 당시 기준·점수·확인 가능한 공개 근거를 제공하고, 설명 생성 시점과 원래 평가 시점을 구분한다. 저장되지 않은 과거 설명은 없다고 표시한다. 특정 후보의 깊은 설명은 저장된 3차 설명이 있으면 그 원문을 읽는다. 없으면 회사 원본 LLM이 점수와 현재 공개 프로필을 읽어 현재 해석을 설명하며, 당시 모델의 이유를 복원했다고 표현하지 않는다. 후보 프로필의 과거 원문은 일반 이력 테이블에 복제하지 않으므로 오래된 평가 당시의 근거 전체를 재현하는 기능은 아니다.

### 실행 병렬성과 평가 전용 계약

1·2차는 모두 Decisions API를 사용한다. 일반 추론 API로 우회하는 fallback은 없다. 하나의 동시성 예산(기본 64) 안에서 후보별 1차 결과를 먼저 저장하고 곧바로 그 후보의 2차를 시작한다. 다른 후보의 느린 1차가 전체 2차의 시작을 막지 않는다. DB 저장·lease 실패는 새 호출을 중단시키며 모델의 부적합 판단으로 바꾸지 않는다.

현재 provider는 한 요청에 질문 400개를 허용한다. 제품의 criteria 수를 이 값으로 제한하지 않고, 초과한 경우 같은 한 후보의 전체 원문을 공유하는 여러 요청으로 질문만 나눠 처리한다. 질문의 식별자·응답 개수를 확인한 뒤 원래 순서로 결합한다. 후보를 한 요청에 여러 명 넣거나 criteria를 버리지 않는다. 논리적인 후보 평가 수와 실제 API 요청 수·시도 수·토큰은 따로 기록한다.

`recommendCount=0`은 어떤 scope나 exact ID에서도 평가·저장까지만 위임한 것이다. 새 추천 선정, 기존 미응답 카드의 기준 갱신, 추천 제외, 3차 설명 생성을 하지 않는다. 기존 점수 읽기만 필요한 경우에는 일반 reader를 쓴다.

일부 평가가 실패하면 성공한 개별 평가 이력은 보존하되 실행을 완료로 표시하거나 일부 모집단으로 추천을 발행하지 않는다. 실행 결과에는 성공한 단계별 인원, 실패한 단계와 후보 참조, 실제 토큰·시간을 남긴다. 회사 조회는 접근 가능한 후보 참조만 제공하고 내부 오류 원문은 내보내지 않는다. 실패 대상이 많으면 기존 summary의 offset/limit으로 페이지를 읽고, 성공 평가 이력의 페이지와 구분한 다음 조회 참조를 제공한다. 실패는 부적합 판정이 아니며, 원본 LLM이 이력과 현재 미평가 범위를 읽고 재시도 범위를 정한다. 같은 실행 재개는 동일 입력의 저장 결과를 재사용한다. 새 run에서의 재평가 여부는 일반 도구와 모델 판단에 맡긴다.

사용량은 이번 시도의 성공 응답 범위다. 저장 결과 재사용을 새 호출로 세지 않고, usage가 없는 실패를 비용 0으로 계산하지 않는다. 실제 청구액과 공개 가격표에 따른 추정은 별도로 표시한다.

### 3차: 선택한 사람의 설명과 criteria

새로 추천할 후보와 변경된 기준에서 재평가 후 유지할 기존 미응답 추천 후보에게 기존 presentation 작성기를 호출한다. 각 기준의 점수와 설명, 추천 근거와 중요한 tradeoff를 함께 읽을 수 있게 한다. 2차의 점수를 다른 의미로 다시 채점하지 않는다. criteria가 바뀌면 해당 version의 새 설명을 작성한다. 후보의 관심·답변·지원·연결 상태는 실제 사실만 사용한다.

10명은 원본 회사 LLM에 제공하는 권장 규모이며 발행 수나 총상한이 아니다. 추가 요청에서는 같은 version의 남은 평가를 읽고 적절한 대상을 선택할 수 있다. 남은 후보가 부족하면 미평가 풀을 확인해 더 평가할 수 있다. 충분한 후보가 없다면 통계와 확인 범위를 근거로 조건 변경을 제안할 수 있으며, 회사의 동의 없이 기준을 완화하지 않는다.

### 대화 검색 선정: 회사 원본 LLM의 명시적 ID 선택

2026-10-24 사용자 요청으로 자동 Top N 발행을 대체했다. `request_matching_search`는 1·2차 평가를 저장하고 완료 사건을 회사 대화에 전달한다. 기본 수량이나 전체 재평가가 추천 목록 변경을 자동으로 허가하지 않는다.

`get_more_data(kinds=["matching_runs"], matching={roleId,view:"selection"})`은 현재 기준 전체 통계와 신규 추천 가능 후보 Top 20을 `mutualFit` 내림차순으로 제공한다. 모든 미결정 기존 추천은 별도 목록으로 전원 포함한다. 각각 후보 ID, companyFit/candidateFit/mutualFit와 기준별 점수·라벨, 가입 날짜, 최근 경력 최대 5개·학력 최대 3개, 현재 관계를 제공한다. 오래된 카드 점수와 현재 평가를 구별한다. 다음 페이지와 상세 원문은 일반 도구로 선택적으로 조회한다. Top 20이나 상세 조회 여부가 최종 선택을 제한하지 않는다. `matching.from`·`matching.to`로 상위 후보 목록의 조회 범위를 지정한다. 1부터 시작하고 양끝을 포함한다. 생략하면 1~20, `from:21,to:40`은 21~40위, `from:1,to:100`은 상위 100명이다. `from`만 지정하면 그 위치부터 20명, `to`만 지정하면 1위부터 해당 위치까지 읽는다. 결과에는 요청 범위·반환 수·전체 수·다음 범위를 함께 표시하며 현재 미결정 추천은 범위와 무관하게 전원 포함한다. 기존 `offset`·`limit`도 호환되지만 `from`·`to`와 함께 지정하지 않는다.

원본 company-side LLM은 같은 대화에서 분포·현재 요구·후보별 근거를 보고 신규 추천, 기존 후보 유지, 적은 인원 또는 목록 변경 보류를 판단한다. 약 10명은 권장 규모이며 채워야 할 수가 아니다. 특정 조건 때문에 후보가 부족하면 근거와 대안을 논의할 수 있지만, 사용자의 조건을 임의로 완화하거나 알려진 충돌을 인원수로 덮지 않는다. 정성 판단은 prompt/context와 공통 도구에 두며 근속연수 같은 사례별 분기는 만들지 않는다.

`publish_role_recommendations(roleId, kind, talentIds, sourceRunId?, reason?)`는 추가와 교체를 구분한다. `kind=add`는 추가할 ID만 받아 기존 카드와 설명을 모두 보존한다. 이미 미결정 목록에 있는 ID는 새로 쓰지 않으며 빈 배열은 아무것도 추가하지 않는다. `kind=replace`는 남길 기존 후보와 추가할 후보를 합친 전체 미결정 목록을 발행하며 빈 배열은 명시적으로 미결정 목록을 비운다. 선택하지 않은 미결정 카드는 재평가로 목록에서 제외하되 거절로 기록하지 않는다. Save/Pass/Accept/Intro 및 진행 이력은 보존한다. 현재 2차 평가가 있는 선택 후보만 기존 3차 writer로 설명을 작성하며 Worker 재선정·인원 보충은 없다. 현재 평가가 없거나 새 공유 자격이 없는 기존 카드는 설명을 새로 만들지 않고 그대로 유지할 수 있다.

2026-10-27 후속 로컬 정책(미배포): 슬롯 없는 활성 Free Role도 후보자 선추천·연결 대기·연결 수락을 지원하며 공용 Intro는 월 3개다. 기존 동의·공유·활성 상태·test-only·Intro 잔액 경계는 유지한다. 정본은 `20261027074848_free_role_matching_and_three_intros.sql`과 [결제 구현 문서](workspace-billing-stripe-setup-ko.md)이며 새 migration은 운영 미적용이다. 아래 DB 선반영 기록의 “유료 조건은 변경하지 않는다”는 당시 작업 범위다.

2026-10-27 DB 선반영(Worker 미배포): Free Role도 Run Search의 평가와 먼저 제안 가능한 후보 추가·교체를 사용할 수 있도록 `enqueue_company_agentic_search_v1`과 Worker의 시작/저장 직전 Role 조회를 `free`, `paid` 공통 범위로 맞췄다. 정본 migration은 `20261027072006_free_role_company_agentic_search.sql`이다. Owner/Admin·Role 접근·활성/만료·Hiring Brief·test-only·공유/중복 경계는 유지한다. 후보자 선추천, 연결 대기, Intro 차감의 유료/동의 조건은 변경하지 않는다. 운영 DB에는 `20261027074326`(`free_role_company_agentic_search`)으로 적용했고 함수 본문 정본 일치·서버 전용 실행 권한 유지·신규 security advisory 없음을 확인했다. 해당 AI Research Engineer Role의 현재 Free 분류가 새 접수 조건을 통과하는 것을 읽기 전용으로 확인했다. 실제 검색·추가 완료까지 사용하려면 남은 Worker 코드 반영이 필요하다. 운영에서 검색 재접수·후보 등록·연락은 실행하지 않았다. 후속 배포 때 같은 migration을 재적용하지 않는다. 독립 로컬 DB snapshot clone에서 실제 함수 접수·재접수·Worker 조회·권한/상태 차단 8개와 기존 검색/추가/교체 테스트 65개를 확인했으며 모델 호출·운영 후보 등록·연락은 하지 않았다. DB 검증 정본은 Worker의 `tests/test_company_requested_free_role_postgres.py`이며 `COMPANY_FREE_ROLE_TEST_DSN`으로 지정한 localhost 전용 `harper_agentic_free_role_test_*` clone에서만 실행한다. snapshot 원본은 수정하지 않는다.

권한·새 후보의 현재 평가/공유 자격·후보/Role 동시 수정·목록 revision을 실행과 발행 경계에서 확인한다. LLM은 briefVersion·poolVersion을 전달하지 않는다. 기존 enqueue가 Brief snapshot을 고정하고 Worker는 실행 시작과 발행 직전에 현재 Brief를 확인한다. 교체는 설명 준비 전에 현재 미결정 목록의 revision을 캡처하고 저장 시 같은 목록인지 확인한다. 그 사이 Brief 또는 교체 대상 목록이 바뀌면 부분 교체 없이 실패한다. 추가는 기존 목록을 교체하지 않으므로 전체 pool revision 일치를 요구하지 않지만 새 후보의 공유·중복 경계는 저장 직전에 재검사한다. 기존 버전 인자를 담고 이미 접수된 작업은 원래 교체 의미와 검사를 유지한다. 별도 판단 테이블은 만들지 않으며 기존 run의 request_options에 정확한 선택 명령을 저장한다. company-first 카드만 바꾸며 talent-first 연락이나 연결 대기 전환은 하지 않는다. 정기 검색의 별도 위임·선정 도구는 해당 정기 계약을 따른다.

완료 run의 기존 `result.roleSearch.evidence`에 실제 조회한 1·2차 평가 행 ID, 당시 추천 가능 신규 후보 전체 순위의 평가 ID, 실행 전 미결정 카드 ID·revision, 실행 후 미결정 후보 ID를 저장한다. Top 20은 첫 페이지일 뿐 보존 상한이 아니다. 평가·criteria 원문은 기존 불변 평가 행과 `source_snapshot.roleSearchBrief`에 있으며 새 테이블이나 프로필 복제는 추가하지 않는다. 이후 평가·추천 변경으로 과거 순위와 점수가 바뀌지 않는다.

`matching={roleId,runId,view:"selection"}`은 이 고정 목록과 당시 기준을 읽고 현재 미결정 풀·최신 평가·현재 관계를 비교한다. 당시 풀도 조회하며 추가 후보는 같은 runId로 페이지를 읽는다. 현재 열람 권한은 다시 확인하고 현재 프로필을 과거 프로필로 표현하지 않는다. 과거 참조가 없는 legacy 실행은 자체 평가만 조회하며 당시 재사용 평가·전체 추천 가능 목록·풀을 복원했다고 주장하지 않는다. 참조가 유실되면 불완전한 목록을 완전한 이력처럼 반환하지 않는다.

`publish_role_recommendations`의 선택적 `sourceRunId`는 같은 Role·workspace의 완료 실행이며 현재 Brief와 같은 경우에만 해당 저장 점수를 선택 근거로 재사용한다. 다른 Brief의 점수를 현재 기준 충족으로 바꾸지 않으며 현재 공유·결정·최신 제외·목록 revision 경계는 그대로 적용한다. 새 검색과 1·2차 평가 없이 기존 후보 유지·새 후보 교체가 가능하다. 선택된 후보의 3차 소개문 작성은 별도이며 당시 점수 자체는 수정하지 않는다. 실제 검증은 [journey-v4](../evaluation/company-agentic-role-search/JOURNEY-V4.md)를 따른다.

완료 route는 평가만 끝난 경우 같은 일반 reader로 통계·Top 목록·현재 풀을 읽어 기존 `enqueueCompanyUpdate`에 사실로 전달한다. 회사 원본 LLM이 기존 대화와 도구로 이어서 판단한다. 발신 코드가 후보 수에 따라 고정 메시지나 완화 시나리오를 고르지 않는다.

### 병렬성과 실패 복구

2026-10-23 실제 웹 요청에서 내부 운영 계정의 조회 권한과 검색 접수 권한이 다름을 확인했다. 웹의 `hasOrgWorkspaceAccessBypass`는 내부 계정에 조직 조회 권한을 주지만, `enqueue_company_agentic_search_v1`은 실제 Owner/Admin 팀원 및 Role 접근 범위를 검사한다. 팀원 행이 없는 내부 계정의 요청은 `42501/company_matching_search_workspace_forbidden`으로 큐 저장 전에 거절된다. 이 정확한 오류는 일반 통신 실패와 구분해 `not_queued/workspace_forbidden` 사실로 회사 LLM에 전달한다. 다른 오류의 접수 불확실성은 유지한다. 기존 검색 adapter에만 있던 처리를 새 대화 검색 adapter에도 공유했으며, 권한 검사·팀원 정보는 변경하지 않았다. 로컬 대상 테스트 8개 통과, 실제 DB 읽기 전용 재현으로 거절과 해당 요청의 큐 0건을 확인했다. 웹 배포·검색 재접수는 하지 않았다.

pointwise 동시성은 설정값으로 두고 기본 64에서 시작한다. 사용자 요청 검색의 설명 동시성도 기본 64의 별도 설정으로 두며 정기 run의 기존 설정은 바꾸지 않는다. 후보 수를 제한하는 제품 상한과 provider를 보호하는 동시성은 구분한다. provider의 실제 429/일시 오류에는 Retry-After와 backoff를 적용하며 후보별 결과를 보존한다. 성공한 후보 전체를 다시 호출하지 않는다. DB transaction은 API 응답을 기다리는 동안 열어 두지 않는다. provider 호출에는 지원되지 않는 max_tokens를 붙이지 않고, 설명 작성에는 provider가 지원하는 충분한 출력 범위를 사용한다. 취소·lease 상실·권한 변경은 실제 실행 경계다.

## 6. Version과 평가 이력

현재 `talent_opportunity_fit`에는 pair UNIQUE와 이를 전제로 한 정기·Career reader/upsert가 많다. 이 제약만 제거하면 이전 평가가 현재 평가로 임의 선택되거나 기존 저장이 실패한다. 이번 요청의 목적은 같은 pair의 과거 평가를 여러 행으로 보존하는 것이므로, **현재 fit projection을 유지하고 `company_role_candidate_evaluations`에 요청 경로의 평가 이력을 append한다.** 기존 current fit table의 UNIQUE 해제 자체를 완료했다고 표현하지 않는다. 이후 current projection 통합은 모든 reader 전환이 필요한 별도 변경이다.

각 이력 행에는 workspace, role, talent, run, Brief version, 단계, input fingerprint, 평가값, 평가 시각을 보존한다. `(run, talent, stage)`의 unique는 같은 실행의 재시도가 평가 이력을 중복 저장하는 것을 막는다. 자유로운 평가 내용은 JSON이며 점수 라벨·시나리오·criteria 이름에 DB CHECK를 추가하지 않는다.

Brief version은 DB 공통 함수가 현재 역할의 name/description/request/criteria/location/work mode/employment type/seniority/compensation의 정규화된 JSON을 해시한 값이다. 언어별 JSON 직렬화 차이로 version이 갈라지지 않는다. version은 내용 identity이며 모델의 의미 판단을 대신하지 않는다. run의 source snapshot에는 당시 회사 기준을 보존한다. 서로 다른 모델·prompt의 재평가는 같은 Brief version 안에서도 별도 run으로 남는다.

현재 기준 통계는 같은 Brief version에서 후보×단계별 최신 성공 평가를 사용한다. 전체 실행 행 수를 사람 수로 더하지 않는다. 한 실행 통계와 현재 기준 누적 통계를 명확히 구분하고 실패·미평가·stale를 분리한다. 외부 공급 변화 때문에 capture 시점 이후 새 후보가 존재할 수 있다.

## 7. 매칭 조회

기존 `get_more_data(kinds=["matching_runs"])`를 확장한다. matching 옵션으로 역할, run, Brief version, 후보 IDs, 통계/목록/후보 이력, criteria와 반환된 라벨 또는 점수를 지정한다. 기존 다섯 건의 이력 목록도 계속 동작한다.

| 조회 | 모델에 제공할 사실 |
| --- | --- |
| 실행 목록 | 언제·무슨 목적으로·어느 기준 version으로·어느 범위를 실행했는지, 실제 완료/실패/일부 완료 |
| 한 실행 통계 | eligible/retrieved/1차 통과/2차 완료·실패, 기준별 점수 분포, 실제 추천 추가·제외 |
| 현재 기준 누적 통계 | 중복 없는 평가 인원, 평가하지 않은 인원, 단계별 결과, criteria별 분포 |
| 통계에 해당하는 목록 | 동일 필터의 후보 ID·점수·설명 조회 참조, 다음 페이지; 공개 프로필은 공통 reader |
| 후보별 이력 | 당시 기준 version·시각·run·단계·점수와 공개 가능한 설명 |

평가와 현재 회사 관계는 서로 다른 사실이다. 목록에는 기존 회사 추천 상태·공개 진행 기록 유무와 후보쌍의 공유·중복·기존 결정 조건상 신규 등록 가능 여부를 함께 제공한다. Role의 유료·활성 자격은 별도이며, 이 값은 적합 점수나 추천 완료를 의미하지 않는다. 일반 `hasCompanyHistory` 필터는 집계와 목록의 모집단에 동일하게 적용하고, 비공개 거절·선호의 이유는 노출하지 않는다. 개인 설명은 일반 후보 조회와 같은 공유 권한으로 정제한다. 같은 날 별도 Free 정책 원복 작업에 따라 플랜별 프로필 블러·열람 차감은 제거됐다. 플랜과 무관하게 공유 가능한 공개 프로필·3차 설명을 읽으며, 비공개 후보 Memory·연락처를 노출하지 않는다. 이는 현재 로컬 코드 계약이며 배포 완료를 뜻하지 않는다.

`view=candidates`는 중복 없는 사람 목록이며 `view=evaluations`는 같은 사람이 여러 단계·version·실행으로 반복될 수 있는 평가 행 이력이다. 같은 criteria 정의는 응답마다 한 번만 표현하고 세부 확률분포는 일반 옵션으로 확장한다. 점수 라벨은 실제 제외 인원·원인과 동일하지 않다. 실패한 실행에도 성공한 개별 평가 원장이 남을 수 있다.

목록이 길면 페이지로 반환하고 정확한 후속 조회 입력을 제공한다. 20명만 보고 전체에 없다고 말하지 않는다. 기본 context에는 최근 실행과 현재 역할의 짧은 요약·조회 참조만 넣고 수천 명의 JSON을 넣지 않는다. 동적 text projection은 확인된 값의 렌더링이며 별도 요약 LLM이 아니다.

## 8. 회사 Memory

회사 메모리는 확인된 회사 발화·피드백·맥락을 행으로 저장한다. role, team, company의 범위를 원본 LLM이 결정한다. 회사 범위는 현재 Workspace 조직을 뜻하며 `company_db`가 같다는 이유로 다른 Workspace에 공유하지 않는다. 한 후보의 Pass를 회사 전체의 영구 기준으로 일반화하지 않는다.

`get_more_data(kinds=["company_memory"], memory=...)`는 scope, role/team, forRoleId(상속 범위 포함), 페이지를 지원하고 `write_company_memory`는 add/update/delete batch를 받는다. label과 content는 자유 텍스트다. update/delete는 짧은 ref와 revision으로 기존 행을 정확히 변경한다. 쓰기 내부에 LLM·추출기·정성 분류기는 없다. 동시 변경은 충돌로 알리고 모델이 최신값을 읽어 판단한다. tool call 재시도는 멱등하게 처리한다.

팀 대상의 식별은 역할 목록에서 추정하지 않는다. 일반 `get_more_data(kinds=["teams"])`가 접근 가능한 활성 팀의 ID와 이름을 제공하므로, 활성 역할이나 기존 Memory가 없는 팀도 원본 LLM이 찾아 사용할 수 있다. 조직 전체 접근자는 해당 Workspace의 활성 팀을, 팀 범위 접근자는 실제 허용된 팀만 읽는다. DB 조회에 권한 필터를 먼저 적용하며 내부 페이지 처리는 전체 조회를 위한 것으로 팀 수 제품 상한이 아니다. 팀명 유사도나 사례별 팀 선택 규칙은 두지 않는다.

회사 범위는 조직 접근 권한, 팀 범위는 배정된 팀, 역할 범위는 현재 Role 접근을 확인한다. 공유 Slack audience 제한도 같은 reader에 적용한다. 작은 관련 scope 색인을 기본 context에 제공하며 상세는 일반 read로 확장한다. scoring은 해당 역할에 적용되는 회사·팀·역할 행과 기존 문서를 읽는다. 기존 긴 문서 Memory는 삭제하거나 임의 분해하지 않고 호환 reader로 유지한다.

Memory와 Brief에 기록된 상대 시점은 원본 작성·갱신 시각을 함께 제공한다. 과거의 “며칠 뒤 이동”을 현재 예정인 일정으로 재해석하지 않는다. Memory는 Brief를 조용히 덮어쓰거나 권한·동의를 만들지 않는다. 메모리 변경만으로 같은 Brief의 평가가 자동 무효가 되는 정책도 만들지 않는다. 새 근거의 적용과 재평가는 원본 LLM이 사용자 목적에 맞게 선택한다.

## 9. 기존 추천과 재평가

2026-10-24 기준: 전체 재평가는 아직 Save/Pass/Accept/Intro 등 실제 피드백을 주지 않은 ready 후보를 모두 평가에 포함하며, 2차부터 시작하거나 새 조회 조건/예산 밖이어도 누락하지 않는다. 평가 완료만으로 목록을 교체하지 않는다. 회사 원본 LLM이 새 평가의 Top 20 및 필요하면 추가 범위와 기존 미결정 풀 전원을 비교하고, 필요한 조건 논의를 거쳐 `publish_role_recommendations`에 최종 전체 ID를 넘긴다. 기존 후보도 명시적으로 선택하면 유지하며, 새 후보나 목표 인원을 자동으로 보충하지 않는다. 이 계약은 2026-10-23의 자동 Top N 교체 방식을 대체한다.

명시적 발행의 설명 작성이 끝난 뒤 하나의 transaction으로 현재 미결정 목록을 교체한다. 회사 결정·Brief·원문·동시 목록 변경은 저장 직전에 확인하며 실패하면 기존 목록을 유지한다. 선택되지 않은 후보는 `closed/reassessed`로 기록을 남기고 회사 거절로 취급하지 않는다. 이 사유로만 제외됐고 실제 결정/연락이 없으면 이후 다시 선택될 수 있다. 일반 평가 reader도 같은 재추천 가능 사실을 제공한다. 실제 추가·제외·갱신·그대로 유지 ID를 실행 결과에 기록한다. 2차의 임의 합격선이나 3차의 숨은 재선발은 추가하지 않는다. 현재 검증은 [journey-v3](../evaluation/company-agentic-role-search/JOURNEY-V3.md), 이전 자동 Top N 동작의 증거는 [2026-10-23 감사](../evaluation/company-agentic-role-search/AUDIT-2026-10-23.md)에 구분해 보존한다.

이미 Save·Pass·Accept·Intro·연결·진행된 관계는 일반 검색으로 되돌리거나 삭제하지 않는다. candidate setting 변화가 기존 공유 이력을 없애지 않는 현재 계약도 유지한다. 재평가는 평가 이력을 만들며, 명시적인 상태 결정과 연락은 해당 기존 도구의 책임이다.

## 10. 후보 badge와 오른쪽 카드

user와 assistant 메시지의 지원되는 talent 참조는 같은 클릭 가능한 badge로 표시한다. 먼저 현재 workspace/role의 기존 추천·Intro 관계를 찾아 기존 상세로 연결한다. 없으면 허용된 공개 프로필만 preview한다. preview 열람으로 추천/Intro/pipeline 행을 만들지 않는다.

미추천 후보는 현재 역할 접근, 공유 자격, 삭제·차단·test-only 경계를 먼저 확인한다. API 응답에서 비공개 연락처·이력서·Memory를 제외하며 UI 숨김만으로 처리하지 않는다. 기존 company-side 공유가 있는 후보는 현재의 보존 계약을 사용한다. 순수 GET에는 열람 차감이나 연락 side effect가 없다.

## 11. 긴 tool chain의 정보 관리

20회·30회라는 호출 횟수를 업무 완료 정의로 사용하지 않는다. 완료할 일이 있고 사용자 취소·실제 실행 시간·provider 한도가 허용하면 계속한다. 단기 HTTP surface의 시간 한계와 백그라운드 작업의 수명을 구분한다. 진행 중인 검색은 durable run에 남겨 다음 대화에서 이어 읽는다. 회사 chat route는 실제 Pro·Node24·Fluid 설정과 [Vercel 실행 시간 문서](https://vercel.com/docs/functions/configuring-functions/duration)를 확인해 개별 함수 1,800초 범위로 설정했다. HTTP/1.1에서도 provider 대기 중 연결이 끊기지 않도록 15초 간격 SSE comment를 보내며, 이를 사용자에게 진행 사실로 보여주지 않는다. 이 설정은 임의 도구 횟수 제한을 없애는 것이지 무한 HTTP 수명을 보장하는 것은 아니다. 운영 배포·실제 호스팅의 30분 지속은 아직 검증하지 않았다.

원본 결과는 trace에 보존한다. 모델에 보내는 반복 입력은 최근 상세와 과거의 작은 사실/참조로 줄인다. 압축할 때 tool_call/tool_result의 protocol 짝, exact ID·revision·승인 원문·실제 변경·실패·미완료·다음 페이지를 보존한다. 오래된 조회의 상세 본문부터 줄이며 최신 결과를 누적 예산이 소진됐다는 이유로 빈값으로 바꾸지 않는다. 필요하면 같은 일반 reader로 다시 읽는다. 도구 결과 80,000자는 중단 상한이 아닌 rolling 목표다. 일반 회사 completion은 제공 모델이 모두 지원하는 65,536 token 상한으로 여유를 두며 작은 4,000 token adapter 기본값에 의존하지 않는다(2026-10-22 [provider catalog](https://openrouter.ai/api/v1/models) 확인). 요약이 과거 실패를 성공으로 바꾸거나 존재하지 않는 실행을 만들어서는 안 된다.

## 12. 실험과 완료 판정

실제 유료 slot에 연결된 Role 하나와 실제 후보 데이터를 읽기 전용으로 capture한다. 실제 slot이 없다면 그 사실을 먼저 확인하고 paid-equivalent 역할을 같은 조건이라고 조용히 바꾸지 않는다. 합성 후보를 섞지 않는다. capture는 Worker canonical read-only connection만 사용한다.

실제 원본 snapshot, 시나리오 입력, 이상적인 출력·상태를 모델 실행 전에 동결한다. 신규 이력은 초기 0행이므로 실제 새 Worker 검색을 1회 실행한 결과를 별도 baseline으로 동결한 뒤 재사용·추가 추천 시나리오를 비교한다. 기존 legacy fit을 새 Decisions 평가처럼 변환하거나 가짜 평가를 seed하지 않는다. bootstrap도 원문·usage·설정·상태를 별도 run으로 보존한다. 각 실험은 별도의 로컬 DB를 base에서 복원한다. 회사 대화·메모리·Brief·평가·추천·사용량·작업 상태를 모두 동일하게 시작하고 이전 run의 로그는 별도 디렉터리에 보존한다. 운영 데이터는 초기화하지 않는다. 외부 메일·Slack·회사 알림은 차단하고 LLM provider 호출만 허용한다.

보고서는 하나의 표에 시나리오, 기대 판단/상태, 실제 tool chain, 실제 저장 변화, 사용자 응답 검토, UI/로그 증거, 통과 여부·남은 한계를 함께 기록한다. 실행 성공과 agentic한 판단 품질을 구분한다. raw prompt/output은 ignored private/runs에 owner-only 권한으로 저장하며 공유 보고서에는 비식별 aggregate만 남긴다.

필수 확인은 기준 수정 후 1/2차 선택, 같은 기준의 추가 추천, 신규·미평가 탐색, 누적 통계 병목과 회사 확인, 특정 후보의 평가·이력·추천, Memory 범위/정정, 비추천 badge와 오른쪽 카드, 20회 이상의 chain, 부분 실패와 재시도, 기존 피드백 보호다. 실제 출력 전문을 읽고 문제의 원본 prompt/context/tool 계약을 고친 뒤 같은 frozen 입력으로 재실행한다. API 성능·5,000명 부하·UI·DB 검증의 실제 수행 범위를 각각 표시한다.

## 13. 반영과 복구

schema는 새로운 이력·메모리 저장과 request 옵션을 추가하는 migration으로 준비하고 로컬 DB에서 검증한다. 2026-10-22 후속 사용자 승인으로 운영 schema를 migration `20261022045532`로 적용했다. 새 저장소·서버 전용 함수만 추가했으며 운영 검색·추천·Memory를 생성하지 않았다. 웹/Worker 배포·Slack/메일 발송은 별도 범위다. 새 history와 memory가 없는 환경에서는 읽기 실패를 빈 사실로 오인하지 않게 표시한다. 새 요청을 구 Worker가 소비하지 않도록 계약 version과 실행 경로를 함께 배포해야 한다.

기존 정기 검색과 이미 진행 중인 전달은 그대로 두고, 신규 요청의 기능과 migration을 함께 활성화하는 순서를 사용한다. 실제 배포는 별도 명시적 승인과 저장소의 배포·Notion 동기화 계약을 따른다.


## 14. 실제 실험에서 확인된 보완 기준

첫 full 실험을 끝내기 전 runtime은 동결하고 실패 원문·상태를 보존한다. 보완 코드는 같은 frozen baseline과 대화 입력으로 전체를 재실행해 평가한다. 이 절은 보완 구현의 계약이며, 성능 통과 여부는 [실험 보고서](../evaluation/company-agentic-role-search/REPORT-2026-10-22.md)의 실제 실행 결과로 판정한다.

- `unassessed`와 `new_members`의 범위는 이번 평가 대상뿐 아니라 이번 새 추천 모집단에도 적용한다. 이전 평가에서 추가 선택하려면 기존 `evaluated` 범위를 사용한다. 이번 선택 모집단과 전체 누적 평가 수를 각각 결과로 남긴다.
- 재평가 없는 최근 결과 재사용도 기존 원장과 새 선택·설명 효과를 읽을 수 있어야 한다. 이번 run에서 0명을 새로 평가했다는 사실과 누적 수천 명의 평가가 있다는 사실은 양립한다.
- 최근 추천 기본 context는 긴 평가 JSON 대신 ID·Role·현재 관계·조회 참조의 작은 색인으로 유지한다. 길어졌다는 이유로 모든 후보의 존재 정보를 버리지 않는다. 목록 등록과 실제 대화 소개·외부 전달은 별도 사실이다.
- 특정 criteria의 한 부분을 바꿀 때 같은 문단의 다른 조건을 조용히 삭제하지 않는다. 필수·우대·허용·불확실·명시적 배제의 강도를 원본대로 보존한다. 이 판단은 원본 LLM의 입력·도구 계약으로 개선하며 언어 패턴 검사기로 대체하지 않는다.
- 실패한 Worker를 로컬 실험에서 임의의 완료 상태로 꾸미지 않는다. 실제 실패 종료 경로를 사용하고 처음 접수된 queued 영수증과 이후 실패 사실을 각각 보존한다. 실험 DB 시간대는 확인한 운영 UTC와 일치시키되 frozen 원본 시각은 수정하지 않는다.


## 15. 실제 두 번째 실험에서 확인한 계약 보완

- `scope=all, startStage=2`는 새 discovery SQL로 후보를 다시 고르는 명령이 아니다. 저장된 최신1차 통과 집합에서 현재 공개 자격과 명시적인 후보 ID·평가 예산을 적용해 재평가한다. 새 retrieval 교집합 때문에 이전 통과자가 사라져서는 안 된다. 이 효과는 도구의 실행 의미이고, 어느 단계를 선택할지는 원본 LLM이 판단한다.
- 현재 거주·현재 자격처럼 사용자가 명시한 현재 상태 필수조건과, 장래 근무지·이동 가능성을 구분한다. 실제 현재 사실이 전자와 배타적이면 장래 이동 의사가 상쇄하지 않는다. 반대로 Role의 주소만으로 현재 거주 필수조건을 발명하지 않는다. 이 판단은 일반 scoring prompt와 원본 사실로 수행한다.
- compact 비교 이후 최종 확인에는 자신이 읽는 subset과 앞선 비교 범위·결과를 제공한다. 본인이 본 일부의 부적합 사유를 전체 모집단의 이유로 일반화하지 않는다. 회사 설명에도 원래의 비교 범위를 유지한다.
- provider가 HTTP200 keep-alive 뒤 error envelope를 반환할 수 있다. 회사 completion의 구조 검증은 그 원래 오류와 상태코드를 보존하여 공통 일시 오류 재시도를 적용한다. 오류를 성공한 빈 메시지나 고정 성공 문장으로 바꾸지 않는다.
- 후보 구성의 회사 기본 모델은 `gpt-6.1-sol`, reasoning high로 검증한다. 같은 입력의 프로필·평가 이력 진단에서 제공된 근거를 더 정확히 사용했지만 두 건만으로 일반 성능을 주장하지 않는다. 전체 frozen set에서 확인하며, 사용자의 명시 모델 선택과 환경 override는 유지한다. 모델별 실패를 특정 사례 router나 출력 교정 규칙으로 감추지 않는다. 웹·Worker 배포 여부와 실제 운영 환경 override는 별도다.


### 2026-10-22 실제 실험 후 1차·조회 입력 보완

1차는 한 후보의 동일 원문으로 업무 적합성, 회사의 명시적 실질 조건, 후보자의 명시적 실질 조건을
한 Decisions API 요청의 세 choice로 평가한다. 이는 중간 사고 계획이 아니라 각각 2차 진행 여부를
결정하는 실행 명령이다. 하나라도 exclude면 2차를 실행하지 않는다. `assessment`에는 기존
`decision`, `proceedToStage2`와 `workScreen`, `companyPracticalScreen`, `candidatePracticalScreen`,
두 실질 명령을 합친 `practicalScreen`이 기록된다. run의 `roleSearch.stage1DecisionStats`는 각 축의
continue/exclude/unrecorded 실제 수다. 이전 단일 질문 이력에 축이 없으면 미기록으로 읽으며 소급 추론하지 않는다.
일반 평가 reader도 같은 저장된 세 축을 후보별로 보여주고, 선택한 실행 또는 Brief 누적 범위에서
각 축의 통과·제외·미기록 수와 분모를 집계한다. 여러 축에서 함께 제외될 수 있으므로 축별 제외를
합쳐 고유 제외 인원으로 설명하지 않는다. 과거 축별 기록이 없는 평가의 원인은 만들어내지 않는다.

당시 v17~v40은 Hiring Brief(request·criteria)와 후보의 전체 Search Brief를 두 방향 질문 각각에 함께 원문으로 제공했다. 아래는 과거 입력 배치의 기록이며, 현재 로컬 v60은 뒤의 공통 입력 1회 계약을 따른다.
전체 scoring 입력에도 있으므로 이 두 근거는 의도적으로 중복 전달된다. 실제 긴 입력에서 조건을 놓치던
Decisions 응답이 질문의 평가 대상으로 원문을 직접 제공했을 때 달라진 관찰에 따른 입력 배치다.
`company_requested_decisions_v17`은 회사가 요구하는 조건과 후보자가 제한한 조건을 짧게 구별하며,
긍정적 선호 목록을 배타적 허용 목록으로 바꾸지 않는다. 지원·이동 가능성 미확인을 명시적 불가와
구별한다. 기존 구조화 원본을 `render_evidence`/`talent_text`로 표현하고 동일한 `paired_brief_context`를
두 질문에 사용한다. Profile 본문에서 heading이나 단어를 찾아 조건을 추출하지 않는다.
사후 실사례 진단 17건과 실제 repository 경로를 확인했으나 일반 recall을 입증하지 않는다. 반복 호출에서
이미 회사 축으로 제외된 한 사례의 후보 축이 달라진 관찰도 보존했으며 축별 판단의 불확실성을 숨기지 않는다.
별도 LLM 추출기·요약기·지역/직군 분기나 점수 cutoff를 추가하지 않는다. Profile의 저장 지역은 그
레코드의 지역 근거이며 다른 원본이 명시적으로 갱신하면 그 사실을 사용한다. 확인되지 않은 이사나
취업 허가는 가정하지 않는다. 단계2의 기존 분포/점수 계약은 유지한다.

`company_requested_decisions_v23`은 2차에 원본 Profile 기본 사실·전체 Brief·Memory를 가까이
제공하고, 현재 거주지와 경력의 고용주 지역을 구별했다. 실제 전체 v5에서는 긍정적 선호를 배타적
조건으로 읽은 1차 오판과 미확인 근무조건을 2차 conflict로 읽은 사례가 남아 있었다. 당시 원문·점수는
수정하지 않고 이력으로 보존한다.

`company_requested_decisions_v30`은 두 단계에서 Role의 `location`/`location_text`를
`role_work_location`, Profile 기본 사실의 `location`을 `recorded_current_residence`로 표현한다.
이는 읽기용 필드 의미 표시이며 저장값·경력 원문·필터를 바꾸지 않는다. 두 실무조건 1차 질문에는
동일한 구조화 원본에서 만든 현재 Hiring Brief와 후보 Profile 기본 사실·전체 Brief·Memory를 준다.
후보 질문은 실제 명시적 비협상 조건과 긍정적 선호·미확인·조건부 유연성을 구별한다. 희망 직급·직무·
회사 성격 차이만으로 실무조건을 금지하지 않으며 업무 적합성은 별도로 판단한다.

2차는 같은 다섯 ordinal label을 유지하되 각 label의 설명에서 명시적 충돌·문서화된 부족·미확인을
구별한다. 긴 후보 원문을 질문 앞에, 공통 근거 읽기 계약과 실제 평가 기준을 뒤에 둔다. 입력 사실이나
원문 중복량은 순서 변경으로 달라지지 않는다. 경력 전체는 공통 입력에만 두며, 별도 추출모델·추론
중간 상태·지역/직군 분기·점수 cutoff·라벨 후처리는 없다. 1차 continue를 2차의 정답으로 주입하지 않는다.

사후 고정 진단에서 1차 24개 입력의 목표 축과 2차 9개 입력의 명시적 제한/미확인 구별을 관찰했다.
추가 1건은 v28에서 여전히 오판했으며 질문의 원문/기준 순서만 바꾼 v30에서 미확인으로 읽었다.
이는 숨은 모델 원인의 증명이 아니다. 실패를 본 뒤 고른 작은 표본과 반복 튜닝이므로 전체 정확도·
재현율로 일반화하지 않는다. 실패한 진단도 보존하고 실제 repository 경로의 HTTP payload 일치를
확인한다. 최신 전체 실험의 결과는 이 보충 진단과 구분해 기록한다.

Manual retrieval은 실제 typed schema와 허용 함수를 함께 받는다. `source_cutoff`는 데이터 snapshot의
상한이고, 신규 가입 시작점·현재 평가 유무·공개 자격·예산은 executor가 적용한다. Planner가 임의로
최근 기간이나 legacy fit 부재로 같은 모집단을 다시 정의하지 않도록 계약을 명시한다. 구조 검증 실패도
실패한 SQL과 원래 오류를 다시 모델에 제공하며, 의미를 코드로 고치지 않는다. `unnest`는 manual의
순수 read capability로만 추가했으며 정기 validator의 기본 capability는 보존한다.

Manual 3차 출력 예산은 `COMPANY_REQUESTED_PRESENTATION_MAX_TOKENS` 기본 128000이다.
[GPT-6 Luna 공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)는 최대 출력
128000을 명시한다(2026-10-22 확인). 공유 adapter는 maxTokens를 생략하면 기존 16384 설정을 다시
사용하므로, manual 호출에만 지원 범위의 큰 예산을 명시하여 작은 기본 제한을 피한다. 이는 관측된
평균 출력 길이로 제한을 정한 것이 아니며 실제 사용 토큰만 집계한다. 정기 3차의 설정은 변경하지 않는다.

### Manual 원문 보존 (v31)

v6 실제 입력 감사에서 공유 profile loader가 bio 800자, Behavior Context 6000자, 경력 20행,
학력 12행과 extras 일부를 자르는 사실을 확인했다. 3차의 별도 serializer는 경력 설명 2000자와
학력 설명 생략도 적용했다. 이는 원문 전체를 보존한다는 manual 계약의 구현 결함이며 v6 결과의
한계로 기록한다. 실제 2차 2946명 중 bio 1080명·경력 13명·학력 1명에 해당했고, 3차 15명 중
11명의 학력 설명이 생략됐다. 항목별 인원은 중복될 수 있다.

`company_requested_decisions_v31`은 v30의 질문·판정 계약을 유지하고 manual의 source loader만
전체 근거로 바꾼다. bio/Behavior Context 원문, 경력·학력의 모든 행과 설명, 기존 허용 extras 필드의
모든 항목을 보존한다. extras의 미확인 필드를 새로 공개하지 않는다. 1·2차와 최종 원문 확인은 같은
projection을 사용하며, 3차도 fingerprint를 재확인한 같은 공개 Profile을 사용한다. 원문 뒤쪽의 변경도
fingerprint에 반영된다. 카드용 짧은 인덱스와 compact selector의 요약된 필드 목록은 상세 근거와
구분한다. 전체 근거를 읽는 단계에 무음 절단·별도 요약모델·의미 필터를 추가하지 않는다.
정기 matching의 기본 loader·serializer는 그대로 유지한다.

실제 로컬 snapshot 사본에서 영향받은 33명의 원본 bio/경력/학력 일치를 읽기 전용으로 확인하고,
실제 3차 대상 15명의 packet이 같은 전체 Profile을 전달하는지 확인했다. 이는 source 전달 검증이며
수정 뒤 모델 품질이나 전체 정확도의 증명이 아니다. 전체 대화 재실험은 같은 baseline/gold에서 별도로
보존한다.


## 매칭 기준 변경의 독립 이력

Brief 텍스트와 Criteria를 합친 매칭 기준의 저장 이력·최소 입력 Luna low 요약·웹 저장 후 자동 검토 채팅은 [매칭 기준 이력 계약](company-hiring-brief-history-ko.md)을 따른다. 검색 실행 이력과 별개다. 같은 웹 저장의 두 필드는 한 트랜잭션/이력이며, LLM/Slack 저장은 이력만 남기고 웹 사용자 메시지를 복제하지 않는다. 기본 context에는 최근 변경의 작은 목록을, 일반 get_more_data에는 목록/전체 전후 상세를 제공한다. 기준 변경에서 검색 범위와 시작 단계를 결정하는 것은 원본 회사 LLM이다.


### 초기 제외의 신중함과 전체 검증 (v39)

`company_requested_decisions_v39`는 원문 전체를 전달하는 v31 위에서 후보측 실무조건 질문과
선택지 설명을 같은 한국어 계약으로 명확히 한다. 언어·회사·지역별 분기는 없다. 후보가 밝힌
양보 불가능한 조건과 확인된 역할 조건의 충돌을 상세 평가 중단의 이유로 삼고, 선호·미확인·
조건부 가능성은 계속 평가한다. 다른 두 1차 질문과 2차 점수/라벨, 실제 선택 명령 실행은 유지한다.

실제 오판을 본 뒤 고른 32개 비교에서 선호 5개와 기존 대조17개의 목표 판정을 보존했지만,
명시 제한 10개 중3개는 1차의 모든 축에서 통과했다. 초기 단계의 과잉배제를 줄이는 목적의 변경이며
완벽한 hard-filter 성능을 입증한 것이 아니다. 그3개의 실제 2차·최종 원문 비교를 전체 v7에서
추적하며 1차 오류는 별도로 남긴다. Probability threshold, 지역·직군 규칙, label 후처리나 추가
추출 LLM으로 결과를 맞추지 않는다. 전체 v7의 raw/원장/의미 리뷰가 이 작은 사후 진단보다 우선한다.

### Decisions 입력 배치 이력 (v40, 현재 API 제한으로 해석하지 않음)

당시 문서·SDK 해석을 바탕으로 공통 정책을 질문별로 배치했다. 2026-10-23 다시 확인한
[공식 Decisions guide](https://developers.openai.com/api/docs/guides/decisions)는 `input`의
developer/system 메시지도 지원한다. 과거의 non-user role 미지원 설명은 현재 계약에 맞지 않는다.
`company_requested_decisions_v40`은 기존 공통 정책을 각 `question.instructions` 앞에 옮기고
원문만 user input으로 보낸다. 정책·개별 질문·choice·level·근거 순서는 바꾸지 않는다.
지원 모델은 현재 문서의 `gpt-6-luna`이며 별도 reasoning 옵션을 임의로 추가하지 않는다.

같은 동결 원문34+11개로 실제 API 형식과 현재 builder의 정확한 일치를 확인했다. 정책을 짧은
문구로 대체한 별도 대안은 명시적 제한 판정이 더 나빠 채택하지 않았다. 지원 형식을 고친 현재
안에도 회사 조건을 잘못 제외하거나 미확인을 conflict로 읽는 사례가 남아 있다. 이 변경은 API
배치 변경이며 scoring 정확도 완료를 뜻하지 않는다. 원문/축별 진단과 전체 v8 결과를
평가 registry에 별도로 남긴다.

### 2026-10-23 v60/v61 — 넓은 1차와 공통 원문 1회

1차는 추천·채용 판정이 아니라 2차로 넘겨 볼 가치가 있는지 판단한다. 기본은 continue이며,
명백히 다른 업무 또는 양측 원문으로 확인되는 중요한 실무조건 충돌만 제외한다. 역량의 정도,
세부 criteria 미충족, 선호 차이, 미확인 지원·이동 조건은 2차에 남긴다. 세 축의 명령과 기록 계약은
유지하며, 확률 임계값이나 직군·회사별 분기를 추가하지 않는다. 첫 실행에서 정보 미확인이
명확히 다른 업무까지 통과시키는 문제가 보여 v61은 업무 질문을 보완했다. 실제 경력이 충분히
기록돼 있고 주된 전문 업무가 다르며 관련 핵심 업무를 한 근거가 없다면 제외할 수 있다.
반대로 원문 자체가 빈약하거나 같은·인접 업무의 세부 충족도만 미확인이면 계속 평가한다.
어떤 일을 한 적이 전혀 없다는 명시 문장을 탈락의 필수조건으로 요구하지 않는다.

1·2차 모두 Decisions API를 유지한다. 공통 developer 정책과 user 근거를 각각 한 번 보낸다.
질문별 지침에는 판단 대상만 두며 실무조건 두 질문에 Brief·Memory를 다시 붙이지 않는다.
공통 원문은 현재 Hiring Brief, 현재 criteria, 실제 역할 제공 조건, 회사 소개·기존 공고,
회사 Memory, 전체 후보 Profile, 전체 Search Brief, 후보 Memory, 참고 Behavior Context로 구분한다.
원문은 자르거나 별도 LLM으로 추출하지 않으며, 수정 도구용 ref/id/revision만 scoring 행에서 뺀다.
거주지와 근무지의 구분, Memory의 범위·수정 시각은 보존한다. 2차 criterion 정의는 공통 근거에
한 번 두고 질문은 번호로 참조한다. 신규 요청의 원문·응답과 단계별 집계는
[실제 역할 읽기 전용 평가](../evaluation/company-agentic-role-search/READONLY-ROLES-V1.md)에 보존한다.
이 변경과 실험은 로컬 구현이며 운영 배포·운영 DB 변경을 뜻하지 않는다.


### v8에서 발견한 통합 이유·유지 후보 설명의 누락과 후속 보완

`evaluated`와 명시한 `talentIds`로 선택하는 요청은 회사의 선택을 실행하므로 selector를 다시
호출하지 않는다. v8 당시 3차는 TL;DR, Harper Note, 각 criterion의 근거·한계 및 fitness를 작성했지만,
별도의 통합 추천 이유는 생성하지 않았다. 따라서 이 경로의 평가 이력 `recommendationReason`과
matching review의 `reason`은 빈값이었다. 기존 추천을 새 기준으로 유지·갱신하면서 selector가 새로
선정하지 않은 경우에도 같은 빈값이 생겼다. 카드의 `selection_reason`에는 TL;DR을 저장했다.

실제 v8 ARS15의 2명은 기준별 점수·근거·미확인 사항과 TL;DR이 저장되었고 회사 답변이 이를
종합했지만, 모든 추천에 ‘추천 이유와 tradeoff를 묶은 텍스트’를 별도로 작성했다는 의미는 아니다.
v8의 이 요구는 부분 구현이었다. selector의 내부 판단 문장을 복사하거나 기존 점수의 당시 이유를
복원했다고 주장하는 방식으로 빈값을 메우지 않는다.

후속 수정은 요청 경로의 기존 3차 호출에 `recommendationReason` 한 문단을 추가한다. 같은 공개
경력·공유 가능한 Brief·역할 근거로 검토 가치와 중요한 tradeoff·미확인 요건을 새로 작성하고,
기존 `reason` 및 평가 이력·카드 presentation에 저장한다. TL;DR의 경력 사실 중심 목적과
정기 경로의 기존 네 출력 필드는 유지한다. selector 원문은 3차에 전달하지 않는다. 새 출력 계약은
presentation fingerprint에 포함되어 구 캐시와 구별되고, 캐시 복원도 작성된 통합 이유를 보존한다.

v8 ARS09에서는 새 1차만 평가된 기존 ready 1명이 최종 selector의 제외 명령 없이 유지되었지만,
refresh가 2차 행만 순회하여 설명을 갱신하지 않은 오류도 발견했다. 이후에는 같은 요청에서 새로
평가된 유지 ready를 1차 행까지 포함해 갱신한다. 명시적으로 제외된 후보, 회사 결정이 있는 후보,
이번 예산 밖에서 평가되지 않은 후보는 이 변경으로 갱신 대상에 추가하지 않는다. 현재 2차 기록이
없다면 새 기준의 설명과 fitness를 작성하되 숫자 점수·라벨·확률은 저장하지 않는다. 구 점수를
새 기준의 점수로 복사하지 않는다. 실제 v8 결과는 덮어쓰지 않으며 ARS15 두 명과 실제 누락 후보
한 명의 별도 보충 실험으로 변경 경로를 확인한다. 이 보완은 남은 scoring 의미 오류의 해결을
뜻하지 않는다.

위 유지 후보 1명의 별도 실제 보충에서는 현재 원문이 기존 1차 input fingerprint와 일치함을
확인한 뒤 3차를 1회 실행했다. 새 기준 6개의 설명과 통합 근거·tradeoff를 생성했고 숫자 점수·라벨·
확률을 만들지 않았다. 현재 거주와 향후 근무 수용·지원의 미확인을 구분했으며 전체 문장을 원문과
대조했다. 이 보충은 공통 refresh 포함 조건과 writer 입력·출력을 확인한 것이며, 원래 1차 판정을
바꾸거나 업무 표 발행을 다시 실행하지 않았다. 원본 v8 리뷰와 후속 보충 근거는 평가 registry에서
분리해 보존한다.
