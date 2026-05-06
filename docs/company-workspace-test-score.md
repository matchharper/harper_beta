# company_workspace.test_score 계산안

작성일: 2026-05-05

## 목적

`company_workspace.test_score`는 추천 기능을 본격적으로 돌리기 전에, 회사 자체의 대략적인 매력도를 0-20점으로 채워 넣기 위한 테스트용 점수다.

여기서 "좋은 회사"는 특정 인재가 그 회사를 얼마나 가고 싶어할지를 의미한다. 다만 지금 단계에서는 유저별 선호, 공고 추천 결과, 추천 피드백, role 매칭 결과는 전혀 쓰지 않는다. 회사 자체에 이미 붙어 있는 정적/준정적 데이터만 사용한다.

원칙은 다음과 같다.

1. `company_workspace.company_db_id`가 없으면 무조건 0점으로 둔다.
2. `company_db_id`가 있는 회사만 1-20점 사이로 분포시킨다.
3. 20점은 상위권 회사에만 주고, 많은 회사가 20점으로 몰리지 않게 한다.
4. 해외/한국 여부는 점수에 직접 반영하지 않는다.
5. 추천 실행 이후에 생기는 데이터는 사용하지 않는다.
6. 산식은 완벽한 평판 모델이 아니라, 지금 DB로 계산 가능한 baseline ranker로 본다.

## 사용 데이터 범위

v1에서는 아래 데이터만 사용한다.

| 테이블 | 사용 목적 |
| --- | --- |
| `company_workspace` | 최종 업데이트 대상, 회사명/URL/설명/로고 보조 신호 |
| `company_db` | 회사 규모, 설립연도, Crunchbase 기반 성장/인지도/상태 신호 |
| `experience_user` | Harper DB 내 후보자 경력에서 해당 회사가 얼마나 자주 등장하는지 |

`talent_experiences`도 회사 이력 데이터이긴 하지만 현재 84 row뿐이라 v1에서는 제외한다. 나중에 충분히 쌓이면 `experience_user`와 같은 방식으로 합산할 수 있다.

## 확인한 DB 현황

실제 DB는 `worker.env`의 Postgres/Supabase 연결로 조회했다. 연결 정보는 문서에 남기지 않는다.

2026-05-05 기준:

| 항목 | 수 |
| --- | ---: |
| `company_workspace` 전체 | 15,328 |
| `company_db_id` 있음 | 10,768 |
| `company_db_id` 없음 | 4,560 |
| workspace homepage 있음 | 10,078 |
| workspace LinkedIn 있음 | 10,766 |
| workspace description 있음 | 10,570 |
| workspace logo 있음 | 12,282 |
| 현재 `test_score = 0` | 15,328 |

`company_db_id`가 있는 10,768개 workspace에서 쓸 수 있는 `company_db` 신호:

| 신호 | 수 |
| --- | ---: |
| `company_db.name` 있음 | 10,768 |
| website 있음 | 8,878 |
| LinkedIn 있음 | 10,763 |
| description 있음 | 9,195 |
| short description 있음 | 3,806 |
| founded year 있음 | 9,515 |
| employee count range 있음, 빈 `{}` 제외 | 9,383 |
| investors 있음 | 2,345 |
| Crunchbase information 있음 | 3,788 |
| Crunchbase updated at 있음 | 3,788 |

`company_db.employee_count_range` 분포 상위 값:

| employee range | 회사 수 |
| --- | ---: |
| 11-50 | 3,347 |
| 2-10 | 1,596 |
| 51-200 | 1,267 |
| 1001-5000 | 488 |
| 1-10 | 480 |
| 201-500 | 475 |
| 501-1000 | 334 |
| 10001+ | 338 |
| 5001-10000 | 143 |

Crunchbase JSON에서 많이 있는 key:

| section | key | 수 |
| --- | --- | ---: |
| `company` | `ipo_status` | 3,715 |
| `company` | `operating_status` | 3,715 |
| `company` | `company_type` | 3,514 |
| `metrics` | `rank_org_company` | 3,530 |
| `metrics` | `semrush_visits_latest_month` | 2,968 |
| `scores` | `heat_score` | 3,714 |
| `scores` | `growth_prediction_probability` | 3,238 |
| `scores` | `growth_score` | 3,112 |
| `scores` | `ipo_prediction_probability` | 2,042 |
| `taxonomy` | `categories` | 3,626 |
| `taxonomy` | `founders` | 1,255 |

`experience_user` 현황:

| 항목 | 수 |
| --- | ---: |
| 전체 experience row | 1,138,758 |
| `company_id`가 있는 row | 1,138,758 |
| distinct company id | 300,191 |
| `company_workspace.company_db_id`와 매칭되는 workspace | 10,190 |
| 매칭된 experience row 총합 | 475,125 |
| 회사별 experience row p50, 0 제외 | 6 |
| 회사별 experience row p90, 0 제외 | 65 |
| 회사별 experience row p99, 0 제외 | 약 652 |
| 최대 experience row | 24,253 |

이 데이터는 회사 선호도를 직접 측정하지는 않는다. 하지만 많은 후보자 이력에 등장하는 회사는 인재 시장에서 알려져 있거나 경력 가치가 있는 회사일 가능성이 높다. 그래서 v1에서는 이 신호를 가장 큰 component로 둔다.

## 점수 신호

최종 점수는 먼저 0-1 사이 component를 만들고, weighted sum으로 `raw_score`를 계산한 뒤, linked company 안에서 1-20점 bucket으로 변환한다.

### 1. Talent brand, 35%

사용 데이터:

- `experience_user.company_id`
- `company_workspace.company_db_id`

계산:

```text
candidate_count = count(distinct experience_user.candid_id)
  where experience_user.company_id::integer = company_workspace.company_db_id

talent_brand =
  min(1, ln(1 + candidate_count) / ln(1 + p99_candidate_count))
```

`p99_candidate_count`는 `company_db_id`가 있는 회사 중 `candidate_count > 0`인 회사들의 p99 값을 쓴다.

해석:

- 많은 후보자의 경력에 등장하는 회사일수록 높은 점수를 준다.
- 단순 row 수 대신 distinct candidate 수를 쓰면 한 후보자의 중복 경력 row에 덜 흔들린다.
- log normalize를 써서 초대형 회사가 점수를 전부 가져가지 않게 한다.

### 2. Company scale and stability, 20%

사용 데이터:

- `company_db.employee_count_range`
- `company_db.founded_year`
- `company_db.crunchbase_information->'company'->>'ipo_status'`

계산:

```text
employee_midpoint =
  if start and end exist: (start + end) / 2
  if only start exists: start
  else: null

employee_score =
  if employee_midpoint is null: 0.35
  else min(1, ln(1 + employee_midpoint) / ln(1 + 10001))

age_score =
  1.0 if founded_year <= current_year - 20
  0.7 if founded_year <= current_year - 10
  0.4 if founded_year is not null
  0.3 otherwise

ipo_score =
  1.0 if ipo_status = 'public'
  0.7 if ipo_status = 'private'
  0.4 if ipo_status is present
  0.5 otherwise

company_scale_stability =
  0.60 * employee_score
  + 0.20 * age_score
  + 0.20 * ipo_score
```

해석:

- 규모와 안정성은 많은 인재가 선호하는 신호다.
- 하지만 작은 스타트업도 좋은 회사일 수 있으므로 전체 weight는 20%로 제한한다.

### 3. Market traction, 20%

사용 데이터:

- `company_db.crunchbase_information->'scores'`
- `company_db.crunchbase_information->'metrics'`

계산:

```text
growth_score =
  numeric(crunchbase_information->'scores'->>'growth_score') / 100

heat_score =
  numeric(crunchbase_information->'scores'->>'heat_score') / 100

growth_probability =
  numeric(crunchbase_information->'scores'->>'growth_prediction_probability')

rank_score =
  1 - percentile_rank(rank_org_company)
  -- rank_org_company은 낮을수록 좋음

traffic_score =
  percentile_rank(ln(1 + semrush_visits_latest_month))

market_traction =
  0.30 * coalesce(growth_score, 0.45)
  + 0.25 * coalesce(heat_score, 0.45)
  + 0.15 * coalesce(growth_probability, 0.40)
  + 0.20 * coalesce(rank_score, 0.40)
  + 0.10 * coalesce(traffic_score, 0.35)
```

해석:

- Crunchbase 기반 성장성, 관심도, 방문량, rank를 회사 인지도/성장성 proxy로 사용한다.
- Crunchbase 정보가 없는 회사는 0점으로 두지 않고 neutral-low fallback을 준다. 정보 없음 자체가 나쁜 회사라는 뜻은 아니기 때문이다.

### 4. External validation, 15%

사용 데이터:

- `company_db.investors`
- `company_db.crunchbase_information->'company'`
- `company_db.crunchbase_information->'scores'`

계산:

```text
investor_score =
  1.0 if investors is not null and trim(investors) != ''
  0.0 otherwise

operating_score =
  1.0 if operating_status = 'active'
  0.2 if operating_status is present
  0.6 otherwise

ipo_prediction_score =
  numeric(crunchbase_information->'scores'->>'ipo_prediction_probability')

external_validation =
  0.35 * investor_score
  + 0.35 * operating_score
  + 0.30 * coalesce(ipo_prediction_score, 0.35)
```

해석:

- 투자자 정보, active 상태, 상장 가능성은 시장 검증 proxy다.
- 투자자가 없는 좋은 회사도 많기 때문에 investors만으로 과도하게 결정하지 않는다.

### 5. Company information quality, 10%

사용 데이터:

- `company_workspace`
- `company_db`

계산:

```text
has_homepage =
  coalesce(company_workspace.homepage_url, company_db.website_url) is present

has_linkedin =
  coalesce(company_workspace.linkedin_url, company_db.linkedin_url) is present

has_description =
  coalesce(company_workspace.company_description, company_db.description, company_db.short_description) is present

has_employee_range =
  company_db.employee_count_range is present and not empty

has_founded_year =
  company_db.founded_year is not null

has_logo =
  coalesce(company_workspace.logo_url, company_db.logo) is present

company_information_quality =
  0.20 * has_homepage
  + 0.20 * has_linkedin
  + 0.20 * has_description
  + 0.15 * has_employee_range
  + 0.15 * has_founded_year
  + 0.10 * has_logo
```

해석:

- 이 component는 회사 자체의 매력이라기보다 계산 신뢰도 보정이다.
- 정보가 정리된 회사가 약간 유리하지만, 전체 weight는 10%로 제한한다.

## 원점수 계산

`company_db_id`가 있는 회사에 대해 아래 원점수를 만든다.

```text
raw_score =
  0.35 * talent_brand
  + 0.20 * company_scale_stability
  + 0.20 * market_traction
  + 0.15 * external_validation
  + 0.10 * company_information_quality
```

폐업/비활성으로 보이는 회사만 penalty를 준다.

```text
raw_score = raw_score * 0.5
  if operating_status is present
  and lower(operating_status) != 'active'
```

## 0-20점 변환

원점수를 그대로 20점으로 scaling하면 분포가 한쪽으로 몰릴 수 있다. 최종 `test_score`는 `company_db_id`가 있는 회사들 안에서 rank 기반으로 만든다.

권장 방식:

```text
if company_db_id is null:
  test_score = 0
else:
  test_score = ntile(20) over (order by raw_score, company_workspace_id)
```

`ntile(20)`은 낮은 raw score부터 1, 높은 raw score까지 20을 준다.

이 방식의 결과:

- `company_db_id`가 없는 4,560개는 0점이다.
- `company_db_id`가 있는 10,768개는 1-20점에 거의 균등하게 나뉜다.
- 20점은 linked company 중 상위 약 5%, 전체 workspace 기준 약 3.5%만 받는다.
- 20점 쏠림이 생기지 않는다.

동점이 있을 수 있으므로 `order by raw_score, company_workspace_id`처럼 deterministic tie-breaker를 둔다.

20점을 더 희소하게 만들고 싶으면 custom percentile bucket을 쓸 수 있다.

```text
pct = percent_rank() over (order by raw_score)

test_score =
  20 if pct >= 0.98
  19 if pct >= 0.95
  18 if pct >= 0.90
  17 if pct >= 0.85
  ...
```

하지만 테스트용으로는 `ntile(20)`이 가장 단순하고 예측 가능하다.

## 파이썬 스크립트 구현 흐름

나중에 하나의 Python 파일로 구현할 때는 다음 순서가 좋다.

1. `worker.env` 또는 환경변수에서 `DATABASE_URL`을 읽는다.
2. DB 연결 후 `statement_timeout`, `lock_timeout`, `application_name`을 설정한다.
3. CTE로 회사별 component와 `raw_score`를 계산한다.
4. `company_db_id is not null`인 workspace만 `ntile(20)`로 score bucket을 만든다.
5. dry-run이면 업데이트하지 않고 분포와 샘플만 출력한다.
6. apply 모드이면 같은 transaction 안에서 `company_workspace.test_score`를 업데이트한다.
7. update 후 분포를 출력한다.

스크립트는 idempotent해야 한다. 같은 데이터에서는 다시 실행해도 같은 점수가 나와야 한다.

## SQL CTE 구조 예시

아래는 구현할 SQL의 형태다. 실제 Python에서는 이 CTE를 하나의 SQL 문자열로 실행하고, dry-run/update 모드만 분기하면 된다.

```sql
with workspace_base as (
  select
    cw.company_workspace_id,
    cw.company_db_id,
    cw.company_name,
    coalesce(nullif(trim(cw.homepage_url), ''), nullif(trim(cd.website_url), '')) as homepage_url,
    coalesce(nullif(trim(cw.linkedin_url), ''), nullif(trim(cd.linkedin_url), '')) as linkedin_url,
    coalesce(
      nullif(trim(cw.company_description), ''),
      nullif(trim(cd.description), ''),
      nullif(trim(cd.short_description), '')
    ) as description,
    coalesce(nullif(trim(cw.logo_url), ''), nullif(trim(cd.logo), '')) as logo_url,
    cd.employee_count_range,
    cd.founded_year,
    cd.investors,
    cd.crunchbase_information
  from public.company_workspace cw
  left join public.company_db cd on cd.id = cw.company_db_id
),
experience_signal as (
  select
    cw.company_workspace_id,
    count(distinct eu.candid_id) as candidate_count
  from public.company_workspace cw
  left join public.experience_user eu
    on eu.company_id::integer = cw.company_db_id
  where cw.company_db_id is not null
  group by cw.company_workspace_id
),
numeric_inputs as (
  select
    wb.*,
    coalesce(es.candidate_count, 0) as candidate_count,
    case
      when jsonb_typeof(wb.employee_count_range) = 'object'
        and (wb.employee_count_range ? 'start')
        and (wb.employee_count_range ? 'end')
        and nullif(wb.employee_count_range->>'end', '') is not null
      then ((wb.employee_count_range->>'start')::numeric + (wb.employee_count_range->>'end')::numeric) / 2
      when jsonb_typeof(wb.employee_count_range) = 'object'
        and (wb.employee_count_range ? 'start')
      then (wb.employee_count_range->>'start')::numeric
      else null
    end as employee_midpoint,
    nullif(wb.crunchbase_information->'company'->>'ipo_status', '') as ipo_status,
    nullif(wb.crunchbase_information->'company'->>'operating_status', '') as operating_status,
    nullif(wb.crunchbase_information->'scores'->>'growth_score', '')::numeric / 100.0 as growth_score,
    nullif(wb.crunchbase_information->'scores'->>'heat_score', '')::numeric / 100.0 as heat_score,
    nullif(wb.crunchbase_information->'scores'->>'growth_prediction_probability', '')::numeric as growth_probability,
    nullif(wb.crunchbase_information->'scores'->>'ipo_prediction_probability', '')::numeric as ipo_prediction_probability,
    nullif(wb.crunchbase_information->'metrics'->>'rank_org_company', '')::numeric as rank_org_company,
    nullif(wb.crunchbase_information->'metrics'->>'semrush_visits_latest_month', '')::numeric as semrush_visits
  from workspace_base wb
  left join experience_signal es on es.company_workspace_id = wb.company_workspace_id
),
stats as (
  select
    percentile_cont(0.99) within group (order by candidate_count) filter (where candidate_count > 0) as p99_candidate_count
  from numeric_inputs
  where company_db_id is not null
),
ranked_inputs as (
  select
    ni.*,
    percent_rank() over (order by rank_org_company desc nulls first) as rank_score,
    percent_rank() over (order by ln(1 + semrush_visits) nulls first) as traffic_score
  from numeric_inputs ni
),
components as (
  select
    ri.company_workspace_id,
    ri.company_db_id,
    case
      when ri.company_db_id is null then 0
      when coalesce(s.p99_candidate_count, 0) <= 0 then 0
      else least(1, ln(1 + ri.candidate_count) / ln(1 + s.p99_candidate_count))
    end as talent_brand,
    (
      0.60 * coalesce(least(1, ln(1 + ri.employee_midpoint) / ln(1 + 10001)), 0.35)
      + 0.20 * case
          when ri.founded_year is null then 0.3
          when ri.founded_year <= extract(year from now())::int - 20 then 1.0
          when ri.founded_year <= extract(year from now())::int - 10 then 0.7
          else 0.4
        end
      + 0.20 * case
          when lower(ri.ipo_status) = 'public' then 1.0
          when lower(ri.ipo_status) = 'private' then 0.7
          when ri.ipo_status is not null then 0.4
          else 0.5
        end
    ) as company_scale_stability,
    (
      0.30 * coalesce(ri.growth_score, 0.45)
      + 0.25 * coalesce(ri.heat_score, 0.45)
      + 0.15 * coalesce(ri.growth_probability, 0.40)
      + 0.20 * coalesce(ri.rank_score, 0.40)
      + 0.10 * coalesce(ri.traffic_score, 0.35)
    ) as market_traction,
    (
      0.35 * case when nullif(trim(coalesce(ri.investors, '')), '') is not null then 1.0 else 0.0 end
      + 0.35 * case
          when lower(ri.operating_status) = 'active' then 1.0
          when ri.operating_status is not null then 0.2
          else 0.6
        end
      + 0.30 * coalesce(ri.ipo_prediction_probability, 0.35)
    ) as external_validation,
    (
      0.20 * case when ri.homepage_url is not null then 1.0 else 0.0 end
      + 0.20 * case when ri.linkedin_url is not null then 1.0 else 0.0 end
      + 0.20 * case when ri.description is not null then 1.0 else 0.0 end
      + 0.15 * case when ri.employee_count_range is not null and ri.employee_count_range <> '{}'::jsonb then 1.0 else 0.0 end
      + 0.15 * case when ri.founded_year is not null then 1.0 else 0.0 end
      + 0.10 * case when ri.logo_url is not null then 1.0 else 0.0 end
    ) as company_information_quality,
    ri.operating_status
  from ranked_inputs ri
  cross join stats s
),
raw_scored as (
  select
    company_workspace_id,
    company_db_id,
    case
      when company_db_id is null then 0
      else (
        0.35 * talent_brand
        + 0.20 * company_scale_stability
        + 0.20 * market_traction
        + 0.15 * external_validation
        + 0.10 * company_information_quality
      ) * case
        when operating_status is not null and lower(operating_status) <> 'active' then 0.5
        else 1.0
      end
    end as raw_score
  from components
),
ranked as (
  select
    company_workspace_id,
    ntile(20) over (order by raw_score, company_workspace_id) as test_score
  from raw_scored
  where company_db_id is not null
),
scored as (
  select company_workspace_id, test_score from ranked
  union all
  select company_workspace_id, 0 as test_score
  from raw_scored
  where company_db_id is null
)
select *
from scored;
```

## 업데이트 쿼리

실제 적용은 위 CTE의 마지막 `select * from scored`를 `update`로 바꾸면 된다.

```sql
update public.company_workspace cw
set test_score = scored.test_score,
    updated_at = now()
from scored
where cw.company_workspace_id = scored.company_workspace_id;
```

## 운영상 확인 쿼리

업데이트 전후에 최소한 아래는 확인한다.

```sql
select test_score, count(*)
from public.company_workspace
group by test_score
order by test_score;
```

```sql
select
  count(*) as total,
  count(*) filter (where company_db_id is null and test_score = 0) as missing_db_zero,
  count(*) filter (where company_db_id is null and test_score <> 0) as missing_db_nonzero,
  count(*) filter (where company_db_id is not null and test_score between 1 and 20) as linked_valid,
  count(*) filter (where company_db_id is not null and test_score = 0) as linked_zero
from public.company_workspace;
```

상위/하위 샘플도 눈으로 봐야 한다.

```sql
select company_name, test_score
from public.company_workspace
order by test_score desc, company_name
limit 50;
```

```sql
select company_name, test_score
from public.company_workspace
where company_db_id is not null
order by test_score asc, company_name
limit 50;
```

## 향후 개선

v1이 들어간 뒤 실제 결과를 보면 다음 개선을 고려한다.

1. `raw_score`와 component별 점수를 별도 table 또는 CSV로 남겨 디버깅 가능하게 한다.
2. `test_score`만 저장하지 말고 `company_workspace_score_snapshot` 같은 테이블을 만들어 `raw_score`, `component_scores`, `computed_at`, `version`을 저장한다.
3. `talent_experiences`가 충분히 쌓이면 `experience_user`와 함께 brand signal에 반영한다.
4. 후보자 자체의 품질 신호를 `talent_brand`에 추가할 수 있다. 예를 들어 좋은 학교/좋은 회사 출신 후보자의 경력에 반복 등장하는 회사는 더 높은 brand signal을 줄 수 있다.
5. 나중에 추천 기능이 충분히 사용된 뒤에는 별도 버전에서 유저 피드백 기반 score를 만들 수 있다. 단, 이번 `test_score` v1에는 포함하지 않는다.

