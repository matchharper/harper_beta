# Company Snapshot Implementation

이 문서는 `/career`에서 회사 뒷조사 성격의 `company snapshot` 기능을 구현하는 방식을 정리한다.

현재 코드베이스에는 이미 아래 뼈대가 있다.

- `company_snapshot` 테이블: `harper_beta/supabase/migrations/20260421_company_snapshot.sql`
- 회사 조사 setup / start API: `harper_beta/src/lib/career/companySnapshot.ts`
- 회사 조사 시작 route: `harper_beta/src/app/api/talent/company-snapshot/start/route.ts`
- 채팅 tool 연결: `harper_beta/src/app/api/talent/chat/route.ts`
- 채팅 UI setup panel: `harper_beta/src/components/career/chat/CareerTimelineSection.tsx`

하지만 실제 조사 로직인 `runCompanySnapshotResearch()`는 아직 비어 있다.  
즉, 이 기능은 새로 만드는 것보다 기존 뼈대 위에 조사 엔진을 붙이는 작업에 가깝다.

## TL;DR

내가 구현한다면 이렇게 간다.

1. 버튼은 프론트에 추가한다.
2. 실제 조사와 저장은 백엔드에서 한다.
3. 공용 회사 정보와 회원별 fit 평가는 분리한다.
4. 조사 엔진은 "완전 자유형 agent"가 아니라 "bounded agent + deterministic pipeline"으로 만든다.
5. `company_snapshot`은 회사 공용 캐시로 쓰고, fit positive/negative는 조회 시점에 회원 프로필을 얹어 계산한다.

가장 중요한 결정은 이것이다.

- 회사 공용 정보: `company_snapshot`에 저장
- 회원별 해석: 저장하지 않거나, 필요할 때만 별도 캐시

이걸 섞으면 재사용성이 깨진다.

## 왜 백엔드인가

이 기능은 프론트에서 돌리면 안 된다.

- Google/Brave/Apify/Crunchbase/LinkedIn 관련 키를 클라이언트에 노출하면 안 된다.
- 검색, 본문 수집, dedupe, fallback, retry, timeout 제어는 서버가 맡아야 한다.
- 같은 회사를 여러 회원이 눌러도 한번 조사한 결과를 재사용해야 한다.
- 조사 시간이 길어질 수 있어서 UI는 얇게 두고, 실행 상태는 백엔드가 관리해야 한다.
- 출처, confidence, 실패 원인, API quota 같은 운영 정보는 서버 로그와 DB에 남겨야 한다.

결론은:

- 버튼/상태표시/UI는 프론트
- 조사/검증/구조화/저장은 백엔드

## 지금 코드 기준으로 어디에 붙일지

### 1. 버튼 위치

가장 자연스러운 진입점은 이미 유저가 말한 그 위치다.

- `harper_beta/src/components/career/history/OpportunityDetailModal.tsx`

현재 여기에는 이미 `모의 인터뷰` 버튼이 있다.  
같은 줄에 `회사 조사` 버튼을 추가하면 된다.

권장 동작:

1. 유저가 opportunity detail modal에서 `회사 조사` 클릭
2. modal 닫기
3. chat tab 열기
4. `onStartCompanySnapshot({ companyName, reason })` 호출
5. chat timeline 안에 `회사 조사 준비/진행/결과` 메시지 표시

즉, 모의 인터뷰와 같은 UX 패턴을 재사용한다.

### 2. 현재 회사 조사 엔트리

이미 연결된 서버 진입점은 있다.

- `harper_beta/src/app/api/talent/company-snapshot/start/route.ts`
- `harper_beta/src/lib/career/companySnapshot.ts`

현재 흐름:

1. 회사명과 conversation id를 받는다.
2. 최근 snapshot이 있으면 재사용한다.
3. 없으면 `runCompanySnapshotResearch()`를 호출한다.
4. 결과를 `company_snapshot`에 저장한다.
5. assistant message를 conversation에 남긴다.

문제는 3번이 아직 비어 있다는 점이다.

## 제품 목표

유저가 회사 하나를 눌렀을 때 아래 정보를 빠르게 얻어야 한다.

- 회사 설명
- fundraising 기록
- headcount 변화
- 매출 기록
- 구성원 배경 요약
- 최근 중요 뉴스 1~3개
- 회사의 좋은 점
- 회사의 문제점 예측
- 회원과의 fit positive
- 회원과의 fit negative

이 중 앞의 8개는 회사 공용 정보다.  
마지막 2개만 회원별 정보다.

## 가장 중요한 설계 원칙

### 1. 공용 snapshot과 회원별 fit를 분리

`company_snapshot`은 여러 회원이 재사용할 수 있어야 한다.

그런데 아래 항목은 회원마다 달라진다.

- `[회원]과의 적합성 - Positive`
- `[회원]과의 적합성 - Negative`

따라서 이 두 항목을 `company_snapshot.content`에 영구 저장하는 것은 좋지 않다.

권장 방식:

- `company_snapshot.content`: 회사 공용 리서치만 저장
- `buildCompanySnapshotMemberFit(...)`: snapshot + 회원 프로필을 받아 실시간 생성

아주 필요해지면 나중에 아래 별도 캐시를 추가할 수 있다.

- `company_snapshot_member_fit(snapshot_id, user_id, positive, negative, created_at)`

하지만 1차 구현에서는 이 테이블 없이 가는 것이 맞다.

### 2. 완전 자유형 agent 대신 bounded agent

유저는 agentic하게 만들고 싶다고 했지만, 구현은 아래처럼 하는 것이 좋다.

- 검색어 생성: LLM
- 검색 실행: deterministic
- 링크 선택 및 분류: LLM + rules
- 본문 수집: deterministic
- 구조화: LLM JSON mode
- fit 생성: LLM

즉, agent는 쓰되 도구 사용 횟수와 단계는 고정한다.

이유:

- 디버깅이 쉽다
- 비용 통제가 된다
- timeout을 관리하기 쉽다
- hallucination을 줄이기 쉽다
- 나중에 source quality를 통제하기 쉽다

내 권장안은 "pipeline inside an agent", "agent over everything"이 아니다.

## 데이터 모델

### 현재 테이블

이미 있는 테이블:

```sql
public.company_snapshot (
  id uuid primary key,
  company_db_id integer null,
  company_name text not null,
  normalized_company_name text not null,
  content jsonb not null,
  source_urls jsonb not null,
  status text not null,
  error_message text null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)
```

이 구조는 1차 구현에 충분하다.  
처음부터 테이블을 크게 바꾸지 말고 `content` JSON 스키마를 명확히 잡는 것이 더 중요하다.

### 권장 `content` 스키마

```json
{
  "schemaVersion": 1,
  "summaryMarkdown": "### 회사 한줄 요약\n...\n\n### 최근 뉴스\n...",
  "companyDescription": {
    "text": "이 회사는 단순히 무엇을 만드는지가 아니라...",
    "confidence": "high",
    "sourceIds": ["src_1", "src_3"]
  },
  "fundraiseHistory": [
    {
      "date": "2024-05-01",
      "round": "Series B",
      "amount": "$35M",
      "investors": ["A", "B"],
      "sourceIds": ["src_4"]
    }
  ],
  "headcount": {
    "currentRange": "51-200",
    "trendSummary": "최근 12개월 기준 증원 신호가 보인다.",
    "signals": [
      {
        "type": "linkedin_size",
        "value": "51-200",
        "sourceIds": ["src_2"]
      },
      {
        "type": "internal_recent_join_count",
        "value": 7,
        "sourceIds": []
      }
    ],
    "confidence": "medium"
  },
  "revenue": {
    "summary": "공개 매출 숫자는 확인되지 않았다.",
    "amount": null,
    "period": null,
    "confidence": "low",
    "sourceIds": []
  },
  "teamComposition": {
    "schoolSignals": ["Stanford", "KAIST"],
    "previousCompanySignals": ["Google", "Meta", "Naver"],
    "summary": "초기 AI/infra 인력 비중이 높고 빅테크 출신 비율이 보인다.",
    "confidence": "medium",
    "sourceIds": ["src_2", "src_5"]
  },
  "recentNews": [
    {
      "date": "2026-03-10",
      "headline": "...",
      "summary": "...",
      "sourceIds": ["src_8"]
    }
  ],
  "strengths": [
    {
      "point": "제품/시장 포지셔닝이 선명하다.",
      "sourceIds": ["src_1", "src_6"]
    }
  ],
  "risks": [
    {
      "point": "채용 포지션 대비 조직 구조가 아직 불안정할 수 있다.",
      "sourceIds": ["src_4", "src_7"]
    }
  ],
  "sources": [
    {
      "id": "src_1",
      "url": "https://...",
      "title": "...",
      "domain": "company.com",
      "publishedAt": "2026-03-10",
      "sourceType": "official_blog",
      "accessMethod": "web_search",
      "quality": "high"
    }
  ]
}
```

핵심은:

- 화면에 보여줄 텍스트만 저장하지 않는다.
- sourceIds까지 저장한다.
- confidence를 저장한다.
- 매출처럼 없는 데이터는 `unknown/null`로 남긴다.

## 추천 아키텍처

### A. 1차 구현: 동기식 backend path

이 방식은 가장 빨리 붙일 수 있다.

1. `/api/talent/company-snapshot/start`
2. 최근 snapshot cache 조회
3. 없으면 즉시 조사 실행
4. `company_snapshot` 저장
5. summary markdown을 assistant message로 반환

장점:

- 구현이 빠르다
- 기존 코드와 가장 잘 맞는다
- 별도 worker가 필요 없다

단점:

- 검색/스크래핑/API fallback이 많아지면 route가 느려진다
- timeout 위험이 있다
- provider 지연이 UI 체감으로 바로 온다

언제 쓰나:

- 1차 검증
- 검색 query 3~5개
- source fetch 5~8개 이내

### B. 권장 구현: 비동기 worker path

장기적으로는 이 구조가 맞다.

1. 프론트가 `/api/talent/company-snapshot/start` 호출
2. fresh cache 있으면 바로 반환
3. 없으면 `company_snapshot.status = 'pending'` row 생성
4. 별도 worker job enqueue
5. 채팅에는 `회사 조사 중...` 메시지 표시
6. worker가 조사 완료 후 `company_snapshot` update
7. 결과 assistant message 생성
8. 프론트가 session refresh 또는 polling으로 결과 반영

장점:

- agentic pipeline을 길게 가져갈 수 있다
- retry와 timeout 제어가 쉽다
- provider failover를 붙이기 쉽다
- 운영 로그를 남기기 좋다

단점:

- 구현 복잡도가 올라간다

내 권장:

- 제품 검증은 A
- 정착은 B

## 왜 worker가 더 맞는가

이 repo는 이미 Next app과 별도 worker성 코드가 공존한다.

- `harper_beta`: 사용자 facing app
- `harper_worker`: 장시간 처리/검색/추천 계열 로직
- `data_sc`: enrichment/scraping 자산

즉, company snapshot도 성격상 UI thread가 아니라 worker job에 더 가깝다.

내가 실제 구현하면:

- chat / button trigger는 `harper_beta`
- 장시간 조사 파이프라인은 `harper_beta` backend 내부 job 또는 `harper_worker` 스타일의 background worker

둘 중 하나로 간다.

## 조사 파이프라인

### Stage 0. 회사 identity 정규화

입력은 보통 opportunity에서 온다.

가능한 입력:

- `companyName`
- `companyHomepageUrl`
- `companyLinkedinUrl`
- `company_db_id`
- `company_workspace_id`

정규화 순서:

1. opportunity로부터 `companyName` 확보
2. `company_workspace.company_db_id` 있으면 우선 사용
3. 없으면 `company_db` name match
4. 홈페이지 / LinkedIn / Crunchbase URL을 internal source에서 모음
5. `normalizeCompanySnapshotName()`으로 cache key 생성

여기서 중요한 점:

- 이름 match만 믿으면 동명이인이 생긴다
- 가능하면 `company_db_id` 기준 cache reuse가 우선이다

### Stage 1. 내부 데이터 먼저 사용

외부 호출 전에 현재 DB에서 먼저 모은다.

우선순위:

1. `company_db`
2. `company_workspace`
3. `company_db.crunchbase_information`
4. `company_db.employee_count_range`
5. `company_db.funding`, `funding_url`, `investors`
6. `experience_user` 기반 recent join count

이미 코드베이스에 있는 유용한 자산:

- `company_db.crunchbase_information`
- LinkedIn 회사 enrichment 스크립트
- `experience_user` 기반 recent join count 계산
- `/api/tool/scrape`와 `htmlToReadableMarkdown()`

즉, 외부 웹 검색 전에 내부 data hydration부터 해야 한다.

### Stage 2. 검색 query plan 생성

단순 query 1개로는 품질이 낮다.  
회사별로 의도 분리된 query set이 필요하다.

예시:

```text
{company} company overview
{company} funding round OR raised OR Series A OR Series B
{company} layoffs OR hiring OR headcount OR team growth
{company} revenue OR ARR OR sales
{company} founder interview OR CEO interview
{company} recent news
```

한국 회사면 한글 query도 같이 섞는다.

```text
{company} 투자 유치
{company} 최근 뉴스
{company} 채용
{company} 인터뷰
```

LLM이 query set을 만들 수는 있지만, 규칙 기반 seed를 두는 것이 좋다.

권장 방식:

- deterministic seed queries 5~7개
- LLM이 최대 2개 정도만 추가

### Stage 3. 검색 실행

가장 단순한 시작점은 Google 계열 검색이다.  
하지만 이 repo 기준으로는 provider abstraction을 두는 게 맞다.

```ts
type CompanySearchProvider = {
  search(args: { query: string; maxResults: number }): Promise<SearchResult[]>;
};
```

초기 provider 후보:

- `GoogleProgrammableSearchProvider`
- `BraveSearchProvider`
- `ApifyGoogleSerpProvider`

내 권장 우선순위:

1. 현재 repo 자산 재사용이 목표면 `ApifyGoogleSerpProvider` 또는 Brave
2. 완전 공식 API 선호면 Google Programmable Search + Crunchbase API
3. 운영 난이도/품질 균형은 Brave가 좋음

### Stage 4. 링크 선택과 분류

검색 결과를 그대로 다 읽으면 비용이 커진다.  
먼저 링크를 고른다.

분류 categories:

- official site / official blog
- Crunchbase company profile
- funding news
- product / partnership / launch news
- founder / executive interview
- employee / team data source
- low quality / irrelevant

이 단계는 LLM에 잘 맞지만, 룰도 같이 써야 한다.

hard filters:

- query와 무관한 동일 이름 타회사 제거
- aggregator / spam / duplicate 제거
- 채용공고 페이지는 headcount 보조 signal 외에는 낮은 우선순위
- Crunchbase 사람 페이지, LinkedIn 개인 프로필 페이지 제외

### Stage 5. 본문 수집

선택된 링크만 fetch한다.

이미 재사용 가능한 코드:

- `harper_beta/src/app/api/tool/scrape/route.ts`
- `harper_beta/src/app/api/tool/utils.ts`

여기에는 이미 아래 기능이 있다.

- direct fetch
- Apify website crawler fallback
- Readability
- HTML -> readable markdown
- 문서 cache

즉, company snapshot research에서 새 scraper를 만들기 전에 이 유틸을 lib로 빼서 재사용하는 게 좋다.

권장 fetch 개수:

- 공식/고품질 링크 4~8개
- 최대 10개 안쪽

### Stage 6. API fallback / inaccessible source enrichment

유저가 말한 "못 들어가는 사이트는 API로"는 맞다.  
다만 여기서 현실 제약이 있다.

#### LinkedIn

공식 LinkedIn Organization Lookup API는 arbitrary company intelligence용으로는 제약이 크다.

- 조직 lookup은 3-legged OAuth 기반이다.
- `rw_organization_admin` 권한이 필요하다.
- admin/non-admin에 따라 반환 필드가 달라진다.

즉, 우리가 마음대로 모든 회사의 자세한 회사 데이터를 공식 API로 읽는 구조는 어렵다.

실무 권장:

1. `company_db.linkedin_url`이 이미 있으면 우선 사용
2. 공개 회사 페이지 기준 scraper / enrichment 결과 재사용
3. 공식 LinkedIn API는 "내가 관리하는 회사 페이지" 용도로만 제한적으로 사용

현재 repo의 현실적 자산:

- `data_sc/scrape_linkedin.py`
- Apify 기반 LinkedIn company scrape 패턴

#### Crunchbase

Crunchbase는 공식 API가 있지만 권한 tier에 따라 접근 범위가 다르다.

- Basic API는 organization search / entity lookup / autocomplete 중심
- 더 많은 endpoint/card는 advanced/commercial license가 필요하다

실무 권장:

1. `company_db.crunchbase_information`이 있으면 재사용
2. `funding_url`이 있으면 enrichment backfill 실행
3. license가 있으면 공식 API 우선
4. 없으면 현재 repo의 Apify/수집 자산 유지

현재 repo의 자산:

- `data_sc/get_crunchbase.py`
- `data_sc/company_funding_enrichment.py`
- `company_db.crunchbase_information`

### Stage 7. 구조화

raw facts를 LLM에게 넘겨 strict JSON으로 구조화한다.

중요 규칙:

- 숫자는 근거가 있을 때만
- revenue 없으면 `unknown`
- layoff/headcount 감소를 단정하지 말고 signal language 사용
- sourceId가 없는 bullet는 만들지 않기

예시 프롬프트 요구사항:

- output must be valid JSON
- do not invent revenue/headcount/funding
- every claim must map to one or more sourceIds
- if evidence is weak, mark confidence low
- recentNews is max 3
- strengths max 4
- risks max 4

### Stage 8. 회원 fit overlay

공용 snapshot이 완성되면 마지막에 회원 profile을 얹는다.

입력:

- `buildTalentProfileContext(...)`
- `talent_insights`
- `talent_settings`
- `blocked_companies`
- experience / education / desired location / career intent

출력:

- `fitPositive: string[]`
- `fitNegative: string[]`

권장 규칙:

- positive 2~4개
- negative 2~4개
- blocked company면 아예 negative 첫 줄에 표시
- 회사가 특정 location 중심인데 유저 선호지역과 어긋나면 negative
- 학력/전직회사/도메인 경험/연구 스타일이 맞으면 positive

이 단계 결과는 assistant message에는 포함하되 `company_snapshot.content`에는 넣지 않는 것을 권장한다.

## 항목별 데이터 수집 전략

### 1. 회사 설명

입력 소스:

- `company_db.description`
- `company_db.short_description`
- 홈페이지 about page
- founder interview
- official blog / press

좋은 설명의 조건:

- 제품 설명만 하지 않기
- 누구를 위해 무엇을 해결하는지
- 왜 지금 중요한지
- 시장/조직 단계가 어디인지

### 2. Fund raise 기록

입력 소스:

- `company_db.crunchbase_information`
- Crunchbase entity / raised_funding_rounds 계열
- funding news

출력은 timeline array가 좋다.

### 3. Headcount 변화

이 항목은 공개 데이터가 애매하므로 "정확한 숫자"보다 "변화 신호"를 보는 게 맞다.

우선순위:

1. LinkedIn company size / public company page
2. Crunchbase employee enum / growth signals
3. 최근 채용 포지션 수
4. 내부 network 데이터의 `experience_user` recent join count
5. layoffs / hiring freeze / org change 뉴스

권장 출력:

- current range
- recent trend summary
- evidence signals
- confidence

### 4. 매출 기록

매출은 없는 경우가 많다.  
이 항목은 반드시 fail-safe해야 한다.

원칙:

- 숫자 확인 못하면 `공개 매출 수치는 확인되지 않음`
- 대신 proxy를 보조로 적을 수 있음
  - funding stage
  - enterprise customer mentions
  - ARR 공개 인터뷰
  - investor material

하지만 proxy는 revenue와 구분해서 써야 한다.

### 5. 구성원 배경 요약

가능한 소스:

- LinkedIn company page의 featured employees
- founder/about page
- team page
- GitHub org / public profiles
- 현재 DB에 연결된 internal talent / network graph

출력 예:

- 빅테크 출신 비중
- 학교 신호
- 연구조직 vs 제품조직 성향
- 창업팀 반복창업 여부

### 6. 최근 중요한 뉴스 1~3개

원칙:

- 12개월 안 뉴스 우선
- funding, partnership, launch, hiring, geography expansion, layoff, leadership change 우선
- 중복 주제 뉴스 제거

### 7. 좋은 점

LLM이 그냥 칭찬문구를 만들면 안 된다.  
좋은 점도 source-grounded inference여야 한다.

예:

- 강한 distribution channel
- 빠른 hiring velocity
- clear product wedge
- strong founder-market fit

### 8. 문제점 예측

이 부분도 "예측"임을 명시해야 한다.

좋은 phrasing:

- "공개 정보 기준으로 보면 ... 리스크가 있을 수 있다"
- "특정 signal만으로 확정할 수는 없지만 ..."

나쁜 phrasing:

- "이 회사는 내부적으로 문제가 있다"

## 추천 코드 구조

현재 `companySnapshot.ts` 한 파일에 전부 넣기 시작할 수는 있지만, 실제로는 분리하는 게 맞다.

권장 파일 구조:

```text
src/lib/career/companySnapshot.ts
src/lib/career/companySnapshotResearch.ts
src/lib/career/companySnapshotTypes.ts
src/lib/career/companySnapshotPrompts.ts
src/lib/career/companySnapshotSources.ts
src/lib/career/companySnapshotMemberFit.ts
```

역할:

- `companySnapshot.ts`
  - public entrypoint
  - cache lookup
  - message formatting
- `companySnapshotResearch.ts`
  - research orchestrator
- `companySnapshotTypes.ts`
  - JSON schema types
- `companySnapshotPrompts.ts`
  - query planning / structuring / fit prompts
- `companySnapshotSources.ts`
  - Google/Brave/Crunchbase/LinkedIn/search/scrape adapters
- `companySnapshotMemberFit.ts`
  - snapshot + member profile -> positive/negative fit

## 권장 함수 설계

```ts
async function runCompanySnapshotResearch(args: {
  companyDbId: number | null;
  companyName: string;
  reason?: string | null;
}): Promise<CompanySnapshotContent>
```

내부 추천 분해:

```ts
async function resolveCompanyResearchIdentity(...)
async function loadInternalCompanyContext(...)
async function buildCompanyResearchQueryPlan(...)
async function runCompanyResearchSearch(...)
async function selectCompanyResearchSources(...)
async function fetchCompanyResearchDocuments(...)
async function fetchLinkedInCompanySignals(...)
async function fetchCrunchbaseSignals(...)
async function buildCompanySnapshotContent(...)
async function buildCompanySnapshotMemberFit(...)
```

## 추천 실행 흐름 의사코드

```ts
export async function runCompanySnapshotResearch(args) {
  const identity = await resolveCompanyResearchIdentity(args);
  const internal = await loadInternalCompanyContext(identity);

  const queryPlan = await buildCompanyResearchQueryPlan({
    companyName: identity.companyName,
    internal,
    reason: args.reason ?? null,
  });

  const searchResults = await runCompanyResearchSearch(queryPlan);
  const selectedSources = await selectCompanyResearchSources({
    companyName: identity.companyName,
    internal,
    results: searchResults,
  });

  const documents = await fetchCompanyResearchDocuments(selectedSources);
  const linkedInSignals = await fetchLinkedInCompanySignals(identity, internal);
  const crunchbaseSignals = await fetchCrunchbaseSignals(identity, internal);
  const headcountSignals = await fetchHeadcountSignals(identity, internal);

  const content = await buildCompanySnapshotContent({
    companyName: identity.companyName,
    crunchbaseSignals,
    documents,
    headcountSignals,
    internal,
    linkedInSignals,
  });

  return content;
}
```

## UI 제안

### 1차

가장 간단한 UI는 markdown 결과를 chat bubble에 보여주는 것이다.

예:

```md
### 회사 설명
...

### Fundraise
- 2024 Series B ...

### 최근 뉴스
1. ...
2. ...

### 이 회원과의 적합성
Positive
- ...

Negative
- ...
```

장점:

- 새 card component 없이 바로 붙일 수 있다
- 기존 `CareerMessageBubble` 재사용 가능성이 높다

### 2차

여유가 생기면 전용 result card를 만든다.

- `company_snapshot_preparing`
- `company_snapshot_setup`
- `company_snapshot`

특히 async로 갈 경우 `company_snapshot_preparing` message type이 있으면 좋다.

## 캐시 전략

현재 cache window는 30일이다.

```ts
export const COMPANY_SNAPSHOT_CACHE_WINDOW_DAYS = 30;
```

이건 기본값으로 괜찮지만, 항목별로 생각하면 좀 다르다.

- 회사 설명: 30일 이상 가능
- fundraise: 30일 가능
- headcount 변화: 더 짧아도 됨
- 최근 뉴스: 7~14일 민감
- fit overlay: 거의 실시간

그래서 현실적 타협은:

- snapshot 전체 TTL: 30일
- 다만 `recentNews`는 결과 생성 시 최신성 우선
- `fit`는 항상 fresh 계산

## 에러 처리

반드시 구분해야 한다.

- 검색 결과가 적음
- 수집은 됐지만 구조화 실패
- Crunchbase/LinkedIn fallback 실패
- 완전 실패

권장 status:

- `pending`
- `completed`
- `failed`

그리고 `content`가 부분적이어도 결과를 보여주는 것이 좋다.  
즉, hard fail보다 partial success가 낫다.

예:

- revenue 없음
- headcount low confidence
- 그래도 나머지는 보여줌

## 품질 규칙

이 기능은 "잘 아는 척"이 아니라 "잘 모르면 모른다고 말하는 것"이 중요하다.

강제 규칙:

- source 없는 숫자 금지
- revenue/headcount 확정치 hallucination 금지
- 뉴스는 원문 date가 확인되는 것 우선
- strength/risk는 각각 4개 이하
- 같은 근거를 다른 문장으로 중복 반복 금지
- member fit는 회사 정보와 회원 프로필 모두에 근거해야 함

## 테스트 포인트

### unit

- 회사명 정규화
- recent snapshot cache lookup
- source dedupe
- empty source fallback
- no revenue handling
- fit overlay with blocked company

### integration

- company button -> chat flow
- cache hit path
- first-time generation path
- partial failure path
- company name ambiguity path

### manual QA

- 한국 회사 / 미국 회사 각각
- funding 있는 회사 / 없는 회사
- LinkedIn/Crunchbase URL 있는 회사 / 없는 회사
- 동명이인 회사

## 단계별 구현 순서

### Phase 1. 가장 작은 성공

1. `OpportunityDetailModal.tsx`에 `회사 조사` 버튼 추가
2. `CareerHistoryPanel.tsx`에서 button action 연결
3. `runCompanySnapshotResearch()`에 최소 파이프라인 구현
4. 내부 DB + 검색 결과 + scrape 기반 summary markdown 생성
5. fit overlay 생성

이 단계 목표:

- 유저가 눌렀을 때 실제로 쓸만한 요약이 나온다
- cache reuse가 된다

### Phase 2. 구조화 강화

1. `content` JSON schema 고정
2. sourceIds / confidence 추가
3. 뉴스 / fundraising / team composition 분리
4. revenue unknown 처리 강화

### Phase 3. 비동기 worker

1. pending state 추가
2. preparing message 추가
3. worker queue 도입
4. retry / timeout / trace logging 추가

### Phase 4. 고급 소스 연결

1. LinkedIn company enrichment 연결
2. Crunchbase license/API 여부에 따른 provider 분기
3. headcount trend signal 정교화
4. optional personalization cache

## 내가 실제로 먼저 만들 기능

제일 먼저는 이것만 만든다.

1. 모달 버튼 추가
2. 기존 `company_snapshot` cache 재사용
3. 회사 공용 리서치 생성
4. 회원 fit는 response 시점 계산
5. markdown 결과 렌더링

즉, 1차는 "회사 리서치가 실제로 나온다"가 목표다.  
전용 UI card나 거대한 workflow engine은 그 다음이다.

## 최종 판단

질문에 대한 짧은 답은 이렇다.

- 네, 실제 실행은 backend가 맞다.
- 더 정확히는 "Next API가 트리거하고, 조사 엔진은 backend/worker가 처리"가 맞다.
- `company_snapshot`은 공용 회사 지식 캐시로 쓰고,
- `[회원]과의 적합성`은 별도 실시간 overlay로 계산해야 한다.
- 구현 방식은 "Google 검색으로 시작"해도 되지만, 실제로는 검색 provider abstraction + LinkedIn/Crunchbase/internal DB fallback 구조로 가는 것이 맞다.
- 완전 자유형 agent보다는 bounded agent가 운영 가능성이 훨씬 높다.

## 바로 수정할 파일

- `harper_beta/src/components/career/history/OpportunityDetailModal.tsx`
- `harper_beta/src/components/career/CareerHistoryPanel.tsx`
- `harper_beta/src/lib/career/companySnapshot.ts`
- `harper_beta/src/app/api/talent/company-snapshot/start/route.ts`
- 필요하면 `harper_beta/supabase/migrations/` 아래 후속 migration
