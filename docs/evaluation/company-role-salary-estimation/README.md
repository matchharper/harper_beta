# 국내 외부 기회 연봉 추정 평가

## v11-kr-db-expanded · Harper DB 추가 조사 · 2026-11-11

v10의 100건과 다른 Harper 국내 외부 공고 100건을 추가 조사했다. 총 200건 중 같은 공고의 공개 연간 원화 금액이 확인된 사례는 **79건**이다. 기존 18건의 정답을 유지했고 신규 61건을 추가했다. 79건은 범위 51건, 단일 금액 14건, 하한 13건, 상한 1건이다. 기본급이 명시된 사례는 4건이다.

추가 표본은 공개 급여 단서가 있는 DB 공고에서 저·중·고연봉 후보와 여러 직군을 골랐다. 기존 100건의 Role과 workspace는 제외했다. DB의 게시 또는 수집 시점이 최근 1년 이내인 공고에서 활성 상태를 우선하고 마감 사례도 포함했다. 추가 100건 중 DB상 활성 74건, 비활성 또는 마감 26건이며 새로 금액을 확인한 61건 중 활성은 47건이다.

| 확인한 공개 연봉 중간값 또는 단일 금액 | 건수 |
| --- | ---: |
| 4,500만원 미만 | 13 |
| 4,500만~6,000만원 미만 | 11 |
| 6,000만~8,000만원 미만 | 23 |
| 8,000만~1억 1,000만원 미만 | 12 |
| 1억 1,000만원 이상 | 6 |
| 합계 | 65 |

추가 100건의 원공고 URL에 모두 접근을 시도했다. 공개 화면과 연간 KRW 구조화 값이 일치한 38건, 동일 공고 본문이나 급여 표시에서 확인한 19건, 제목·회사·직무가 일치한 재게시본에서 확인한 4건을 채택했다. 채용사·플랫폼에 공개된 값과 저장 JD의 값 또는 보상 조건이 충돌한 10건과 검증하지 못한 29건은 비워 뒀다. 선택 기준에 공개 단서가 포함됐고 신규 확인 건의 리멤버 비중은 42/61이다. 국내 기회 전체의 공개율이나 대표 표본으로 해석하기 어렵다.

- [정답과 확인 상태 200건](gold-v11-kr-db-expanded.jsonl)과 [재현 매니페스트](manifest-v11-kr-db-expanded.json)
- `private/v11-kr-db-expanded/verified-evidence.jsonl` · 검증된 79건의 공고, 공개 급여와 출처.
- `private/v11-kr-db-expanded/evidence.jsonl` · 전체 200건의 Harper Role ID, 원공고와 재게시 URL, 확인 상태와 근거.
- `private/v11-kr-db-expanded/inputs.jsonl` · 연봉과 출처 URL을 가린 200건의 직무·회사 맥락.
- `private/v11-kr-db-expanded/requests.jsonl` · 현재 웹 `productionSalaryRequest`와 `buildSalaryDecisionRequest`로 생성한 79건의 요청 9개. `salary-decisions-production-v4-ingestion`, `mapping`, `gpt-6-luna` 계약을 사용했다. 기존 개발 확인용과 평가용은 분리했다. 오프라인 입력 검사에서 정답 숫자가 직무·회사 입력에 남지 않았음을 확인했고 공급자 호출은 수행하지 않았다.

공개 범위는 중간값·양 끝점 오차와 구간 IoU를, 단일 금액은 추정 중간값과의 오차를 비교한다. 한쪽만 공개된 14건은 해당 경계만 비교한다. 기본급이 명시된 사례와 구성 미확인 연봉은 구분해서 집계한다. 보상 범위의 대표성과 표본 수를 고려해 이 데이터셋 단독으로 출시를 결정하지 않는다. 운영 Role ID와 실제 모델 입력은 owner-only `private/`에 보관한다.

2026-11-11 현행 추정기 실행에서 79건 모두 유효한 값을 반환했다. 비교 가능한 65건의 중간값 절대 오차 중앙값은 19.5% 또는 1,015만원이었으며, 과대 22건·과소 43건이었다. 하한만 공개된 13건의 추정 하한은 모두 낮았다. 사례별 결과와 같은 배치에서 숫자 시장표를 제거한 진단은 owner-only `runs/v11-current-20261111.eX6ZGI/report-ko.md`에 있다.

같은 79건에서 회사 보상 자료를 새로 수집하지 않고 입력·프롬프트 조건 6개를 비교했다. 별도 회사 설명·규모·설립연도·투자 정보를 제외한 조건의 중간값 절대 오차 중앙값은 15.4%, 구간 IoU는 44.1%였다. 여기에 짧은 직무 중심 프롬프트를 결합한 조건의 중간값 오차는 16.9%였고 저·고연봉 편향 및 공개 하한 과소 추정이 현행 대비 작았다. 같은 평가셋에서 고른 탐색 결과와 정확한 프롬프트는 owner-only `runs/v11-lightweight-combined-20261111.cQ9SUM/report-ko.md`에 있다.

## v10-kr-db · Harper DB 표본 · 2026-11-11

Harper 운영 `company_roles`에서 국내 외부 기회 100건을 먼저 선택했다. 읽기 전용 조회 시점에 DB상 활성이고, 공개 원공고 URL과 평가에 필요한 JD가 있는 역할을 대상으로 했다. 사용자 제출과 테스트 공고는 제외했다. 원공고를 열었을 때 이미 마감된 사례도 있다. 회사 workspace당 한 건을 고르고, 확인된 동일 회사의 다른 workspace 별칭과 프리랜서 사례를 표본 확정 전에 제외했다.

| 저장 연봉 중간값 | 표본 | 확인된 동일 공고의 연간 원화 금액 |
| --- | ---: | ---: |
| 4,500만원 미만 | 18 | 2 |
| 4,500만~6,000만원 미만 | 18 | 3 |
| 6,000만~8,000만원 미만 | 18 | 4 |
| 8,000만~1억 1,000만원 미만 | 18 | 3 |
| 1억 1,000만원 이상 | 18 | 4 |
| 비교 가능한 저장 범위 없음 | 10 | 2 |
| 합계 | 100 | 18 |

금액 구간은 Harper가 저장한 연간 원화 범위의 중간값을 사용했다. 예측값을 포함한 이 값은 표본을 고르게 뽑는 데만 사용했다. 각 층에서 DB에 공개 금액 또는 JD 내 보상 문구가 있는 후보 4건을 포함했고, 나머지 76건은 직군을 순환하며 고정 시드 해시 순서로 뽑았다. 비즈니스·기타 31, 엔지니어링 27, AI·데이터 26, 제품·디자인 16건이다. 이 표본의 공개 금액 확인율을 전체 Harper 국내 DB의 비율로 해석하기는 어렵다.

100건 모두 저장된 공고 링크에 접근을 시도하고 회사·직무명으로 공개 검색했다. 동일 역할의 원공고, 같은 회사와 업무의 재게시 공고, 또는 채용사 ATS에서 비교할 수 있는 공개 금액을 찾은 18건에 라벨을 붙였다. 보상 문구가 있는 24건 중 17건, 나머지 76건 중 1건에서 확인했다. 확인된 금액은 범위 12건, 단일 금액 5건, 하한 1건이다. 기본급이 명시된 2건 중 이전 평가와 중복된 Fieldguide는 개발 확인용으로 두었다. 헤드헌터 공개 범위 5건과 세전 급여 및 신입 초임은 각 근거 유형을 함께 기록했다. 확인한 급여의 하단은 2,700만원이고 상단은 4억 1,475만 6,400원이다.

공고 내 복수 직종 또는 교대별 월급, 저장 JD와 현재 공고의 충돌, 독립적으로 재확인하지 못한 저장 JD 금액, 한국 역할의 비원화 표기는 라벨을 비워 뒀다. 나머지 미확인 사례와 함께 82건은 숫자 정확도 산출에서 제외한다. 공고 급여는 계약서나 실제 오퍼 수령액과 다를 수 있다.

- [정답과 확인 상태 100건](gold-v10-kr-db.jsonl)과 [재현 매니페스트](manifest-v10-kr-db.json)
- `private/v10-kr-db/evidence.jsonl` · 원래 Harper Role ID, 제목, 회사, 저장 연봉과 추정 여부, 원공고 및 공개 근거 URL, 라벨 판정 사유.
- `private/v10-kr-db/inputs.jsonl` · 실제 DB의 JD와 회사 맥락으로 만든 추론용 입력. 공고 연봉, 저장 추정, 근거 URL, 출처 검토 결과를 가렸다.
- `private/v10-kr-db/requests.jsonl` · 웹의 [productionSalaryRequest](../../../src/lib/externalRecommendationsV2/salaryEstimation.server.ts)와 [buildSalaryDecisionRequest](../../../src/lib/ops/roleSalaryEstimation.ts)로 오프라인 생성한 요청 11개. `salary-decisions-production-v4-ingestion`, `mapping`, `gpt-6-luna`를 사용하고 개발 확인용과 평가용을 각각 최대 10건씩 묶었다. 모델 호출은 하지 않았다.

채점은 확인된 범위에서 중앙값·상하한 오차와 구간 IoU, 단일 금액에서 예측 중앙값 오차, 하한 공개 건에서 하한 오차를 계산한다. 보상 구성이 확인되지 않은 경우는 공개 연봉 복원 지표로 해석한다. 추정기의 한국 앵커 상한은 2억 6,000만원이므로, 이보다 높은 공개 급여는 별도 진단 사례로 표시해 해석한다. 출시 기준은 이 표본으로 정하지 않는다. 운영 Role ID 및 공고 맥락은 무시되는 owner-only `private/`에 보관하며 후보자 데이터는 사용하지 않았다.

2026-11-11 실행은 같은 고정 입력의 공개 금액 확인 사례 18건에 `estimateSalaryBatch`를 호출했다. 평가용 중간값·단일 금액 16건의 절대 오차 중앙값은 16.8% 또는 805만원, 과대·과소 각 8건이었다. 공개 범위 11건의 구간 IoU 중앙값은 37.4%였다. 사례별 결과와 시장 연봉표·최상단 앵커·고용형태 입력 진단은 owner-only `runs/v10-current-20261111.Y5yaGC/report-ko.md`에 있다.

## v9-kr-public · 2026-11-11

국내 근무 공고 한 건을 평가 단위로 삼는다. 채용사가 공개한 연간 원화 급여를 가리고 Harper가 추정한 연간 기본급의 하한과 상한을 비교한다. 100건 중 96건은 평가용, 이전 평가에 등장한 회사 또는 2025년 이전 마감 공고 4건은 개발 확인용이다.

| 직군 | 건수 |
| --- | ---: |
| 소프트웨어 개발·QA | 23 |
| AI·데이터 | 12 |
| 인프라·보안·IT 기술지원 | 14 |
| 하드웨어·연구개발 | 20 |
| 제품기획·디자인 | 13 |
| 사업·마케팅·재무 | 18 |

### 고정 데이터

- [정답](gold-v9-kr-public.jsonl) · 100건. 연간 원화 금액을 `min_krw`, `max_krw`로 기록한다. 하한만 공개된 경우 상한은 `null`이다.
- [재현 매니페스트](manifest-v9-kr-public.json) · 표본 선택 규칙, 집계와 파일 SHA-256.
- `private/v9-kr-public/evidence.jsonl` · 공고별 회사·직무·출처 URL·공개 금액 근거와 확인일. 고용24 사례는 목록의 금액과 채용사가 등록한 상세 공고의 임금 조건을 대조했다. 게시일과 마감일은 출처에서 확인된 경우에 기록했다.
- `private/v9-kr-public/inputs.jsonl` · 회사명, 직무명, 근무 지역, 고용형태, JD와 확보된 회사 정보. 공고 URL, 연락처, 해당 공고의 연봉 금액과 구조화 급여 필드를 가렸다. 고용24는 원문 JD에서 해당 부분을 제외했고 직접 선별한 공고는 직무 사실을 요약했다.
- `private/v9-kr-public/requests.jsonl` · 현재 웹 추정기의 요청 빌더가 만든 11개 요청. 각 요청의 `cases` 배열과 `r0_lower`, `r0_upper` 같은 응답 키의 인덱스가 대응한다.
- `private/v9-kr-public/eligible-frame.jsonl` · 선별한 공고 13건과 무작위 추출의 후보가 된 고용24 공고 152건의 당시 목록.

회사 이름 표기를 정규화해 회사당 한 건만 남겼다. 서로 다른 이름으로 올라온 동일 JD와 주소·업무가 사실상 같은 공고를 검토해 제거했다. 고용24는 정보통신 직종 코드와 역할별 키워드의 공개 검색 결과 중 연봉제 공고를 확인했다. 직군과 라벨 유형별로 고정 시드 `20261111`을 사용해 87건을 뽑았다. 고용24에서 드문 고보상·제품·기본급 명시 사례 등을 보강하려고 점핏 6건, 원티드 4건, 로켓펀치·Fieldguide 공식 채용 데이터·사람인 각 1건을 직접 선정했다. 고용24 87건은 2026-09-14~2026-11-11에 등록됐다. 전체 표본에는 과거 공고와 게시일을 확인할 수 없는 공고도 있다.

### 실행과 채점

실행 경로는 웹의 [productionSalaryRequest](../../../src/lib/externalRecommendationsV2/salaryEstimation.server.ts)와 [buildSalaryDecisionRequest 및 decodeSalaryEstimate](../../../src/lib/ops/roleSalaryEstimation.ts)다. 저장된 요청은 `salary-decisions-production-v4-ingestion`, `mapping`, `gpt-6-luna` 계약을 쓴다. 평가용과 개발 확인용을 각각 고정 순서로 최대 10건씩 묶었다. 이 버전은 요청 생성과 입력의 금액 노출 여부까지 확인했다. 모델 응답과 점수는 아직 없다.

- `range` 88건. 공개 범위의 중앙값 절대 오차(KRW와 %)와 과대·과소 추정 방향, 상·하한 오차, 구간 IoU와 예측 범위 폭을 함께 본다.
- `point` 3건. 예측 중앙값과 공개 단일 금액의 오차를 본다. 구간 IoU에서 제외한다.
- `floor` 9건. 추정 하한과 공개 하한의 차이를 본다. 중앙값과 상한 오차는 계산할 수 없다.
- 기본급 명시(`base_explicit`)는 4건이며 평가용은 3건이다. 상여 별도(`annual_pay_bonus_separate`) 7건은 별도로 집계한다. 나머지 89건(`annual_pay_unspecified`)은 공고에 연봉이 기재됐으나 구성까지 확인되지 않았다. 이 사례의 수치는 공개 연봉 복원 결과로 해석한다.

기본급 표본의 수와 공개 공고의 선택 편향을 고려해 이 버전의 점수만으로 출시를 결정하지 않는다. 고용24 비중이 높고 공고를 공개하지 않는 회사와 실제 계약·오퍼의 보상은 관측되지 않았다. 회사 평균 급여는 정답으로 사용하지 않았으며 별도 평균 연봉 정보도 이 버전의 모델 입력에 수집하지 않았다. 공고는 1차 출처를 확인했으며 독립 검수는 아직 이루어지지 않았다.

운영 DB와 후보자 데이터를 사용하지 않았다. 회사·공고 식별 정보와 모델 입력은 무시되는 owner-only `private/`에 보관한다. 실행 시 원본 응답은 `runs/`에 보관한다. 이전 버전의 자료는 [당시 평가 레지스트리](https://github.com/matchharper/harper_beta/tree/1b661a8317aec934036ee8aa24a2b5d4ee7f58f1/docs/evaluation/company-role-salary-estimation)에 있다.

# Company Role 연봉 범위 추정

## Production prefill v8 (2026-10-15, local implementation)

- User authorization: all reviewed external roles lacking BOTH numeric and text salary;
  ten roles/request, company-adjacent batching, structural/provider failures retried separately (last 52 one-role requests), maximum USD 50 for prefill. Historical
  experiment USD 1 ledger remains separate. No deployment authorization.
- Canonical read-only capture: Worker `scripts/capture_role_salary_prefill.py`, frozen
  owner-only JSONL and manifest under private. Partial interrupted captures are not frozen datasets. The completed capture
  retained the valid first 50,000-row prefix and captured the remainder with new
  read-only keyset pages; only the complete hashed input is used for inference.
- Canonical inference/persistence: beta `scripts/prefillExternalRoleSalaries.ts` and
  `src/lib/externalRecommendationsV2/salaryEstimation.server.ts`. Shared existing
  Decisions request builder/decoder/provider function and mapping prompt are reused.
  Production contract `salary-decisions-production-v2` extends anchors below prior
  floors and supports all role countries. KR estimates use KRW, US/other markets USD
  equivalents and a dated ECB conversion to annual KRW storage. Global anchors are
  wider/coarser than US/KR; new-country salary accuracy is not established.
- Each request contains max10 roles, four concurrent calls,40s timeout,no automatic
  paid retry. Complete receipts are persisted locally before resume; raw input/response,
  actual cost/time and source hash remain private. Possibly billed failures retain
  conservative reserves. A new run is required if frozen request hash changes.
- Output: annual base min/max in won plus `salary_is_predicted=true`; `salary_range`
  is never synthesized. Conditional service-only RPC rejects changed source, real
  salary written meanwhile, or canonical testOnly role. No new judgement table.
- Inference artifacts are prepared first. Production persistence requires updated
  salary readers verified live (`--persist --readers-upgraded`). Old live readers
  would otherwise describe estimates as facts. Runtime/column retirement migration
  is separate from the compatible boolean-column migration. No release is implied.
- Metrics: coverage, invalid/failed role IDs, actual/reserved cost,call p50/p95,company
  batch composition, prediction width,10-role consistency against prior published
  pay cases. Predictions are not true-salary gold; earlier v6/v7 labels stay frozen.
  Tests verify data integrity and LLM projection boundaries, not prediction accuracy.

- Result: 64,139/64,144 prepared, USD 14.0584113 confirmed; conservative
  budget-managed USD 19.4243683. Persistence 0 until reader deployment.
  [Production result](reports/production-v8-20261015.md).


## v7-search50: 실제 누락 급여 50개와 Google 근거 비교

- 단위/목표: 실험 시작 시 Ops 기본 `market_reasoning`의 Role당 1회 연간 기본급 추정 50개를
  먼저 실행하고 공개 검색 근거와 비교한다. 이후 옵션 비교 요청으로 같은 frozen input의
  baseline/mapping도 각각 50회 실행한다. 한국 25·미국 25, 회사 workspace당 1개,
  두 salary endpoint가 NULL이고 JD 100자 초과인 현재 active external Role 중 고정 seed
  hash 순서로 선택한다. 나라/회사 균등 표본이며 production Role 전체의 비율을 대표하지 않는다.
- frozen input: `manifest-v7-search50.json`, ignored owner-only `private/capture-v7-search50.json`
  및 `private/fixture-v7-search50.json`. 최초 provider 요청 전에 capture와 실제 요청 body를 동결한다.
  v6 입력/정답과 겹침 여부 및 당시 상태를 provenance에 기록하며 frozen v6는 변경하지 않는다.
- canonical capture: Worker `llm_evals/company_role_salary_estimation/search50_capture.py`,
  `connect_read_only()` 사용. Canonical inference: beta `scripts/evalRoleSalarySearch50.ts`는
  실제 Ops `buildSalaryModelRole`, `buildSalaryDecisionRequest`, `decodeSalaryEstimate`,
  `directUsageCost`를 import한다. 원문 급여/JD 금액/URL은 모델 입력에서 제외한다.
- 실행 조건: gpt-6-luna Decisions, C prompt 고정, endpoint default, 역할당 단독 요청,
  timeout 40초, retry 0, 기존 태스크 USD 1 ledger 공유. provider fetch부터 JSON까지 측정하여
  DB capture·수동 검색 시간을 API latency에 합치지 않는다. Request/응답·token·비용·시간 모두 private.
- 근거/정답: 모든 Role에 대해 Google에서 회사·직무·국가·salary/연봉 검색을 실행한 후
  직접 source를 확인한다. 정확한 해당 공고의 동일 국가·연간 기본급만 numeric accuracy gold다.
  같은 회사 유사 직무, 회사 평균, 시장 참고값, 총보상/OTE, numeric 자료 없음은 별도로 표기하며
  이를 정확한 Role 정답으로 둔갑시키지 않는다. 비교 원문은 runs, 비식별 gold는 별도 버전 파일에 저장한다.
- 검증 지표/gate: exact same-role comparable base subset의 midpoint APE·endpoint error·IoU·overlap,
  국가별 slice, 전체 예측 폭/midpoint, 비용/시간 median/mean/p95, 검색 근거 coverage와 유형.
  기존 C gate(구조 실패 0, midpoint/endpoint median ≤20%, nonpoint IoU median ≥0.5)를 그대로 적용한다.
  검색으로 정답이 나오는 subset의 selection bias가 있어 전체 50 accuracy로 표현하지 않는다.
- 승인/privacy: 사용자의 50개 실행·Google 조사 요청 및 기존 USD 1 승인. 공개 회사/JD만 OpenAI
  `/v1/decisions`에 전송, 계정 기존 API data controls 사용. 후보자/대화 데이터·DB write·발송·배포 없음.
  회사명/ID/raw response/source capture는 ignored private/runs의 0600 파일·0700 디렉터리에 둔다.
- 한계: 웹 label은 모델 추정 후 작성한 source audit이며 독립 blind human gold가 아니다.
  한국 회사 평균은 Role 급여가 아니고, 공개 채용 band는 실제 오퍼가 아니다. 환율 변환 없이 통화별 비교.
  salary가 NULL이어도 JD에 공개 숫자가 남아 있을 수 있으며 builder는 이를 숨긴다.
- 결과: 세 방식 각 50회(총 150회), USD 0.0355849. `gold-v7-search50-reviewed-v1.json`은
  primary annual cash/base 6개(명시 base 5 + 현금 구성 미확인 1), secondary same-role 4개,
  하한만 있는 2개를 비식별로 보관한다. 모든 50개 Google 조회/회사 평균·유사 역할·site estimate
  원문과 식별 보고서는 ignored run에 있다. Primary 6개 midpoint median APE는
  baseline/mapping/market_reasoning 16.0%/15.6%/20.0%; extended 10개는 17.2%/14.5%/20.0%.
  전체 예측 폭/midpoint median은 31.3%/34.9%/28.3%, primary IoU median은
  13.5%/24.5%/15.8%로 세 방법 모두 구간 gate NO-GO. Numeric source-observable subset의 bias와
  unblinded audit를 유지하며 전체 50개의 정확도로 주장하지 않는다. 이번 broad-role 비교로 Ops
  기본 선택은 mapping으로 변경했다. Prompt/anchor/모델은 변경하지 않았다.
- canonical report: Worker `llm_evals/company_role_salary_estimation/search50_report.py`;
  [비식별 결과](reports/decisions-search50-v7-20261015.md). 정확한 cost/latency와 회사명·source URL을
  포함한 50행 표는 `runs/2026-10-14T17-29-33-782Z-search50/report-ko.md`와 같은 폴더 HTML.
  Ops 실제 20개 단일 요청은 20/20 결과, 0.74초, 화면 비용 USD 0.002775를 확인했다.
  기본 mapping의 실제 Ops 함수 20개 실행도 20/20, 1.73초, USD 0.0030585를 확인했다.
  화면 반올림 상한과 이전 미보고 실패 reserve까지 전체 budget-managed USD 0.0816999로 승인 $1 이내.

## Ops 역할 선택 화면 (로컬 구현, 미배포)

`/ops/debugging/role-salary`에서 회사명·직무명·Role UUID로 한국/미국 external
Role을 검색하고 최대 20개를 선택해 한 번에 실행한다. 기본 조건은 `mapping`이며,
작은 선택 메뉴에서 `baseline`/`market_reasoning`으로 변경할 수 있다. 공개 급여(저장된 필드),
추정 범위, 폭/중앙값, 같은 통화의 연간 공개 급여가 있는 경우 중앙값 오차, 요청 비용·시간을
표시한다. 실제 provider 입력은 접힌 `입력 보기`에서 확인한다.

- runtime owner/canonical code: beta `src/lib/ops/roleSalaryEstimation.ts`,
  `roleSalaryEstimationServer.ts`, `src/app/api/internal/debug/role-salary/route.ts`.
- 공유 prompt/model/금액 기준점의 v1 역사적 정본은
  `src/lib/ops/roleSalaryEstimation.prompts.json`이다. 현재 Ops 화면은 production v2 factory/금액 기준점을 모든 방법에 재사용하며 기존 frozen v6/v7 builder는 그대로 보존한다. Worker `decisions_eval.py`도
  이 파일을 읽는다. 기존 v6의 세 조건 request fingerprint는 공유 전후 동일함을
  offline으로 확인했고 frozen gold/input/기존 run은 변경하지 않았다. 기존 Worker
  mapping/reasoning Markdown은 v6 prompt의 역사적 원본으로 보존한다.
- 입력은 해당 Role와 회사의 공개 업무·사업·규모·투자 context만 조회한다. structured salary와
  공고 URL은 model 입력에 넣지 않고, title/JD의 숫자 monetary expression을 입력
  blinding으로 숨긴다. 별도 회사 context는 보존한다. 원문 JD는 최대 9,000자, 회사 text
  항목은 각각 최대 2,500자이다. 금액 blinding은 시장 규모 등 JD의 다른 monetary
  expression도 숨길 수 있어 frozen v6 입력과 동일하다고 주장하지 않는다.
- production DB는 기존 service-only SELECT RPC로 읽기만 한다. internal Ops 인증은
  GET/POST 모두 필수다. 마감·삭제된 Role와 canonical testOnly Role는 검색과 실행
  양쪽에서 제외한다. 선택 후 마감/삭제되어 조회되지 않는 ID가 있으면 provider 호출 전에 중단한다.
- 한 실행은 OpenAI Decisions 1회, 자동 retry/자동 반복 없음. 구조적 probability/ID 계약을
  검증하고 실제 금액으로 decode한다. 모델 범위를 clamp하거나 뒤집힌 endpoint를
  자동 교환하지 않는다. invalid Role 응답은 해당 행의 실패로 표시한다.
- 비용은 기존 `directUsageCost(openai_decisions)` resolver를 사용한다. 입력 bytes와 framing의
  보수적 비용 reserve가 USD 0.25를 넘으면 호출하지 않는다. 이 guard는 요청당 크기
  경계이며 사용자 수동 실행의 누적 예산 관리 기능은 아니다.
- Role/추천/fit/급여 필드에 쓰기, 후보자 정보 조회, 메시지 발송은 없다. 이 화면의 공개
  급여 비교는 primary-source 검증을 마친 frozen gold 평가와 구분한다. 결과를
  추천 Worker나 external SQL의 production 보상 조건에 연결하지 않는다.
- targeted verification: `node --env-file=.env.local --import tsx --test
  src/lib/ops/roleSalaryEstimation.test.ts`는 monetary decode, 넓은 범위 보존,
  malformed/reversed 응답, 공개 급여 비교의 통화/기간 경계, 숫자 blinding,
  검색 literal 및 eligibility를 확인한다. 실사용 flow는 localhost에서 기존 실제
  external Role를 읽어 선택→단일 provider 요청→결과 표시를 확인하며 fixture를 삽입하지 않는다.

## v6 Decisions 단일 호출 추론 실험 (2026-10-15)

- 목표: 회사·JD만 제공한 `baseline`과 아래 compensation market mapping을 추가한
  `mapping`을 비교한다. 공개 급여가 없더라도 시장 지식을 적극적으로 사용한다.
  기존 exact-company web-only estimator의 abstention 계약과 별개인 실험이며 production
  검색·추천·저장 경로를 변경하지 않는다.
- 단위: 하나의 Role의 가장 가능성 높은 연간 기본급 hiring band 하한·상한.
  두 endpoint는 한 `/v1/decisions` 요청에서 독립 `score` 질문으로 받는다. 외부 검색이나
  근거 작성용 두 번째 모델 호출은 하지 않는다. 운영 추정 band와 불확실성 band를
  혼동하지 않도록 prompt에서 구분하며 결과 범위를 사후 clamp하거나 자동 교환하지 않는다.
- frozen input/gold: `gold-v6-decisions.json`, `manifest-v6-decisions.json`, owner-only
  `private/fixture-v6-decisions.json`. 국내 6·미국 6 gold(개발 4·holdout 8), 실제 급여 필드
  없는 production Role 6개. 개발·holdout 회사는 겹치지 않는다. 표본은 보상 시장 차이를
  보려는 목적 표집이며 대표 무작위 표본이 아니다. 누락 급여 slice는 숫자 정확도에 합치지 않는다.
  v5는 최초 호출 전 audit에서 M02의 JD에 공개 연봉을 발견하여 교체한 이전 input이며
  모델 호출에는 사용하지 않았다. v5 파일은 보존하고 input 정제·교체를 v6로 기록했다.
- gold provenance: US 6 + KR 1은 회사 공식 Ashby API의 연간 `Salary` component를
  조회하여 기본급·주식·성과급을 구분했다. KR 나머지 5개는 회사 홈페이지, 회사가 작성한
  채용 플랫폼 공고, 회사 채용문을 게시한 대학 원문에서 연봉을 검증했다. 후자는
  고정 연장수당 등의 구성까지 보장하지 않는다. 한국 3개는 historical 공고이며
  독립 human label review는 아직 없다. 이러한 slice는 보고서에서 구분한다.
- 입력: 회사명·확보된 사업/규모/투자 정보, 역할명·JD·고용형태·근무 국가/지역·통화.
  실제 급여/주식 숫자와 공고 URL은 제거한다. 한국 web gold는 확인된 non-pay 사실만
  직접 추출하며 역할 책임이나 회사 정보를 임의 보충하지 않는다. 원문과 mask audit는 private.
- canonical runner: `harper_worker/llm_evals/company_role_salary_estimation/decisions_eval.py`.
  현재 prompt 정본은 beta `src/lib/ops/roleSalaryEstimation.prompts.json`이며,
  v6 mapping의 역사적 원본은 Worker 같은 폴더의 `compensation_market_mapping.v1.md`다. 한국과 미국의 채용 시장 ×
  책임 수준별 숫자는 analyst-authored prior이며 검증된 통계로 주장하지 않는다. BLS
  orientation만 별도 출처/정의와 함께 제공한다. holdout 회사명·정답은 mapping에 없다.
- 모델/실행: OpenAI `gpt-6-luna`, `/v1/decisions`, endpoint 기본 설정, timeout 40초,
  자동 retry 0회. Native probability의 실제 금액 가중평균을 사용한다(선택지 index를
  연봉으로 바꾸지 않는다). 각각 10개 country/currency anchor를 사용한다.
  최초 development request는 19개 level로 HTTP 400을 받아 inference가 실행되지 않았다.
  API 응답으로 maximum 10개를 확인한 뒤 anchor 계약을 수정하고 새 run을 생성했다.
  실패 request는 비용 usage가 없어 보수적 reserve를 ledger에 유지했다.
  개발 A/B 각 1회 후 prompt를 고정하여 holdout A/B 각 3회, missing mapping 3회,
  company-name/context ablation 1회. 요청당 최대 4개 Role, 3회차는 순서를 반대로 한다.
- 지표: midpoint APE, 하한·상한 APE 및 normalized endpoint error, interval IoU,
  overlap, 예측 폭/midpoint, 예측 폭/gold 폭, 반복 midpoint 변동, 보상 기준 상한 오분류,
  구조 실패 수, 요청/Role당 비용, wall time. 넓은 범위로 overlap만 높이는 결과를
  개선으로 인정하지 않는다. Pilot gate: 구조 실패 0, holdout midpoint median APE ≤20%,
  endpoint median error ≤20%, median IoU ≥0.5. A/B보다 심한 과대 추정/범위 폭 악화가
  없어야 한다. 작은 set 통과가 배포 허가는 아니다.
  반복은 각 Role의 하한/상한 중앙값으로 요약하여 8개 독립 사례 지표를 계산한다.
  단일 금액 gold는 endpoint/중앙값 오차에는 포함하고 구간 IoU 중앙값에서는 제외한다.
- 예산: 사용자 승인한 전체 실험 상한 USD 1. 입력 1M token당 USD 0.10
  (공식 Decisions 가격, 2026-10-15 확인), 출력 과금 없음. 각 요청 전에 보수적 reserve를
  persistent ledger에 기록하고 성공 응답의 actual input usage로 정산한다. 실패/usage 누락은
  reserve를 보존하며 자동 재호출하지 않는다. 이 태스크의 모든 run이 같은 ledger를 공유한다.
- privacy: production capture는 `connect_read_only()`만 사용한다. OpenAI에는 공개
  회사·공고 사실만 보낸다. 후보자/대화/이메일은 전송하지 않는다. 계정의 기존 API data
  controls를 사용하며 추가 retention eligibility를 주장하지 않는다. Raw 파일은 ignored
  `private/`/`runs/`에 mode 0600, 디렉터리 0700. DB write/연락/배포 없음.
- 한계: 공개 band는 실제 오퍼 정답이 아니다. 공개 공고가 모델 학습 지식에 있었을
  가능성을 제거할 수 없다. Sparse Korean JD, historical pay, cash/base composition 차이,
  anchor discretization, probabilistic score calibration 부재를 사례별로 기록한다.
- 추가 `market_reasoning`: 최초 A/B holdout 결과를 본 뒤 만든 unblinded prompt 실험.
  `compensation_market_reasoning.v1.md`에서 금액표를 제거하고 회사의 실제 인재 채용시장과
  JD 책임을 먼저 해석하도록 한다. 회사명/gold 금액별 분기는 없고 frozen input/gold는 같다.
  좋아져도 독립 holdout 통과로 주장하지 않는다. 같은 예산 ledger와 원본 output을 보존한다.
- 결과: [비식별 aggregate 보고서](reports/decisions-v6-20261015.md). A/B/C midpoint median
  APE 19.6%/24.4%/16.8%, nonpoint IoU median 1.6%/0%/16.1%로 구간 gate NO-GO.
  C의 한국 오차는 28.0%, 미국은 9.3%이며 국가별 4개 표본의 한계를 유지한다.
  성공 46회·124 Role 추정, usage-priced USD 0.024525; 미보고 실패 1건 예약까지
  USD 0.039781. 요청 중앙 0.253초·p95 0.425초. 결과·회사명 포함 상세 보고서는
  ignored `runs/decisions-v6-report-20261015/report-ko.md`에 있다.
  canonical report runner는 Worker 같은 폴더의 `decisions_report.py`다.

```bash
# harper_worker에서 실행; capture는 draft만 만들며 frozen fixture를 덮어쓰지 않는다.
venv/bin/python llm_evals/company_role_salary_estimation/decisions_eval.py --capture
venv/bin/python llm_evals/company_role_salary_estimation/decisions_eval.py --split development
venv/bin/python llm_evals/company_role_salary_estimation/decisions_eval.py --split holdout --repeats 3 --batch-size 4
venv/bin/python llm_evals/company_role_salary_estimation/decisions_eval.py --split missing --methods mapping --repeats 3 --batch-size 4
```

## 목적과 한계

`company_roles` 한 건에서 공개 연봉이 없을 때 연간 기본급 범위를 낮은 비용으로
추정하는 방법을 비교한다. 평가가 답하는 것은 공개된 숫자 범위에 대한 근사 성능,
호출 비용, 지연이다. 실제 오퍼, 총보상, 보너스·커미션·지분, 협상 결과의 정확성을
보장하지 않는다.

## 평가 단위와 데이터

- 단위: 하나의 Role에서 연봉 필드를 가린 뒤 생성한 `min/max/currency/year` 한 건
- `v1`: 서로 다른 회사의 미국 USD 연봉제 외부 Role 12건
- `v2`: 구조적으로 정상인 annual Role 중 DB `random()`으로 뽑고 회사 중복을 제거한
  10건(USD 9, JPY 1). 모델 호출 전에 fixture와 gold를 동결했다.
- `v3`: annual external Role 중 회사 중복 없이 무작위 추출한 50건(USD 46, GBP 3,
  CAD 1). 정확한 회사·Role web retrieval 세 방법을 provider 호출 전에 동결했다.
- `v4-korea`: `company_db.location`으로 한국 회사 20개를 무작위 선택하고 회사당 external
  Role 1개를 뽑았다. 급여 유무를 조건으로 쓰지 않았고 numeric annual gold는 0건이다.
- 포함: `salary_min`, `salary_max`, currency, period가 구조화돼 있고 범위가 정상인 Role
- 제외: 시급제, 통화가 없거나 잘못된 Role, 숫자가 없거나 비정상적으로 넓은 범위,
  설명이 없는 Role. v1만 USD로 제한하고 v2·v3는 유효한 다른 통화도 포함한다.
- 공개 gold: `gold-v1.json`, `gold-v2.json`, `gold-v3.json`, `gold-v4-korea.json`
- private fixture: `private/fixture-v1.json`, `private/fixture-v2.json`,
  `private/fixture-v3.json`, `private/fixture-v4-korea.json`
  (Role UUID, 회사명, 모델 입력 포함, mode `0600`)

급여 숫자와 compensation 문장은 모델 입력 설명에서 제거한다. 공개 gold에는 회사명,
Role UUID, 원문 설명을 넣지 않는다. 입력·정답 사례가 바뀌면 dataset version을 올린다.

## Canonical runner와 입력 계약

v1 canonical runner는 `eval.py`, v2는 `improved_eval.py`, v3는
`company_specific_eval.py`다. 모두 `harper_worker/llm_evals/company_role_salary_estimation/`
아래에 있으며 실제 함수 `harper_worker/opp/utils/salary_estimation.py`의 prompt,
정규화, 비용 계산을 재사용한다.
v4-korea runner는 같은 폴더의 `korea_eval.py`이며, production의
`estimate_company_role_salary_from_web()`를 직접 호출한다.

입력은 Role의 title, 설명, 고용 형태, seniority, location, work mode와 회사의 짧은
설명·설립연도·인원 범위·funding stage다. v1 peer 방식은 공개 연봉 raw peer를 최대
10건 추가한다. v2 compact market 방식은 live external Role의 기존 name trigram index로
후보를 찾고 title similarity가 충분한 Role만 남겨 통화별 count·min p25/median·max
median/p75로 압축하며 raw peer를 모델에 보내지 않는다. v2 follow-up threshold는
`similarTitle >= 0.45`, `sameCompany/sameLocation >= 0.40`이다.
구조화된 연봉이 이미 있으면 production 함수는 모델을 호출하지 않고 그 값을 반환한다.
v3 이후 production 함수는 cross-company market summary를 기본으로 읽지 않는다.
회사별 Exa 결과를 넣을 수 있는 `companySpecificWebEvidence` 입력을 지원하며, 배포 전
한국 회사의 가벼운 추정 후보는 v4의 Exa Deep 1회다. 아직 production 호출 경로에
연결하거나 배포한 상태는 아니다.

## 비교 조건

| 방법 | 외부 호출 | 기본 조건 |
| --- | --- | --- |
| `market_median` | 없음 | peer 최소·최대의 중앙값 |
| `deepseek` | OpenRouter 1회 | DeepSeek V4.1 Flash, low reasoning, temperature 0.1, 1,000 max tokens |
| `deepseek_peers` | OpenRouter 1회 | 위 모델 + 공개 연봉 peer 최대 10건 |
| `glm` | OpenRouter 1회 | GLM 5.3 Flash, low reasoning, temperature 0.1, 1,000 max tokens |
| `glm_peers` | OpenRouter 1회 | 위 모델 + 공개 연봉 peer 최대 10건 |
| `exa` | Exa structured search 1회 | 검색 결과 5개, 공개 회사·Role·location query |
| `deepseek_market` | DB + OpenRouter 1회 | DeepSeek V4.1 Flash + compact market summary |
| `luna` | OpenAI 1회 | GPT-5.6 Luna low reasoning, Role/company context only |
| `luna_market` | DB + OpenAI 1회 | GPT-5.6 Luna low reasoning + compact market summary |
| `exa_url_luna` | Exa Contents + OpenAI 1회 | 정확한 공고 URL content + GPT-5.6 Luna |
| `exa_auto` | Exa Search 1회 | 정확한 회사·Role·위치·URL, 다른 회사 연봉 금지 |
| `exa_deep` | Exa Deep Search 1회 | 같은 회사의 공식 공고·보상·자금·규모 추가 검색 |
| `exa_auto_abstain` | Exa Search 1회 | found / estimated / unknown 허용, 회사별 근거만 사용 |
| `exa_deep_abstain` | Exa Deep Search 1회 | 근거가 부족하면 unknown, exact-company grounding 보존 |
| `exa_auto_company_anchor` | Exa Search 1회 | 정확한 Role 급여가 없으면 같은 회사 평균·초봉·직급·최저/최고를 넓은 추정의 기준점으로 허용 |
| `exa_deep_company_anchor` | Exa Deep Search 1회 | 위 계약으로 회사별 급여 자료를 추가 탐색하고, 숫자가 실린 출처 URL을 요구 |

OpenRouter 요청은 data collection `deny` 정책을 사용한다. timeout은 worker client 기본값,
병렬도는 기본 4다. 모델/provider/reasoning/prompt를 바꿔도 같은 `v1`을 재사용한다.

## 지표와 release gate

- 비용: provider usage 기반 Role당 USD와 전체 USD
- 속도: median/p95 wall time. peer 방식은 DB context load를 포함한다.
- 성능: 공개 구간 overlap, 공개 midpoint가 예측 구간에 포함되는 비율, 예측 midpoint가
  공개 구간에 포함되는 비율, midpoint 절대 백분율 오차, interval IoU
- critical failure: JSON/숫자/currency/기간 계약 실패

각 frozen set의 pilot gate는 구조 실패 0건, overlap 80% 이상, midpoint 절대 백분율
오차 중앙값 20% 이하, 기본 경로 평균 모델 비용 $0.001 이하로 둔다. v2 선택안은 이
수치 gate를 통과했지만 similarity threshold를 같은 v2에서 한 번 조정했으므로 독립
holdout 통과로 보지 않는다. v3는 web-search 비용을 별도로 비교하며 Auto가 49/50이라
구조 실패 0건 gate는 통과하지 못했다. 따라서 현재 결과는 배포 기본값 확정이 아니라
비용·성능 후보 선택이다. 다른 국가·통화 배포 기준도 아니다.
v4-korea의 company-anchor 조건은 numeric gold가 없어 release accuracy gate로 쓰지 않고,
coverage·비용·지연·회사별 근거 준수 여부만 비교한다.

## 데이터 출처·privacy

정답은 read-only production capture 시점의 구조화된 외부 채용공고 연봉이다. 외부
provider에는 공개 Role·회사 정보만 보내며 Talent, 대화, 이메일, 개인 식별정보는 보내지
않는다. v3에는 다른 회사의 급여나 일반 시장 급여 통계를 보내지 않는다. raw fixture,
회사명, Role UUID, raw model output은 ignored `private/` 또는 `runs/`
에만 두고 owner-only 권한을 사용한다.

## 알려진 한계

- v1 12건과 random v2 10건의 작은 표본은 전체 Role 모집단을 대표하지 않는다. v2도
  우연히 USD 9건, JPY 1건이어서 한국·유럽·시급제·커미션 중심 역할을 검증하지 못한다.
- 채용공고의 공개 범위도 실제 오퍼나 시장 정답이 아니라 회사가 게시한 band다.
- Exa가 원 공고를 다시 찾으면 추론이 아니라 공개 숫자 검색 성능이 된다.
- title full-text peer는 직무 의미와 level이 완전히 같은 사례를 보장하지 않는다.
- 작은 표본의 수치를 전체 production accuracy로 일반화하지 않는다.
- v3 전체 고득점은 정확한 원 공고 급여를 Auto 42건, Deep 47건에서 다시 찾은 영향이
  크다. exact evidence가 없는 순수 회사별 추론 slice는 각각 7건·3건뿐이다.
- v4-korea는 무작위 20건 모두 numeric gold가 없어 accuracy benchmark가 아니다. strict
  Deep은 found 1·unknown 19였고 Auto의 found 1건은 출처 audit에서 false positive였다.
- 같은 v4-korea에서 회사 전체 급여를 가벼운 추정 기준점으로 허용하자 Deep은 20/20에
  범위를 냈다. 이는 정답률 100%가 아니라 출력 coverage 100%다. 회사 평균에는 성과급,
  수당, 계약직, 오래된 자료가 섞일 수 있어 모든 비직접 결과는 `estimated_range`로 표시한다.
- Auto company-anchor는 두 사례에서 금지한 일반 시장값을 사용했고, 한 사례는 급여가 없는
  페이지를 숫자 근거로 오인했다. 현재 선택안은 Deep이며 Auto는 기본 경로로 채택하지 않는다.
