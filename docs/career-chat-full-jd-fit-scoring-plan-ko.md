# Career `recommend_job_postings` full-JD fit scoring 계획

문서 상태: **옵트인 구현 완료, 아직 배포되지 않음**
작성 기준: 2026-08-13

이 문서는 `/career`의 `recommend_job_postings`가 compact shortlist만 보고 후보를
줄이면서 생기는 품질 손실을 줄이되, 기존의 비용 절감 휴리스틱을 보존하는 구현
계획이다. 현재 동작 계약은
[`career-chat-recommend-job-postings.md`](./career-chat-recommend-job-postings.md)를
참고한다.

## 0. 실행 방식 선택

기존 경로는 삭제하거나 덮어쓰지 않았다. 아무 설정이 없거나 알 수 없는 값을 넣으면
항상 `legacy`를 사용한다. 새 경로는 아래 세 방법 중 하나로만 선택한다.

| 우선순위 | 선택 방법 | 용도 |
| ---: | --- | --- |
| 1 | 내부 호출 인자 `strategy: "legacy" \| "full_jd"` | 테스트·명시적 1회 실행 |
| 2 | `CAREER_RECOMMEND_JOB_POSTINGS_FULL_JD_USER_IDS`에 user id를 쉼표로 열거 | 내부 사용자별 점진 rollout |
| 3 | `CAREER_RECOMMEND_JOB_POSTINGS_STRATEGY=legacy|full_jd` | 환경 전체 기본 경로 전환 |

명시적 호출 인자가 allowlist와 전역 설정보다 우선한다. allowlist가 전역 설정보다
우선하며, 어느 값도 유효하지 않으면 `legacy`다. 따라서 배포 직후에는 기존 동작을
그대로 유지하면서 내부 사용자만 `full_jd`로 실행할 수 있다.

Luna prompt cache key는 user id 원문을 넣지 않고 기본 16개 shard 중 하나를 고른다.
필요하면 `CAREER_RECOMMEND_JOB_POSTINGS_CACHE_SHARDS`로 shard 수만 조정한다.

## 1. 결론

제안한 방향은 타당하다. 다만 다음 형태로 정리하는 것이 구현 난이도와
품질·비용·시간의 균형이 가장 좋다.

1. GPT-5.6 Luna가 현재 요청과 사용자 맥락을 구조화된 search plan으로 만든다.
   실제 SQL은 현재처럼 서버 코드가 plan을 검증·정규화한 뒤 결정론적으로 만든다.
2. SQL로 external JD 후보를 최대 150개 가져오고, 현재의 회사 점수와 최근 회사
   페널티를 유지한다.
3. 10일 이내 `talent_external_fit`은 요청이나 사용자 맥락이 달라져도 그대로
   재사용한다. 캐시가 있는 role은 fresh scoring에서 제외한다.
4. 캐시 miss 중 retrieval 순위가 높은 role부터 GPT-5.6 Luna가 상세 JD와 필요한
   회사 정보를 읽고 20개씩 독립 평가한다. 최대 100개까지만 평가한다.
5. 매 wave 뒤 캐시 결과와 새 결과를 합쳐, 보정 점수 75점 이상이 서로 다른 회사
   기준으로 목표 개수만큼 있으면 종료한다.
6. 최대 100개 이후 75점 이상을 먼저 고르고, 부족하면 60~74점을 보충한다.
   60점 미만은 추천하지 않는다. 별도 listwise reranking은 생략한다.
7. 새 평가 결과는 최종 추천 여부와 무관하게 batch가 끝날 때마다 바로 fit cache에
   저장한다. 낮은 점수도 저장해야 다음 요청에서 같은 비용을 내지 않는다.

권장 호출 스케줄은 `20 → 40 → 40`이다. 모든 실제 Luna 요청 크기는 20개이고,
첫 20개가 끝난 뒤 다음 wave부터 최대 두 batch만 병렬 실행한다. 첫 호출이 사용자
context prefix를 cache에 먼저 쓸 수 있어 이후 두 호출이 읽을 가능성이 높다.
측정 결과 cache write 중복보다 latency가 더 중요하면 상수만 바꿔 `40 → 40 → 20`을
쓸 수 있다. 다섯 batch를 동시에 실행하는 형태는 사용하지 않는다.

### 현재 구현과 달라지는 핵심

| 항목 | 현재 Career 경로 | 제안 경로 |
| --- | --- | --- |
| 후보 평가 | compact card shortlist 후 소수의 상세 후보만 선택 | cache miss 상위 role을 상세 JD로 최대 100개 독립 평가 |
| fit cache | 10일 cache를 읽지만 이 호출에서 새로 만든 fit score는 저장하지 않음 | hit 규칙은 그대로 두고 모든 유효 fresh 평가를 batch별 저장 |
| role summary | 주로 최종 추천된 role의 새 summary 저장 | 추천 가능 점수의 유효 summary를 batch별 저장 |
| 최종 선택 | final-selection LLM이 추천할 role만 출력 | 모든 평가를 합쳐 deterministic threshold/sort |
| prompt cache | Responses adapter가 explicit breakpoint/key를 전달하지 않음 | stable prefix만 explicit cache, candidate suffix는 write하지 않음 |

기존 compact shortlist LLM과 final-selection LLM을 새 batch scorer 하나로 대체하므로,
구현은 기존 3단계 결과를 억지로 이어 붙이는 것보다 단순해진다. 반면 scorer가 반드시
입력 role마다 결과를 내고, partial failure를 복구해야 하므로 output validation은 더
엄격해진다.

## 2. 반드시 유지할 결정

### 2.1 Fit cache

- cache key의 의미는 지금과 동일하게 `talent_id + role_id`이다.
- Career 경로의 현재 TTL인 10일을 유지한다.
- 요청 fingerprint, behavior-context version, profile hash를 cache hit 조건에 넣지
  않는다.
- profile이나 요청이 바뀌었다는 이유로 기존 평가를 무효화하지 않는다.
- cache에는 LLM의 원본 `modelScore100`을 저장한다. 매 요청마다 달라질 수 있는
  회사 보너스와 최근 회사 페널티를 더한 점수를 저장하면 안 된다.
- score가 낮은 유효 평가도 저장한다. 모델 실패나 누락을 인위적인 0점으로 저장하지
  않는다.

이 정책은 완벽한 현재 시점의 fit보다 “한 번 낸 평가 비용을 최대한 다시 쓰는 것”을
우선하는 명시적인 비용 결정이다.

### 2.2 회사 점수와 최근 추천 페널티

두 값은 모델 prompt에 숨기고, 코드에서 모든 후보에 항상 적용한다.

```txt
companyBonus = clamp(company_test_score, 0, 20) / 5
              # 0.0 ~ 4.0

recentCompanyPenalty =
  최근 추천 회사 순위 1~6   -> -15
  최근 추천 회사 순위 7~12  -> -10
  최근 추천 회사 순위 13~18 -> -5
  그 외                    -> 0

adjustedScore100 = round(clamp(
  modelScore100 + companyBonus + recentCompanyPenalty,
  0,
  100
))
```

- 회사 보너스는 최대 `+4`로 낮추되 조건부로 제거하지 않는다.
- 최근 회사 페널티도 현재 요청이 그 회사를 명시했다는 이유 등으로 제거하지 않는다.
- 회사 점수는 retrieval 순위에도 지금처럼 반영한다. retrieval에서 “평가받을 기회”에
  영향을 주고, 최종 단계에서 adjusted score에도 반영하는 2단계 효과는 의도된
  동작이다.

## 3. 전체 실행 흐름

```txt
현재 요청 + 사용자 snapshot
  -> Luna search plan
  -> 검증된 deterministic SQL
  -> external 후보 최대 150개
  -> 기존 추천 제외 + 회사당 cap + retrieval 정렬
  -> 10일 fit cache 조회
     -> cache만으로 75점 이상 목표 충족: scoring 생략
     -> 부족: cache miss 상위 최대 100개를 20개 batch로 평가
        -> wave마다 새 결과 저장
        -> cache + fresh 결과에 회사 보너스/최근 페널티 적용
        -> 75점 이상 목표 충족 시 early stop
  -> 회사 중복 제거 + deterministic final sort
  -> cached role summary와 fit metadata를 그대로 재사용
  -> recommendation 저장 + answer draft 반환
```

### 세부 순서

1. profile, setting, structured career history, insight, behavior context,
   최근 대화 delta, 최근 추천 feedback을 한 snapshot으로 읽는다.
2. Luna가 raw SQL이 아니라 제한된 search-plan schema를 반환한다.
3. 기존 SQL builder가 hard filter와 weighted FTS SQL을 생성해 최대 150개를 가져온다.
4. 기존에 추천한 role/fingerprint를 제외하고 회사당 retrieval cap을 적용한다.
5. 150개 전체 role id에 대해 fit cache를 한 번에 읽는다.
6. cache hit에는 현재 회사 보너스와 최근 회사 페널티를 다시 적용한다.
7. 서로 다른 회사의 adjusted score 75점 이상이 목표 개수, 현재 기본 5개, 이상이면
   fresh scoring을 전혀 하지 않는다.
8. 아니면 cache miss만 retrieval 순서대로 최대 100개 자르고 `20 → 40 → 40`으로
   평가한다. 각 wave가 끝날 때 동일한 early-stop 검사를 한다.
9. 75점 이상을 adjusted score 순으로 고른다. 부족한 수만 60~74점에서 보충한다.
10. 한 회사에서는 최종 1개만 남기며, 60점 미만으로 개수를 억지로 채우지 않는다.

## 4. 사용자 데이터 계약

DB row나 큰 JSON object를 그대로 prompt에 넣지 않는다. 한 번 정규화한 canonical
snapshot으로 아래 두 개의 문자열 projection을 만든다.

- `searchContextText`: search plan 작성에 필요한 compact view
- `fitContextText`: JD fit 평가에 필요한 detailed view

두 projection은 같은 source snapshot에서 생성해야 서로 모순되지 않는다. 빈 값은
줄 자체를 생략하고, section과 field 순서를 항상 동일하게 유지한다.

### 4.1 항상 포함하는 데이터

| 영역 | 모델에 보내는 값 | 사용 방식 |
| --- | --- | --- |
| 현재 요청 | tool input `request`, 출력 언어 | 가장 우선하는 검색·평가 목표 |
| 기본 프로필 | headline, bio, location | 역할 방향과 위치 판단 |
| 경력 | 최근/주요 경력 최대 12개: 회사명, role, 기간, employment type, description, memo | search에는 role/domain 중심 compact text, scoring에는 상세 text |
| 학력 | 최대 8개: 학교, 학위, 전공, 기간, 필요한 설명 | 학력·전공이 JD 조건과 관련 있을 때 |
| 기타 경력 | 최대 12개: 자격·프로젝트·수상 등의 title, date, description, memo | 관련 evidence가 있을 때 |
| insight | matching에 관련된 정규화된 preference와 career signal | 명시 선호와 profile 해석 |
| setting | blocked companies, engagement types, work modes 등 존재하는 명시 설정 | SQL hard filter와 scoring constraint에 동일하게 반영 |
| resume 상태 | resume/LinkedIn 존재 여부만 | evidence가 부족한 이유를 해석할 때만 사용 |

`name`, `email`, profile picture, user id, 파일명, raw resume URL, login time은 fit 판단에
필요하지 않으므로 모델에 보내지 않는다. raw `resume_text`를 새로 넣지 않고, 현재의
정규화된 경력 데이터를 사용한다.

초기 text budget은 현재 Career context의 정보량을 크게 바꾸지 않는 선에서 다음처럼
고정한다. `searchContextText`에서는 긴 경력 설명을 role당 800자로 줄이고,
`fitContextText`에서는 현재의 상세 cap을 유지한다.

| 값 | search view | fit view |
| --- | --- | --- |
| bio | 최대 800자 | 최대 800자 |
| experience | 최대 12개; 회사/role/기간 + description 800자 | 최대 12개; description 5,000자, memo 600자 |
| education | 최대 8개; 학교/학위/전공/기간 중심 | 최대 8개; description 900자, memo 600자 |
| extra | 최대 12개; title/date + description 240자 | 최대 12개; title 160자, description 500자, memo 300자 |
| insight scalar | key당 최대 800자 | key당 최대 800자 |
| insight list | 최대 12개, item당 180자 | 최대 12개, item당 180자 |

nested field 정리 후의 전체 초기 budget은 `searchContextText` 24,000자,
`fitContextText` 60,000자로 둔다. 현재 요청과 explicit setting은 절대 잘라내지 않고,
nested insight object는 raw JSON으로 직렬화하지 않고 `parent.child: value` 형태의
결정론적 line으로 펼친다. section budget을 넘으면 `현재 요청/setting → 최근·현재
경력 → behavior/direct feedback → insight → 오래된 경력` 순서로 보존한다. 잘린
field 수는 metric에 남겨 context 축소가 품질 저하의 원인인지 확인할 수 있게 한다.

### 4.2 Behavior context가 있을 때

`talent_behavior_contexts.context_text`가 비어 있지 않으면 이를 장기 행동 맥락의
기본값으로 사용한다. 동기 Career 요청 안에서 behavior context를 다시 생성하는 LLM은
호출하지 않는다. 이미 만들어진 snapshot만 읽어 latency와 비용을 고정한다.

함께 읽는 값은 다음과 같다.

- `context_text`: 현재 builder와 동일하게 최대 24,000자 안에서 전달한다.
- `context_version`: 로그와 trace에만 사용하며 자연어 prompt에는 넣지 않는다.
- `last_consumed_change_id`: context 이후 delta를 찾는 cursor로 사용한다.
- cursor 이후의 최근 사용자 interaction 최대 6개.
  - 사용자 문장을 evidence로 보낸다.
  - “네”, “그건 싫어요”처럼 단독으로 뜻이 불명확한 경우에만 직전 assistant 문장을
    최대 600자로 `assistant_context`에 붙인다.
  - 사용자 본문은 interaction당 최대 1,200자다.
- cursor 이후의 최근 추천 반응 최대 10개.
  - explicit like/dislike, feedback reason, save/apply/dismiss 상태를 우선한다.
  - view/click은 약한 행동 신호라고 표시하고 명시적 선호처럼 쓰지 않는다.
  - 이전 회사명과 role id는 보내지 않는다. 역할 category, location, work mode 같은
    해석 가능한 특징과 사용자의 feedback reason만 남긴다.

`talent_behavior_context_changes.id > last_consumed_change_id`를 기준으로 source row를
resolve하는 것이 가장 정확하다. 이 cursor 조회가 실패하면 `last_evaluated_at` 이후
row를 읽는 fallback을 사용한다. 현재 tool request는 별도 최상위 section에 있으므로
delta에서 중복되면 한 번만 남긴다.

### 4.3 Behavior context가 없을 때

현재 Career 경로의 fallback을 유지한다.

- 최근 conversation summary 최대 3개
- 최근 activity event 최대 10개
- 최근 external recommendation/feedback 최대 10개
- 현재 요청

이 경우에도 JSON을 그대로 보내지 않고 동일한 sectioned string builder를 사용한다.

### 4.4 사용자 문자열 예시

```txt
[CURRENT REQUEST]
서울 기반 LLM infrastructure 역할. Series B 이상 선호, 대기업 제외.

[PROFILE]
headline: ML Platform Engineer
location: Seoul
career direction: LLM serving, inference platform, evaluation infrastructure

[CAREER HISTORY 01]
company: ExampleAI
role: ML Platform Engineer
period: 2022-01 - present
work: LLM inference platform과 evaluation pipeline을 구축하고 운영함.

[EXPLICIT SETTINGS]
blocked companies: Samsung, Google
engagement types: full-time

[LONG-TERM BEHAVIOR CONTEXT]
- 반복적으로 작은 연구 중심 팀과 hands-on 역할을 선호한다고 밝힘.
- management-only 역할보다 individual contributor scope에 긍정적으로 반응함.

[NEW INTERACTION AFTER CONTEXT 01]
user: 이제는 모델 학습보다 serving 쪽을 더 보고 싶어요.

[RECENT RECOMMENDATION FEEDBACK 01]
role traits: backend-heavy, onsite, large enterprise
response: dislike
reason: 인프라보다는 일반 백엔드에 가까워서
```

중요한 우선순위는 `현재 요청 > 명시 setting/deal breaker > 직접 말한 최근 문장 >
behavior context > 약한 행동 신호 > 일반 profile 추론`이다. behavior context는 hard
constraint engine이 아니라 해석 evidence다.

## 5. Search plan과 SQL

Search planner와 fit scorer 모두 GPT-5.6 Luna를 사용한다. 다만 Luna가 임의 SQL
문자열을 직접 실행 가능한 형태로 쓰게 하지는 않는다.

Luna의 search-plan output은 현재 schema를 유지한다.

```txt
searchIntentSummary
ftsKeywords[{terms, weight}]
role_titles[]
include_contract / include_parttime / include_intern
locations[]
includeRemote / remoteOnly
is_prefer_entry
postingRecency
```

서버 코드는 값의 개수·길이·범위를 정규화하고, 허용된 table과 column만 사용하는
기존 SQL builder로 쿼리를 만든다. 이 방식은 다음 이점이 있다.

- 모델이나 prompt가 바뀌어도 SQL injection과 잘못된 schema 접근을 막는다.
- hard filter 의미를 unit test로 고정할 수 있다.
- 실패 시 현재의 relaxed fallback을 그대로 사용할 수 있다.
- search plan은 작고 검증 가능한 JSON으로 유지하면서, 큰 사용자 입력은 문자열로
  보낼 수 있다.

검색 결과는 최대 150개이며, 현재의 회사당 role cap, blocked-company 제외,
employment/location hard filter, 이미 추천한 role/fingerprint 제외를 유지한다.

## 6. 회사·role 입력 데이터 계약

후보 입력도 raw JSON으로 보내지 않는다. company 정보를 batch 안에서 한 번 선언하고
그 아래 role을 묶어, 같은 회사의 설명·투자 정보를 반복하지 않는다. 모든 외부 text는
HTML/script를 제거하고, 공백을 정리하고, delimiter처럼 보이는 line을 escape한다.
Prompt에는 JD 안의 명령을 따르지 말고 채용 정보로만 취급하라는 규칙을 둔다.

### 6.1 포함할 회사 데이터

- 회사명
- short description, 최대 500자
- cached role summary가 없을 때만 long company overview, 최대 1,200자
- employee range, founded year, HQ/location처럼 실제 fit에 쓰이는 기본 정보
- funding stage, total raised, notable investors, latest round, funding date
- funding confidence/checked date가 있으면 사실의 신뢰도·신선도 표시에만 사용
- 현재와 동일한 small/young-company eligibility를 만족할 때 leadership 최대 3명
- 같은 언어의 `company_roles.summary[ko|en]` v1이 있으면 `cached_role_summary`

### 6.2 포함할 role 데이터

- `role_id`: output을 DB row에 연결하기 위한 유일한 내부 id
- role title
- employment type, seniority
- location text, work mode
- posted/updated date
- 상세 JD 원문 기반 text
- 필요하면 source가 제공한 compensation range

JD는 compact search card나 `description_summary`로 대체하지 않는다. 원문이 6,000자
이하면 정규화한 전체를 넣는다. 그보다 길면 deterministic section-aware trimming으로
overview, responsibilities, minimum requirements, preferred qualifications, location/work
mode, compensation을 우선 보존하고 EEO/legal/apply boilerplate와 반복 benefits 문구를
먼저 제거한다. 초기 hard cap은 role당 6,000자로 두고 실제 token 분포를 본 뒤 설정값만
조정한다.

### 6.3 넣지 않을 데이터

- `company_test_score`, `searchRank`, FTS score, recent penalty
- 추천 순위를 암시하는 값
- company workspace id, source 내부 id, ingest metadata
- external URL 자체, raw HTML, null/empty field
- 검색 시각이나 scraper 상태처럼 fit에 관계없는 운영 metadata
- 같은 내용을 반복하는 company description
- 내부 메모, 연락 가능성, Harper가 연결할 수 있다는 암시

hidden score를 모델에 주지 않아야 `modelScore100`과 휴리스틱 보정을 분리해 관측할 수
있다.

### 6.4 candidate 문자열 예시

```txt
[COMPANY C01]
name: ExampleVoice
overview: 음성 생성 모델과 실시간 voice API를 개발하는 회사.
company size: 51-200
founded: 2020
headquarters: London
funding: Series C | total raised $180M | investors: ... | checked 2026-07

[ROLE R01 | COMPANY C01]
role_id: 82f4...
title: Senior Research Engineer, Speech
employment: full-time
seniority: senior
location: London or remote in Europe
work mode: remote
posted: 2026-08-01
cached role summary: 없음

job description:
The role owns speech-model training, dataset quality, evaluation, and production...
[END ROLE R01]
```

## 7. Luna fit scoring 계약

한 호출은 최대 20개 role을 반드시 각각 평가한다. output은 입력은 문자열이어도
파싱 안전성을 위해 strict JSON schema를 사용한다.

```json
{
  "evaluations": [
    {
      "roleId": "uuid",
      "score": 87,
      "fitSummary": "회사와 역할에 대한 중립 요약",
      "fitReasons": ["구체적인 개인화 이유"],
      "tradeoff": "구체적인 caveat 한 문장"
    }
  ]
}
```

### 7.1 Score

- `score`는 회사 보너스와 recent penalty를 모르는 상태에서 계산한 0~100 정수다.
- 현재 요청, hard preference, 경력 evidence, seniority, 역할 scope, location/work mode를
  함께 본다.
- 좋은 회사라는 이유로 role mismatch를 덮지 않는다.
- 입력 20개 모두에 role id와 score가 있어야 한다.

### 7.2 Summary와 reason을 만드는 시점

출력 비용을 줄이면서 나중에 추천 가능한 후보의 문구는 확보하기 위해 다음 규칙을
쓴다.

| 조건 | 생성할 값 |
| --- | --- |
| 모든 유효 평가 | `roleId`, `score` |
| `modelScore100 < 56` | 필요하면 짧은 `tradeoff`만. summary와 fit reason은 생략 |
| `modelScore100 >= 56` | `fitReasons` 1~3개, concrete `tradeoff` 0~1개 |
| 56점 이상이며 cached role summary 없음 | neutral `fitSummary` 생성 |
| cached role summary 있음 | summary를 다시 쓰지 않고 score/reasons/tradeoff만 생성 |

56점은 회사 보너스 최대 +4를 받아 60점 supplemental 후보가 될 수 있는 가장 낮은
model score다. recent penalty는 점수를 낮추기만 하므로 이보다 낮은 후보에 긴 표시용
문구를 미리 만들 필요가 없다.

- `fitSummary`는 사용자와 무관한 공유 가능한 회사+역할 설명이다. 회사 2~4문장,
  역할 2~4문장 정도로 작성하고 개인화된 추천 이유를 넣지 않는다.
- `fitReasons`는 사용자 evidence와 JD evidence를 연결하는 개인화 문장이다.
- `tradeoff`는 실제 caveat 한 문장 또는 빈 값이다.
- 새 `fitSummary`는 언어 검증 뒤 `company_roles.summary[ko|en]` v1에 저장한다. 최종
  선택된 role뿐 아니라 56점 이상 평가에서 생성된 유효 summary 모두 저장한다.
- 개인화 값은 `talent_external_fit.meta`에 저장한다.

기존 fit cache의 `fitSummary`, `fitReasons`, `tradeoff`는 있으면 그대로 재사용한다.
score만 있고 표시용 필드가 없는 오래된 row도 score를 다시 평가하지 않는다. 이
경우 추가 Luna 호출을 만들지 않고, 저장된 role summary가 있으면 그것을 쓰며 둘 다
없을 때만 회사명+직무명 fallback을 쓴다. 드문 legacy row의 문구 완성도보다 캐시
재사용과 무추가비용을 우선한 결정이다.

### 7.3 누락과 실패 처리

- 20개 중 일부 role이 output에 없으면 누락된 role만 한 번 재요청한다.
- 전체 batch가 누락되면 `10 + 10`으로 한 번 split retry한다.
- retry 후에도 없는 role은 `unscored`로 남기고 cache에 쓰지 않는다.
- cache 저장 실패는 추천 자체를 막지 않되 반드시 metric과 error log를 남긴다.
- 한 batch가 성공할 때마다 다음 wave를 기다리지 않고 cache와 role summary를
  upsert한다. 중간 취소나 timeout 뒤에도 완료된 비용을 재사용할 수 있다.

## 8. Early stop과 최종 선택

각 검사 시점에는 cache와 지금까지의 fresh evaluation을 모두 합친다.

1. 현재 회사 보너스와 recent penalty를 적용한다.
2. 같은 회사에서 adjusted score가 가장 높은 role 하나만 센다.
3. adjusted score 75점 이상이 목표 수 이상이면 종료한다.
4. 최대 100개 평가 후 75점 이상을 먼저 선택한다.
5. 부족한 수만 adjusted score 60~74점으로 채운다.
6. 60점 미만은 선택하지 않고, 필요하면 5개보다 적게 반환한다.

여기서 “같은 회사”는 저장된 workspace 이름만 비교하지 않는다. Workday,
Greenhouse, Lever, Ashby 같은 employer-specific ATS URL과 LinkedIn 공고의 employer
slug를 우선 사용하고, 신뢰할 URL 신호가 없을 때 정규화한 회사명, workspace id,
role id 순서로 fallback한다. 따라서 공고가 잘못된 workspace에 연결되어도 실제
고용주를 식별할 수 있는 URL이 있으면 최종 Top N과 early stop에서 한 회사로 센다.
recent-company penalty 조회는 기존 저장 회사명 key를 먼저 사용하고 canonical key를
fallback으로 사용해 중복 제거 강화 때문에 페널티가 사라지지 않게 한다.

최종 sort는 LLM reranking 없이 다음 순서로 결정한다.

```txt
adjustedScore100 DESC
modelScore100 DESC
retrievalSearchRank DESC
companyTestScore DESC
postedAt DESC
roleId ASC
```

60~74점 후보가 하나라도 포함되면 answer draft에 다음 의미의 안내를 붙인다.

> 요청에 정확히 맞는 공고가 충분하지 않아, 인접한 가능성까지 넓혀 우선 추천할
> 만한 후보를 함께 골랐어요.

5개를 채우지 못한 경우에는 현재 확인된 범위에서 추천 기준을 넘은 수만 제공했다고
말한다. 낮은 점수를 사용자에게 직접 노출할 필요는 없다.

## 9. GPT-5.6 Luna prompt cache 설계

OpenAI의 GPT-5.6 prompt cache는 **exact prefix** 단위다. cache write는 일반 uncached
input rate의 1.25배이므로, candidate batch처럼 매번 달라지는 suffix까지 implicit
cache write가 생기지 않게 해야 한다. 공식 계약은
[OpenAI Prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)를
기준으로 한다.

### 9.1 Scoring prompt 순서

```txt
1. static scorer system prompt + score rubric + strict output schema
   -> explicit breakpoint A
2. stable fitContextText + 현재 request + normalized search intent + output language
   -> explicit breakpoint B
3. dynamic candidate company/role string for this batch
   -> no breakpoint
```

- `prompt_cache_options = { mode: "explicit", ttl: "30m" }`
- breakpoint block에는
  `prompt_cache_breakpoint = { mode: "explicit" }`를 둔다.
- 첫 breakpoint는 모든 사용자 사이에서 같은 system prefix를 재사용한다.
- 두 번째 breakpoint는 같은 추천 실행의 후속 batch가 긴 사용자 context를 재사용한다.
- timestamp, batch number, trace id, candidate count처럼 매번 달라지는 값은 breakpoint
  뒤로 보낸다.
- prefix가 최소 1,024 token 이상일 때만 cacheable하므로 짧은 search-plan prompt에서
  억지로 breakpoint를 늘리지 않는다.

Responses API의 개념적 request shape는 다음과 같다.

```json
{
  "model": "gpt-5.6-luna",
  "prompt_cache_key": "career-job-fit:v2:s07",
  "prompt_cache_options": { "mode": "explicit", "ttl": "30m" },
  "input": [
    {
      "role": "system",
      "content": [{
        "type": "input_text",
        "text": "{stable scoring instructions and schema}",
        "prompt_cache_breakpoint": { "mode": "explicit" }
      }]
    },
    {
      "role": "user",
      "content": [{
        "type": "input_text",
        "text": "{stable user context and request}",
        "prompt_cache_breakpoint": { "mode": "explicit" }
      }]
    },
    {
      "role": "user",
      "content": [{
        "type": "input_text",
        "text": "{dynamic batch candidates}"
      }]
    }
  ]
}
```

### 9.2 Cache key

- stage와 prompt version을 key에 넣는다: `career-job-fit:v2`.
- raw talent id, email 등 PII는 넣지 않는다.
- 같은 talent의 batch는 항상 같은 stable shard로 보낸다.
- 예: `s{hash(talentId) % 16}`. 실제 traffic이 key당 약 15 request/min을 넘으면 shard
  수를 설정값으로 늘린다.
- search planner는 scoring과 prefix가 다르므로 별도 key namespace를 쓴다.

### 9.3 현재 adapter에서 필요한 변경

현재 `responsesChatAdapter.ts`는 message content를 문자열로 바꿔 content-block의
breakpoint를 보존하지 못하고, `prompt_cache_key`와 `prompt_cache_options`도 전달하지
않는다. 구현 시 다음을 backward-compatible option으로 추가한다.

- Responses `input_text` content block 보존
- `prompt_cache_key` 전달
- `prompt_cache_options.mode/ttl` 전달
- GPT-5.6 계열에만 breakpoint option 적용; older fallback model에는 제거
- strict JSON schema 전달 지원 또는 현재 JSON mode + validator fallback

usage logging은 `cached_tokens`뿐 아니라 GPT-5.6의 `cache_write_tokens`를 Responses의
`usage.input_tokens_details`와 Chat Completions의 `usage.prompt_tokens_details`에서 모두
읽어야 한다. cache read가 많아 보여도 write가 더 비싸면 순절감이 아닐 수 있다.

## 10. 비용·시간·품질 평가

### 품질

현재보다 좋아질 가능성이 높다. shortlist 단계에서 title/compact card만 보고 버리던
후보를 상세 responsibilities, requirements, seniority, work mode까지 보고 평가하기
때문이다. worker와 같은 종류의 evidence를 사용하면서 Career의 현재 요청을 최우선으로
둘 수 있다.

### 비용

무조건 더 싸지는 않는다. 현재는 compact shortlist 뒤 대략 10개 안팎의 상세 후보만
읽지만, 새 경로는 최소 20개, 최악에는 100개의 상세 JD를 읽는다. candidate JD는
batch마다 달라 prompt cache로 절약되지 않는다. 따라서 worst-case scoring input은
현재보다 크게 늘 수 있다.

비용을 통제하는 실제 장치는 중요도 순으로 다음과 같다.

1. 10일 fit cache를 요청 변화와 무관하게 재사용
2. 캐시된 low score까지 fresh 대상에서 제외
3. cache만으로 목표를 만족하면 Luna scoring 0회
4. 75점 이상 목표 달성 시 early stop
5. fresh 평가 hard cap 100
6. system/user prefix explicit cache
7. 56점 미만의 summary/reason output 생략
8. cached role summary 재사용
9. listwise reranking과 기존 compact shortlist 호출 제거

즉, 처음 보는 사용자·후보 조합의 최악 비용은 증가하지만, 같은 사용자의 반복 요청은
빠르게 싸지는 구조다. 이것이 이 설계에서 의도한 tradeoff다.

### 시간

- cache가 충분하면 search plan + SQL 이후 scoring 없이 끝난다.
- cache miss가 있으면 권장 `20 → 40 → 40` 스케줄로 scoring latency wave는 최대 3회다.
- 첫 20개에서 목표를 만족하면 한 번만 호출한다.
- worst case는 현재 shortlist + final selection보다 느릴 수 있다.
- 회사/funding/leadership 조회는 role별 N+1 query가 아니라 후보 회사 id를 모아 batch
  조회하고, 실제 scoring 대상에만 붙인다.

| 종료 지점 | 실제 20-role Luna 호출 수 | scoring latency wave 수 |
| --- | ---: | ---: |
| cache만으로 충족 | 0 | 0 |
| 첫 20개 후 충족 | 1 | 1 |
| 다음 40개 후 충족 | 3 | 2 |
| 최대 100개 평가 | 5 | 3 |

## 11. 구현 범위와 난이도

난이도는 **중간**이다. 새 DB schema 없이 기존 table과 JSONB meta로 구현할 수 있다.
가장 주의할 부분은 shared OpenAI adapter의 content block 보존과 cache 사용량 집계다.

예상 변경 지점은 다음과 같다.

- `src/lib/talentOnboarding/jobPostingRecommendations.ts`
  - 기존 shortlist/final-selection orchestration을 batch scorer로 교체
  - cache/fresh merge, early stop, deterministic final selection
- `src/lib/career/llm.ts`
  - search planner와 scoring Luna 설정, batch/wave/threshold 상수
- 새 recommendation 전용 helper
  - user context string builder
  - company/role string builder
  - fit score/cache normalization과 adjusted-score 계산
- `src/lib/talentOnboarding/llm.ts`
  - feature-scoped Responses cache options 전달
- `src/lib/llm/responsesChatAdapter.ts`
  - content block, breakpoint, prompt cache key/options 보존
- `src/lib/llm/usageLogging.ts`
  - `cache_write_tokens` 정규화와 비용 집계

공유 adapter 변경은 기존 호출의 request shape를 바꾸지 않도록 optional parameter로만
추가한다. 선택 규칙은 이 문서의 `0. 실행 방식 선택`과 같고, 기본값은 `legacy`다.

## 12. 테스트 계획

### Unit tests

- 10일 이내 cache는 request/profile/behavior version이 달라도 hit
- 10일이 지난 row와 numeric score가 없는 row만 miss
- low score도 cache에 저장되고 다음 요청에서 fresh scoring 제외
- model score는 저장하고 adjusted score는 저장하지 않음
- 회사 bonus가 항상 적용되고 최대 +4
- recent company penalty tier가 항상 적용됨
- cache hit만으로 75점 이상 5개면 scoring 0회
- 20개, 최대 100개, wave별 early stop
- 회사 중복 제거 후에도 threshold count를 올바르게 계산
- 75점 우선, 60~74점 보충, 60점 미만 제외
- score 56 경계에서 summary/reason 생성 규칙
- cached role summary가 있으면 summary output 요구 안 함
- 표시용 필드가 없는 legacy cache도 score 재계산 없이 재사용
- candidate string에 hidden score, raw JSON, HTML, PII가 없음
- 동일 run의 batch마다 breakpoint B까지 byte-for-byte 동일
- candidate suffix만 변경됨
- GPT-5.6 요청에만 explicit cache option이 붙음
- `cached_tokens`, `cache_write_tokens`가 비용에 각각 반영됨

### Failure tests

- 20개 일부 누락 시 missing-only retry
- 전체 누락 시 10+10 split 후 무한 retry하지 않음
- Luna timeout, malformed JSON, language mismatch
- cache read/write 실패 시 recommendation flow fail-open
- role summary write 실패가 recommendation 저장을 막지 않음
- abort signal 뒤 새 batch를 시작하지 않음

### Offline evaluation

production에서 무작정 shadow scoring을 켜면 비용이 두 배가 되므로 기본값으로 하지
않는다. 과거 추천 run에서 candidate/profile snapshot을 개인정보 제거 후 replay하여
현재 결과와 새 결과를 비교한다.

- 최소 20개 대표 요청: 명확한 역할, 넓은 요청, location hard constraint, seniority
  mismatch, feedback가 많은 사용자, cache hit가 많은 사용자
- 기존 top 5와 새 top 5를 사람이 blind pairwise 평가
- JD 근거 없는 추천, hard mismatch, 중복 회사, fit reason 구체성을 따로 채점
- reasoning effort는 `high`를 기준으로 시작하되 `medium`도 같은 replay에서 비교한다.
  품질 차이가 작을 때만 medium으로 낮춘다.

## 13. 운영 지표와 rollout gate

prompt 원문과 사용자 개인정보는 로그에 남기지 않고 count, token, version, hash만
기록한다.

필수 지표:

- SQL candidate count, cache hit/miss, cached high-fit count
- fresh role count, batch/wave count, early-stop wave
- 75점 이상 수, supplemental 수, 최종 추천 수, 회사 중복 제거 수
- batch latency, total tool latency, timeout/retry/missing role count
- input/output/cached/cache-write tokens와 실제 추정 비용
- system-prefix cache hit, run-context-prefix cache hit
- role summary hit/generated/stored/language-rejected 수
- 표시용 필드가 없는 legacy cache 선택 수
- 추천 1개당 비용, 성공 run당 비용

권장 rollout 순서:

1. helper와 deterministic logic unit test
2. 저장 없는 local replay
3. 내부 talent allowlist에서 feature flag on
4. cache write/read와 cost를 먼저 확인
5. 품질 검수 후 점진 확대
6. p95 latency와 cost가 과하면 threshold가 아니라 우선 JD text budget, reasoning
   effort, wave schedule을 조정

초기에는 75/60, 20개 batch, 최대 100개, 회사 +4, recent penalty tier, 10일 cache를
한꺼번에 튜닝하지 않는다. 이 값들은 이번 설계의 비교 기준으로 고정하고, 관측 결과가
쌓인 뒤 한 변수씩 바꾼다.

## 14. 구현 완료 조건

- 기존 fit cache 재사용률이 떨어지지 않는다.
- cache가 있는 role은 request가 달라져도 scorer에 다시 들어가지 않는다.
- 새로 평가한 모든 유효 role이 최종 선택 여부와 무관하게 cache에 저장된다.
- Luna가 평가하는 모든 fresh role에 상세 JD가 들어간다.
- 모델 입력에 company/retrieval/recent hidden score가 노출되지 않는다.
- 회사 보너스와 recent penalty가 cache/fresh 후보 모두에 동일하게 적용된다.
- 목표 충족 뒤 불필요한 다음 wave를 시작하지 않는다.
- 60점 미만으로 추천 수를 채우지 않는다.
- user-facing summary와 fit reason이 생성·재사용·저장되는 시점이 테스트로 고정된다.
- explicit prompt cache read/write를 token과 비용으로 확인할 수 있다.
