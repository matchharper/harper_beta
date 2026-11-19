# Career 기회 탐색 재설계

- 작성: 2026-11-18
- 상태: 제안. 코드는 아직 바꾸지 않았다.
- 범위: Career 기회 탐색·평가·추천. 회사 데이터, 탐색 도구, 매칭 노트와 후보 풀, 핸드북.
- 후속 설계(2026-11-19): 공개 글·기사로 회사를 찾고 찾은 것을 쌓는 방법은 [career-opportunity-signals-design-ko.md](career-opportunity-signals-design-ko.md)에 있다.
- 이어지는 문서: [매칭 연구 노트 설계](career-matching-research-notebook-design-ko.md)
- 상위 정본: [좋은 기회를 어떻게 추천할까](career-good-opportunity-recommendation-ko.md). 이 문서의 결정이 바뀌면 그 문서의 '바뀐 생각'에도 남긴다.

## 0. 요약

Harper가 좋은 기회를 못 찾는 이유는 판단력이 아니라 후보를 만드는 방식에 있다. 지금 후보는 직무명이 비슷한 공고에서만 나온다. 메인 에이전트는 원자료를 읽느라 비싼 맥락을 쓴다.

이 설계는 다섯 가지를 바꾼다.

1. **회사 허브:** company_workspace를 유일한 회사 허브로 삼는다. company_db에서 LinkedIn URL로 확인되는 회사 약 9만 곳을 옮긴다.
2. **탐색 경로:** 공고만이 아니라 세 경로로도 후보를 만든다. 원하는 일을 하는 회사, 좋아한 회사와 비슷한 회사, LLM이 알거나 웹에서 새로 찾은 회사다. 모든 후보는 같은 평가기로 한 목록에서 비교된다. 시장 통계 도구는 만들지 않는다. 필요한 시장 정보는 agent가 직접 찾아 쓴다.
   - **내부 회사 제외:** Harper 연결(내부) 회사와 그 공고는 평가 방식이 완전히 다르다. 그래서 이 과정 전체에서 뺀다.
3. **역할 분담:** 넓게 보는 일은 싼 층(검색·평가기)에 맡긴다. 메인 에이전트에게는 판단에 필요한 사실만 한 줄씩 준다. 깊은 확인은 추천 순위가 바뀔 수 있는 후보에만 한다.
4. **탐색 장부:** 매 검색 결과가 세 가지를 알려 준다. 처음 본 후보 수, 상위 후보가 바뀌었는지, 경로별로 몇 번 봤는지다. "더 찾아봐도 지금 추천이 바뀔 가능성이 낮다"를 사실로 판단할 수 있게 된다.
5. **도구와 핸드북 정리:** 쓰이지 않는 리소스 도구 다섯 개를 없앤다. 회사 읽기는 여러 곳을 한 번에 하도록 바꾼다. 탐색 핸드북 두 개는 하나로 합친다.

## 1. 지금 무엇이 문제인가

아래 숫자는 2026-11-18에 운영 DB를 읽기 전용으로 조회하고, 로컬 실험 기록(요청 410개, 도구 호출 1,146회)을 센 결과다.

### 1.1 후보가 공고 쪽에 몰린다

- **추천 대상:** 지난 반복 실험에서 창업자 사례는 추천 24자리가 회사 10곳에 몰렸다. 정민서 사례는 25자리가 6곳에 몰렸다. 토스인슈어런스가 7번, LINE Pay Plus가 6번 나왔다.
- **회사만 추천:** 한 번도 성공하지 못했다.
- **원인:** 공고 직무명 검색은 "비슷한 직무명으로 공고를 많이 올리는 회사"를 고른다. 이런 회사가 이 사람에게 가장 좋은 회사라는 보장은 없다.

### 1.2 회사를 찾을 데이터가 없다

| 항목 | 값 |
| --- | --- |
| company_workspace (고객사 제외) | 30,376곳 |
| 그중 공유 요약이 있는 곳 | 200곳 |
| 그중 회사 설명이 40자를 넘는 곳 | 17,821곳 |
| 그중 채용 페이지 URL이 있는 곳 | 614곳 |
| 회사 검색 색인 | 198건, 임베딩 0건 |
| company_db | 318,560행. LinkedIn 회사 URL이 있는 행 109,231 |
| 후보자 DB 경력 | 약 113만 건(약 36.5만 명). 모두 company_db 회사를 가리킨다 |

지금은 "실제 고객에게 배포되는 AI agent 제품을 만드는 팀"처럼 하는 일로 회사를 찾을 방법이 없다. 반면 비슷한 경력의 사람들이 실제로 어디로 옮겼는지는 Harper만 가진 데이터다. 이 데이터를 아직 쓰지 않고 있다.

### 1.3 메인 에이전트가 원자료를 읽는다

실험 중 가장 큰 요청 하나에서 도구 결과는 약 36만 자였다. 도구 스키마는 27개에 8.9만 자였다.

| 도구 | 한 요청 안의 결과 크기 |
| --- | --- |
| open_url (5회) | 9.6만 자. 페이지 원문 |
| read_matching (4회) | 7.5만 자 |
| search_resources (4회) | 6.3만 자. 공고 목록과 "요약 없음" 반복 |
| get_role_context (3회) | 3.9만 자. JD 원문 |
| search_opportunities (1회) | 3만 자. 30개 항목이 각 약 1,000자이고, 맥락에 이미 있는 Brief 전문을 다시 담았다 |

회사도 하나씩 읽는다. 실험 전체에서 read_resources를 260번 호출했는데, 그중 246번이 회사 한 곳만 읽었다. 검색 결과에 회사 사실이 없으니 회사마다 따로 읽은 것이다.

### 1.4 평가기는 싸고 빠르다

로컬 실행 기록을 보면 평가기는 후보 519개를 12초에, 560개를 14초에 평가했다. 출력 토큰은 0이다. 확률 분류로 점수를 매기기 때문이다. 넓게 평가하는 비용은 병목이 아니다. 병목은 후보를 만드는 방식과 메인 에이전트의 맥락이다.

### 1.5 쓰이지 않는 도구

| 도구 | 실험 호출 | 운영 기록 |
| --- | --- | --- |
| research_resources | 0 | 최근 30일 조사 작업 0건 |
| evaluate_resources | 0 | 최근 30일 평가 작업 0건 |
| manage_result_sets | 0 | result set 0건 |
| manage_views | 0 | — |
| search_resources | 42 (web 18, external_roles 14, companies 10) | 최근 30일 4건. 셋 다 web_search, search_opportunities, 회사 검색과 겹친다 |

### 1.6 멈출 근거가 없다

Harper는 무엇을 얼마나 봤는지 모른 채 "찾았다"고 멈춘다. 같은 방식으로 웹 검색을 반복해도 결과가 거의 바뀌지 않는다. 그래도 그 사실을 알려 주는 것이 없다.

### 1.7 실행 오류

웹에서 찾은 공고를 추천하려다 `Company opportunities unavailable`로 4번 실패했다. 원인은 workspace의 `external_roles_enabled`였다.

- **값의 출처:** false인 회사 1,709곳은 모두 사용자가 공고 링크를 넣어 만들어졌다. 그 공고 2,033개도 전부 `user_submitted`였다.
- **문제:** 이 값은 나중에 같은 회사에 들어온 공개 공고까지 막았다.
- **처리:** 2026-11-18에 이 값을 읽지도 쓰지도 않게 바꿨다(`20261118110000` 마이그레이션, 웹 코드와 Worker). 개인정보 경계는 공고 단위에 남겼다. `user_submitted` 공고는 제출한 사람에게만 추천된다.

## 2. 핵심 논리: 왜 이 방식이 더 좋은 기회를 더 싸게 찾는가

### 2.1 좋은 기회는 공고판 밖에도 있다

경력자에게 이직의 가치는 대부분 회사에서 나온다. 함께 일할 사람, 성장 속도, 보상, 이력서에 남는 이름이 그렇다. 그런 회사가 지금 이 사람의 직무명으로 공고를 내고 있을 확률은 높지 않다.

좋은 기회가 있는 곳을 가리키는 신호는 따로 있다.

| 경로 | 무엇을 보는가 | 왜 좋은 후보가 나오는가 |
| --- | --- | --- |
| 공고 (postings) | 직무명이 비슷한 공개 공고 | 지금 열려 있는 자리를 확실히 잡는다 |
| 하는 일 (companies.about) | 원하는 일을 하는 회사. 공고 유무와 무관 | 공고에 안 보이는 좋은 팀을 잡는다 |
| 비슷한 회사 (companies.like) | 이 사람이 좋아한 회사와 비슷한 회사 | 반응이 쌓일수록 정확해진다 |
| 이름 지정 (named) | LLM이 알거나 웹에서 찾은 회사 | DB에 아직 없는 새 팀을 잡는다 |

각 경로는 다른 경로가 못 보는 곳을 본다. 합치면 시장 전체에 가까워진다.

**시장 통계 도구는 만들지 않는다(2026-11-18 결정).** 비슷한 경력자가 어디로 옮겼는지, 어느 직무 공고가 늘었는지 같은 정보는 agent가 필요하면 웹 검색 등으로 직접 찾는다. 회사 단위 사실(팀 규모·증감, 합류자의 이전 회사, 같은 학교·회사 출신 재직자 수)은 회사 카드에 그대로 붙는다(4.2).

### 2.2 넓게는 싸게, 깊게는 바뀔 수 있는 곳에만

| 층 | 하는 일 | 비용 | 규모 |
| --- | --- | --- | --- |
| 검색 | 임베딩·SQL로 후보를 모은다 | 거의 0 | 경로당 수백 개 |
| 평가 | 같은 기준으로 점수를 매긴다 | 500개에 약 12초 | 검색당 수백 개 |
| 메인 에이전트 | 비교하고 판단하고 설명한다 | 읽는 글자마다 비싸다 | 상위 20줄 안팎 |
| 깊은 확인 | 채용 페이지, 웹, 공고 원문을 본다 | 회사당 수십 초 | 상위 추천에 들거나 빠질 수 있는 몇 곳 |

지금은 메인 에이전트가 원자료를 읽고, 깊은 확인도 회사 하나씩 한다. 새 설계에서는 넓은 일을 아래 두 층이 맡는다. 메인 에이전트는 후보 한 줄씩과 장부만 읽는다. 깊은 확인은 순위가 바뀔 수 있는 후보에만 하고, 여러 회사를 병렬로 처리한다.

### 2.3 경로를 바꿔 가며 찾고, 바뀌지 않으면 멈춘다

검색 결과마다 장부가 붙는다.

- **처음 본 후보:** 이번에 처음 본 후보는 몇 개인가.
- **새 후보의 순위:** 이번 검색에서 처음 본 후보 중 가장 높은 것이 지금까지 평가한 전체 후보 중 몇 위인가.
- **경로별 기록:** 경로마다 몇 번 찾았고, 그 경로의 새 후보가 가장 높게 들어간 순위와 가장 최근 검색의 순위는 얼마인가.

같은 경로를 반복해 처음 본 후보가 줄거나 새 후보의 순위가 계속 낮으면 그 경로는 포화된 것이다. 다른 경로도 높은 순위의 새 후보를 내지 못하면 멈출 근거가 된다. 장부에는 "상위 N개" 같은 고정 개수를 두지 않는다(2026-11-18 변경: 매 검색의 "Top 3"가 추천 개수를 3개 안팎으로 끌어당겼다). 멈출지 판단하는 것은 LLM이다. 근거는 코드가 계산한 사실이다. 안 본 경로는 사용자에게 말하고, 일정으로 이어서 찾는다.

장부는 "총 몇 개를 어떤 방식으로 봤는가"를 설명할 숫자도 준다. 지난 평가 기준 2-1(탐색 범위 설명)을 지침 없이 채우는 방법이다.

### 2.4 회사 지식은 쌓이고, 탐색은 이어진다

- **공유:** 회사 사실(요약, 팀 변화, 투자, 채용 상황)은 모든 사용자가 같이 쓴다. 한 사람을 위해 확인한 채용 페이지는 다음 사람 검색에 바로 쓰인다.
- **재사용:** 개인 평가는 입력이 같으면 다시 하지 않는다. 검색할수록 싸지고 정확해진다.
- **이어 찾기:** 매칭의 후보 풀은 다음 요청의 출발점이다. 적합한 후보가 10개인데 3개만 추천했다면, 다음 요청은 남은 7개와 아직 안 본 경로에서 시작한다.
- **반응 반영:** 사용자 반응은 다음 검색의 비슷한 회사 경로 씨앗이 된다.

### 2.5 설명은 맥락에 있는 사실에서 나온다

Cheiron 같은 설명을 하려면 세 사실이 맥락에 있어야 한다. 스탠퍼드 출신 창업자, 3개월 전 투자, 서울 근무 1.68억이다. 지난 실험에서 설명이 공고 요약에 머문 이유는 맥락에 공고 요약만 있었기 때문이다. 이 설계는 후보 한 줄에 결정적 사실을 넣는다. 글쓰기 지침은 더하지 않는다.

## 3. 흐름 예시: 정민서 사례

정민서는 서울에서 일하려는 AI 제품 엔지니어다. 1억 원 이상을 바라고, 좋은 동료가 있는 탑티어 스타트업을 선호한다. 지원 이력에는 토스와 무신사도 있다. 스타트업만 원하는지, 고연봉 대기업도 원하는지는 아직 모른다.

1. **방향 정하기:** Harper는 프로필·Brief·지원 이력·반응을 읽고 방향 두세 개를 노트에 적는다. 평가 기준으로 쓸 방향은 매칭 scope에 쓴다. scope는 평가기 입력에 이미 들어간다(`externalSearch.ts:231`). 모르는 것은 양쪽 후보를 다 만들어 보고, 답이 검색을 크게 바꿀 때만 묻는다.
2. **첫 검색:** 예를 들어 한 번의 search_opportunities로 두 경로를 병렬로 돌린다. 어떤 경로를 쓸지는 agent가 정한다.
   - companies.about: "실제 고객에게 배포되는 AI agent·LLM 제품을 만드는 팀", 서울
   - postings: Applied AI Engineer 등
   
   평가 600개 안팎이 12~20초 걸린다. 결과는 상위 20줄과 장부다.
3. **깊은 확인:** 상위에 든 회사 중 채용 상황을 모르는 곳 다섯 곳을 read_companies(check)로 한 번에 확인한다. 채용 페이지 공고는 색인돼 후보 풀에 들어간다. 창업자·투자·최근 채용 글은 회사 조사로 저장된다.
4. **두 번째 검색:** 웹에서 새로 안 회사는 named로, 좋아할 만한 회사는 like로 넘긴다. 장부를 보니 상위 3이 두 번 연속 바뀌지 않았다.
5. **추천:** 회사만 추천할 수도 있고, 공고와 섞을 수도 있다. 메시지에서는 무엇을 봤는지 숫자로 말한다. 예를 들면 공고 412개, 회사 180곳이다. 안 본 경로(예: 서울에서 원격으로 일할 수 있는 해외 팀)도 말하고, 그 경로는 일정으로 이어 찾는다.
6. **이어 찾기:** 사흘 뒤 "더 찾아줘"라고 하면, Harper는 풀에서 추천하지 않은 상위 후보와 사용자 반응을 먼저 본다. 새로 찾는 것은 안 본 경로뿐이다.

## 4. 데이터

### 4.1 company_workspace를 회사 허브로

Career가 다루는 회사는 company_workspace 하나다. company_db는 원래 다른 용도로 대충 만들어졌다. 그래서 두 가지에만 쓴다. 이번 한 번의 이전, 그리고 경력 데이터가 가리키는 회사 키(`experience_user.company_id`)를 workspace로 잇는 일이다. 회사 조사는 이미 workspace의 company_datas에 붙는다(20261117160000 마이그레이션).

**이전 대상과 규칙**

- **대상:** company_db 중 LinkedIn 회사 URL(`linkedin.com/company/…`)이 있는 109,231행.
- **식별 키:** URL을 정규화한다. 프로토콜, 서브도메인, 끝 슬래시, 쿼리를 없애고 소문자로 바꾼다.
- **company_db 안의 중복:** 8묶음이다. 채워진 필드가 가장 많은 행 하나만 쓴다.
- **제외:** 같은 정규화 LinkedIn URL을 가진 workspace가 있거나, `company_workspace.company_db_id`로 이미 연결된 행.
- **결과:** 새 workspace 약 89,600곳. 전체는 약 3만에서 약 12만 곳이 된다.
- **이름만 같은 회사:** 합치지 않는다. LinkedIn URL이 다르면 다른 회사다.

**옮길 필드**

| company_db | company_workspace |
| --- | --- |
| name | company_name |
| website_url | homepage_url |
| linkedin_url | linkedin_url |
| logo | logo_url |
| description, 없으면 short_description | company_description |
| id | company_db_id |

투자·규모·설립 연도·위치는 복제하지 않는다. 4.2의 회사 사실 계산이 company_db에서 읽어 workspace의 사실 JSON에 넣는다.

**연결 보완:** 기존 workspace 중 company_db_id가 없는 약 9,600곳은 LinkedIn URL로 연결을 채운다. company_db에서 LinkedIn URL이 없는 약 21만 행은 연결하지 않는다. 표본으로 보면 경력의 약 35%가 이런 회사를 가리킨다. 이 경력은 집계에서 빠진다.

**workspace 안의 중복도 함께 정리한다.** 점검(12절)에서 실제 후보 회사의 중복을 확인했다.

- ElevenLabs는 workspace가 4개다.
- 채널톡은 "채널톡"(공고 추천 가능)과 "Channel Corp."(`external_roles_enabled=false`)으로 나뉘어 있다.

같은 정규화 LinkedIn URL이나 사이트 키를 가진 workspace는 기존 병합 기록(`company_workspace_merge_audit`)을 남기며 합친다. 공고와 조사는 남는 workspace로 옮긴다.

**이전 전에 확인할 것**

- **테넌트 테이블:** company_workspace는 고객사 테넌트 테이블이기도 하다. 행이 12만으로 늘어도 회사 쪽 화면, 가입 도메인 매칭(`signup_domain`), 관리자 목록이 깨지지 않는지 workspace 전체를 읽는 코드를 점검한다.

### 4.2 회사 사실 (코드가 매일 계산)

workspace마다 `career_facts jsonb`와 `career_facts_at`을 둔다.

- **쓰는 곳:** 매일 도는 계산 작업, 그리고 채용 확인(read_companies check).
- **읽는 곳:** 회사 카드 포맷터, 평가기 입력, 검색 필터(규모·지역).

| 키 | 내용 | 출처 |
| --- | --- | --- |
| team | 재직자 수, 최근 12개월 합류·이탈 수, 합류자의 이전 회사 상위 3과 학교 상위 3 | 후보자 DB 경력 |
| leaders | 현재 대표·공동창업자의 학력과 이전 회사 | 후보자 DB 경력. 직함에서 추출 |
| funding | 마지막 라운드, 날짜, 금액, 투자사 | 회사 summary와 조사(company_datas, 출처 포함)에서만 가져온다. 옛 company_data의 투자 필드는 LLM 입력에 쓰지 않는다(2026-11-17 지침). summary가 있는 회사는 200곳뿐이다. 그래서 후보 풀 상위에 오른 회사 중 summary가 없는 곳은 공유 summary 생성(기존 `refreshCompanySummary`)을 걸어 두고, 다음 검색부터 다시 쓴다 |
| profile | 규모 구간, 설립 연도, 위치 | company_db |
| hiring | 열린 공고 수, 최근 공고 날짜, 채용 페이지, 마지막 채용 확인 시각과 결과 | company_roles, read_companies check |

규칙은 두 가지다.

- **범위:** 팀 수치는 Harper가 아는 경력 기준이다. 경력 데이터는 2026년 4월에 마지막으로 수집됐다. 그래서 "최근 12개월"은 수집 시점 기준으로 계산하고, 결과에 "2026-04 기준"을 한 번만 밝힌다. 경력 데이터를 다시 수집하는 주기는 11절에서 정한다.
- **판단:** 어느 회사 출신이 좋은지는 코드가 정하지 않는다. 회사 이름과 수를 그대로 주고 판단은 LLM에 맡긴다. 그래서 "탑 회사 목록" 같은 테이블은 만들지 않는다.

### 4.3 비슷한 회사 계산 (like)

두 회사를 거쳐 간 사람이 많으면 비슷한 회사로 본다. 회사 설명 임베딩이 가까운 회사와 함께 like 경로의 후보가 된다. 이동 수 3명 미만인 짝은 쓰지 않고, 내부 회사는 뺀다(4.6).

### 4.4 회사 색인

- **저장 위치:** 기존 `career_resource_index`(resource_kind `company`)와 색인 작업(`resources/indexing.ts`)을 다시 쓴다.
- **본문:** 회사 이름, 설명이나 summary, 전문 분야, 그리고 지금 열린 공고 제목을 넣는다. 옛 company_data 필드는 넣지 않는다. 공고 제목은 회사가 지금 무엇을 만드는지 가장 최근에 보여 주는 신호다. 점검해 보니 회사 설명에 agent가 들어간 한국 회사는 54곳뿐이었고 대부분 작은 회사였다. 뤼튼, 채널톡, Upstage, Allganize, Sionic처럼 agent 제품을 만드는 회사들은 설명(100~140자 LinkedIn 소개)에 agent라는 말이 없다. 설명만 색인하면 이 회사들을 놓친다.
- **임베딩:** text-embedding-3-small. 12만 곳에 약 3천만 토큰이고, 비용은 약 0.6달러다.
- **검색:** 임베딩과 기존 tsv를 함께 쓴다.
- **갱신:** 요약이나 설명이 바뀌면 다시 색인한다.

### 4.5 매칭 후보 풀

새 테이블 `talent_matching_candidates`를 만든다.

| 열 | 뜻 |
| --- | --- |
| matching_id, number | 매칭 안에서 1부터 매기는 번호 |
| role_id 또는 company_workspace_id | 둘 중 하나만 |
| first_seen_at, first_run_id | 처음 본 시점과 검색 |
| angles text[] | 이 후보를 찾은 경로 |
| latest_evaluation_id | 최신 평가 |

- **제약:** `(matching_id, number)`, `(matching_id, role_id)`, `(matching_id, company_workspace_id)` unique.
- **쓰는 곳:** search_opportunities와 read_companies(check) 실행기가 평가 직후에 쓴다.
- **읽는 곳:** 장부의 처음 본 후보 계산, read_matching 풀, 번호를 받는 도구들(upsert_opportunities, get_role_context, read_companies).
- **새 테이블이 필요한 이유:** 번호는 요청이 바뀌어도 같아야 한다. 노트가 번호로 후보를 가리키기 때문이다. 처음 본 시점과 경로는 나중에 계산으로 되살릴 수 없다.
- **풀에 두지 않는 것:** 탈락 이유는 노트에 적는다. 풀에는 사실만 둔다.

### 4.6 내부 회사와 공고는 이 과정에서 뺀다

Harper 연결(내부) 회사와 그 공고는 평가 방식이 완전히 다르다. 회사 쪽 agent가 후보를 고르고, Career는 그 추천과 사용자가 고른 공개 공고만 다룬다. 그래서 이 설계의 모든 과정에서 `company_workspace.is_internal = true`인 workspace와 그 공고를 뺀다. 그 workspace에 크롤링된 외부 공고도 함께 뺀다.

| 과정 | 처리 |
| --- | --- |
| 이전·중복 정리 | 내부 workspace는 병합하지 않는다. 같은 LinkedIn URL이나 사이트 키를 가진 공개 workspace도 새로 만들지 않는다 |
| 회사 사실·색인 | 계산하지도 색인하지도 않는다 |
| search_opportunities | 공고·회사·이름 지정 모든 경로에서 뺀다 |
| read_companies | 이름 해석·카드·check에서 뺀다. "이 검색에서 다루지 않는 회사"라고만 쓴다 |
| 후보 풀·장부 | 넣지 않는다 |

내부 기회는 기존 경로가 맡는다.

- 회사 쪽 agent가 고른 추천: read_recommended_opportunities
- 사용자가 고른 공개 공고: get_internal_roles, apply_to_internal_role

**지금 코드의 빈틈 (2026-11-18 확인)**

- **외부 공고 검색:** `buildFilterFirstRoleSql`(`jobPostingRecommendations.ts`)은 `is_internal`을 보지 않는다. 운영의 내부 workspace 30곳 중 14곳에 외부 공고가 있다. 이 공고들이 지금 검색과 평가에 들어간다.
- **회사 기회 평가와 이름 해석:** `readCompanyOpportunityRows`와 `searchCareerCompanies`·`resolveCompanyNames`도 내부 workspace를 거르지 않는다.
- **고칠 것:** 세 곳에 `is_internal = false` 조건을 더하고 1단계에 넣는다. 공고 검색 SQL은 일일 외부 추천과 ops 검색도 같이 쓴다. 그래서 그 소비처에서도 내부 회사를 빼는 것이 맞는지 함께 확인한다.

## 5. 도구

### 5.1 정리

| 도구 | 처리 | 근거 |
| --- | --- | --- |
| search_opportunities | 바꿈: 경로 넷, 번호, 장부, 한 줄 결과 | 5.2 |
| read_companies | 신규. read_resources와 search_companies를 대신한다 | read_resources 260회 중 246회가 한 곳씩 |
| upsert_company | 유지. 이름·공식 신원으로 회사 등록도 한다 | |
| read_matching, upsert_matching | 바꿈: 풀, 장부, scope 설명 | 5.4 |
| upsert_opportunities | 바꿈: 후보 번호 입력 | |
| get_role_context | 바꿈: 번호 입력, 여러 개 | |
| open_url | 바꿈: `find`(찾을 말)로 해당 부분만 | 한 요청 9.6만 자 |
| web_search, save_job_posting, follow_company | 유지 | |
| search_resources | 삭제 | 세 용도 모두 다른 도구와 겹친다 |
| research_resources, evaluate_resources | 삭제 | 실험·운영 모두 0회 |
| manage_result_sets, manage_views | 삭제 | 실험 0회, 운영 result set 0건 |
| search_companies | 삭제 | read_companies의 이름 해석으로 대신한다 |

다섯 도구를 지우면 스키마가 약 2.2만 자(약 25%) 줄어든다. 기존 데이터는 지우지 않는다.

### 5.2 search_opportunities

회사를 투자사나 웹사이트로 찾는 사람은 없다. 사람들은 하는 일, 좋아하는 회사와 비슷한 곳, 이미 아는 이름으로 찾는다. 그래서 입력은 이 세 가지에 공고 검색과 실제 제약(지역·규모)만 더한다. 투자·팀 구성·연봉은 검색 조건이 아니라 결과에 붙는 사실이다. 평가기도 이 사실을 읽는다.

```ts
search_opportunities({
  matchingId?, note?,
  postings?:  { titles: string[]; countries: Record<string, { weight: number }>; at?: Array<number | string> },
  companies?: { about?: string; like?: Array<number | string>; size?: "startup" | "scaleup" | "large"; places?: string[] },
  named?:     string[],   // 회사 이름, 공식 사이트, LinkedIn, 공고 URL
  action?: "read" | "cancel", cursor?: string,
})
```

**실행**

- **병렬 검색:** 경로마다 검색한다. postings는 공고, companies는 회사, named는 회사나 공고를 만든다.
- **내부 회사 제외:** 모든 경로에서 내부 workspace와 그 공고를 뺀다(4.6).
- **평가:** 후보를 합치고 중복을 없앤 뒤 같은 평가기에 넣는다.
- **평가 수:** 기본값은 postings 400, companies 150, named는 전부다. 평가기가 빠르므로 숫자는 시간 제한에서 정한다.
- **새 회사 등록:** named에 디렉터리에 없는 회사가 오면 웹에서 공식 사이트와 LinkedIn을 찾아 등록한다. 같은 이름의 회사가 여러 곳이면 후보만 돌려준다.
- **at:** 회사 번호나 workspace id를 받는다. 그 회사들의 공고만 평가한다. 회사 카드에서 관련 공고를 보고 공고 단위로 비교하고 싶을 때 쓴다.

**회사 평가 입력.** 평가 기준표(`fitQuestions.v4`)는 그대로 둔다. 입력에는 세 가지를 더한다.

- 회사 사실(4.2)
- 관련 공고: 매칭 직무명과 공고 제목 임베딩(`company_roles.title_embedding`)이 가까운 공고의 수와 상위 3개 제목
- 연결 경로 사실: 공개 공고가 있는지, 사용자와 같은 회사·학교 출신 재직자 수

**공고는 수만 줄지 채점할지.** 회사 평가에는 관련 공고 수와 상위 제목만 넣는다. 공고 채점은 LLM이 `postings.at`으로 고른 회사에만 한다. 이유는 둘이다.

- 회사가 좋은지와 그 회사의 어느 자리가 맞는지는 다른 질문이다.
- 회사 150곳의 공고를 모두 채점하면 메인 에이전트가 읽을 줄이 몇 배로 늘어난다.

**결과 예시**

```
검색 3 · 경로 2개 · 612개 평가, 처음 본 것 233
가장 높은 새 후보: [41] Cheiron, 전체 1,072개 중 2위
경로: postings 3회(새 후보 최고 1위 · 검색 1, 최근 검색 57위) · companies 1회 · named 0회

[41] Cheiron · 회사 · 86 · 신규 · companies
  AI 에이전트 인프라 · 팀 23명(1년 +11; Google 4, Meta 2 출신) · 2026-08 시드(a16z) · 관련 공고 1: Founding Engineer
[12] Sendbird · Applied AI Engineer · 84 · postings
  서울 하이브리드 · 공고 연봉 1.1~1.4억 · 팀 410명(1년 +35) · 시리즈 C
…
점수 순 20개 / 612개. 다음: cursor 20. 팀 수치는 Harper가 아는 경력 기준.
```

### 5.3 read_companies

```ts
read_companies({
  companies: Array<number | string>,  // 후보 번호, workspace id, 이름, 공식 사이트, LinkedIn
  topics?: string[],                   // 저장된 회사 조사 라벨을 출처와 함께
  check?: boolean,                     // 지금 채용 상황을 확인한다
  matchingId?, note?,
})
```

- **기본 결과:** 회사마다 카드 3~5줄이다. 요약 첫 문단과 회사 사실이 들어간다.
- **topics:** 저장된 조사 원문을 출처와 함께 준다.
- **check:** 회사별로 병렬 실행한다.
  1. **채용 페이지:** career_url이나 공식 사이트에서 채용 페이지와 ATS를 찾는다. 공고 목록 중 매칭 직무와 관련된 공고는 기존 공개 색인 함수(`career_index_public_job_v1`)로 등록해 후보 풀에 넣는다.
  2. **최근 소식:** 최근 90일의 채용 글·투자·출시 소식을 찾는다. 작성자, 날짜, 링크를 함께 준다.
  3. **리더:** 공개 소개 페이지와 프로필에서 창업자·리더 이력을 찾는다.
  
  결과는 회사 조사(company_datas)의 hiring·people 라벨에 출처와 함께 저장된다. 다른 사용자도 다시 쓴다. 7일 안에 확인한 회사는 저장된 결과를 쓰고, `freshness`로 바꿀 수 있다.
- **이름 해석:** 디렉터리에 없는 이름은 named와 같은 방식으로 등록한다. 내부 workspace로 해석되는 이름은 이 도구에서 다루지 않는다. 결과에는 "이 검색에서 다루지 않는 회사"라고만 쓰고, 연결 회사라는 사실은 밝히지 않는다(4.6).

공고가 없는 회사도 check가 채용 신호와 연결 경로를 찾아 준다. 그래서 회사 자체를 추천할 근거가 생긴다.

### 5.4 read_matching, upsert_matching

- **read_matching 개요:** 제목, scope, 노트 최근 페이지, 풀 요약(예: "평가 612 · 회사 180 · 추천 3 · 반응 2"), 경로 장부, 현재 추천(번호와 반응)을 준다. 매칭 기준은 현재 Brief와 다를 때만 보인다.
- **section `pool`:** 점수순이나 번호순으로 한 줄씩 준다. 종류, 추천 여부, 경로로 거를 수 있다. 지난 실험에서 이전 목록을 먼저 보여 주면 첫 판단이 그 목록에 묶였다. 그래서 개요에는 숫자만 두고, 목록은 요청할 때만 준다.
- **upsert_matching:** scope를 고칠 수 있다(이미 된다). 도구 설명에 "평가기가 이 scope로 점수를 매긴다"는 사실을 적는다.

### 5.5 나머지

- **upsert_opportunities:** `items: [{ candidate: 41, explanation }]` 형태로 번호를 받는다. 기존 roleId와 companyWorkspaceId도 계속 받는다.
- **get_role_context:** 번호 여러 개를 받는다.
- **open_url:** `find`를 주면 그 말이 나오는 문단과 위치만 돌려준다. 원문은 위치로 이어 읽는다. 요약하거나 다시 쓰지 않는다.

## 6. 도구 결과 텍스트 계약

모든 탐색 도구 결과에 적용한다. 새 도구를 만들거나 결과를 바꿀 때마다 이 계약으로 확인한다.

1. **판단에 쓰는 사실만:** 원문은 번호로 필요할 때 읽는다.
2. **이미 있는 것은 다시 주지 않는다:** Brief, 프로필, 앞선 결과는 다시 싣지 않고 바뀐 것만 준다.
3. **점수는 가중 점수 하나:** 가중치는 mutualFit 55%, candidateInterest 35%, companyInterest 10%다. 제약 위반 감점도 들어간다(`rankScore`).
4. **UUID 대신 매칭 안 번호:** 시각은 날짜까지만 쓴다.
5. **예외만 말한다:** "완료됨" 같은 기본 상태는 쓰지 않는다. 실패, 부분 결과, 범위 제한만 쓴다.
6. **범위 설명은 결과마다 한 번:** 예를 들어 "팀 수치는 Harper가 아는 경력 기준"이다.
7. **도구 계약은 도구 설명에:** 결과마다 반복하지 않는다.
8. **페이지:** 상위 20줄과 커서를 준다.

검증할 때는 같은 재현 요청에서 한 턴의 도구 결과 글자 수와 추천 품질을 함께 잰다. 글자 수가 줄어도 추천 품질이 떨어지면 실패다.

## 7. 멈춤과 이어 찾기

**장부 계산**

- **처음 본 후보:** 이번 검색 전에 `talent_matching_candidates`에 없던 후보.
- **순위:** 풀에서 가중 점수 순이다. 사용자가 거절한 후보, 막은 회사, 마감된 공고는 뺀다. Harper가 점수와 다른 순서를 고를 수 있다. 장부는 비교할 기준만 준다.
- **경로별 기록:** 검색마다 경로별로 새 후보의 최고 순위를 저장하고(`metrics.ledger.bestNewByAngle`), 경로별 횟수·최고 순위·최근 순위를 계산한다.
- **이번 요청의 작업량:** "Search work in this request so far"는 이번 요청에서 처음 비교한 후보를 공고·회사로 나눠 한 번씩만 센다. system prompt에는 넣지 않고 추천을 게시한 결과에 붙인다. 매 단계 system이 바뀌면 캐시가 깨지기 때문이다.

**멈춤**

멈출지는 LLM이 판단한다. 핸드북에는 목적만 적는다. "서로 다른 경로가 더 이상 추천을 바꾸지 못하면 충분하다. 무엇을 봤고 무엇을 안 봤는지 말한다." 횟수 상한이나 점수 기준은 두지 않는다.

**이어 찾기**

- **일정 예약:** 안 본 경로는 기존 schedules로 예약한다.
- **백그라운드 실행:** 노트와 풀을 읽고 남은 경로를 찾는다. 알릴지 말지는 기존 proactive 핸드북의 판단을 따른다.
- **"더 찾아줘":** 풀에서 추천하지 않은 상위 후보와 사용자 반응을 먼저 본다. 반응한 회사는 like 경로의 씨앗이 된다.

## 8. 핸드북 통합안

`opportunity_discovery`(methods)와 `opportunity_search`를 하나로 합친다. 단계 목록은 쓰지 않는다. 목적, 노트와 풀의 목적, 멈춤의 목적, 실행 계약만 쓴다.

**도구 이름은 쓰지 않는다.** 핸드북은 특정 도구를 해결 방법으로 내세우지 않는다(2026-11-18 지침). 각 도구가 무엇을 하는지는 도구 설명에만 있다. 경력 이동 집계는 핸드북에서 언급하지 않는다.

1~3절에 적은 흐름은 이 목적과 도구만으로 나와야 한다. 나오지 않으면 문장을 더하지 않고, 어떤 사실이 맥락에 빠졌는지 먼저 본다.

```
# Finding and recommending opportunities
Purpose: find the few options this person would most want to pursue if they could see the whole market, and could realistically reach. An option is a posted role, a public hiring post or a company itself. For an experienced person the employer often decides most of a move's value; a company worth joining can be recommended whether or not it advertises a fitting role, with the teams or roles that matter and a credible route to its people.

The matching's scope is the direction its evaluations are scored against; the note holds why you chose it. Past titles and industries help judge access; they do not bound the search.

Postings show what is advertised under a title; they are one view of the market, not the market. A team Harper does not know yet can be registered and compared with everything else. Search results report how much of what was found was new and whether the strongest options changed. Spend deeper reading on options whose place in your recommendation could change.

Each matching keeps a research note and a pool of every option evaluated for it. Nothing from this turn carries over except what they hold: when the person asks for more, reacts to a recommendation or a scheduled check runs, continue from them. Steps and the person's reactions are recorded automatically. Add your own thinking as you go: what you are testing, what results showed, why options were dropped or chosen, what remains worth trying. Keep the note compact by rewriting, merging or deleting entries by number.

Searching is enough when looking from different views no longer changes what you would recommend. Tell the person what you compared and what you have not looked at; an unexplored view can continue later through a schedule. Explain each recommendation by what makes it worth this person's move compared with the alternatives, and the tradeoffs that matter for that choice. No recommendation count, company quota or score cutoff is implied.
```

이어서 기존 실행 계약 문단을 중복 없이 붙인다.

- upsert_opportunities 게시와 목록 관리
- save_job_posting 모드
- Harper 연결 Role 범위
- Brief와 매칭의 관계
- 일정
- 연봉 환율 맥락

다음은 뺀다.

- result set·view 문단
- research_resources·evaluate_resources 설명
- 핸드북 두 개에 겹쳐 있던 설명

## 9. 실행 경계

결정론적 검증은 아래 경계에만 둔다.

| 경계 | 검증 | 막는 오류 |
| --- | --- | --- |
| 회사 등록 | 정규화 LinkedIn URL과 사이트 키(`career_company_url_key_v1`, `career_company_site_key_v1`). 내부 workspace도 대조한다 | 같은 회사가 두 번 생긴다. 내부 회사의 공개 사본이 생겨 외부 기회로 평가된다 |
| 내부 회사 제외 | 공고 검색·회사 평가·이름 해석·색인·경력 이동·후보 풀에서 `is_internal = false` | 다르게 평가해야 할 내부 회사와 공고가 외부 기회로 평가·추천된다 |
| 경력 집계 | 이동 3명 미만 제외, 이름 비노출 | 개인 경력이 드러난다 |
| 후보 풀 | 번호·대상 unique | 번호가 다른 후보를 가리킨다 |
| 회사 조사 공유 | 공개 출처만(기존 공개 사실 계약) | 개인 자료가 공유 조사로 새어 나간다 |
| 공고 추천 | `user_submitted` 공고는 제출한 사람에게만(공고 단위) | 한 사용자가 비공개로 넣은 공고가 다른 사용자에게 추천된다 |

workspace 단위 `external_roles_enabled`는 2026-11-18에 쓰지 않게 바꿨다(1.7). 컬럼 삭제는 웹과 Worker를 배포한 뒤 별도 마이그레이션으로 한다.

## 10. 구현 순서와 검증

| 단계 | 내용 | 끝났다는 기준 |
| --- | --- | --- |
| 1 | company_db 이전, 회사 색인, 회사 사실 계산, 공고 추천 오류 수정 | 운영 데이터 복사본에서 이전 건수와 중복 0건 확인. 회사 하는 일 검색 결과를 눈으로 확인 |
| 2 | search_opportunities의 companies·named 경로, 후보 풀과 번호, 한 줄 결과, 장부 | 정민서 재현에서 회사 후보가 상위에 들어오고, 도구 결과 글자 수가 줄었는지 확인 |
| 3 | like(경력 이동 기반 비슷한 회사) | 집계가 정확하고 개인정보 경계를 지키는지 확인. 쓸지는 agent가 정하므로 사용 빈도는 목표로 삼지 않는다 |
| 4 | read_companies(check), 리소스 도구 삭제, 핸드북 통합 | 공고 없는 회사 추천이 실제로 나오는지 확인 |
| 5 | 일정으로 이어 찾기 | 다음 요청이 풀과 안 본 경로에서 시작하는지 확인 |

**기준 목록:** 정민서와 창업자 페르소나마다 비용 제한 없이 모든 경로를 끝까지 돌린다. 그렇게 상위 후보 목록을 만들고 대표님이 검토해 확정한다. 이 목록이 있어야 멈춤 규칙과 경로의 효과를 숫자로 비교할 수 있다.

**지표**

1. 최종 추천 3개 중 기준 목록에 든 수
2. 같은 비용(호출 수, 도구 결과 글자 수, 시간)으로 기준 목록에서 찾은 수
3. 지난 세 점수: Best 3 느낌, 탐색 설명, 고유성 전달
4. 회사만 추천한 경우가 나오는가
5. 한 턴의 도구 결과 글자 수(지금 약 36만 자)

한 페르소나 결과만 보고 지침을 바꾸지 않는다. 결과가 나쁘면 맥락에 빠진 사실을 먼저 찾는다.

## 11. 결정이 필요한 것

1. **후보자 DB 사용:** candid·experience_user를 Career 쪽 집계(경력 이동, 팀 구성)에 써도 되는가. 설계는 집계만 쓰고, 3명 이상만 보이며, 이름을 내보내지 않는다.
2. **테넌트 테이블 영향:** company_workspace에 약 9만 곳을 넣어도 회사 쪽 화면, 가입 도메인 매칭, 관리자 목록에 문제가 없는가. 코드를 점검한 뒤 진행한다.
3. **다른 세션과 조율:** company workspace 허브와 회사 조사를 다른 세션이 함께 작업하고 있다. 같은 파일을 고치기 전에 조율한다.
4. **경력 데이터 갱신:** 경력 데이터는 2026년 4월이 마지막 수집이다. 팀 변화와 경력 이동은 시간이 지날수록 낡는다. 다시 수집하는 주기를 정한다.

## 12. 첫 추천 점검 (2026-11-18)

AI 연구자 출신 창업자 프로필 하나를 새로 가입한 사용자로 가정했다. 그리고 1~3절 흐름의 각 단계가 실제 운영 데이터로 돌아가는지 읽기 전용 조회로 확인했다. 개인 데이터는 집계 수치만 봤다.

### 12.1 첫 추천이 실제로 만들어지는 곳

온보딩이 끝나면 Career agent가 백그라운드 턴(`conversation_completed`)으로 대화를 이어 간다. 이 턴의 답이 사용자 채팅에 바로 나타난다. 이 턴이 받는 지시는 다음이 전부다.

- "온보딩이 끝났다"는 사실
- 대화를 이어 가는 안내(`postOnboardingGuide.ts`)

최근 14일 운영 집계는 이렇다.

| 항목 | 값 |
| --- | --- |
| 온보딩 완료 | 383명 |
| 1시간 안에 추천을 받은 사람 | 347명(91%) |
| 1시간 안에 외부 검색을 돈 사람 | 304명 |
| 첫 추천까지 걸린 시간 | 중앙값 2.4분, 상위 10% 4.7분 |
| 첫 추천 수 | 평균 8개 |
| 회사만 추천한 경우 | 2,776개 중 0개 |

그래서 이 설계가 가장 먼저 효과를 내야 하는 곳은 이 턴이다. 사용자가 채팅을 보며 기다리는 시간이기도 하다.

### 12.2 단계별 결과

| 단계 | 결과 | 막히는 점과 고칠 것 |
| --- | --- | --- |
| 참고 정보: 이런 사람들은 어디로 가나 (도구로 만들지 않기로 함) | 회사 기준(작은 회사 두 곳 출신): 95명, 64곳에 흩어지고 최다 4명. 직무 기준(AI 직무, 한국, 2019년 이후): 4,281명, 2024년 이후 이동 1,413건. 상위는 카카오·네이버 32, 삼성전자·토스 31, KT 25 순이고, 무신사 6도 나온다 | 직무 기준이어야 쓸 만하다. 이동 수만 보면 큰 회사가 덮으므로 lift 목록을 함께 준다(4.3). 대학원·군 복무도 이동처로 섞여 나온다. 데이터는 2026-04 기준이다. 2026-11-18 결정으로 도구는 만들지 않는다 |
| 좋아할 회사 찾기: agent 초기 스타트업 | 회사 설명에 agent가 들어간 한국 회사는 54곳이고 대부분 작은 회사다. 실제 agent 회사들(뤼튼 61, 채널톡 73, Upstage 48, Allganize 16, Sionic 5개 공고)은 workspace에 있지만 설명에 agent라는 말이 없다 | 색인 본문에 지금 열린 공고 제목과 최근 소식을 넣는다(4.4). LLM이 아는 회사는 named로 바로 찾을 수 있다 |
| 좋아할 회사 찾기: 오디오 | ElevenLabs(117개 공고, 중복 workspace 4개), Suno 63, 타입캐스트 5, 코클 1, Supertone·리턴제로 0. 가우디오랩은 Harper 연결 회사다 | 오디오는 공고 경로로 찾기 어렵다. named와 check로 회사부터 봐야 한다. 가우디오랩은 내부 회사라 이 과정에서 뺀다. 내부 기회는 회사 쪽 선정 경로가 다룬다(4.6) |
| 회사 사실(summary, members) | 팀 구성은 경력 데이터로 계산된다. 예: Supertone 재직 33명, 12개월 합류 1명·이탈 15명. Upstage 144명이고 이전 회사 1위는 네이버 20명. Cheiron 14명, 합류 4명. 공유 summary는 200곳뿐이다. 옛 company_data에는 투자 필드가 9,825곳 있지만 지침상 LLM 입력에 쓰지 않는다 | 투자 같은 사실은 summary와 조사로만 들어간다. 후보에 오른 회사의 summary를 만들어 공유한다(4.2) |
| 공고 검색 | 열린 외부 공고 127,798개. agent 직무명은 한국 163개, 샌프란시스코 231개다. 오디오 연구·엔지니어 직무는 한국 14개인데 절반은 "voice"가 다른 뜻으로 걸린 것이다 | agent 방향은 공고 경로로 충분하다. 오디오 방향은 회사 경로가 필요하다. 직무마다 효율적인 경로가 다르다는 가정이 데이터로 맞았다 |
| 연결 여지 | 사용자와 같은 학교·회사 출신 재직자 수가 계산된다. 예: 뤼튼은 같은 학교 출신 9명과 이전 회사 출신 2명. Upstage는 같은 학교 14명 | 개인을 드러내지 않고 수만 준다 |
| 추천 게시 | Cheiron workspace는 공고가 3개 열려 있는데 `external_roles_enabled=false`라서 공고 추천이 거절됐다. 이 값은 2026-11-18에 쓰지 않게 바꿨다(1.7). 다만 지금 Cheiron 공고 3개는 다른 사용자가 비공개로 넣은 것이다. 그래서 공개 출처로 다시 색인해야(save_job_posting index) 추천할 수 있다. 회사 자체 추천은 원래 막히지 않는다. 채널톡은 workspace가 둘로 나뉘어 있다 | workspace 중복 정리와 추천 경계 수정이 1단계에 들어가야 한다(4.1, 9절) |
| 공고 없는 회사 | 채용 페이지 URL이 있는 workspace는 614곳뿐이다 | check가 공식 사이트에서 채용 페이지를 찾아야 한다. summary 생성과 공개 공고 색인은 기존 경로를 다시 쓴다 |
| 이어 찾기 | 데이터 문제는 없다 | 4.5 후보 풀 그대로 |

### 12.3 새로 가입한 사용자에게 없는 것

새로 가입한 사용자에게는 Harper 지원 기록이 없다. "토스·무신사에 지원했으니 대기업에도 열려 있다"는 판단은 Gmail을 연결하거나 대화에서 말해야 가능하다(`gmail_connected` 턴).

첫 턴에서 쓸 수 있는 것은 프로필과 온보딩 대화로 만든 Brief다. 시장 정보가 더 필요하면 agent가 직접 찾는다.

### 12.4 첫 턴 흐름과 시간

1. **검색 1회:** 예를 들어 companies와 postings를 병렬로 돌린다. 평가 600개 안팎에 약 20초다.
2. **check 1회:** 상위 회사 5곳을 병렬로 확인한다. 회사당 수십 초이고, 병렬이라 전체도 비슷하다.
3. **첫 추천 3개 게시.**
4. **나머지 경로는 일정으로 이어 찾는다.**

지금 중앙값 2.4분 안에 들어오려면 check는 첫 추천에 꼭 필요한 회사에만 써야 한다. 그 판단은 장부와 LLM에 맡긴다.

### 12.5 결론

흐름 자체는 이 설계로 돌아간다. 다만 아래 일곱 가지를 고쳐야 처음 의도대로 나온다. 1~6번은 2·4·5·9절에 반영했다. 7번은 11절의 결정 사항으로 남겼다.

1. 경력 이동 집계는 도구로 만들지 않는다(2026-11-18 결정). 회사 단위 사실만 회사 카드에 붙인다.
2. 회사 색인에 지금 열린 공고 제목을 넣는다.
3. 투자 같은 사실은 summary와 조사로만 넣는다. 후보 회사의 summary를 만들어 공유한다.
4. workspace 중복을 정리한다.
5. 공고 추천 경계(`external_roles_enabled`)를 고친다. 2026-11-18에 처리했다(1.7).
6. 내부 workspace와 공고를 모든 과정에서 뺀다. 지금 코드는 공고 검색, 회사 평가, 이름 해석에서 이들을 거르지 않는다.
7. 경력 데이터 갱신 주기를 정한다.

## 13. 구현 상태 (2026-11-18 구현, 2026-11-20 운영 배포)

2026-11-18에 로컬에서 구현했고, 2026-11-20에 아래 마이그레이션을 운영 DB에 적용한 뒤 웹·Worker를 배포했다. 적용 방식은 [운영 적용 기록](agent-guidance/rollout-history.md)에 있다.

### 13.1 만든 것

| 항목 | 위치 |
| --- | --- |
| `external_roles_enabled` 사용 중단 | `20261118110000_career_stop_using_external_roles_enabled.sql`. 웹의 공고 검색 SQL 2곳, Worker `new_role_search.py`. 사용자 제출 공고는 제출자에게만 추천된다 |
| 내부 회사 제외 | Career 공고 검색(`excludeInternalCompanies`), 회사 기회 평가, 회사 이름 해석(`companyNames.ts`), 회사 색인·사실·비슷한 회사 SQL |
| company_db 이전과 연결 보완 | `20261118120000_career_company_discovery.sql` 1a·1b. LinkedIn 회사 페이지 기준이고, 같은 공개 이름이 이미 있으면 넣지 않는다 |
| 회사 사실(요청할 때 계산) | `career_company_facts_v1`, `companies/discovery.ts`의 `readCompanyFacts`·`formatCompanyFacts`. 배치별로 15초를 넘기면 사실 없이 진행한다 |
| 회사 색인과 검색 | `career_company_search` 테이블, `career_search_companies_v1`, `indexCompanies`, `scripts/career/indexCompanySearch.ts` |
| 비슷한 회사 | 색인 임베딩 평균과 `career_company_coflow_v1`(회사 규모로 나눈 공유 인원)을 번갈아 합친다 |
| search_opportunities 재구성 | `postings`(at 포함)·`companies`(about·like·size·places)·`named`·`roleIds`. 실행기는 `companyCandidateIds`와 `angles`를 저장한다. 회사 평가 입력에 회사 사실을 넣는다 |
| 후보 풀·번호·장부 | `talent_matching_candidates`, `career_record_matching_candidates_v1`, `matching/candidatePool.ts`, `searchOutput.ts`. 장부는 실행 기록 `metrics.ledger`에 남긴다 |
| 번호 입력 | upsert_opportunities `items[].candidate`, get_role_context `roleIds`의 숫자, read_companies·postings.at·companies.like |
| read_matching | 개요에 풀 요약과 경로 기록, `section: "pool"` 목록 |
| read_companies | `companies/readCompanies.ts`. 카드, topics, check(요약 갱신과 90일 공개 글·소식) |
| 도구 정리 | search_resources·research_resources·evaluate_resources·manage_result_sets·manage_views·search_companies를 agent에게서 뺐다. read_resources 정의는 회사 상세 DB 테스트용으로만 남았다 |
| open_url find | `agentTools/web.ts`의 `findPassages`. 페이지 전체에서 찾은 문단을 위치와 함께 준다 |
| 핸드북 통합 | `opportunity_search` v31 하나. `opportunity_discovery`는 지웠다 |
| 고객사 우선 조회 | ops 이름 검색 2곳, Worker `company_db_id` 조회 2곳이 고객사 workspace를 먼저 고른다 |

### 13.2 남은 것

- **운영 색인:** 2026-11-20 배포 때 `scripts/career/indexCompanySearch.ts`로 운영 회사 색인을 채웠다(운영 적용 기록). 새 회사는 이름·URL 등록과 회사 확인 때 색인된다.
- **컬럼 삭제:** 웹과 Worker를 배포한 뒤 별도 마이그레이션으로 `external_roles_enabled` 컬럼을 지운다.
- **workspace 중복 합치기:** 합치는 루틴이 없다. 80개 가까운 참조 테이블을 옮겨야 해서 따로 만든다.
- **채용 확인 결과 저장:** check가 찾은 최근 공개 글은 결과로만 준다. 요약 갱신과 채용 신호(`hiring signal`)는 저장된다.
- **read_resources 테스트 이전:** 회사 상세 DB 테스트를 read_companies로 옮긴 뒤 read_resources 정의를 지운다.
- **기존에 있던 보안 문제:** `/api/match/workspace`는 LinkedIn URL만으로 같은 `company_db_id`의 workspace 소유자를 붙인다. 이번 작업 전부터 있던 문제다. 재직 확인 없이 고객사 workspace에도 붙을 수 있어서 따로 판단이 필요하다.

### 13.3 실제 사용자처럼 돌린 결과 (로컬, i10)

이전 반복 실험과 같은 두 사례를 실제 채팅 UI로 돌렸다. 기록은 `docs/evaluation/career-opportunity-discovery/private/iterations/i10`에 있다.

| 항목 | 창업자 사례("아니 새걸 찾아줘") | 정민서 사례("저한테 맞는 곳 추천해 주세요") |
| --- | --- | --- |
| 쓴 경로 | 공고와 회사 설명을 한 번에, 이어서 이름 지정. 후보 풀, 번호로 공고 읽기와 회사 읽기 | 새 매칭을 만든 뒤 공고·회사 설명·이름 지정을 한 번에. 번호로 회사 읽기, 웹사이트로 회사 읽기 |
| 장부 | "700 evaluated (postings 400 · companies 300), 565 new", 상위 3 변경 표시(2026-11-18에 새 후보 순위로 교체) | "303 evaluated (postings 150 · companies 153)" |
| 최종 추천 | 텍트그룹 AI Product Engineer, 당근 AI Platform, 타입캐스트 Voice AI System Engineer, 사이오닉 FDE. 모두 이전 추천과 다르다 | LINE Pay Server Engineer, 토스 서버 개발자 |
| 도구 결과 합계 | 약 20.4만 자(가장 큰 것: 공고 원문 4.7만, read_matching 4.3만) | 약 9.8만 자 |
| 도구 스키마 | 22개, 6.3만 자(이전 27개, 8.9만 자) | 21개, 6.1만 자 |

**남은 관찰**

- **회사 자체 추천:** 회사 설명 검색으로 찾은 타입캐스트가 회사로 1위였지만, agent는 맞는 공고가 있어 공고로 추천했다. 회사 자체 추천은 맞는 공고가 없을 때 나와야 하므로 이 판단은 자연스럽다.
- **탐색 범위 숫자:** 두 답 모두 "얼마나 봤는지"를 숫자로 말하지 않았다. 장부에는 숫자가 있다. 지침을 더하지 않고 지켜본다.
- **read_matching 개요의 크기:** 한 요청에 4만 자를 넘는다. 노트와 추천 목록이 대부분이라 다음 정리 대상이다.
