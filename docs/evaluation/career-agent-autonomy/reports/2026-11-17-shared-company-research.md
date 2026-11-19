# A가 조사한 회사 정보를 B가 다시 읽는 과정

2026년 11월 17일, 공개 회사 자료의 저장과 재사용을 두 사용자로 검증했다. 회사 디렉터리와 자료가 비어 있는 로컬 PostgreSQL 17에 PostgREST를 연결했고, 실제 Career 모델과 Exa를 사용했다. 사용자와 개인 프로필은 테스트용이다. 운영 DB 반영과 기존 데이터의 일괄 이관은 별도 단계다.

## 브라우저에서 평소처럼 물은 경우

A와 B를 별도 로컬 계정으로 로그인시켜 각각 새 브라우저 세션을 열었다. A는 ‘채널톡에 지원할지 고민 중’이라며 제품, 2025년 1월 투자액과 투자사를 물었다. B는 ‘채널톡이 무슨 회사예요?’라고 시작해 같은 투자의 출처를 요청했다. 두 질문 모두 저장·캐시·도구 이름을 언급하지 않았다. 각 계정에서 Career 채팅 입력창에 질문을 넣고 Enter로 전송한 뒤 페이지를 새로고침해 답변과 출처 링크가 다시 보이는지 확인했다. [고정한 두 질문](../shared-company-browser-v1.json)

| 확인 항목 | A | B |
| --- | --- | --- |
| 실제 도구 호출 | `read_resources` → `web_search` 세 번 → `open_url` → `upsert_company` 한 번. `search_companies` 0회 | `read_resources` 두 번. 브랜드명으로 회사를 찾고 반환받은 참조로 `summary`와 `투자 유치`를 읽었다. |
| DB와 외부 요청 | 같은 회사 workspace에 `summary`와 `투자 유치` 두 행, 각각 공개 출처를 저장. Exa 요청 3회 | A가 만든 두 자료 ID와 본문이 실제 모델 입력에 포함됐다. Exa 요청 0회 |
| 화면과 개인 정보 | 개인 프로필에 넣은 합성 선호가 A의 실제 모델 입력에 포함됐다. | 새로고침 후에도 110억 원, 주도·참여 투자사 세 곳과 공식 발표 링크가 보였다. A의 개인 프로필 문구는 공유 행, B의 모델 입력·답변에 없었다. |

[브라우저 실행 판정](../runs/2026-11-17T09-18-19.900Z-company-browser/passed.json) · [A의 도구 인자와 호출 기록](../runs/2026-11-17T09-18-19.900Z-company-browser/A-observed.json) · [같은 workspace에 저장된 두 행과 원문](../runs/2026-11-17T09-18-19.900Z-company-browser/shared-rows.json) · [B의 실행 기록](../runs/2026-11-17T09-18-19.900Z-company-browser/B-observed.json) · [B의 마지막 모델 입력 전문](../runs/2026-11-17T09-18-19.900Z-company-browser/provider-1794907156190-ea92c46d-efed-461d-9db5-01d13f55d806-request.json) · [B의 채팅 화면](../runs/2026-11-17T09-18-19.900Z-company-browser/b-reply.png)

같은 입력을 채팅 런타임으로 직접 실행한 초기 시도에서는 A가 제품과 투자 자료를 남겼지만 B가 첫 응답에서 DB 조회와 웹 검색 두 번을 동시에 요청했다. 회사 정보를 묻는 일반 질문에서도 확보한 자료를 먼저 확인하도록 원본 모델 지침과 도구 설명을 수정했다. 브랜드 조회에서 찾은 후보에도 질문에 맞는 회사 자료와 공개 원문을 반환하게 고쳤다. 수정 뒤 독립 실행에서 A가 `summary`와 `투자`를 남겼고 B는 두 번의 DB 조회로 답했다. [수정 전 실제 응답](../runs/2026-11-17T09-07-11.101Z-shared-company/B-response-8.json) · [수정 후 독립 모델 실행](../runs/2026-11-17T09-16-47.717Z-shared-company/summary.json)

초기 브라우저 검증에서는 공식 발표 주소의 축약형에 `funding`이 없어 링크 검사가 실패했다. 두 주소가 같은 공식 기사 ID를 가리키는지와 B가 읽은 자료의 실제 원문 URL을 대조하도록 검사를 고쳐 재실행했다. [해당 실행의 링크와 모델 응답](../runs/2026-11-17T09-16-02.292Z-company-browser/B-observed.json)

새 DB를 만들고 두 계정의 채팅을 다시 실행했다. A가 선택한 label은 `summary`와 `투자`였다. A의 `search_companies` 호출은 0회, B의 `read_resources` 호출은 2회, B의 Exa 요청은 0회였다. 새로고침한 화면에서 다음 질문을 보낼 수 있는 상태까지 확인했다. [재실행 결과](../runs/2026-11-17T09-21-11.969Z-company-browser/passed.json) · [B의 실제 모델 입력](../runs/2026-11-17T09-21-11.969Z-company-browser/provider-1794907340391-d1a22faf-a9ce-468a-863b-ae42566e4be5-request.json) · [B가 화면에서 읽은 답변](../runs/2026-11-17T09-21-11.969Z-company-browser/b-answer.png)

## 저장을 명시한 요청

A는 채널톡의 회사 개요와 공식 투자 발표를 조사해 회사 자료로 남겨 달라고 했다. 다른 계정의 B는 브랜드명 ‘채널톡’으로 회사와 투자사를 물었다. B에게 A의 대화, 회사 ID, 자료 ID를 주지 않았다.

| 관찰 항목 | 결과 |
| --- | --- |
| A의 실행 | 실제 모델 `gpt-6.1-terra`가 공개 웹 조사 후 `upsert_company` 한 번에 `summary`와 `투자` 두 행을 저장했다. `search_companies` 0회, Exa HTTP 요청 5회 |
| DB | 서로 다른 행 두 개가 같은 `company_workspace_id`를 참조했다. 각 행의 `source_refs`는 실제로 읽은 공개 문서의 관측 ID를 담았다. |
| B의 실행 | `read_resources`, `search_resources(source=companies)`, `read_resources`를 실행했다. Exa와 외부 웹 도구 호출은 모두 0회였다. |
| B가 본 답변 | 채널코퍼레이션의 제품, 2025년 1월 13일 유치한 110억 원, 본엔젤스벤처파트너스·라구나인베스트먼트·알토스벤처스, 공식 발표 링크를 제시했다. A의 개인 근무 선호는 자료와 B의 답변에 없었다. |

[A에게 보낸 실제 모델 입력](../runs/2026-11-17T08-36-05.970Z-shared-company/A-request-1.json) · [두 사용자의 도구 인자와 결과](../runs/2026-11-17T08-36-05.970Z-shared-company/calls.json) · [저장 행](../runs/2026-11-17T08-36-05.970Z-shared-company/shared-rows.json) · [B의 마지막 모델 입력](../runs/2026-11-17T08-36-05.970Z-shared-company/B-request-16.json) · [외부 요청](../runs/2026-11-17T08-36-05.970Z-shared-company/network.json)

초기 두 실행에서는 B가 Exa를 한 번씩 더 호출했다. 실제 입력에 남아 있던 웹 검색 우선 지침을 수정했고, 브랜드명과 저장된 법인명이 다를 때 읽기 도구가 회사 자료의 본문에서도 후보를 찾게 했다. 자료에 언급된 회사라는 이유만으로 그 회사에 새 자료를 쓰지는 않는다. [첫 실행](../runs/2026-11-17T08-27-04.493Z-shared-company/summary.json) · [두 번째 실행](../runs/2026-11-17T08-33-32.395Z-shared-company/summary.json)

## DB 구조와 기존 서비스

같은 회사의 공개 자료는 그 회사의 `company_workspace` 한 곳에 모인다. 처음 구현은 회사마다 전용 workspace를 따로 만들었지만, 같은 날 후속 변경에서 공고가 쓰는 기존 workspace에 바로 저장하도록 바꿨다(아래 절). 각 자료는 `company_datas.company_workspace_id → company_workspace.company_workspace_id`로 연결된다. 개요(`summary`)는 회사당 한 행이다. 다른 label은 같은 회사에 같은 이름으로도 여러 건을 쌓을 수 있다. 공개 원문의 관측본 ID를 저장하므로 원문이 나중에 바뀌어도 읽었던 버전을 알 수 있다.

기존 `company_data`와 그 투자·보상·회사 관리 필드는 유지한다. 공개 개요에 같은 숫자가 적혀 있어도 구조화된 연봉이나 투자 필드의 확인일을 갱신하지 않는다. 조직 전용 정보를 공유 행으로 일괄 복사하지 않는다. 회사 자료의 외래키·동시성·조회 권한과 기존 writer 호환성은 모델 실행과 별도 DB 테스트로 확인한다. [저장소와 RPC](../../../../supabase/migrations/20261117123000_career_public_company_datas.sql) · [철회와 저장 제약](../../../../supabase/migrations/20261117124000_career_company_data_integrity.sql)

## 기존 서비스와 배포 순서 검증

회사 저장·철회·이전 스키마 호환 테스트 54개와 공고 검색·평가 등 관련 테스트 65개를 통과했다. 공개 회사 자료가 있는 DB에서는 같은 회사 공고가 여러 개여도 모델이 개요와 label 목록을 한 번만 받는다. 이전 DB에서 공개 자료 조회 함수가 없을 때도 원래 공고와 평가 결과를 읽을 수 있다. [공고 목록·회사 자료 검증](../../../../src/lib/career/matching/externalEvaluationResults.test.ts) · [공고 평가 입력 검증](../../../../src/lib/career/matching/externalSearch.test.ts)

- PostgreSQL 17에서 여덟 개의 독립 트랜잭션이 같은 회사에 개요 네 번과 서로 다른 소식 네 개를 동시에 쓰게 했다. 회사 한 곳, 대표 workspace 한 곳, 개요 한 행과 소식 네 행이 남았다. 원문 삭제와 동시에 읽는 경우도 검사했다. 철회 후 기존 참조로는 자료를 읽을 수 없었다.
- `company_data`를 읽는 회사 웹 설정과 급여 추정·입력 테스트 24개를 통과했다. Worker 단위 테스트 76개와 하위 검사 7개를 통과했고, PostgreSQL에서 급여·점수 칼럼 유무에 따른 기존 투자 읽기·쓰기도 실행했다. 공개 고용주를 확인하지 못한 공고와 사용자 전용 공고에는 회사 자료가 노출되지 않았다.
- 기존 데이터가 많은 DB에는 [온라인 인덱스 준비 SQL](../../../../scripts/prepareCareerCompanyIndexes.sql)을 psql 자동 커밋으로 먼저 실행하고 회사 자료 마이그레이션을 순서대로 적용한다. 이 스크립트는 workspace 표시를 추가한 뒤 기존 테이블의 인덱스를 동시에 생성한다. 회사와 workspace가 각각 1만 행인 로컬 DB에서 인덱스 생성 중 다른 세션의 workspace 등록이 성공했고 스크립트 재실행도 통과했다. 운영 트래픽에서의 잠금 대기 시간은 별도로 확인해야 한다.

## 회사 workspace 중심으로 바꾼 뒤의 확인

같은 날 저장 위치를 바꿨다. 이제 `company_datas`는 공고가 쓰는 기존 `company_workspace`에 붙는다. 운영 DB에서 활성 외부 공고가 있는 workspace 9,555곳 중 4,551곳에는 회사 웹사이트도 LinkedIn도 없었다. 이전 구조에서는 이런 회사의 자료를 저장해도, 공고에서 들어온 다른 사용자가 읽을 수 없었다. [마이그레이션](../../../../supabase/migrations/20261117160000_career_company_workspace_hub.sql)

- 이전 구조는 회사마다 이름 없는 전용 workspace를 하나씩 더 만들었다. 지금은 workspace가 없는 회사만 첫 저장 때 하나를 만든다. 나중에 디렉터리 항목이 생기면 링크가 같은 기존 workspace에 연결한다.
- 옛 `company_data`의 투자 필드는 웹 추천 점수 입력, Worker 추천·행동 맥락 입력, 기회 카드에서 뺐다. Worker는 투자 정보를 Exa로 검색하지 않는다. 평균 연봉 검색은 연봉 추정이 읽고 있어 유지한다.
- 갱신 기간이 지난 summary는 바로 보여 주고 응답 뒤에 갱신한다. 인용 중 일부가 저장된 출처와 맞지 않아도 맞는 출처로 저장하고, 본문의 `[n]` 표시는 원문 링크로 바꾼다.
- Exa 검색어에 한국어 검색어를 함께 넣었다. 같은 설정으로 비교하니 리턴제로는 영어 요약이 한국어 요약으로 바뀌었고, 한국 언론 출처가 1곳에서 3곳으로 늘었다. Notion 결과의 출처 구성은 비슷했다. 채널코퍼레이션은 두 검색어 모두 한국어 요약이었다.

실제 모델(`gpt-6.1-terra`)과 Exa로 A/B를 다시 실행했다. 저장을 요청한 경우와 평소처럼 물은 경우 모두, 두 자료가 한 workspace에 저장됐고 B의 Exa 호출은 0회였다. [평소 질문](../runs/2026-11-17T10-26-56.592Z-shared-company/summary.json) · [저장 요청](../runs/2026-11-17T10-27-48.107Z-shared-company/summary.json) · [도구 설명 수정 전 실행](../runs/2026-11-17T10-24-08.836Z-shared-company/summary.json)

summary의 목적을 도구 설명에 한 문장으로 넣기 전에는 A가 쓴 summary가 107~144자였다. 넣은 뒤에는 193자와 579자였다. 저장 요청 실행에서는 A가 `search_companies`를 한 번 호출해 기존 판정 기준 하나를 통과하지 못했다. 그 호출은 테스트용 DB 어댑터가 지원하지 않는 필터라 오류로 끝났다. B의 답변과 출처는 맞았다.
