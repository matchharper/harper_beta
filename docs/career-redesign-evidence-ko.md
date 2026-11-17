# Career 재설계의 현재 근거

2026-11-12 조사. [작업 계획](career-redesign-work-plan-ko.md)에 따라 Notion 원문, 로컬 코드, 연결된 Harper DB의 집계와 일부 실제 대화 출력을 확인했다. 제품 변경은 실행하지 않았다.

## 1. 이번 조사가 바꾼 판단

**현재 Harper는 회사 추천·웹 조사·연락·후속 작업을 전혀 못 하는 제품이 아니다. 하지만 이미 있는 능력이 넓은 탐색, 사용자별 조사, 조작 가능한 화면으로 충분히 연결되어 있지도 않다.** 따라서 자유로운 agent를 처음부터 다시 만드는 안과 회사 카드만 추가하는 안 모두 불충분하다.

- 보유 회사 수와 Career가 회사 발견에 활용하는 범위가 크게 다르다. 회사 DB에는 318,558개 행이 있지만 `search_companies`는 workspace의 이름·LinkedIn URL 조회다.
- 공고 검색은 검색된 후보의 평가까지 묶여 있다. 많은 후보를 저렴하게 훑어보고 필요한 것만 추가 조사하는 용도와 계약이 다르다.
- 실제 대화에서 이미 웹을 통해 공고 밖의 회사를 찾아 설명한다. 그러나 채팅의 회사 설명이 공고와 동등하게 탐색·비교·후속 처리되는 화면 객체로 연결되는 것은 아니다.
- 자료·기억·일반 작업·예약·Gmail·브라우저는 이미 있다. 이를 새로 추가하는 안으로 사용자 가치 증가를 설명하면 중복 투자다. 접근이 막힌 시점, 실제 빠진 외부 능력, 실행 입력의 좁은 전제를 구분해야 한다.

## 2. 운영 DB에서 직접 확인한 규모

연결 프로젝트 Harper(`zzojrniuppueizhnmqfd`)에서 읽기 전용 SQL로 확인했다. 아래는 2026-11-12 조회 시점의 정확한 행 수다. 사용자·회사 실체의 중복 제거 결과나 최신성 검증 결과는 아니다.

| 대상 | 관측값 | 설계에 주는 의미 |
| --- | ---: | --- |
| `company_db` 전체 | 318,558 | 공고가 없어도 시작할 수 있는 회사 원본이 이미 있음 |
| description 또는 short_description이 비어 있지 않은 회사 | 53,330 | 약 16.7%만 이 설명 필드가 채워짐. 전체 DB에 의미 검색을 붙이는 것만으로 풍부한 시장 조사가 되지 않음 |
| website_url이 있는 회사 | 52,566 | 주소·원문 확보 자체가 필요한 대상도 많음 |
| `company_workspace` 전체 | 30,141 | Career의 현재 회사 이름 조회 대상 |
| company_db_id가 연결된 workspace | 20,751 | 회사 원본과 workspace가 같은 개념도, 완전한 일대일 목록도 아님 |
| company_roles 행이 하나도 없는 workspace | 17,500 | 현재 내부 목록에도 공고 없는 회사가 존재함 |
| `candid` 전체 | 365,185 | 사람 정보 자산이 존재함 |
| email이 비어 있지 않은 candid 행 | 307,517 | 연락처의 존재만 확인. 현재 담당자·정확한 주소·Career 공개 가능 정보임을 뜻하지 않음 |
| LinkedIn URL이 있는 candid 행 | 291,349 | 사람 식별과 출처 연결의 출발점 |
| unfollowed_at이 없는 회사 follow | 78 | 회사 팔로우는 이미 저장·사용되는 기능 |

외부 Role 중 `status=active AND is_expired=false`인 행은 127,983개, 연결 workspace는 9,400개였다. 이 조건은 날짜·사용자 설정 등 전체 노출 자격을 대신하지 않는다. 이 수치와 회사 DB 규모를 혼동해서는 안 된다.

처음 확인한 `pg_stat_user_tables.n_live_tup`은 일부 테이블에서 실제 수와 크게 달랐다. 위 수치는 해당 메타데이터 추정치가 아니라 후속 `count(*)` 결과다.

### 재확인 가능한 대표 쿼리

```sql
select count(*) as total,
       count(*) filter (where nullif(btrim(description), '') is not null
                         or nullif(btrim(short_description), '') is not null) as described,
       count(*) filter (where nullif(btrim(website_url), '') is not null) as with_website
from public.company_db;

select count(*) as total,
       count(*) filter (where nullif(btrim(email), '') is not null) as with_email,
       count(*) filter (where nullif(btrim(linkedin_url), '') is not null) as with_linkedin
from public.candid;

select count(*) from public.company_workspace w
where not exists (
  select 1 from public.company_roles r
  where r.company_workspace_id = w.company_workspace_id
);
```

## 3. 실제 사용 기록에서 확인한 것

### 검색과 평가가 결합된 규모

조회 시점 이전 14일의 `external_recommendation_runs` 중 `variant=career_agent`, `surface=search`, `status=completed`인 6,728건에서 저장된 candidate ID 수는 평균 229.1개, evaluation ID 수도 평균 229.1개였다. 후보 수 범위는 0~631개였다. 명시적 Role 지정 경로와 기간 중 코드 버전이 있으므로 최대값을 현재 plan 검색 상한 위반으로 해석하지 않는다.

이 집계는 비용 측정이 아니다. 평가 ID에는 재사용 결과도 포함될 수 있다. 테스트·내부 실행을 제외하거나 고유 사용자 수를 집계하지 않았으므로 사용자 전체의 행동 비율이나 성과로 사용하지 않는다. 다만 실제 저장 경로에서도 후보 확보와 평가가 밀접하게 연결되어 있음을 확인한다.

### 도구 호출의 분포

이전 7일의 저장된 chat/mail turn record에 기록된 호출은 `web_search` 3,615회, `open_url` 2,288회, `use_browser` 1,858회, `search_opportunities` 838회였다. `search_companies` 16회, `follow_company` 4회도 확인했다. `write_email` 23회, `manage_work` 1,126회, `upsert_schedule` 45회가 기록돼 있다.

이는 해당 기록 형식에 남은 호출 집계다. 모든 채널의 총량·고유 사용자·성공적인 가치 전달 횟수가 아니다. 호출 수가 적다고 수요가 없다고 결론 내릴 수 없고, 웹 호출 수만으로 낭비라고 판단할 수도 없다.

### 실제 대화 두 건의 요청과 출력

설계에 필요한 범위만 읽고 개인 이력과 원문은 이 문서에 복사하지 않았다. 두 건은 표본 통계가 아니라 현존 능력과 연결 공백을 확인하는 사례다.

| 관측 | 확인한 동작 | 여기서 주장할 수 없는 것 |
| --- | --- | --- |
| 11월 12일 저녁, 이전에 이야기한 서비스와 비슷한 회사 탐색 요청 | 웹 검색·페이지 읽기·사용자 맥락 읽기를 통해 여섯 회사를 설명. 제품 차이, 사용자 경험과의 연결, 채용 정보의 불확실성을 다룸 | 회사 추천이 전혀 불가능하다는 주장. 반대로 여섯 곳이 시장 최선이라는 주장도 불가 |
| 같은 날 오후, 국내 시장 확장 중인 다른 회사 탐색 요청 | 도구 결과 38개를 거쳐 공고 한 곳과 지켜볼 회사 두 곳을 구분. 회사 조회·공고 검색·공고 저장·할 일 관리도 사용 | 호출이 모두 불필요했다는 주장. ‘지켜볼 회사’라는 설명만으로 실제 follow가 저장됐다는 주장도 불가 |

두 번째 턴의 기록에는 `follow_company` 호출이 없었다. 사용자가 follow를 요청했거나 이 턴에서 반드시 등록해야 했다는 뜻은 아니다. **자연어 제안, 저장된 관심, 향후 실행은 서로 다른 제품 효과**라는 점을 확인하는 근거다.

## 4. 로컬 코드에서 확인한 제약과 기존 능력

아래는 현재 checkout의 동작이다. 운영 배포 revision과 전부 대조한 결과는 아니다. 운영 집계와 구분해서 읽는다.

| 경로 | 확인한 사실 | 실제 변경이 필요한 지점 |
| --- | --- | --- |
| [회사 검색](../src/lib/career/companies/server.ts) | `searchCareerCompanies`는 `company_workspace` 이름·LinkedIn 문자열 조회. 20개씩 페이지 처리. `company_db` 전체의 사업·수요·팀 특성 검색이 아님 | 회사 발견을 이름 조회와 분리. 기존 회사 원본과 외부 탐색을 사용할 검색 경로 |
| [공고 검색 입력](../src/lib/career/matching/searchPlan.ts), [실행](../src/lib/career/matching/externalSearch.ts) | 직함·키워드·국가 등의 plan으로 Role 검색. 기본 평가 수 400, plan 경로는 최대 500. 확보 후보에 scoring input을 만들고 캐시 확인 후 평가 | 후보 검색·열람과 평가를 따로 호출할 수 있게 변경. 평가를 없애거나 숫자 상한만 높이는 것으로 해결되지 않음 |
| [기회 도구](../src/lib/career/matching/tools.ts), [도구 설명](../src/lib/llm/toolDescriptions.ts) | 검색과 게시가 별개. 외부 기회 게시에 evaluation ID가 항상 필수는 아님. 외부 공고 URL 저장 경로도 존재 | ‘모든 표시가 점수에 막혀 있다’고 진단하지 않음. 대상·조회 경로와 화면의 Role 의존을 바꿀 것 |
| [능력 목록](../src/lib/career/capabilities/registry.ts) | 웹, 폼, 자료, 맥락, 작업 위임, 예약, Gmail, 브라우저, 회사 agent 연락, 회사 팔로우가 존재. Career callable 목록에 일반 candid 검색·회사 원본 의미 탐색·범용 사실 보강은 없음 | 실행기 재개발 대신 빠진 데이터 접근과 보강 능력 추가. 기존 회사 연락은 임의 외부 담당자 찾기와 구분 |
| [첫 대화 조립](../src/lib/career/prompts/conversationPlan.ts), [능력 진입](../src/lib/career/capabilities/server.ts), [Gmail 선택](../src/lib/career/gmailToolSelection.ts) | 온보딩 완료 여부가 일반 capability 경로와 Gmail 노출을 가름 | 사용자 정보가 부족한 것과 작업 능력을 사용할 수 없는 것을 분리 |
| [application guide](../src/lib/career/handbooks/application.ts), [실제 등록](../src/lib/career/handbooks/registry.ts) | 등록된 `APPLICATION_HANDBOOK`에는 공고 탐색 최대 3회, 기본 이메일 우선 조사·두 경로 준비 지침이 있음. 완화된 `APPLICATION_HANDBOOK2`의 존재만으로 적용됐다고 볼 수 없음 | 활성 원본의 과도한 순서·횟수 지침을 수정. 다른 상위 prompt에 반대 지침을 덧붙이지 않음 |
| [inline UI](../src/lib/career/inlineUi.ts) | forms·matching·Role ID 기반 opportunities·brief·meetings·automations·actions의 정해진 참조 계약 | 일반 결과 집합, 사용자별 표시 구성, 선택 이벤트의 계약 추가 |
| [새 기회 목록](../src/components/career/history/NewOpportunityList.tsx) | 추천 시각 순으로 정렬 후 internal/external 구분, 동일 카드 renderer | 회사·사람·비교 결과 등을 같은 목적 화면에 구성할 경로 |
| [상세 화면](../src/components/career/history/HistoryOpportunityDetailContent.tsx) | 내용은 조건부지만 헤더·Role 요약·Harper 메모, 회사/출처·하는 일 등의 구성이 컴포넌트에 정해져 있음 | 사용자가 결정해야 하는 질문에 맞춰 정보·근거·비교 순서를 구성할 경로 |
| [회사 follow](../src/lib/career/companies/server.ts) | directory에 없는 이름도 저장. 지시·날짜와 연결된 외부 공고/기존 내부 추천을 정기 확인에 전달 | 회사 팔로우를 신규 기능처럼 제안하지 않음. 어떤 변화와 후속 일을 살필지는 기존 위임·예약을 활용 |
| [브라우저](../src/lib/career/browser/tool.ts), [Gmail 발송](../src/lib/career/emailWriting/tool.ts) | 브라우저 `role_refs`는 선택이고 Gmail도 Role을 요구하지 않음. 브라우저 capability와 하위 task 조립에는 지원 양식/검토 중심 안내가 들어감 | 실제로 좁은 지침을 고치되 범용 실행기가 없다고 진단하지 않음 |

UI는 이 조사에서 소스로 확인했다. 브라우저에서 새로운 UI를 렌더링하거나 사용성 검증을 수행한 결과가 아니다.

## 5. 외부 자료에서 채택할 것과 유보할 것

[사용자가 지정한 Notion 기획](https://app.notion.com/p/4167277d26df818ab5ccc7e3c0edbd48)은 실제 답장·연결·결과까지 돕는 의도를 보여 준다. 그 안의 채널 순위, 고정 작업 순서, 보장 표현, retention 수치는 이번 조사로 검증한 보편 규칙이 아니다. 직접 연락이나 소개가 모든 사용자에게 최선이라는 전제로 설계하지 않는다.

현재 공식 [Exa Agent 문서](https://exa.ai/docs/agent/quickstart)는 비동기 목록 수집·정보 보강·조사, 구조화 결과와 출처·비용 정보를 제공하는 API를 설명한다. [Websets 문서](https://exa.ai/docs/websets/quickstart)는 신규 목록/보강 작업에 Agent를 안내하고, 기존 Websets의 별도 과금과 대량 작업 지연을 설명한다. 따라서 외부 대량 조사는 구현 가능한 선택지다. Harper의 데이터·언어·대상에서 품질이나 단가가 검증된 것은 아니므로 특정 서비스로 즉시 전면 교체하지 않는다.

[AI SDK의 generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)는 도구 결과와 React renderer를 연결하는 방식을, [Google A2UI](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)는 클라이언트 컴포넌트를 agent가 조합하는 표현 계약을 설명한다. 참고할 원리는 데이터·표현·실행을 분리하는 것이다. 패키지를 도입하면 Harper의 정보 접근과 판단까지 개선된다는 근거는 아니다.

## 6. 남은 확인 범위

- 31만 회사 중 실제 검색 가능한 사업 정보의 질·언어 분포·중복·최신성. 설명 존재 수로 대체할 수 없다.
- 검색 재현율, 중요한 대안을 빠뜨리는 정도, 대량 조사의 지연·실제 과금. 새로운 검색/보강 경로로 측정해야 한다.
- candid 각 필드의 출처·사용 목적·공개 가능 범위. 보유 이메일 수를 사용자에게 제공 가능한 연락처 수로 계산하지 않는다.
- 실제 사용자 전체가 원하는 도움의 분포와 각 접근의 성과. 두 대화와 도구 호출 빈도로 결정하지 않는다.
- 모델이 새로운 도구·표현·지식을 받아 낯선 문제에서 더 좋은 방법을 선택하는지. 이번 작업의 설계 검토는 모델 실험이 아니다.

이 불확실성은 설계를 멈출 이유가 아니라, 첫 구현에서 어떤 경험을 만들고 무엇을 측정할지 정하는 입력이다.
