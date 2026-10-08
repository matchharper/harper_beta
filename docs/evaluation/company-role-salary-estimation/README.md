# Company Role 연봉 범위 추정

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
