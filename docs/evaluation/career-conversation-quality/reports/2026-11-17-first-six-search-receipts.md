# 여섯 대화에서 웹 검색이 늘어난 이유

11월 16일 보고서에 연결된 턴별 실행 기록 62개를 다시 셌다. 일부 사례를 재실행해 반영한 보고서이므로 디렉터리 전체를 합산하면 숫자가 달라진다. 검색 내역과 비용은 같은 턴을 기준으로 비교해야 한다. [원래 보고서와 실제 답변](2026-11-16-notion-first-six-v10.md)

## 어떤 대화에서 늘었나

각 숫자는 모델이 웹 검색을 요청한 횟수다. 한 사람의 검색 결과에 처음 등장하는 URL이 하나라도 있으면 ‘새 URL 있음’으로 셌다. 이미 본 URL의 순위만 바뀌면 ‘앞선 URL만 나옴’으로 셌다.

| 사람 | 변경 전 | 변경 후 | 차이 | 변경 후 새 URL 있음 | 변경 후 앞선 URL만 나옴 |
|---|---:|---:|---:|---:|---:|
| 오늘의집 백엔드 엔지니어 | 0 | 3 | +3 | 3 | 0 |
| 토론토 재무기획 매니저 | 1 | 0 | -1 | 0 | 0 |
| 결제 앱 디자이너 | 3 | 14 | +11 | 3 | 11 |
| 영업 운영자 | 4 | 9 | +5 | 4 | 5 |
| 부산 주니어 개발자 | 5 | 11 | +6 | 6 | 5 |
| 금요일까지 답해야 하는 AI 엔지니어 | 17 | 21 | +4 | 4 | 17 |
| **합계** | **30** | **58** | **+28** | **20** | **38** |

58회 중 57회는 `web_search`, 1회는 `search_resources(source=web)`이었다. 마지막 도구 한 번에 검색어 네 개가 들어갔다. 운영 구현은 검색어마다 공급자에 한 번씩 보내므로 같은 인자라면 과금 대상 검색 요청은 61회다. 이 평가는 14개 공개 페이지를 재생해 실제 검색 공급자에 보낸 요청은 0회다.

원래 30회에서는 새 URL이 13회, 이전 턴의 URL만 나온 경우가 6회, 같은 턴 이전 모델 호출에서 이미 받은 URL만 나온 경우가 4회였다. 같은 모델 응답에서 한꺼번에 요청한 검색끼리 겹친 경우는 4회, 결과가 빈 경우는 3회였다. 변경 후 58회에서는 각각 20회, 27회, 9회, 2회, 0회였다. 같은 묶음에서 동시에 고른 두 질의는 앞선 결과를 보고 반복한 것으로 볼 수 없다.

이 분류는 검색 결과의 추가분을 재는 방법이다. 이전 URL이 나오더라도 그 순위나 새로운 출처를 찾으려던 목적에 가치가 있을 수 있다. 실제 웹에서는 다른 출처나 다른 발췌문이 나올 수도 있다. 이 자료에서 URL별 발췌문은 검색어를 바꿔도 같다. 14개 중 11개는 발췌문이 제목과 같고, 나머지 3개는 제목에 회사나 문서명을 덧붙인 정도다.

## 사용자에게 어떤 차이가 있었나

- **오늘의집 백엔드 엔지니어**. 기본급을 먼저 확인해 달라는 마지막 요청에서 세 번을 검색했다. 세 검색 모두 새로운 URL을 돌려줬다. 그중 당근페이 공식 공고에서 주문·결제 업무를 찾았고 제3자 연봉 추정치도 구분했다. 기본급 1억 1천만 원을 받을 수 있는지는 확인되지 않았다. [해당 턴의 답과 호출](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-1/payments_backend_6-1.json)

- **토론토 재무기획 매니저**. 가입할 때 가져온 실제 공고와 이미 고른 역할의 상세 정보를 사용했다. 웹 검색 없이 공급사 결제 조건 협상 경험을 소개에 넣고, 구매 결정권과 현금 CAD 15만을 확인할 사항으로 짚었다. [해당 턴의 답과 호출](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-1/toronto_finance_4-1.json)

- **결제 앱 디자이너**. 처음 추천을 앞당겨 vooy를 찾았지만 마지막 티타임 질문 한 번에 여섯 번 더 검색했다. 세 개씩 두 차례로 ‘커피챗’, ‘티타임’을 바꿔 찾았고 여섯 검색 모두 앞선 턴에서 본 URL만 돌려줬다. 실제 신청 방식은 이미 열었던 공식 공고 본문에 있었다. 같은 공고를 다시 저장한 도구는 이전 추천을 재사용했다고 응답했다. [해당 턴의 답과 호출](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/product_designer_5-1.json)

- **영업 운영자**. Salesforce 경험과 해외 영업 운영을 말했을 때 검색을 시작했다. 희망 급여와 APAC 시장이 명확해진 뒤 서울 GPU 회사 공고를 골랐다. 마지막 두 검색은 첫 분기부터 맡을 시장이라는 새 질문에 답하려 했지만 앞서 나온 URL만 돌려줬고 시장과 연락처를 끝내 확인하지 못했다. [해당 턴의 답과 호출](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/sales_operations_5-1.json)

- **부산 주니어 개발자**. 부산에 살면서 동료에게 리뷰받고 싶다는 말에 일찍 검색을 시작했다. 가끔 직접 만나도 좋다고 한 마지막 턴의 첫 세 검색은 이전 URL만 돌려줬다. 일곱 검색 끝에 고른 NARWHAL의 채용문에는 정작 중요한 코드 리뷰 방식이 없었다. 기술이 유사한 곳을 더 찾는 일과 이미 찾은 두 팀의 리뷰 환경을 대조하는 일은 서로 다른 조사다. [해당 턴의 답과 호출](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/busan_engineer_4-1.json)

- **금요일까지 답해야 하는 AI 엔지니어**. 제품 검색 품질을 오래 맡고 싶다는 말에서 탐색을 앞당겼다. 다음 턴에는 실제 팀이 하는 일이 무엇인지 묻자 쿠팡·당근·네이버·카카오 등으로 열 번 검색했다. 마지막 턴의 검색 기록 조회는 두 번 모두 0건이었고 웹 자료를 다시 찾았다. 결국 이미 저장된 Fieldguide 원문은 정확한 참조로 열 수 있었다. [해당 턴의 답과 호출](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/ai_offer_6-1.json)

## 설계한 비용 절감 방법은 어디서 쓰였나

- **추천과 공개 자료 재사용.** 디자이너의 두 번째 vooy 저장은 같은 개인 추천을 재사용했다. AI 엔지니어는 이미 저장한 Fieldguide의 원문을 `read_resources`로 읽었다. 오늘의집 엔지니어와 부산 개발자가 당근페이 공식 공고를 각각 열었다. 부산 개발자는 다음 턴에도 같은 공고를 열었다. 각 계정은 같은 고정 원문을 받지만 저장 상태는 별개다. 첫 사람의 조회 덕분에 둘째 사람의 외부 요청을 절약했는지는 이 실행으로 검증할 수 없다. 회사 저장소 조회는 세 번 모두, 공유 자료 조회도 두 번 모두 비었다. 이 시점의 평가용 공유 자료 검색은 14개 `web_resource`가 있어도 `observation`만 대상으로 삼았다. 운영에서 공유 정보가 비었다는 증거로 쓸 수 없다.
- **개인의 전략과 조사 기록.** 여섯 사람 모두 Brief나 Memory에 새 사실을 남겼다. 전체 쓰기 20회, 읽기 8회였고 AI 엔지니어의 기본급·출장·일하고 싶은 방식 등은 다음 턴에도 남았다. 반면 마지막 턴에서 과거 검색을 두 번 조회했는데, 평가용 도구는 앞서 16회 웹 검색을 했어도 항상 빈 기록을 반환했다. 운영에서는 최근 검색 한 건의 범위와 결과 수를 기본 입력에 전달하고, 오래된 검색은 주제·날짜로 다시 열 수 있다. 해당 평가에는 이 경로가 빠져 있었다. [운영 검색 기록 조회](../../../../src/lib/career/resources/searchHistory.ts) · [모델에 전달하는 최근 검색](../../../../src/lib/career/agentTurnRuntime.server.ts) · [평가용 도구](../../../../scripts/evaluation/careerAutonomyFixture.ts)
- **이미 얻은 개인 정보 재사용.** 오늘의집 사용자의 네 전형과 AI 엔지니어의 오퍼 금액·기한을 메일에서 읽었다. 실제로 포트폴리오의 인증 실패 복구 경험과 이력서의 검색 시스템 업무를 이후 답변에 썼다. `read_document` 8회, `upsert_document` 0회였다. 두 번째 입사지원에서 새 문서를 재사용해 Gmail을 건너뛰는 상황은 이 여섯 대화에서 발생하지 않았다. AI 엔지니어는 같은 오퍼 스레드를 네 턴에서 열어 같은 메시지를 받았다. 두 번째에는 업무와 출장 조건을 알아보려 했고, 마지막에는 기한 연장 답장을 쓸 상대와 최신 회신을 확인했다. 이 네 번을 모두 없앨 수 있는 반복으로 세지는 않았다.
- **저렴한 일괄 평가.** `evaluate_resources`를 한 번도 부르지 않았다. `search_opportunities` 10회는 모두 평가 결과 0건을 반환했다. 디자이너의 vooy, AI 엔지니어의 Fieldguide는 웹 검색과 원문 열람으로 찾았다. 31턴마다 실행된 Decisions는 그 턴에서 사용할 도구를 고르는 데 쓰였다. 많은 채용 후보 중 유력 회사를 저렴하게 고른 실적은 여기서 확인할 수 없다.
- **반복할 수 있는 검증.** 사용자 발화·서버 사건·공개 자료를 고정해 매번 테스트 계정을 새로 채우지 않고 비교했다. 같은 사람에게 같은 URL이 다시 나왔는지, 앞의 모델 호출이 그 결과를 받았는지까지 기록에서 구분할 수 있다. 반복 실행은 실제 웹 전체의 채용 기회를 얼마나 찾았는지까지 측정하지 않는다.

## 운영 DB에 남은 공고를 다시 읽어 본 결과

11월 16일 디자이너 테스트에 썼던 두 운영 계정에는 웹 검색 기록이 각각 7건과 4건 남아 있었다. 각 계정의 검색 기록에서 해당 실행을 열자 제목·URL·출처 ID·버전이 표시됐다. 그 버전으로 Bjak의 Product Designer (UX), HCI 지원 페이지 4,059바이트와 클로저의 Product Designer 공고 6,020바이트를 읽었다. 클로저 본문은 전날 실제 웹에서 읽었던 본문과 글자까지 일치했다. Bjak은 당시 검색 시점에 저장된 버전을 읽었다. 이번 조회에는 운영 DB만 사용했고 모델·외부 검색·재크롤·쓰기는 모두 0회였다. 전날 두 대화에서 발생한 Exa 비용은 각각 $0.088과 $0.031이었다. 이 금액은 최초 탐색 전체의 비용이다. [계정별 조회 기록](../private/first-six/2026-11-17-prod-reuse.json)

## 같은 디자이너가 추천받은 뒤 실제 웹에서 확인한 한 턴

클로저를 소개받은 테스트 계정 하나의 기존 대화에 “그 회사에서 제가 실제로 맡을 일이 뭔지 궁금해요. 지원 전에 팀이랑 얘기해볼 수 있어요?”를 붙였다. 변경 전후에 모델이 받은 대화 네 메시지의 해시가 같다. 11월 16일 22:53까지의 대화, 추천 공고, 공개 자료, 시각을 고정했다. 11월 17일 00:33에 각각 Career 모델을 호출하고 실제 운영 DB와 웹에서 읽을 수 있게 했다. 도구를 고르는 별도 모델 없이 양쪽 모두 같은 조회 도구 여섯 개를 제공했다. 대화 내용과 추천은 운영 계정에서 가져왔지만 이번 질문과 답은 평가 기록에만 남겼다.

| 한 번의 답변 | 변경 전 | 변경 후 |
|---|---:|---:|
| 모델 호출과 도구 호출 | 3회 / 4회 | 3회 / 4회 |
| 새 웹 검색 | 0회 | 0회 |
| Exa가 읽은 URL | 공고·홈페이지 2개 | 공고 1개 |
| 모델 추정 비용 + Exa 청구 비용 | $0.01752 + $0.002 | $0.01310 + $0.001 |
| 응답까지 걸린 시간 | 32.7초 | 33.1초 |
| 도구가 운영 DB에 보낸 읽기 요청 | 22회 | 21회 |

두 답 모두 AI의 캠페인 제안을 쇼핑몰 운영자가 검토·승인하는 화면과 팝업·배너 제작을 구분했다. 업무 비중이나 지원 전 미팅은 확정되지 않았다고 하고, 공식 문의처와 팀에 보낼 초안을 줬다. 실제로 연락하거나 지원하지 않았다. 변경 후에는 홈페이지를 추가로 읽지 않아도 같은 결정을 도울 수 있었다. 다만 양쪽 모두 역할 상세 정보에서 이미 공고 설명과 문의 주소를 받은 뒤에도 공고를 새로 열었다. 두 쪽이 다시 읽은 공고 본문 2,673자는 같았다. 새 검색이나 재열람을 늘 막을 수 있다고 단정하기에는 한 번씩의 관측이다. [두 답변과 비용 원장](../private/first-six/2026-11-17-closer-live-comparison.json) · [이미 확인한 운영 화면](../../career-agent-autonomy/private/production-profiles/first-dialogue-designer-source-final/09/opened-recommendation.png)

양쪽을 병렬 실행했고 새로 가져온 공개 자료는 각 실행 안에서만 보관했다. 한쪽 실행이 다른 쪽의 운영 DB 캐시를 채우지 않았다. 공급자 자체 캐시와 응답 시간까지 고정하지는 않았다. 위 수치는 정상 실행 한 쌍의 비용이다. 앞서 평가 도구가 읽기 전용 RPC를 잘못 차단하거나 배열을 잘못 인코딩한 두 쌍은 제외했다. 이 준비 과정에서 실제 모델 추정 비용 $0.06734와 Exa 비용 $0.009가 별도로 발생했다.

<details>
<summary>변경 후 웹 검색 58회의 검색어와 결과</summary>

‘앞 턴’은 직전 턴에 한정하지 않고 그 사람의 이전 모든 검색을 포함한다. ‘같은 턴’은 다음 검색을 요청하기 전에 이미 모델이 결과를 받은 경우다. ‘동시 요청’은 같은 모델 응답이 한꺼번에 요청한 다른 검색이 같은 URL을 돌려준 경우다. 마지막 숫자는 해당 검색의 고유 URL 중 그때 처음 나온 URL 개수다.

**오늘의집 백엔드 엔지니어** · [payments_backend_6 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-1/payments_backend_6-1.json)

- 백엔드 결제 채용 기본급 연봉 1억 1천 이상 pay band 한국 (새 URL · 3/3)
- Korea senior backend payments engineer salary "KRW" "110,000,000" (새 URL · 6/8)
- "backend" "payment" "Seoul" "salary" "KRW" senior engineer (새 URL · 2/8)

**결제 앱 디자이너** · [product_designer_2 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/product_designer_2-1.json)

- 한국 채용 프로덕트 디자이너 design system B2B 복잡한 워크플로우 디자인 팀 채용 (새 URL · 2/2)
- Korea product designer design systems AI developer tools platform careers product design (새 URL · 7/8)
- "프로덕트 디자이너" "B2B" SaaS 채용 서울 디자인 (같은 턴 · 0/5)
- "product designer" Korea B2B design systems careers hiring (같은 턴 · 0/7)
- vooy AI 에이전트 서비스 팀 제품 디자인 에이전트 소개 (같은 턴 · 0/4)

**결제 앱 디자이너** · [product_designer_3 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/product_designer_3-1.json)

- "product designer" "AI agent" "human" "workflow" Korea job design (새 URL · 2/8)
- vooy AI 에이전트 서비스 팀 부이 창업 디자인 (앞 턴 · 0/4)
- "AI 에이전트" "프로덕트 디자이너" 진행 상태 채용 (앞 턴 · 0/5)

**결제 앱 디자이너** · [product_designer_5 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/product_designer_5-1.json)

- vooy 프로덕트 디자이너 AI 에이전트 지원 전 티타임 채용 (앞 턴 · 0/7)
- AI 에이전트 프로덕트 디자이너 채용 지원 전 티타임 커피챗 (앞 턴 · 0/7)
- AI 프로덕트 디자이너 에이전트 채용 커피챗 티타임 상태 (앞 턴 · 0/5)
- "에이전트" "디자이너" "커피챗" 채용 AI (앞 턴 · 0/5)
- "AI" "프로덕트 디자이너" "커피챗" 채용 (앞 턴 · 0/5)
- "AI 에이전트" "프로덕트 디자이너" "티타임" (앞 턴 · 0/4)

**영업 운영자** · [sales_operations_3 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/sales_operations_3-1.json)

- global sales operations Salesforce process rollout APAC Korea sales operations job (새 URL · 6/6)
- "sales operations" "Korea" "Salesforce" "APAC" careers pipeline forecasting (새 URL · 3/7)
- "sales operations" "Seoul" "Salesforce" "sales process" international careers 2026 (동시 요청 · 0/8)

**영업 운영자** · [sales_operations_4 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/sales_operations_4-1.json)

- Korea Seoul "sales operations" "APAC" Salesforce revenue operations jobs (새 URL · 1/9)
- "sales operations" "APAC" Seoul Korea Salesforce revenue operations job (같은 턴 · 0/9)
- "서울" "APAC" "sales operations" "CRM" 영업 운영 채용 (새 URL · 1/7)
- "Seoul" "APAC" "revenue operations" "sales" jobs CRM forecasting (같은 턴 · 0/9)

**영업 운영자** · [sales_operations_5 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-2/sales_operations_5-1.json)

- "Sales Operations Specialist" "GPU" "APAC" "market" Korea (앞 턴 · 0/6)
- "gpu-cloud-startup-sales-operations-specialist-seoul" APAC first markets (앞 턴 · 0/5)

**부산 주니어 개발자** · [busan_engineer_3 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/busan_engineer_3-1.json)

- 채용 백엔드 개발자 부산 원격 TypeScript 코드리뷰 팀 (새 URL · 4/4)
- "NARWHAL PROJECT" "Junior Product Engineer" 원격 리뷰 부산 (새 URL · 2/6)
- "NARWHAL PROJECT" engineering code review remote salary (새 URL · 1/5)
- 부산 백엔드 개발자 채용 코드 리뷰 원격 TypeScript PostgreSQL 2년 개발팀 (같은 턴 · 0/5)

**부산 주니어 개발자** · [busan_engineer_4 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/busan_engineer_4-1.json)

- 개발자 채용 부산 원격 TypeScript PostgreSQL 코드리뷰 재택 2년 (앞 턴 · 0/4)
- "원격" "개발자" "코드리뷰" "TypeScript" 채용 재택 (앞 턴 · 0/4)
- 부산 백엔드 개발자 채용 코드리뷰 Node.js 2년 2026 (앞 턴 · 0/4)
- 개발자 채용 "풀리모트" "코드리뷰" 백엔드 2026 (앞 턴 · 0/2)
- "NARWHAL PROJECT" "Junior Product Engineer" code review remote team (새 URL · 3/9)
- "NARWHAL PROJECT" developer remote Korea hiring engineers code review salary (새 URL · 2/10)
- backend software engineer jobs Korea fully remote code review 2 years TypeScript postgres (새 URL · 1/12)

**금요일까지 답해야 하는 AI 엔지니어** · [ai_offer_3 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/ai_offer_3-1.json)

- 서울 senior search relevance engineer 검색 품질 검색 엔지니어 채용 제품 랭킹 머신러닝 (새 URL · 10/10)
- Seoul Korea senior search relevance retrieval ranking machine learning engineer careers search product jobs (새 URL · 1/10)
- site:careers.coupang.com search relevance ranking seoul engineer (새 URL · 1/10)
- 당근 채용 검색 품질 search ranking 검색 엔지니어 머신러닝 (같은 턴 · 0/5)
- 네이버 검색 검색품질 검색엔진 엔지니어 채용 2026 검색 relevance (같은 턴 · 0/4)
- Korea Seoul search relevance engineer jobs search ranking recommendation engineering career (동시 요청 · 0/12)

**금요일까지 답해야 하는 AI 엔지니어** · [ai_offer_4 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/ai_offer_4-1.json)

- 서울 검색 랭킹 search relevance engineer 채용 검색품질 서비스 쿠팡 당근 네이버 2026 (앞 턴 · 0/10)
- site:careers.coupang.com search relevance ranking machine learning engineer Seoul search (앞 턴 · 0/10)
- 당근 검색 팀 검색 품질 랭킹 엔지니어 기술블로그 검색 실패 개선 (앞 턴 · 0/4)
- Seoul Korea jobs search relevance ranking engineer search product senior machine learning e commerce (새 URL · 2/14)
- 검색 개발 채용 검색 랭킹 관련도 AB 테스트 추천 서비스 무신사 당근 네이버 (앞 턴 · 0/7)
- "검색" "검색 품질" "검색팀" 당근 기술 블로그 (앞 턴 · 0/4)
- "search relevance" "Seoul" "ranking" engineer Coupang careers (앞 턴 · 0/9)
- 카카오 검색 기술 블로그 검색 결과 품질 개선 모델 검색 서비스 (앞 턴 · 0/2)
- Coupang tech blog search relevance search ranking e-commerce Korea (같은 턴 · 0/14)
- site:medium.com/daangn 검색 엔지니어 검색 시스템 (앞 턴 · 0/3)

**금요일까지 답해야 하는 AI 엔지니어** · [ai_offer_6 원문](../runs/2026-11-16T13-31-36-392Z-v10-checked-e-3/ai_offer_6-1.json)

- Seoul Korea product search relevance ranking engineering team search quality job engineer (앞 턴 · 0/14)
- 서울 검색 랭킹 검색 품질 엔지니어 팀 실제 검색 품질 운영 채용 (같은 호출의 검색어)
- site:careers.coupang.com "search" "Seoul" relevance engineer (같은 호출의 검색어)
- site:careers.navercorp.com 검색 랭킹 품질 엔지니어 검색 (같은 호출의 검색어)
- 서울 검색 랭킹 검색 품질 개선 엔지니어 채용 제품 검색 당근 쿠팡 검색팀 (앞 턴 · 0/7)
- Seoul search relevance search ranking machine learning engineer Coupang careers (앞 턴 · 0/9)
- 네이버 검색 팀 검색 품질 검색 랭킹 운영 실패 개선 검색 엔지니어 채용 (앞 턴 · 0/4)
- Seoul search ranking product search relevance machine learning engineer Korea careers Toss Karrot (앞 턴 · 0/10)

</details>

## 같은 URL을 다시 연 11건

디자이너가 vooy를 세 번, 영업 운영자가 서울 GPU 공고를 두 번·Google 공고를 한 번 다시 열었다. AI 엔지니어는 Fieldguide와 Cohere를 한 번씩, 부산 개발자는 NARWHAL·당근페이·Canonical을 한 번씩 다시 열었다. 11건 모두 이전 턴과 같은 URL을 처음부터 읽고 `maxAgeHours: 0`으로 실시간 조회를 요청했다. 동결 자료에서 각 쌍의 본문 해시가 일치했다. 이전 읽기 11건 모두 마지막 페이지까지 성공했다. 새 질문에 해당하는 문단을 다시 읽는 이유는 있어도, 동결 자료에 달라진 본문은 없었다. 이전 조건의 재열람 2건은 Fieldguide의 공고와 제품 발표였다.

같은 vooy 후속 질문으로 두 가설을 따로 시험했다. (1) 공급자 캐시 시간 대신 자료의 기준 시점을 받게 바꾸자 세 번 모두 ‘지금’을 지정했다. (2) 23초 전에 읽은 공고 2,710자를 온전히 보여 줘도 세 번 모두 실시간 조회를 요청했다. 각 대조군 세 번도 같았다. 두 변경은 제품에 넣지 않았다. [시점 인자 A/B](../runs/2026-11-17-url-fresh-since-ab/review.json) · [직전 원문 A/B](../runs/2026-11-17-url-previous-evidence-ab/review.json)

### 검색 결과가 원문을 덮던 오류

별도 PostgreSQL에서 제품의 검색·원문 열기·저장 자료 조회 도구를 실행했다. 검색 공급자가 본문 15,000자까지만 돌려준 뒤 그 다음 문단을 열자, 기존 코드는 내용이 없다고 반환했다. 원문을 따로 저장해도 나중에 같은 URL이 짧은 검색 결과로 들어오면 그 한 줄이 원문을 대체했다.

수정 후에는 검색 한도에 닿은 자료의 다음 문단을 열 때 원문을 한 번 가져왔다. 이후 새 검색 결과가 들어와도 원문과 확인 시각이 유지됐다. 다른 사용자가 저장된 검색 결과를 열면 새로 관찰한 한 줄을, URL을 다시 열면 원래의 전체 본문을 읽었다. 지금 다시 확인하라는 요청에는 바뀐 페이지를 가져왔다. 길이 기록이 없는 기존 검색 자료도 첫 원문 열람 때 보완했고 두 번째 열람은 공급자를 호출하지 않았다. 이전 마이그레이션부터 순서대로 설치한 DB와 URL 도구 테스트 38개가 통과했다. 실제 PostgreSQL에 제품 함수를 연결하고 고정된 공급자 응답을 사용해 원문 요청 횟수를 셌다. 앞선 v10 11건은 동결 웹 어댑터로 실행돼 이 DB 결함이나 실제 공급자 청구를 입증하지 않는다. [회귀 테스트](../../../../src/lib/career/resources/database.test.ts) · [원문 조회](../../../../src/lib/talentOnboarding/openUrlTool.ts) · [검색 자료 저장](../../../../supabase/migrations/20261117010000_career_complete_source_cache.sql)

### 후속 대화의 검색을 줄이려다 채택하지 않은 변경

직전 답에서 vooy의 티타임을 소개한 디자이너와, 처음으로 해외 영업 운영에 관심을 보인 사용자에게 각각 같은 발화를 줬다. 두 사람 모두 첫 모델 입력·도구 목록과 앞선 대화를 고정하고 실제 Career 도구 로더로 끝까지 실행했다. 조건별 1회이며 비용은 해당 턴의 Career 모델 추정치다.

| 같은 사용자 발화 | 기존 | 기존 검색과 일치하는 출처 버전 수를 결과에 표시 | 첫 결정을 강조하고 발견 안내서의 적용 범위를 줄임 |
|---|---|---|---|
| 디자이너가 지원 전에 팀을 만나고 싶다 | 웹 검색 4회, 28.7초, $0.050 | 4회, 35.3초, $0.054 | 4회, 45.7초, $0.124 |
| 영업 사용자가 Salesforce 경험과 해외 운영에 대한 관심을 말한다 | 웹 검색 0회, 36.2초, $0.057 | 2회, 51.2초, $0.085 | 0회, 33.5초, $0.074 |

디자이너에게는 ‘검색한 다섯 출처의 버전이 모두 이전과 같다’는 사실이 실제로 전달됐다. 그래도 다시 검색했다. 세 답변 모두 공식 공고를 한 번 열어 30분 티타임과 ‘부이’ 신청 경로를 안내했다. 영업 사용자에게 출처 수를 알려 준 조건은 서울 GPU 공고를 찾아 구체적인 선택지를 하나 더 줬다. 두 변경 모두 이 비교에서 검색비 절감 효과가 없어 제품에 넣지 않았다. [입력 일치 검증과 실제 응답 경로](../runs/2026-11-17-next-decision-ab/review.json)

## 최종 31턴의 모델 비용

공급자 연결이 끊겼을 때 중단된 사람은 첫 발화부터 다시 실행했다. 다시 실행한 사람의 이전 호출은 아래 합계에서 뺐다. 원래 실행과 재실행의 입력 자료·모델·제품 코드가 같은지 확인하고, 응답 ID로 공급자의 토큰 수와 제품의 비용 기록을 연결했다. 두 반복의 비용은 변경 전 $2.00453·$1.83519, 변경 후 $1.66335·$1.81690였다. 고정한 웹 자료로 비교했으므로 실제 웹 검색 요금은 포함하지 않는다.

| 31턴당 평균 | 변경 전 | 변경 후 | 추정 비용 차이 |
|---|---:|---:|---:|
| Career 모델 호출 | 130회 | 127회 | |
| 일반 입력 토큰 | 390 | 381 | −$0.00001 |
| 캐시에서 읽은 입력 토큰 | 1,721,674 | 1,726,594 | +$0.00025 |
| 캐시에 새로 쓴 입력 토큰 | 1,248,380 | 1,131,716 | −$0.14583 |
| 출력 토큰(추론 포함) | 51,936 | 45,171 | −$0.03383 |
| Decisions 비용(각 31회) | $0.01323 | $0.01292 | −$0.00032 |
| **합계** | **$1.91986** | **$1.74013** | **−$0.17974** |

Career 모델의 100만 토큰당 단가는 두 조건에서 같았다. 일반 입력 $1, 캐시 읽기 $0.05, 캐시 쓰기 $1.25, 출력 $5였다. 최종 비교에서는 요청당 평균 입력이 22,850토큰에서 22,509토큰으로 줄고 캐시에서 읽은 비율은 58.0%에서 60.4%로 올랐다. 앞서 도구 선택기에 검색 이력을 잘못 넣은 예비 실험에서는 요청당 캐시 쓰기가 9,400토큰에서 10,875토큰으로 늘어 모델 비용도 $0.148 올랐다. 공급자는 어느 문장을 캐시에 새로 썼는지 공개하지 않는다. [예비·최종 실행 조건](2026-11-17-six-dialogue-efficiency.md)

| 사용자 | 변경 전 | 변경 후 |
|---|---:|---:|
| 오늘의집 백엔드 | $0.288 | $0.278 |
| 토론토 재무기획 | $0.210 | $0.193 |
| 결제 앱 디자인 | $0.300 | $0.255 |
| APAC 영업 운영 | $0.384 | $0.343 |
| 부산 개발자 | $0.277 | $0.230 |
| AI 엔지니어 | $0.461 | $0.442 |

공고 본문은 검색 기록 한 줄보다 컸고, 같은 턴의 후속 모델 호출에도 들어갔다. 최종 변경 후 1회차에서 APAC 사용자가 Google 등을 비교할 때 저장된 공고 46,611자가 후속 요청 네 번에 들어갔다. 같은 대화에서 이전 검색의 결과 7개를 찾은 기록은 556자로 후속 요청 일곱 번에 들어갔다. 반대로 부산 개발자는 변경 전 두 번 모두 NARWHAL 등 공고를 묶어 21,427자씩 읽었다. 변경 후에는 원문 열람 결과가 모델 입력에 들어간 분량이 두 번 평균 49,860자 줄었다. 새로 넣은 ‘마지막 검색’ 한 줄은 여섯 사람 전체를 합쳐 변경 후 1·2회차에 각각 65회·52회 전달됐고, 누적 길이는 16,707자·14,351자였다.

중단 후 비교에서 제외한 부분 대화에도 정상 응답 기록이 남았다. 그 모델 비용은 네 실행 합계 $0.52425였다. 연결 오류·시간 초과 23건은 공급자의 사용량 기록이 없어 비용을 알 수 없다.
