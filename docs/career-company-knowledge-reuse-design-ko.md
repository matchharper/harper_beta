# Career 회사·공고 지식 재사용 (상세 설계)

2026-11-19 작성. 아직 구현하지 않았다. 근거는 2026-11-18 로컬 신규 가입자 실행 10회와 코드·DB 함수 확인이다. 공개 글·기사 탐색 경로(`posts`)는 [별도 문서](career-opportunity-signals-design-ko.md)에서 다루며 이번 범위가 아니다.

## 0. 목표와 범위

한 사용자를 위해 찾은 공개 사실을 다음 사용자가 다시 찾지 않고 쓰게 한다. 대상은 세 가지다.

- 웹에서 찾은 공고
- 회사의 최근 소식
- 에이전트가 확인한 회사 사실

그리고 에이전트가 판단에 쓸 사실 세 가지를 준다. 도구가 할 수 있는 일, 시장에 대한 사실, 회사 자체를 추천하는 근거다.

| 묶음 | 항목 |
| --- | --- |
| A. 찾은 것을 공유 지식으로 남긴다 | A1 공개 공고 공유 · A1b 공고 검색 준비(제목 임베딩·국가 코드) · A1c 새 회사 색인 · A2 회사 확인 결과 저장·재사용 · A3 공유 개요에 채용·진출 사실 |
| B. 남긴 것이 결정하는 자리에 보이게 한다 | B1 회사 검색 색인 · B2 평가 모델 입력 · B3 검색 결과 줄과 회사 카드 |
| C. 판단에 쓰는 사실을 준다 | C1 웹 검색 도구 설명 · C2 handbook 시장 사실 · C3 회사 자체 추천의 근거 |

앞서 제안한 A·B·C에서 달라진 점은 네 가지다.

- **A1b·A1c 추가:** 확인해 보니 공개로 바꾸는 것만으로는 재사용이 안 된다. 공고 검색이 쓰는 값이 비어 있고, 새 회사가 회사 검색 색인에 들어가지 않는다.
- **A2 검색 경로 확대:** LinkedIn 글 검색을 더한다.
- **A2 관련성 확인:** 회사와 무관한 결과를 공유 지식에 섞지 않게 한다.
- **B1 색인 갱신 시점 보완:** 저장할 때마다 다시 색인한다.

## 1. 지금 무엇이 재사용되나

| 찾은 것 | 지금 저장되는 곳 | 다른 사용자 | 근거 |
| --- | --- | --- | --- |
| 회사 개요 | `company_datas` summary | 30일 재사용 | Javier 재실행이 1회차가 저장한 Hydra Host 개요를 웹 검색 없이 썼다 |
| 웹에서 찾은 공고 | 개인 공고(`source_provider='user_submitted'`, `information.submittedTalentIds`) | 보이지 않는다 | 검색 조건이 남의 개인 공고를 뺀다(`roleSql.ts:26`). Javier 재실행이 같은 Hydra Host 공고를 웹에서 다시 찾았다 |
| 웹에서 찾은 공고의 검색 값 | 비어 있다 | 공개로 바꿔도 검색되지 않는다 | 2026-11-18에 앱이 만든 외부 공고 13건 모두 `title_embedding`·`country_code`가 비어 있다. 공고 검색은 이 둘을 요구한다(`indexedTitleSearch.ts`). 임베딩은 크롤러가 직접 쓰는 구조라(`20261016085955` migration) 앱이 만든 공고는 채워지지 않는다 |
| 공고 저장으로 생긴 회사 | `company_workspace` | 회사 검색에 안 걸린다 | 회사 검색 색인(`career_company_search`)은 이름·URL 등록과 회사 확인 때만 갱신된다 |
| 회사 확인의 최근 소식 | 저장하지 않는다 | 매번 다시 검색한다 | 호진 재실행이 1회차가 등록한 Cartesia의 최근 소식을 다시 검색했다 |
| 직접 저장한 회사 주제 | `company_datas` 주제 행 | 거의 안 쓰인다 | 다른 에이전트에게 주제 이름만 보인다. 평가 모델은 이름만, 회사 검색 색인은 개요 첫 단락만 쓴다. 저장해도 색인을 다시 만들지 않는다 |

## 2. 설계

### A1. 웹에서 찾은 공개 공고는 공개 공고로 등록한다

**지금**

`save_job_posting(mode=suggest)`는 `importCareerJobLink`로 개인 공고와 추천을 함께 만든다. 공개 출처가 있어도 개인 공고가 된다.

**바꾼 뒤** (`src/lib/career/saveJobPosting.ts`)

1. **채용 글은 지금 경로로 둔다.** `hiringPost`가 있는 항목(LinkedIn 글 등)은 공개 등록 함수가 채용 글을 받지 않으므로 바꾸지 않는다. 한계로 남긴다(7절).
2. **먼저 공개 등록을 시도한다.** `indexCareerJobLink({ url, title, companyName })`를 부른다. 2026-11-18에 고친 `index` 경로를 그대로 쓴다.
   - 공개 출처 기준은 지금 `index`와 같다. 다음 중 하나면 공개다.
     - 웹 검색 결과로 저장된 공개 문서가 있다.
     - 공개 채용 사이트를 직접 읽었다(Workday·Workable·Ashby·Greenhouse 등).
     - 이미 공개 색인에 있는 공고다.
     - 독립 웹 검색으로 찾아진다.
   - 웹 검색으로 찾은 공고는 이미 공개 문서가 있어 추가 검색이 없다.
3. **결과에 따라 갈린다.**
   - **성공:** 공개 공고 ID를 얻는다. 이 공고를 `importCareerJobLink`에 기존 공고로 넘겨 이 사용자의 추천만 만든다. 이 함수는 기존 공고를 그대로 쓰고 개인 공고로 되돌리지 않는다.
   - **닫힌 공고:** 지금처럼 `posting_closed` 결과를 돌려주고 추천하지 않는다.
   - **제목·회사명이 필요하다는 결과:** 그대로 돌려준다.
   - **"독립적으로 확인된 공개 출처 없음":** 지금 경로(개인 공고 + 추천)로 간다. 사용자가 직접 준 비공개 URL이 여기에 해당한다.
4. **기존 개인 공고도 바뀐다.** 같은 URL의 개인 공고가 이미 있으면, 공개 등록 함수가 그 공고를 공개로 바꾸고 개인 표시(`submittedTalentIds`)를 지운다. 이미 있는 기능이다. 먼저 저장한 사용자의 추천 행은 그대로 남는다.

**개인정보 경계**

- 공개로 올라가는 내용은 공개 출처를 다시 읽어 만든 사실뿐이다.
- 사용자가 준 메모, 직접 입력한 필드, 진행 상태는 올라가지 않는다. 공개 등록 함수가 `extractedBy='manual'`을 거부한다.
- 공개 근거가 없는 URL은 계속 개인 공고다.

**비용:** 공개 문서가 없으면 독립 검색 1회(약 $0.007, 2초)가 늘어난다.

### A1b. 앱이 만든 외부 공고를 검색할 수 있게 채운다

공개 공고든 개인 공고든, 앱이 만들거나 고친 외부 공고에는 공고 검색에 필요한 값을 바로 채운다. 개인 공고도 저장한 사용자 본인의 검색에서는 찾아져야 하므로 함께 채운다.

| 값 | 채우는 방법 |
| --- | --- |
| `title_embedding`, `title_embedding_text` | `embedTitles([제목])`로 임베딩하고, 기존 DB 함수 `save_role_title_embeddings`로 저장한다. 이 함수는 제목이 같을 때만 쓴다 |
| `country_code` | 아래 순서로 정한다 |

**국가 코드를 정하는 순서**

1. **공급처가 주는 값:**
   - Workable `location.countryCode`
   - 원티드·점핏은 KR
   - Workday 위치 앞의 국가 코드(예: "SG - Singapore")
   - Ashby·Greenhouse·Lever의 구조화된 국가 필드가 있으면 그 값
2. **Exa 구조화 요약:** 지금 추출하는 공고 필드에 `countryCode`(ISO 3166-1 alpha-2)를 더한다.
3. **저렴한 모델 한 번:** 위가 없으면 위치·제목·회사명을 읽어 국가 코드를 고른다. 원격이거나 불분명하면 비워 둔다.

**저장 경로**

- `career_index_public_job_v1`와 `import_talent_job_link`가 `p_role->>'countryCode'`를 받아 넣도록 migration으로 고친다.
- 지금 공개 등록 함수는 기존 공고를 갱신할 때 `country_code`를 비운다. 새 값이 있으면 그 값으로 채운다.
- 제목이 바뀌면 기존 트리거가 임베딩을 지운다. 그래서 등록·갱신 직후에 다시 채운다.

**구현 위치**

- `src/lib/career/jobLinkImportServer.ts`: 등록·가져오기 뒤에 보강을 호출한다.
- `src/lib/career/jobLinkImport.ts`, `src/lib/career/atsPostings.ts`: 초안에 `countryCode`를 담는다.

### A1c. 공고 저장으로 생긴 회사도 회사 검색 색인에 넣는다

- 공개 등록이나 가져오기가 새 `company_workspace`를 만들면, 그 회사를 `indexCompanies({ ids })`로 색인한다. 응답을 막지 않도록 뒤에서 돌린다.
- 기존 회사에 새 공고가 생겨도 색인 본문의 "열린 공고" 줄이 바뀌므로 다시 색인한다. 본문이 같으면 해시가 같아 임베딩을 건너뛴다.
- Harper 연결(내부) 회사는 지금처럼 색인하지 않는다.

### A2. 회사 확인 결과를 회사 정보로 저장하고 재사용한다

**지금**

`read_companies(check=true)`는 회사마다 "`이름` hiring OR 채용 OR raises OR launches"를 90일 필터로 검색한다. 결과는 화면용 줄로만 쓰고 버린다.

**바꾼 뒤** (`src/lib/career/companies/readCompanies.ts`)

1. **저장분을 먼저 본다.** 그 회사의 `recent public posts` 행 중 가장 최근 행이 14일 안이면 웹 검색 없이 그 행을 보여 준다. 기간은 환경 변수로 조정한다(`CAREER_COMPANY_POSTS_MAX_AGE_DAYS`, 기본 14).
2. **없거나 오래됐으면 두 번 검색한다.** 둘 다 시작일 필터를 둔다.
   - 일반 검색: 지금 검색어.
   - LinkedIn 검색: `includeDomains: ["linkedin.com"]`, "`이름` hiring OR team OR 채용". 2026-11-18 시험에서 이 방식으로 회사 채용 글이 날짜와 함께 나왔다.
3. **회사와 관계있는 결과만 남긴다.** 제목·본문 발췌·URL에 그 회사의 이름(한글·영문 표기), 공식 사이트 도메인, LinkedIn 회사 주소 중 하나가 있어야 한다. 이름이 겹치는 다른 회사의 글이 공유 지식에 섞이지 않게 하는 신원 확인이다. 글의 좋고 나쁨은 판단하지 않는다.
4. **새 행으로 저장한다.** 기존 쓰기 함수(`career_write_company_datum_v1`)를 쓴다.

   | 필드 | 값 |
   | --- | --- |
   | `label` | `recent public posts` |
   | `content` | 최신순 최대 8줄. "2026-11-03 · LinkedIn · Mistral is building its Applied AI Deployment team in Seoul · URL" |
   | `facts` | `{ "since": "2026-08-20", "queries": [...], "results": [{ "publishedAt", "title", "url", "source": "linkedin" \| "web" }] }` |
   | `source_refs` | 각 결과의 공개 문서 참조. 웹 검색이 이미 저장한 `web_resource` ref |

   - 확인할 때마다 새 행을 쓰고, 읽을 때는 최신 행 하나만 쓴다.
   - 결과가 없으면 저장하지 않는다(`source_refs`가 필수). 다음 확인 때 다시 검색한다.
5. **바로 새로 보고 싶을 때:** 에이전트가 `fresh: true`를 주면 저장분과 상관없이 검색한다. 도구 설명에는 "저장된 확인이 N일 안이면 그대로 보여 준다"는 사실만 적는다.
6. **결과 표시:** "Recent public posts (Harper's check on 2026-11-18): …"처럼 언제 확인했는지 함께 보여 준다. 에이전트는 이미 확인된 것을 다시 찾지 않는다.

**비용**

- 저장분이 있으면 $0.
- 없으면 Exa 2회, 약 $0.014. 지금보다 1회 많다.
- 같은 회사를 14일 안에 여러 사용자가 보면 첫 사람만 검색한다.

### A3. 공유 회사 개요에 공개된 채용·진출 사실을 담는다

**지금**

개요 지시(`companyData.ts:138`)는 제품·창업자·공개 투자만 다루고 "hiring speculation"을 뺀다. 검색어는 "회사 정보 투자 창업자 / company overview funding founders"다.

**바꾼 뒤**

- **지시:** "Cover its products, founders, publicly reported financing, and dated public facts about hiring growth, new teams or offices and market entry where the sources establish them."를 더한다. 추측 금지와 개인 적합성 금지는 유지한다.
- **검색어:** "채용 확대 진출 hiring expansion"을 더한다.
- **적용 시점:** 개요는 없거나 30일이 지났을 때만 다시 만든다. 기존 개요는 그때부터 차례로 바뀐다. 따로 일괄 갱신하지 않는다.

### B1. 회사 검색 색인 본문에 최근 회사 사실을 넣는다

**지금 본문** (`src/lib/career/companies/discovery.ts`): 이름, 설명, 개요 첫 단락, 전문 분야, 열린 공고 제목.

**더하는 것**

- 최신 `recent public posts` 행의 제목 최대 5개(90일 안)
- 다른 주제 행(투자·성장 등)의 첫 문장 최대 3개(90일 안)

본문 상한(6,000자)은 그대로 둔다.

**다시 색인하는 시점**

| 언제 | 근거 |
| --- | --- |
| `upsert_company` 저장 직후 | 새 회사 사실 |
| A2 저장 직후 | 새 최근 소식 |
| 개요 새로 고침 직후 | 개요 첫 단락 변경 |
| A1c 새 공고 등록 직후 | 열린 공고 변경 |

모두 응답을 막지 않고 뒤에서 돌린다. 본문 해시가 같으면 임베딩을 다시 만들지 않는다.

**효과:** "서울에 팀을 꾸리는 AI 회사"처럼 회사를 설명으로 찾는 검색(`companies.about`)에, 다른 사용자가 찾아 둔 최근 소식이 걸린다.

### B2. 평가 모델이 최근 회사 사실을 읽는다

**지금:** `formatCompanyOverview`가 개요 본문과 "Other saved company topics: 이름 목록"만 준다.

**바꾼 뒤**

- 개요 다음에 최근 사실을 최대 3건, 각 240자 이내로 날짜와 함께 준다. 대상은 90일 안의 `recent public posts` 최신 행과 다른 주제 행이다.
- 회사 자체 후보와 공고의 고용주 모두에 적용된다. 같은 함수를 쓰기 때문이다.
- 회사 정보를 읽는 함수(`readCompanyWorkspaceList`, `readRoleCompanyList`)가 이 행들을 함께 읽게 한다.
- 추가 분량은 회사당 최대 약 800자다. 평가 모델(gpt-6-luna) 비용 증가는 작다. 2026-11-18 기준 평가 1,500건에 약 $0.14였다.

**효과:** 진출하거나 팀을 꾸리는 회사가 후보자 관심과 상호 적합 점수에 반영된다.

### B3. 검색 결과 줄과 회사 카드에 최근 사실을 보인다

**검색 결과의 회사 줄** (`candidatePool.ts`의 `formatPoolOptions`)

- 최근 사실이 있으면 한 줄(160자 이내)을 더한다.
- 예: `recent: 2026-11-03 LinkedIn "Building Applied AI Deployment team in Seoul" (checked 11-18)`
- 공고 줄에는 붙이지 않는다. 결과가 길어지기 때문이다.

**`read_companies` 카드**

- 확인(`check`)을 하지 않아도 저장된 최근 소식과 다른 주제의 첫 문장을 날짜와 함께 보여 준다.
- 마지막 공개 확인 시각도 함께 보여 준다. 예: "public posts checked 2026-11-18".

**효과:** 에이전트가 이미 알려진 것을 보고 다시 찾지 않는다. 공고가 없는 회사라도 지금 사람을 모으는 중이라는 사실이 보여 회사 자체를 추천할 근거가 생긴다(C3).

### C1. 웹 검색 도구 설명에 능력을 사실로 적는다

**지금:** "Search the web for information, using search engine." 한 줄이다. 웹 검색 29회 중 날짜·도메인·범주 필터를 쓴 경우가 0회였다.

**바꾼 문장** (`src/lib/llm/toolDescriptions.ts`의 `web_search`, `src/lib/agentTools/webDefinitions.ts`의 매개변수 설명)

> Search the provider's web index. startPublishedDate/endPublishedDate keep results to a publication window. category=news returns news articles such as funding, launches, office openings and market entry; company and people return organization and person pages. includeDomains limits results to sites; with linkedin.com it returns public LinkedIn posts with their dates, including companies' hiring posts. Posts on X are rarely in this index. Each result carries a public source reference that upsert_company accepts.

지시가 아니라 도구가 할 수 있는 일이다. 쓸지 말지는 에이전트가 정한다.

### C2. handbook에 시장 사실과 저장의 쓰임을 적는다

`src/lib/career/handbooks/opportunitySearch.ts` 6줄("Postings show what is advertised under a title; they are one view of the market, not the market.") 뒤에 더한다.

> Companies building a new team or entering a market often show it first in their own public posts and news, before any posting.

12줄의 공유 사실 저장 문장 뒤에 더한다. 지금 문장은 저장이 다음 검색에 도움이 된다고만 말하는데, 실제로 그렇게 되게 만든 뒤(B1~B3) 사실로 적는 것이다.

> Saved company facts appear in later company searches, evaluations and company cards for everyone who looks at that company.

### C3. 회사 자체를 추천하는 근거를 바꾼다

**지금** (handbook 2줄)

> a company worth joining can be recommended whether or not it advertises a fitting role, with the teams or roles that matter and a credible route to its people.

**바꾼 뒤**

> a company worth joining can be recommended whether or not it advertises a fitting role, by what makes it worth joining now, such as a team being built, a market entry or recent hiring; finding a route to its people is something Harper can do next.

2026-11-18에 넣은 "Harper가 다음에 할 수 있는 일" 문장(handbook 14줄)과 이어진다.

## 3. 개인정보와 공유 경계

- **공유 대상:** 공개 출처의 사실만 공유한다. 공개 공고, 회사의 공개 글·기사 목록, 공개 출처가 있는 회사 사실이다.
- **개인 기록:** 사용자별 추천 이유, 매칭 노트, 적합성 판단은 지금처럼 개인 기록이다.
- **사용자가 준 URL:** 독립적인 공개 근거가 없으면 공개하지 않는다(A1).
- **개인정보:** 최근 소식 목록은 회사 단위로 저장한다. 글쓴이 이름은 따로 뽑지 않고, 글 제목에 들어 있는 경우만 원문 그대로 남는다.
- **내부 회사:** Harper 연결(내부) 회사와 공고는 모든 단계에서 뺀다.

## 4. 비용과 시간

| 항목 | 추가 비용 | 추가 시간 |
| --- | --- | --- |
| A1 공개 등록 | 공개 문서가 있으면 0, 없으면 약 $0.007 | 0~2초 |
| A1b 보강 | 임베딩 약 $0.00002, 국가 코드 모델 호출(필요할 때만) 약 $0.0005 | 1~2초, 응답 뒤 처리 가능 |
| A2 회사 확인 | 저장분이 있으면 0, 없으면 약 $0.014 | 0~3초 |
| B1 재색인 | 회사당 임베딩 1회 | 응답 뒤 |
| B2 평가 입력 | 회사당 최대 약 800자 | 무시할 수준 |

같은 회사나 공고를 여러 사용자가 볼수록 웹 검색이 줄어 비용이 내려간다.

## 5. 구현 순서

1. **migration:**
   - `career_index_public_job_v1`·`import_talent_job_link`가 `countryCode`를 받는다.
   - `company_datas`의 최근 행 조회용 인덱스는 기존 `company_datas_read(company_workspace_id, label, checked_at desc, id)`로 충분한지 먼저 본다.
2. **A1b 보강 함수:** `src/lib/career/roleEnrichment.ts`(새 파일). 제목 임베딩 저장과 국가 코드 결정.
3. **A1:** `saveJobPosting.ts`의 `suggest` 분기, `jobLinkImportServer.ts`.
4. **A1c·B1:** `discovery.ts`의 색인 본문과 재색인 진입점. 호출하는 곳은 `jobLinkImportServer.ts`, `companies/tools.ts`(`upsert_company`), `resources/companyData.ts`(개요 새로 고침), `readCompanies.ts`.
5. **A2:** `readCompanies.ts`. 저장분 확인, 두 갈래 검색, 관계 확인, 저장, 표시.
6. **A3:** `resources/companyData.ts`의 개요 지시와 검색어.
7. **B2:** `resources/companyData.ts`의 `formatCompanyOverview`와 회사 목록 읽기 함수.
8. **B3:** `candidatePool.ts`의 회사 줄, `readCompanies.ts`의 카드.
9. **C1~C3:** `toolDescriptions.ts`, `webDefinitions.ts`, `handbooks/opportunitySearch.ts`(버전 올림), [Career 지침 변경 기록](agent-guidance/career-guidance-selection.md).

## 6. 확인 방법

### 6.1 단위·DB 확인

| 항목 | 확인할 것 |
| --- | --- |
| A1 | 공개 문서가 있는 URL의 `suggest`는 공개 공고 + 이 사용자 추천이 된다. 공개 근거가 없는 URL은 개인 공고가 된다. 같은 URL의 기존 개인 공고는 공개로 바뀌고 먼저 저장한 사용자의 추천은 남는다 |
| A1b | 등록·가져오기 뒤 공고에 `title_embedding_text = name`, `country_code`가 채워진다. 같은 공고가 공고 검색 SQL에 걸린다 |
| A1c | 새 회사가 `career_company_search`에 생긴다 |
| A2 | 14일 안에는 Exa를 부르지 않는다. 지나면 부른다. 관계없는 결과는 저장되지 않는다. 결과가 없으면 쓰지 않는다 |
| B1~B3 | 본문·평가 입력·결과 줄에 최근 사실이 들어가고 길이 상한을 지킨다 |
| C1~C3 | 실제 provider 입력에 바뀐 문장이 들어간다 |

### 6.2 실제 실행 (재사용 확인)

같은 분야 두 사람을 차례로 새 계정으로 돌린다.

- **싱가포르 투자 직군:** Javier → 비슷한 VC 경력의 다른 프로필.
- **오디오 AI 연구:** 호진 → 다른 오디오·음성 연구자 프로필.

두 번째 사람에게서 다음을 확인한다.

| 확인할 것 | 성공 기준 |
| --- | --- |
| 앞사람이 웹에서 찾은 공고가 공고 검색 결과에 나오는가 | 나온다(Hydra Host, Cartesia 등) |
| 앞사람이 확인한 회사의 최근 소식을 웹 검색 없이 받는가 | 카드에 "checked 날짜"가 보이고, 그 회사 이름의 Exa 검색이 0회 |
| 회사 검색 결과에 최근 사실 줄이 보이는가 | 보인다 |
| 웹 검색·회사 확인 검색 총횟수 | 앞사람보다 적다 |

### 6.3 함께 보는 지표

신규 가입자 4명을 다시 돌려 2026-11-18 결과와 비교한다.

- 날짜·도메인·범주 필터를 쓴 웹 검색 비율
- 회사 자체 추천 수
- 공개로 등록된 공고 수
- 저장된 최근 소식 수
- 1인당 비용과 시간

## 7. 이번 범위 밖과 남는 한계

- **LinkedIn 채용 글의 공개 등록:** 공개 등록 함수가 채용 글(`hiringPost`)을 받지 않는다. 채용 글은 계속 개인 공고다. 공개로 하려면 등록 함수가 글 본문과 작성자 정보를 공개 사실로 다루는 계약이 따로 필요하다.
- **기존 개인 공고:** 2026-11-18에 만들어진 개인 공고 11건은 따로 바꾸지 않는다. 누군가 같은 URL을 다시 저장하면 A1 경로로 공개가 된다. 일괄 변환이 필요하면 공개 근거를 확인하는 일회성 스크립트를 따로 만든다.
- **X 글:** 검색 제공자 색인에 거의 없다.
- **공개 글·기사 탐색 경로(`posts`):** [별도 문서](career-opportunity-signals-design-ko.md)에서 다룬다.
- **로컬 검증의 한계:** 로컬 색인에는 한국 공고만 있다. 운영 데이터에서 다시 확인해야 한다.
