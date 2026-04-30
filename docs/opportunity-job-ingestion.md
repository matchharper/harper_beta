# 채용 공고 검색 및 업데이트

이 문서는 유저에게 추천할 채용 공고를 DB에 넣고 최신 상태로 유지하는 방법만 다룬다. 유저별 추천 랭킹, 채팅 UI, 인터뷰 준비 기능은 여기서 제외한다.

## 목적

목표는 두 가지다.

1. 우리가 이미 알고 있는 회사의 채용 페이지를 다시 확인해서 `company_roles`를 최신화한다.
2. 유저가 새 조건을 말했을 때, 기존 DB에 없는 범위의 공고를 추가로 찾고 그 범위를 이후 업데이트 대상에 포함한다.

예를 들어 유저가 “Engineer 말고 GTM으로 찾아줘”라고 하면, 그 순간에만 검색하고 끝내지 않는다. `GTM`, `Korea`, `AI startup` 같은 검색 범위를 저장해두고, 다음 공고 업데이트 때도 그 범위를 다시 본다.

## 핵심 테이블

`company_workspace`

회사 정보다. 회사명, 홈페이지, career URL, 설명, 로고를 가진다.

`company_roles`

실제 채용 공고 DB다. 유저에게 추천되는 대상은 최종적으로 이 테이블의 row다.

`opportunity_source_registry`

반복해서 확인할 채용 소스 목록이다.

예:

```text
Toss careers URL
OpenAI Ashby URL
Stripe Greenhouse URL
어떤 회사의 /careers 페이지
```

이 테이블은 “어디를 다시 볼지”를 관리한다.

`opportunity_market_scan_scope`

아직 특정 회사 URL로 고정되지 않은 검색 범위다.

예:

```text
GTM AI startup Korea jobs
ML Engineer Seoul Ashby
Product Designer Korea Wanted
```

이 테이블은 “어떤 범위를 더 찾아볼지”를 관리한다.

`opportunity_source_document`

fetch한 원문 기록이다. 같은 URL을 다시 봤을 때 내용이 바뀌었는지, fetch가 실패했는지 확인하기 위해 둔다.

`opportunity_ingestion_run`

공고 업데이트 작업 1회 실행 기록이다. 몇 개 소스를 봤고, 몇 개 공고를 저장했고, 몇 개를 닫았는지 남긴다.

## 현재 구현된 전체 공고 업데이트 흐름

실제 fetch, parsing, upsert, stale close 처리는 `harper_worker/opportunity_worker.py`가 한다.
`harper_beta`는 내부 endpoint에서 `opportunity_ingestion_run` row를 만들고 worker 실행 명령을 안내하는 얇은 enqueue 역할만 한다.

수동 실행 endpoint:

```text
POST /api/internal/opportunity-ingestion/run
```

실행하면 아래 순서로 돈다.

1. `OPPORTUNITY_CRON_SECRET` 또는 `CRON_SECRET`으로 내부 요청인지 확인한다.
2. `opportunity_ingestion_run`을 만든다.
3. 응답으로 받은 run id를 worker에서 처리한다.

```bash
cd harper_worker
python opportunity_worker.py ingestion --run-id <run-id> --limit 100
```

worker가 처리하면 아래 순서로 돈다.

1. `company_workspace.career_url`이 있는 회사들을 `opportunity_source_registry`에 등록한다.
2. `opportunity_source_registry`에서 `enabled = true`이고 `blocked`가 아닌 소스를 가져온다. `scheduled_refresh`는 `next_refresh_at`이 지난 것만 보고, `manual_admin_refresh`는 상위 `limit`개를 강제로 본다.
3. 각 소스 URL을 fetch한다.
4. HTML 안에서 `job`, `career`, `position`, `채용`, `공고` 같은 링크를 찾는다.
5. 링크의 상세 페이지를 fetch한다.
6. title, description, location, employment type, source URL을 추출한다.
7. `company_workspace`와 `company_roles`에 upsert한다.
8. `opportunity_market_scan_scope`가 있으면 Brave Search API로 후보 URL을 찾고 같은 방식으로 정규화한다. scheduled run에서는 `next_refresh_at`이 지난 scope만 본다.
9. 오래된 external role은 `closed`로 바꾼다.

worker가 직접 수동 run을 만들고 바로 처리할 수도 있다.

```bash
cd harper_worker
python opportunity_worker.py create-ingestion --limit 100 --process
```

worker가 주기적으로 전체 공고 업데이트 run을 생성하고 처리하게 하려면 poll loop를 다음처럼 실행한다.

```bash
cd harper_worker
python opportunity_worker.py poll --schedule-ingestion --ingestion-interval-hours 24 --ingestion-limit 100
```

## Brave Search가 정확히 하는 일

Brave Search는 브라우저로 Brave를 여는 것이 아니다. Google 검색을 자동화하는 것도 아니다.

서버에서 Brave Web Search API에 검색어를 보내고, 검색 결과 URL 목록을 받는 것이다.

예:

```text
query = "GTM AI startup Korea jobs"
```

API 응답:

```text
https://company-a.com/careers/gtm
https://jobs.ashbyhq.com/company-b/...
https://www.linkedin.com/jobs/view/...
```

그 다음 Harper 서버가 각 URL을 직접 fetch해서 공고인지 확인한다.

중요한 점:

- Brave Search는 “후보 URL을 찾는 도구”다.
- Brave Search가 공고를 구조화해주는 것은 아니다.
- 검색 결과에는 블로그, 오래된 글, 회사 소개 페이지도 섞일 수 있다.
- LinkedIn/Wanted/JobKorea처럼 JS나 로그인, 차단이 강한 사이트는 fetch해도 제대로 못 읽을 수 있다.

그래서 Brave Search는 주력 수집 방식이 아니라 fallback이다.

## `opportunity_market_scan_scope`가 있을 때 실제 흐름

예를 들어 이 row가 있다고 하자.

```text
provider = search_api
query = "GTM AI startup Korea jobs"
role_family = "GTM"
location = "Korea"
company_archetype = "AI startup"
```

공고 업데이트 worker는 이렇게 처리한다.

1. `opportunity_market_scan_scope`에서 이 row를 읽는다.
2. `query`를 Brave Search API에 보낸다.
3. 검색 결과 URL 목록을 받는다.
4. 각 URL을 fetch한다.
5. 페이지 텍스트에 `GTM` 관련 내용이 있는지 확인한다.
6. 조건에 맞으면 `opportunity_source_document`에 원문을 저장한다.
7. 공고 형태로 정규화해서 `company_roles`에 넣는다.

현재 구현은 여기까지다.

## 현재 구현의 한계

현재는 provider별 전용 parser가 없다.

즉 `provider = wanted`라고 적혀 있어도 Wanted API나 Wanted 전용 parser를 쓰는 것이 아니다. 지금은 search query 또는 public page fetch 중심이다.

현재 방식으로 잘 되는 케이스:

- 회사의 공개 career page
- Greenhouse/Ashby/Lever처럼 HTML에서 공고 내용을 읽기 쉬운 페이지
- 검색 결과에 직접 JD URL이 노출되는 경우

현재 방식으로 약한 케이스:

- LinkedIn
- Wanted
- JobKorea
- Saramin
- JS 렌더링이 필요한 페이지
- 로그인 또는 bot 차단이 있는 페이지

## 더 효율적인 최종 구조

최종 구조는 `opportunity_source_registry` 중심이어야 한다.

검색은 매번 넓게 돌리는 것이 아니라, 좋은 source를 발견하기 위한 초기 탐색으로 쓴다.

권장 흐름:

1. 먼저 `company_roles`에서 기존 DB를 검색한다.
2. 부족하면 `opportunity_source_registry`의 관련 source를 fetch한다.
3. 그래도 부족하면 `opportunity_market_scan_scope`로 외부 검색을 한다.
4. 검색 결과에서 좋은 source를 찾으면 `opportunity_source_registry`에 등록한다.
5. 다음 업데이트부터는 검색 API가 아니라 등록된 source를 직접 fetch한다.

예:

```text
유저 요청: "GTM으로 찾아줘"
scope 저장: "GTM AI startup Korea jobs"
Brave Search 결과: jobs.ashbyhq.com/company-b
source_registry 등록: company-b Ashby URL
다음 업데이트: company-b Ashby URL 직접 fetch
```

이렇게 해야 매번 검색 API를 많이 쓰지 않고, 안정적인 source를 반복 업데이트할 수 있다.

## 지금 바로 추가해야 하는 개선

1. `opportunity_market_scan_scope` 결과에서 좋은 ATS/career URL을 발견하면 `opportunity_source_registry`에 승격한다.
2. Greenhouse, Ashby, Lever는 provider별 adapter를 먼저 만든다.
3. Wanted, JobKorea, Saramin은 공식/허용 가능한 접근 방식이 있는지 확인한 뒤 별도 adapter로 붙인다.
4. `next_refresh_at <= now()` 필터를 적용해서 수동 업데이트라도 due source만 돌릴 수 있게 한다.
5. source별 실패 횟수를 저장해서 계속 실패하는 URL은 자동으로 우선순위를 낮춘다.

## 정리

현재 구현은 다음 수준이다.

```text
known company career_url 업데이트
+ 저장된 검색 scope를 Brave Search로 보충
+ 읽힌 페이지를 company_roles에 저장
+ 오래된 external role 닫기
```

최종적으로 가야 하는 구조는 다음이다.

```text
검색 scope는 새 source 발견용
반복 업데이트는 source_registry 중심
공고 저장은 company_roles 중심
추천은 company_roles를 기반으로 별도 실행
```
