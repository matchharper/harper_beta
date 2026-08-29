# Wonderful Korea FDE·Field CTO 추천 benchmark 실행 매뉴얼

문서 상태: benchmark 실행 계약 1.2

기준일: 2026-07-17

연결 문서: `../scripts/internal-company-role-talent-matching-manual-ko.md`

1.2 변경 요약:

- 회사명·ID뿐 아니라 source role을 직접 드러내는 표현까지 candidate context에서 가리고 redaction pattern hash를 고정
- lane별 unique contribution과 deterministic backfill을 요구해 lane overlap으로 pool이 조용히 축소되는 문제를 방지
- acceptance 관측 가능성, score 포화, archetype coverage, 다중 role margin을 blind artifact에 추가
- ground truth를 후보자 수락·연결대기와 회사가 실제 후속 단계로 진행한 신호로 계층화
- exact role-pair, person-level overlap, cross-role placement, label-tier별 funnel recall을 별도 보고
- benchmark integrity status와 성능 signal을 서로 다른 필드로 분리
- current-data retrospective에서 outcome 이후 profile 업데이트가 섞일 수 있는 한계를 더 강하게 표시
- production에서는 유용한 `candidate_requested_connection`도 source role에서는 정답 누출이므로 freeze 전 embargo하도록 명시

1.1 변경 요약:

- 기본 매칭 매뉴얼 1.1의 core score·retrieval 100점 cap과 정합성 확보
- 일반 matching과 benchmark의 의도적 override를 표로 고정
- recommendation 생성 전 실패한 orphan discovery run까지 초기화·0건 검증 범위에 포함
- ground truth eligibility 규칙을 unblind 전에 고정하고 positive 0명일 때 `INCONCLUSIVE` 처리
- contaminated clone은 candidate-linked DB row 0건을 확인하기 전 재사용 금지

## 1. 문서의 목적과 현재 상태

이 문서는 Wonderful의 한국 `Forward Deployed Engineer (FDE)`와 `Field CTO` role을 이용해 internal role 추천 품질을 반복 측정하는 방법을 정의한다.

이 문서를 작성하는 행위 자체는 테스트 실행이 아니다. 문서 작성·검토 단계에서는 다음을 하지 않는다.

- Harper workspace에 benchmark role 생성
- `talent_users` 후보 조회 또는 scoring
- Wonderful 원본 role의 recommendation·stage·progress 조회
- 후보자 Top 10 선발
- fit 저장, recommendation 생성, 메시지·이메일 발송

실제 테스트는 사용자가 별도로 아래 실행 명령을 명시했을 때만 시작한다.

```text
이 benchmark 문서대로 실제 테스트를 실행해.
max_selected=10
run_id=<unique run id>
```

`실제 테스트를 실행해`라는 명시적 표현이 없으면 문서 검토 요청으로 간주하고 DB를 변경하지 않는다.

## 2. 검증하려는 가설

주 가설은 다음과 같다.

> Wonderful의 실제 회사 검토에서 `연결 대기` 이상으로 진행한 후보는 현재 매칭 매뉴얼로도 상위 최대 10명 안에 포함될 가능성이 높다.

여기서 성공은 단순히 과거 진행자를 외우거나 stage 데이터를 다시 읽어 찾는 것이 아니다. role·company 정보와 후보자에게 원래 존재하는 profile·경력·대화·활동 evidence만으로 해당 후보를 독립적으로 다시 발견해야 한다.

이 테스트는 다음 세 질문에 답해야 한다.

1. **Retrieval**: 실제 positive 후보가 약 200명 후보군 안에 들어왔는가?
2. **Reranking**: 들어왔다면 독립 평가와 Top 50 비교를 통과했는가?
3. **Final selection**: 최종 최대 10명 안에 같은 role의 positive로 선택됐는가?

최종 10명에 positive가 있으면 좋은 신호지만 그것만으로 시스템 전체 성능이 입증되지는 않는다. 반대로 positive가 없다고 바로 나쁜 시스템이라고 결론 내리지 않는다. miss가 발생한 단계와 이유를 분해해야 한다.

### 2.1 기본 매뉴얼에서 override하는 규칙

| 항목 | 기본 매뉴얼 1.2 | 이 benchmark 1.2 |
| --- | --- | --- |
| 과거 회사 feedback | consideration의 핵심 source | Wonderful outcome은 freeze 전 금지 |
| active role 요구 | active/top_priority만 최종 선택 | paused clone의 read-only 평가 허용 |
| 같은 role 추천 이력 | 후보 pool에서 제외 | Wonderful source 추천 이력은 조회·제외 금지 |
| execution mode | dry_run/commit_fit/send | dry_run만 허용 |
| fit·recommendation write | mode에 따라 가능 | 항상 0건 |
| M | 단일 role 상한 | 두 role 합계 고유 후보 최대 10명 |
| company context | role workspace 회사 | clone은 Harper지만 평가는 Wonderful |

이 표에 없는 scoring·evidence·privacy 규칙은 기본 매뉴얼 1.2를 그대로 따른다.

## 3. benchmark 단위와 최대 10명의 의미

### 3.1 평가 단위

기본 평가 단위는 사람만이 아니라 `(source_role_id, talent_id)` pair다. 같은 사람이 FDE와 Field CTO 모두에 적합하더라도 각 role 적합성은 별도로 평가한다.

### 3.2 최종 인원 상한

- 두 role을 합쳐 최대 10명의 **고유 후보자**만 최종 선택한다.
- 10명은 quota가 아니라 상한이다.
- role별 5명씩 강제로 배분하지 않는다.
- 한 후보가 두 role 모두에 맞으면 두 pair를 모두 보존한다. 4점 이상 차이와 role-specific evidence가 있을 때만 mutual score가 높은 role을 `primaryRole`로 지정한다. 차이가 0~3점이면 기본 매뉴얼 12.6의 role ambiguity 검토를 수행한다.
- ground truth 비교는 primary role pair를 주 지표로 사용하고 secondary role hit는 별도로 보고한다.
- 기준을 통과한 후보가 10명 미만이면 그 수만 선택한다.

role별 강제 quota가 없는 이유는 실제 운영의 제한된 연결 기회를 재현하기 위해서다. 단, 한 role이 10명을 독점해 다른 role 평가가 보이지 않으면 role별 Top 10과 global Top 10을 모두 보고해 진단 가능성을 유지한다.

## 4. 절대 금지 사항

### 4.1 원본 Wonderful outcome 사전 조회 금지

최종 예측을 고정하기 전에는 원본 Wonderful workspace와 두 source role의 다음 데이터를 읽지 않는다.

- `talent_opportunity_recommendation`
- `talent_opportunity_fit`
- `talent_opportunity_tag`
- `talent_progress`
- `talent_opportunity_delivery`
- `opportunity_discovery_run`의 Wonderful 관련 payload
- 회사 수락·거절·중단 이유와 운영 메모
- 원본 role의 outcome에서 파생된 `considerations`

source role ID와 description·request를 읽는 것은 허용된다. candidate ID가 결합된 outcome row를 읽는 것은 금지된다.

### 4.2 연결 제안·fit write 금지

benchmark는 항상 `dry_run`이다.

- `talent_opportunity_fit`에 쓰지 않는다.
- `talent_opportunity_recommendation`을 만들지 않는다.
- manual recommendation API를 호출하지 않는다.
- discovery run을 만들지 않는다.
- 채팅·이메일·추천 탭에 노출하지 않는다.

Harper에 clone을 두는 목적은 production Wonderful role을 건드리지 않는 데이터 격리다. 후보자에게 Harper 또는 Wonderful 제안을 보내기 위한 것이 아니다.

일반 매칭 매뉴얼은 paused role의 발송을 막는다. 이 benchmark에서는 read-only 평가를 위해 paused clone을 분석하는 것만 예외적으로 허용한다. 이 예외는 `commit_fit`이나 `send` 권한을 주지 않는다.

### 4.3 보호 특성 사용 금지

원본 request에 국적, 민족적 배경, 특정 국가의 학교·회사 이력을 배제하는 표현이 있더라도 hard filter나 ranking에 사용하지 않는다.

다음처럼 role 관련 기준으로만 바꾼다.

| 사용 금지 | benchmark에서 사용할 기준 |
| --- | --- |
| 한국인 또는 한국계만 | 한국어 업무 수행, 한국 엔터프라이즈 시장 경험, 한국 근무 가능성 |
| 특정 국가 출신·학교·회사 배제 | 사용하지 않음 |
| young | hands-on 범위, zero-to-one ownership, role seniority 적합성 |
| 학번·졸업연도로 나이 추정 | 사용하지 않음 |

총 관련 경력은 실제 role scope와 seniority를 판단하는 데 사용할 수 있지만 나이 추정의 대리변수로 사용하지 않는다.

### 4.4 benchmark identity 학습 금지

unblind 후 알게 된 positive candidate의 이름, talent ID, 회사, 학교, 고유한 문구를 production retrieval rule에 직접 넣지 않는다. 그런 변경은 성능 개선이 아니라 정답 암기다.

## 5. 실행 역할 분리

가능하면 다음 역할을 서로 다른 Codex task, 프로세스 또는 권한으로 분리한다.

| 역할 | 할 수 있는 일 | 볼 수 없는 것 |
| --- | --- | --- |
| setup operator | source role 복제, Harper clone 초기화, role 원문 snapshot | source role의 candidate outcome |
| matcher | consideration, retrieval, 200명 독립 평가, Top 50, Top 10 고정 | Wonderful outcome과 positive ID |
| benchmark evaluator | 고정된 prediction hash 확인 후 ground truth 조회·대조 | 예측 수정 권한 |
| reviewer | miss 원인과 문서 개선안 검토 | 예측 원본 수정 권한 |

같은 agent가 모든 단계를 수행해야 한다면 다음을 강제한다.

1. 선발 전 outcome query를 실행하지 않는다.
2. `predictions.json`과 SHA-256 hash를 먼저 만든다.
3. hash와 생성 시각을 실행 로그에 기록한다.
4. 그 뒤 별도 단계에서만 unblind query를 실행한다.
5. unblind 후에는 기존 prediction 파일을 수정하지 않는다.

이미 previous run의 positive ID를 대화 context에서 본 agent는 새 blind benchmark의 matcher가 될 수 없다. 이 경우 새 task를 사용하거나 해당 실행을 `regression_test`로 표시한다.

## 6. source와 clone 식별 계약

### 6.1 source workspace

실행 시 이름만 믿지 말고 다음 조건을 모두 확인한다.

```sql
SELECT company_workspace_id, company_name, is_internal, company_db_id
FROM public.company_workspace
WHERE lower(company_name) = 'wonderful'
  AND is_internal = true;
```

정확히 한 row가 아니면 중단한다.

2026-07-17 참고값:

```text
Wonderful workspace_id = f2e80aee-fee3-40f5-807f-5f8694c37eee
```

참고값은 검증용이며, 향후 workspace가 바뀌었으면 현재 DB를 기준으로 다시 식별한다.

### 6.2 source roles

한국 source role은 다음 의미 조건으로 찾는다.

```sql
SELECT role_id, name, location_text, status, source_type, is_expired
FROM public.company_roles
WHERE company_workspace_id = :wonderful_workspace_id::uuid
  AND source_type = 'internal'
  AND status IN ('active', 'top_priority')
  AND is_expired = false
  AND (
    (name = 'Forward Deployed Engineer (FDE)'
      AND location_text ILIKE '%Korea%')
    OR
    (name = 'Field CTO'
      AND location_text ILIKE '%Korea%')
  );
```

각 role이 정확히 한 row여야 한다.

source role이 paused·ended·expired면 current benchmark를 실행하지 않는다. historical benchmark로 바꾸려면 별도 run mode와 cutoff를 정의한다.

2026-07-17 참고값:

```text
Wonderful Korea FDE = e1657263-3369-48c9-8e1b-812834e79037
Wonderful Korea Field CTO = e55649cd-8293-47e8-802f-b697ebe7f4f1
```

Singapore, Japan, Australia role을 혼합하지 않는다.

### 6.3 target Harper workspace

```sql
SELECT company_workspace_id, company_name, is_internal, company_db_id
FROM public.company_workspace
WHERE lower(company_name) = 'harper'
  AND is_internal = true;
```

정확히 한 row가 아니면 중단한다.

2026-07-17 참고값:

```text
Harper workspace_id = 720254d7-aeb7-4709-a56f-7b822f89eac5
```

## 7. Harper benchmark role 계약

두 clone은 일반 Harper role과 구분되도록 다음 값을 사용한다.

| source role | clone name | `source_provider` | `source_job_id` |
| --- | --- | --- | --- |
| Korea FDE | `[BENCHMARK][Wonderful KR] Forward Deployed Engineer (FDE)` | `internal_benchmark` | `benchmark:wonderful:kr:fde:v1` |
| Korea Field CTO | `[BENCHMARK][Wonderful KR] Field CTO` | `internal_benchmark` | `benchmark:wonderful:kr:field-cto:v1` |

필수 안전 설정:

- `company_workspace_id`: Harper
- `source_type='internal'`
- `status='paused'`
- `is_expired=false`
- `priority=NULL`
- `information.benchmark.doNotSend=true`
- `information.benchmark.sourceRoleId=<Wonderful role id>`
- `information.benchmark.sourceWorkspaceId=<Wonderful workspace id>`
- `information.benchmark.protocolVersion='1.2'`

copy 대상:

- `external_jd_url`
- `description`
- `information`의 source 정보. 단 benchmark metadata를 병합
- `type`
- `posted_at`
- `location_text`
- `work_mode`
- `salary_range`와 구조화 salary 필드
- `seniority_level`
- `description_summary`
- `company_internal_roles.request`

copy하지 않거나 초기화할 값:

- `role_id`: 새 UUID
- `company_workspace_id`: Harper ID
- `status`: `paused`
- `priority`: `NULL`
- `expires_at`: `NULL`
- `summary`: `{}`
- `company_internal_roles.considerations`: `{}`
- custom stage, fit, recommendation, tag, progress, run, delivery

원본 `considerations`는 복사하지 않는다. Wonderful outcome에서 파생됐을 가능성이 있어 label leakage가 될 수 있기 때문이다.

`source_job_id`의 `:v1` suffix는 stable clone identity version이다. 문서·평가 protocol version `1.2`와 별개이며, clone schema를 의도적으로 교체할 때만 `:v2`로 올린다.

## 8. Phase A: clone 생성 또는 원문 동기화

### 8.1 실행 원칙

- `source_provider`와 deterministic `source_job_id`로 기존 clone을 찾는다.
- 없으면 생성하고, 있으면 source 원문으로 update한다.
- 같은 `source_job_id`가 두 개 이상이면 중단한다.
- update 후 description·canonical internal request·type·location의 content hash가 source와 같은지 확인한다.
- clone은 항상 `paused`로 되돌린다.

### 8.2 clone SQL 골격

아래 SQL은 transaction 안에서 실행한다. 실제 실행 전 UUID와 row count를 다시 확인한다.

```sql
BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('wonderful-kr-fde-field-cto-benchmark:v1', 0)
);

CREATE TEMP TABLE benchmark_sources (
  source_role_id uuid PRIMARY KEY,
  benchmark_job_id text NOT NULL,
  benchmark_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO benchmark_sources VALUES
  (:fde_source_role_id::uuid,
   'benchmark:wonderful:kr:fde:v1',
   '[BENCHMARK][Wonderful KR] Forward Deployed Engineer (FDE)'),
  (:field_cto_source_role_id::uuid,
   'benchmark:wonderful:kr:field-cto:v1',
   '[BENCHMARK][Wonderful KR] Field CTO');

CREATE TEMP TABLE validated_source_roles AS
SELECT source.role_id
FROM benchmark_sources bs
JOIN public.company_roles source ON source.role_id = bs.source_role_id
WHERE source.company_workspace_id = :wonderful_workspace_id::uuid
  AND source.source_type = 'internal'
  AND source.status IN ('active', 'top_priority')
  AND source.is_expired = false;

CREATE TEMP TABLE duplicate_benchmark_job_ids AS
SELECT target.source_job_id
FROM public.company_roles target
WHERE target.company_workspace_id = :harper_workspace_id::uuid
  AND target.source_provider = 'internal_benchmark'
  AND target.source_job_id IN (
    'benchmark:wonderful:kr:fde:v1',
    'benchmark:wonderful:kr:field-cto:v1'
  )
GROUP BY target.source_job_id
HAVING count(*) > 1;

DO $$
BEGIN
  IF (SELECT count(*) FROM validated_source_roles) <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two valid Wonderful source roles';
  END IF;

  IF EXISTS (SELECT 1 FROM duplicate_benchmark_job_ids) THEN
    RAISE EXCEPTION 'Duplicate benchmark source_job_id';
  END IF;
END $$;

INSERT INTO public.company_roles (
  company_workspace_id, name, external_jd_url, description, information,
  type, status, priority, source_type, source_provider, source_job_id,
  posted_at, expires_at, location_text, work_mode, salary_range,
  seniority_level, description_summary, is_expired,
  salary_min, salary_max, salary_currency, salary_period, summary
)
SELECT
  :harper_workspace_id::uuid,
  bs.benchmark_name,
  source.external_jd_url,
  source.description,
  coalesce(source.information, '{}'::jsonb) || jsonb_build_object(
    'benchmark', jsonb_build_object(
      'sourceCompany', 'Wonderful',
      'sourceRoleId', source.role_id,
      'sourceWorkspaceId', source.company_workspace_id,
      'protocolVersion', '1.2',
      'doNotSend', true,
      'copiedAt', timezone('utc', now())
    )
  ),
  source.type,
  'paused',
  NULL,
  'internal',
  'internal_benchmark',
  bs.benchmark_job_id,
  source.posted_at,
  NULL,
  source.location_text,
  source.work_mode,
  source.salary_range,
  source.seniority_level,
  source.description_summary,
  false,
  source.salary_min,
  source.salary_max,
  source.salary_currency,
  source.salary_period,
  '{}'::jsonb
FROM benchmark_sources bs
JOIN public.company_roles source ON source.role_id = bs.source_role_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.company_roles existing
  WHERE existing.company_workspace_id = :harper_workspace_id::uuid
    AND existing.source_provider = 'internal_benchmark'
    AND existing.source_job_id = bs.benchmark_job_id
);

UPDATE public.company_roles target
SET
  name = bs.benchmark_name,
  external_jd_url = source.external_jd_url,
  description = source.description,
  information = coalesce(source.information, '{}'::jsonb)
    || jsonb_build_object(
      'benchmark', jsonb_build_object(
        'sourceCompany', 'Wonderful',
        'sourceRoleId', source.role_id,
        'sourceWorkspaceId', source.company_workspace_id,
        'protocolVersion', '1.2',
        'doNotSend', true,
        'copiedAt', timezone('utc', now())
      )
    ),
  type = source.type,
  status = 'paused',
  priority = NULL,
  source_type = 'internal',
  posted_at = source.posted_at,
  expires_at = NULL,
  location_text = source.location_text,
  work_mode = source.work_mode,
  salary_range = source.salary_range,
  seniority_level = source.seniority_level,
  description_summary = source.description_summary,
  is_expired = false,
  salary_min = source.salary_min,
  salary_max = source.salary_max,
  salary_currency = source.salary_currency,
  salary_period = source.salary_period,
  summary = '{}'::jsonb,
  updated_at = timezone('utc', now())
FROM benchmark_sources bs
JOIN public.company_roles source ON source.role_id = bs.source_role_id
WHERE target.company_workspace_id = :harper_workspace_id::uuid
  AND target.source_provider = 'internal_benchmark'
  AND target.source_job_id = bs.benchmark_job_id;

INSERT INTO public.company_internal_roles (
  role_id, request, considerations, updated_at
)
SELECT
  target.role_id,
  source_internal.request,
  '{}'::jsonb,
  timezone('utc', now())
FROM benchmark_sources bs
JOIN public.company_roles source ON source.role_id = bs.source_role_id
LEFT JOIN public.company_internal_roles source_internal
  ON source_internal.role_id = source.role_id
JOIN public.company_roles target
  ON target.company_workspace_id = :harper_workspace_id::uuid
 AND target.source_provider = 'internal_benchmark'
 AND target.source_job_id = bs.benchmark_job_id
ON CONFLICT (role_id) DO UPDATE SET
  request = EXCLUDED.request,
  considerations = '{}'::jsonb,
  updated_at = EXCLUDED.updated_at;

COMMIT;
```

`UPDATE` 구현은 insert와 같은 source field 목록을 사용해야 한다. 일부 필드만 갱신해 stale canonical request·location이 남지 않도록 한다.

## 9. Phase B: 테스트 시작 전 후보 연결 데이터 완전 초기화

### 9.1 필수 전제

**매 실행을 시작하기 전에 Harper에 만든 두 benchmark role에 연결된 후보자 데이터를 전부 삭제하고 0건임을 검증해야 한다.**

이 초기화는 선택 사항이 아니다. 이전 run의 fit·추천·stage가 남으면 retrieval exclusion, scoring, outcome leakage에 영향을 주어 테스트가 무효가 된다.

삭제 범위는 Harper benchmark role로만 제한한다. Wonderful source role의 row는 어떤 경우에도 삭제하거나 update하지 않는다.

### 9.2 삭제 대상

정상적인 benchmark는 dry-run이므로 아래 row가 원래 없어야 한다. 방어적으로 다음을 확인하고 삭제한다.

- `talent_opportunity_fit`
- `talent_opportunity_recommendation`
- `talent_opportunity_tag`
- `talent_progress`
- benchmark recommendation에서 만들어진 `opportunity_discovery_run`
- 위 run에 연결된 `talent_opportunity_delivery`
- 위 run·recommendation에 연결된 `talent_opportunity_chat_preview`
- 위 run에 연결된 scheduler check
- 이전 run에서 생성한 `company_internal_roles.considerations`

원본 role description·request와 clone 자체는 삭제하지 않는다. clone을 유지해 반복 실행하되 source와 다시 동기화한다.

### 9.3 외부 발송 흔적이 있으면 일반 초기화로 처리하지 않는다

다음 중 하나라도 있으면 이전 benchmark가 안전 계약을 위반한 것이다.

- `talent_opportunity_delivery`의 `sent` row
- benchmark recommendation과 연결된 candidate chat preview
- manual recommendation API가 만든 discovery run
- 후보자가 이미 본 추천·이메일·채팅

DB row를 지워도 발송된 이메일이나 후보자가 본 메시지를 회수할 수 없다. 이 경우:

1. 현재 benchmark version을 `contaminated`로 종료한다.
2. 어떤 후보자에게 무엇이 노출됐는지 incident log를 남긴다.
3. 기존 role을 `paused`로 유지하고 routine cleanup을 중단한다.
4. 승인된 incident cleanup에서 role-linked row, run, preview, 필요 시 생성된 assistant message의 보존·삭제 범위를 별도로 검토한다.
5. 기존 clone을 재사용하려면 candidate-linked DB row가 모두 0임을 다시 증명한다.
6. 외부 노출로 benchmark 자체가 오염됐으면 `source_job_id` clone version을 올린 새 clone을 만든다.
7. 같은 candidate pool로 새 blind benchmark라고 주장하지 않는다.

새 clone을 만든다는 이유로 오염된 이전 clone의 candidate-linked row를 방치하지 않는다. 다만 candidate message 삭제는 conversation summary와 감사 기록에 영향을 줄 수 있으므로 routine SQL에 넣지 않고 승인된 incident 절차로 처리한다.

### 9.4 cleanup scope guard

삭제 전 아래 query가 정확히 2개 role을 반환해야 한다.

```sql
SELECT role_id, name, source_job_id, status,
       information->'benchmark'->>'doNotSend' AS do_not_send
FROM public.company_roles
WHERE company_workspace_id = :harper_workspace_id::uuid
  AND source_provider = 'internal_benchmark'
  AND source_job_id IN (
    'benchmark:wonderful:kr:fde:v1',
    'benchmark:wonderful:kr:field-cto:v1'
  )
ORDER BY source_job_id;
```

검증 조건:

- row count = 2
- 둘 다 `status='paused'`
- 둘 다 `doNotSend=true`
- `information.benchmark.sourceRoleId`가 허용된 Wonderful source role 두 개 중 하나
- workspace가 Harper

하나라도 다르면 delete를 실행하지 않는다.

### 9.5 cleanup SQL 골격

아래 transaction은 role scope가 검증된 후에만 실행한다.

```sql
BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('wonderful-kr-fde-field-cto-benchmark:v1', 0)
);

CREATE TEMP TABLE benchmark_role_ids AS
SELECT role_id
FROM public.company_roles
WHERE company_workspace_id = :harper_workspace_id::uuid
  AND source_provider = 'internal_benchmark'
  AND source_job_id IN (
    'benchmark:wonderful:kr:fde:v1',
    'benchmark:wonderful:kr:field-cto:v1'
  )
  AND status = 'paused'
  AND information->'benchmark'->>'doNotSend' = 'true';

DO $$
BEGIN
  IF (SELECT count(*) FROM benchmark_role_ids) <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two guarded benchmark roles';
  END IF;
END $$;

CREATE TEMP TABLE benchmark_recommendation_ids AS
SELECT id, discovery_run_id
FROM public.talent_opportunity_recommendation
WHERE role_id IN (SELECT role_id FROM benchmark_role_ids);

CREATE TEMP TABLE benchmark_run_ids AS
SELECT DISTINCT discovery_run_id AS run_id
FROM benchmark_recommendation_ids
WHERE discovery_run_id IS NOT NULL

UNION

SELECT run.id AS run_id
FROM public.opportunity_discovery_run run
WHERE run.trigger_payload #>> '{manualInternalRecommendation,roleId}'
      IN (SELECT role_id::text FROM benchmark_role_ids);

-- 이미 후보자에게 노출된 흔적은 자동 삭제 전에 별도 incident로 처리한다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.talent_opportunity_delivery d
    WHERE d.discovery_run_id IN (SELECT run_id FROM benchmark_run_ids)
      AND d.status = 'sent'
  ) THEN
    RAISE EXCEPTION 'Benchmark is contaminated by sent delivery';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.talent_opportunity_chat_preview p
    WHERE p.recommendation_id IN (
      SELECT id FROM benchmark_recommendation_ids
    )
       OR p.discovery_run_id IN (SELECT run_id FROM benchmark_run_ids)
  ) THEN
    RAISE EXCEPTION 'Benchmark is contaminated by candidate chat preview';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.talent_opportunity_recommendation r
    WHERE r.discovery_run_id IN (SELECT run_id FROM benchmark_run_ids)
      AND r.role_id NOT IN (SELECT role_id FROM benchmark_role_ids)
  ) THEN
    RAISE EXCEPTION 'Benchmark run is shared with a non-benchmark role';
  END IF;
END $$;

DELETE FROM public.talent_progress
WHERE role_id IN (SELECT role_id FROM benchmark_role_ids);

DELETE FROM public.talent_opportunity_tag
WHERE opportunity_id IN (SELECT role_id FROM benchmark_role_ids);

DELETE FROM public.talent_opportunity_fit
WHERE opportunity_id IN (SELECT role_id FROM benchmark_role_ids);

DELETE FROM public.opportunity_scheduler_checks
WHERE discovery_run_id IN (SELECT run_id FROM benchmark_run_ids);

DELETE FROM public.talent_opportunity_recommendation
WHERE id IN (SELECT id FROM benchmark_recommendation_ids);

-- delivery와 chat preview는 run FK cascade를 사용한다.
DELETE FROM public.opportunity_discovery_run
WHERE id IN (SELECT run_id FROM benchmark_run_ids);

UPDATE public.company_internal_roles
SET considerations = '{}'::jsonb,
    updated_at = timezone('utc', now())
WHERE role_id IN (SELECT role_id FROM benchmark_role_ids);

COMMIT;
```

schema 또는 FK가 바뀌었으면 위 SQL을 그대로 실행하지 말고 현재 dependency를 다시 확인한다.

### 9.6 0건 검증

cleanup 직후 다음 count를 role별로 확인한다.

```sql
SELECT
  r.role_id,
  r.name,
  (SELECT count(*)
     FROM public.talent_opportunity_fit f
    WHERE f.opportunity_id = r.role_id) AS fit_count,
  (SELECT count(*)
     FROM public.talent_opportunity_recommendation rec
    WHERE rec.role_id = r.role_id) AS recommendation_count,
  (SELECT count(*)
     FROM public.talent_opportunity_tag tag
    WHERE tag.opportunity_id = r.role_id) AS tag_count,
  (SELECT count(*)
     FROM public.talent_progress p
    WHERE p.role_id = r.role_id) AS progress_count
FROM public.company_roles r
WHERE r.role_id IN (SELECT role_id FROM benchmark_role_ids);
```

모든 count가 0이어야 한다. 하나라도 0이 아니면 matching을 시작하지 않는다.

recommendation이 생기기 전에 실패한 orphan run도 별도로 0건인지 확인한다.

```sql
WITH benchmark_roles AS (
  SELECT role_id
  FROM public.company_roles
  WHERE company_workspace_id = :harper_workspace_id::uuid
    AND source_provider = 'internal_benchmark'
    AND source_job_id IN (
      'benchmark:wonderful:kr:fde:v1',
      'benchmark:wonderful:kr:field-cto:v1'
    )
),
benchmark_runs AS (
  SELECT run.id
  FROM public.opportunity_discovery_run run
  WHERE run.trigger_payload #>> '{manualInternalRecommendation,roleId}'
        IN (SELECT role_id::text FROM benchmark_roles)

  UNION

  SELECT rec.discovery_run_id
  FROM public.talent_opportunity_recommendation rec
  WHERE rec.role_id IN (SELECT role_id FROM benchmark_roles)
    AND rec.discovery_run_id IS NOT NULL
)
SELECT
  (SELECT count(*) FROM benchmark_runs) AS run_count,
  (SELECT count(*)
     FROM public.talent_opportunity_delivery d
    WHERE d.discovery_run_id IN (SELECT id FROM benchmark_runs))
    AS delivery_count,
  (SELECT count(*)
     FROM public.talent_opportunity_chat_preview p
    WHERE p.discovery_run_id IN (SELECT id FROM benchmark_runs))
    AS chat_preview_count;
```

세 count 모두 0이어야 한다. `company_internal_roles.considerations`도 `{}`인지 확인한다.

## 10. Phase C: source snapshot과 outcome embargo

### 10.1 matcher가 읽을 수 있는 source

- Wonderful company description·pitch·공개 정보
- 두 source role의 description, request, location, type, work mode, salary, seniority
- clone role의 동일 필드
- candidate의 일반 profile·resume·experiences·educations·extras
- Wonderful과 관계없는 candidate preference·conversation·insight
- Wonderful 이외 회사의 internal response·진행 결과
- Wonderful 이외 role의 `candidate_requested_connection`. 단, 현재 source role 관심으로 직접 전이하지 않고 일반 responsiveness·인접 role 관심의 제한적 evidence로만 사용
- 최근 로그인·활동

### 10.2 matcher가 읽을 수 없는 source

- Wonderful source role과 sibling role의 candidate recommendation
- Wonderful workspace의 stage·progress·delivery
- Wonderful에 대한 candidate like/dislike·연결 요청
- source role의 `talent_progress.kind='candidate_requested_connection'`. production에서는 직접 관심 신호지만 이 benchmark에서는 사실상 정답을 알려주므로 freeze 전 사용 금지
- Wonderful 회사가 남긴 candidate별 accept/stop reason
- source role의 기존 fit score
- positive candidate ID가 들어간 과거 benchmark report

Wonderful workspace 전체를 embargo하는 이유는 같은 후보가 sibling role에서 진행한 흔적도 사실상 정답을 알려줄 수 있기 때문이다.

### 10.3 candidate 대화에서 생기는 간접 leakage

후보자 대화에는 “Wonderful 제안을 수락했다”, “이 회사와 인터뷰 중이다” 같은 문장이 남을 수 있다. 이런 문장을 acceptance evidence로 사용하면 benchmark가 무효다.

matcher용 evidence packet을 만들 때:

- `Wonderful`, source role ID, source recommendation ID가 들어간 summary·message·memo는 제외한다.
- `Forward Deployed`, `FDE`, `Field CTO`, 한국어 번역·축약처럼 source role을 사실상 특정하는 표현이 role 제안·응답 문맥에 있으면 해당 segment를 제외한다.
- 한 conversation에 Wonderful 제안 문맥이 포함되면 해당 recommendation 전후 message segment를 제외한다.
- 어떤 message가 source recommendation에서 파생됐는지 확정할 수 없으면 conservative하게 제외한다.
- role title이 일반 경력 사실로 profile·resume에 등장하는 경우와 source 제안 대화에서 등장하는 경우를 구분한다. 후자는 제외하고, 전자는 현재 profile evidence로 남기되 temporal contamination 가능성을 기록한다.
- 제외한 row 수와 이유만 `redaction_log.json`에 남기고 원문은 복제하지 않는다.

redaction rule은 첫 candidate packet을 만들기 전에 정규식·token set·message-window 규칙으로 고정하고 hash를 남긴다. 평가 중 간접 leakage pattern을 새로 발견하면 ground truth를 보기 전이라도 rule version을 올리고 **두 role 전체 candidate packet과 평가를 다시 생성**한다. 특정 후보만 재평가하지 않는다.

redaction된 후보는 `acceptanceObservability='withheld'`로 표시한다. “거절 evidence가 보이지 않는다”를 acceptance positive로 바꾸지 않으며, redaction 자체를 실제 거절 신호처럼 감점하지도 않는다. finalist라면 `mustVerify`로 남긴다.

현재 profile·experience table은 시점별 snapshot을 완전히 보존하지 않으므로 post-outcome 업데이트가 섞일 가능성이 있다. 이 테스트는 기본적으로 `current-data retrospective benchmark`이며, 이 한계를 최종 보고서에 명시한다.

완전한 historical benchmark를 하려면 각 source stage 이전 시점의 candidate profile·conversation snapshot이 별도로 있어야 한다.

각 candidate packet에는 `profileUpdatedAt`, unblind 후에는 `firstPositiveAt`과의 `temporalRelation=pre_outcome|post_outcome|unknown`을 기록한다. 현재 headline·resume가 positive outcome 뒤에 업데이트됐거나 시각을 알 수 없으면, source role과 직접 일치하는 title·문구를 독립적인 acceptance evidence로 해석하지 않는다. company-fit evidence로 참고할 수는 있지만 `post_outcome_profile_contamination_possible=true`를 표시하고, historical holdout 성능과 같은 수준으로 주장하지 않는다.

### 10.4 source manifest

matching 시작 전에 다음을 `source_manifest.json`에 기록한다.

```json
{
  "protocolVersion": "1.2",
  "runId": "...",
  "benchmarkMode": "current_data_retrospective",
  "blind": true,
  "maxSelected": 10,
  "sourceWorkspaceId": "...",
  "sourceRoleIds": ["...", "..."],
  "cloneRoleIds": ["...", "..."],
  "roleInputHashes": {},
  "companyInputHash": "sha256",
  "retrievalLaneSpecHash": "sha256",
  "outcomeEmbargo": {
    "wonderfulWorkspaceExcluded": true,
    "sourceRoleOutcomesExcluded": true,
    "candidateConversationRedactionApplied": true,
    "sourceRoleLanguageRedactionApplied": true,
    "redactionRuleVersion": "...",
    "redactionPatternHash": "sha256"
  },
  "eligibilityPolicy": {
    "excludeDontShare": true,
    "excludeInternalOptOut": true,
    "excludeBlockedWonderful": true,
    "stoppedStatusIsNotAutomaticExclusion": true,
    "policyHash": "sha256"
  },
  "candidateLinkCountsAfterCleanup": {
    "fit": 0,
    "recommendation": 0,
    "tag": 0,
    "progress": 0,
    "discoveryRun": 0,
    "delivery": 0,
    "chatPreview": 0
  }
}
```

## 11. Phase D: benchmark 전용 consideration 생성

일반 매뉴얼의 consideration 절차를 사용하되 Wonderful outcome feedback은 사용하지 않는다. 이번 benchmark의 consideration은 다음 source만으로 만든다.

1. Wonderful company description·pitch와 최신 공개 사실
2. source role description
3. source role request
4. `company_internal_roles.request`
5. 법적·윤리적으로 허용되는 기준 변환

### 11.1 FDE 최소 기준

반드시 검토할 축:

- 실제 software/backend/system engineering 근거
- Python 또는 TypeScript, API, DB, cloud 등 구현 기반
- LLM·AI agent·automation 이해 또는 인접 production 경험
- 고객의 모호한 문제를 구조화한 경험
- B2B integration, solution engineering, consulting engineering, deployment 경험
- 고객 workflow를 구현·운영까지 책임진 근거
- 한국어·한국 엔터프라이즈 환경 수행 가능성
- 글로벌 조직과 기술적으로 소통할 영어 근거
- 3년 이상 경력과 role scope 적합성
- 13년 이하 선호는 soft preference로 반영. 더 길면 hands-on 유지 여부 확인
- 고보상·equity·startup·customer-facing 역할을 후보자가 선호할 가능성

### 11.2 Field CTO 최소 기준

반드시 검토할 축:

- 7~8년 이상의 hands-on software engineering 근거
- pre-sales, solution architecture 또는 복잡한 technical implementation 성과
- demo, architecture, security, integration, production deployment를 이끈 경험
- 엔터프라이즈 고객과 business·technical language를 모두 사용한 근거
- 팀 빌딩 또는 technical leadership
- Founder, CTO, VP, Director 경험은 plus지만 title만으로 통과시키지 않음
- 실제 code·system delivery를 아직 할 수 있는 hands-on 범위
- 영어로 복잡한 기술·비즈니스 논의를 수행한 근거
- 한국어·한국 시장 enterprise 수행 가능성
- 20년 초과 경력은 나이가 아니라 현재 scope·보상·hands-on mismatch를 검토
- senior/executive 역할, zero-to-one, high ownership을 후보자가 원하는지

### 11.3 공통 prohibited criteria

consideration에 아래를 명시한다.

```text
- 국적·민족·출신 국가를 filter/ranking에 사용하지 않는다.
- 특정 국가의 학교·회사 이력을 negative proxy로 사용하지 않는다.
- young를 나이·학번·졸업연도로 해석하지 않는다.
- 유명 학교·회사는 능력 그 자체가 아니라 고객 신뢰가 필요한 역할에서의
  객관적 commercial signal로만 제한적으로 본다.
```

### 11.4 Harper와 Wonderful context 분리

role은 데이터 격리를 위해 Harper workspace에 있지만 company fit과 candidate acceptance는 **Wonderful company context**로 평가한다.

- Harper의 company description·pitch를 acceptance scoring에 사용하지 않는다.
- 추천 이유에는 Wonderful role을 기준으로 쓴다.
- clone이 Harper에 있다는 사실을 candidate attraction으로 해석하지 않는다.
- 실제 발송을 하지 않으므로 회사 표시 문제는 발생하지 않아야 한다.

## 12. Phase E: retrieval과 200명 독립 평가

### 12.1 retrieval

각 role별 최대 약 200명을 별도로 가져온다.

- FDE retrieval pool 최대 200
- Field CTO retrieval pool 최대 200
- 중복 후보는 두 role에서 각각 평가 가능
- Wonderful outcome feature는 SQL에서 join하지 않음
- 다른 회사의 internal progress·최근 활동은 일반 매뉴얼 범위에서 사용 가능
- clone role의 recommendation exclusion은 cleanup 후 0건이어야 하지만 방어적으로 유지
- source Wonderful role에 과거 recommendation이 있다는 이유로 후보자를 제외하지 않음. 그 row 자체가 embargo 대상이며, 제외하면 known positive가 구조적으로 사라짐

retrieval SQL과 feature weight를 artifact에 남긴다. ground truth를 본 뒤 query를 바꾸지 않는다.

retrieval score는 기본 매뉴얼 1.2의 `role relevance 86 + system signal 14 = total 100` 계약을 따른다. Wonderful outcome은 system signal 14점에도 들어갈 수 없다. 동일 score면 `talent_id` 오름차순으로 정렬해 pool membership을 재현 가능하게 만든다.

각 role pool은 기본 매뉴얼의 direct title, core work evidence, adjacent/transferable, high-impact non-obvious lane을 합쳐 만든다. lane quota와 term은 unblind 전에 고정하며, positive를 확인한 뒤 특정 lane을 추가하지 않는다.

lane별 raw count, 앞 lane과의 overlap, unique contribution, backfill count를 기록한다. dedupe 후 200명 미만인데 최소 role-adjacent evidence를 통과한 미선택 후보가 남아 있으면 기본 매뉴얼 10.7의 deterministic backfill을 수행한다. overlap으로 180명이 된 경우를 “관련 후보가 180명뿐”이라고 보고해서는 안 된다. 실제 relevant remainder가 0일 때만 shortfall을 허용한다.

retrieval 직후 candidate ID 목록, query hash, source timestamps를 고정한다. 평가 중 profile이 변경되면 해당 candidate를 `source_changed`로 표시하고 snapshot을 다시 만든 새 run에서 평가한다.

### 12.2 전원 독립 평가

각 retrieval pool의 모든 후보에게 다음을 남긴다.

```json
{
  "cloneRoleId": "uuid",
  "sourceRoleId": "uuid",
  "talentId": "uuid",
  "coreCompanyFitScore": 0,
  "coreCandidateAcceptanceScore": 0,
  "companyFitScore": 0,
  "candidateAcceptanceScore": 0,
  "evidenceConfidence": 0,
  "mutualScore": 0,
  "acceptanceObservability": "observed_current|observed_stale|not_observed|withheld",
  "acceptanceObservedPoints": 0,
  "acceptanceUnknownPoints": 0,
  "hardCriteria": [],
  "positiveEvidence": [],
  "risks": [],
  "unknowns": [],
  "otherCompanySystemSignals": [
    {"id": "...", "side": "company|candidate", "delta": 0}
  ],
  "decision": "advance|verification_needed|reject"
}
```

`M=10`을 먼저 채웠더라도 평가를 멈추지 않는다. 두 pool 모두 전원을 평가해야 retrieval 순서에 따른 우연을 줄일 수 있다.

두 role의 평가가 끝나면 unblind 전에 score distribution audit을 실행한다. 동일 mutual score 30% 이상, 3점 구간 80% 이상, confidence 고정값 집중 중 하나라도 있으면 `score_saturation=true`다. 이 경우 총점의 소수점이나 임의 tie-break를 추가하지 않고 criterion-level evidence review와 archetype coverage를 사용한다. evaluator rubric을 수정하면 두 pool 전원을 새 version으로 다시 평가하고 변경 이유를 `blind_run_log.md`에 남긴다.

### 12.3 Top 50과 final selection

1. role별 독립 gate를 통과한 후보를 최대 50명씩 구성한다. 기본 매뉴얼 12.1에 따라 scalar 상위와 사전 정의된 role archetype별 상위 후보의 union을 사용한다.
2. role 안에서 비교 평가한다.
3. 두 role의 finalist를 합친다.
4. 같은 후보가 두 role에 있으면 양쪽 평가를 나란히 본다.
5. 각 후보의 두 role score 차이와 role-specific evidence를 비교한다. 차이가 4점 이상일 때만 높은 role을 자동 primary로 둘 수 있다.
6. 차이가 0~3점이거나 acceptance가 `withheld`면 `roleAmbiguous=true`와 secondary role을 보존하고 criterion-level review로 primary를 정한다.
7. 전체에서 최대 10명의 고유 후보를 선택한다.
8. role별 결과도 별도 보존한다.

일반 매뉴얼과 동일하게 다음 gate를 사용한다.

```text
company_fit_score >= 70
candidate_acceptance_score >= 70
core_company_fit_score >= 65
core_candidate_acceptance_score >= 65
mutual_score >= 70
evidence_confidence >= 60
unresolved_blocker_count = 0
```

## 13. 최종 선택자 정보 계약

선택한 최대 10명마다 다음을 기록한다.

- 순위
- talent ID
- 이름과 현재 headline. 이메일·전화번호는 기록하지 않음
- primary source role과 clone role
- secondary role이 있으면 해당 role과 score
- core company fit / core candidate acceptance
- system adjustment가 반영된 최종 company fit / candidate acceptance / confidence / mutual score
- hard criterion별 pass·fail·unknown
- role description·request와 직접 연결되는 객관적 사실
- 고객-facing, implementation, leadership, English, Korea-market evidence
- 다른 회사의 meaningful progress와 최근 활동성
- 회사가 좋아할 이유
- 후보자가 제안을 수락할 가능성이 높은 이유
- 사람이 간과하기 쉬운 세부 성과
- 가장 중요한 caveat
- 공유 가능한 추천 이유
- source reference

추천 이유는 benchmark positive 여부를 모르는 상태에서 완성한다.

## 14. Phase F: 예측 고정과 hash 생성

### 14.1 unblind 전 필수 artifact

다음 파일이 모두 있어야 한다.

```text
output/internal_role_benchmarks/<run_id>/
  source_manifest.json
  redaction_log.json
  fde_consideration.md
  field_cto_consideration.md
  fde_retrieval.sql
  field_cto_retrieval.sql
  fde_retrieval_candidates.jsonl
  field_cto_retrieval_candidates.jsonl
  fde_individual_evaluations.jsonl
  field_cto_individual_evaluations.jsonl
  fde_top50.json
  field_cto_top50.json
  score_distribution_audit.json
  retrieval_lane_audit.json
  predictions.json
  predictions.sha256
  blind_run_log.md
```

`predictions.json` 최소 schema:

```json
{
  "runId": "...",
  "protocolVersion": "1.2",
  "matchingManualVersion": "1.2",
  "createdAt": "timestamp",
  "blind": true,
  "unblinded": false,
  "maxSelected": 10,
  "selectedCount": 0,
  "selected": [
    {
      "rank": 1,
      "talentId": "uuid",
      "primarySourceRoleId": "uuid",
      "primaryCloneRoleId": "uuid",
      "secondarySourceRoleId": null,
      "roleMargin": null,
      "roleAmbiguous": false,
      "coreCompanyFitScore": 0,
      "coreCandidateAcceptanceScore": 0,
      "companyFitScore": 0,
      "candidateAcceptanceScore": 0,
      "evidenceConfidence": 0,
      "mutualScore": 0,
      "internalReason": "...",
      "sharedReason": "...",
      "caveat": "..."
    }
  ]
}
```

### 14.2 freeze 절차

1. `predictions.json`이 선택 수 최대 10을 지키는지 검사한다.
2. selected talent ID와 primary role pair를 정렬·확정한다.
3. 파일의 `unblinded=false`를 확인한다.
4. SHA-256을 생성한다.
5. hash, 파일 크기, 생성 시각을 `blind_run_log.md`에 기록한다.
6. read-only copy를 만든다.
7. matcher 단계 종료를 선언한다.

예시:

```bash
shasum -a 256 predictions.json > predictions.sha256
```

hash가 생성되기 전에는 ground truth query를 실행하지 않는다.

### 14.3 unblind 후 수정 금지

unblind 후 발견한 오탈자도 기존 prediction 파일에서 직접 수정하지 않는다. 필요한 정정은 별도 `post_unblind_notes.md`에 남긴다.

prediction을 변경해야 할 정도의 오류라면 해당 run을 `invalid`로 종료하고 새 `run_id`로 처음부터 다시 실행한다.

## 15. Phase G: ground truth 정의

### 15.1 positive의 기본 정의

source role에서 다음 중 하나가 확인되면 `strict_positive=true`다.

- 회사가 명시적으로 `pending_connection`으로 stage를 저장
- 현재 또는 과거 `내부:연결대기` tag가 확인됨
- custom company stage로 이동
- `final_offer` 또는 `내부:최종오퍼`
- 현재 `process_stopped`여도 그 전에 custom stage 또는 final offer에 도달한 기록이 있음
- 현재 `process_stopped`여도 그 전에 **명시적으로 저장된** pending connection event가 있음

프로세스가 종료됐다는 사실은 positive를 취소하지 않는다. 이 benchmark는 “최종 채용 여부”가 아니라 회사가 연결·후속 검토 가치가 있다고 판단했는지를 측정한다.

### 15.1.1 strict positive 안의 evidence tier

`strict_positive`는 회수 여부를 위한 넓은 label이므로, 신호의 주체와 깊이를 다음처럼 별도 보존한다.

| tier | 조건 | 해석 |
| --- | --- | --- |
| `A_company_validated_advanced` | org actor의 custom interview·technical interview·final offer event 또는 그에 해당하는 명시적 custom stage | 회사가 후보자를 실제 검토하고 pending 이후로 진행한 가장 강한 benchmark 신호 |
| `B_company_validated_pending` | org actor가 pending connection으로 명시 이동하거나 회사 accept reason을 남김 | 회사의 초기 진행 의사가 확인됨 |
| `C_connection_ready_explicit` | explicit pending/connected tag 또는 candidate acceptance가 있으나 회사 actor를 확정할 수 없음 | 양쪽 연결 가능성의 신호지만 회사 fit 검증으로는 약함 |
| `D_permissive_legacy` | stopped previous stage 등 독립 event가 없는 legacy 추론 | primary strict metric에서 제외 |

후보자 like 또는 `candidate_requested_connection`만으로 tier A나 B를 만들지 않는다. 같은 pair가 여러 tier를 가지면 최고 tier와 모든 evidence flag를 함께 저장한다. 주 지표는 기존 strict pair hit를 유지하되, tier A/B hit를 별도 보고한다.

`candidate_requested_connection`이 없는 후보를 non-positive나 낮은 acceptance로 분류하지 않는다. event가 있는 경우에도 candidate-interest evidence일 뿐이며, 독립적인 pending/custom/company action이 없으면 그 event 하나만으로 `strict_positive`를 만들지 않는다.

### 15.2 process stopped의 모호성

현재 코드에서 아무 stage tag가 없어도 UI 기본값이 `pending_connection`으로 보일 수 있다. 따라서 `process_stopped` event의 `previousStage='pending_connection'`만으로는 실제 연결 대기까지 진행했는지 확정할 수 없는 경우가 있다.

다음처럼 나눈다.

- `strict_positive`: 별도의 explicit pending/custom/final evidence가 있음
- `permissive_positive`: process stopped의 previous stage가 pending이지만 독립된 explicit event는 없음
- `unknown_legacy_stop`: 종료·아카이브만 있고 이전 stage history를 복원할 수 없음
- `not_observed_positive`: 추천은 있었지만 회사의 positive stage evidence가 없음

primary 성능 지표는 `strict_positive`를 사용한다. `permissive_positive` overlap은 보조 지표로 보고한다.

### 15.3 non-positive는 negative가 아니다

ground truth에 없는 후보를 “나쁜 후보”라고 부르지 않는다. 과거 추천 시스템이 그 사람을 찾지 못했거나 회사가 아직 보지 않았을 수 있다.

따라서 이 테스트는 완전한 precision 평가가 아니다. 알려진 positive를 다시 찾는 `positive retrieval / ranking benchmark`다.

### 15.4 현재 eligibility

과거 positive라도 현재 다음 상태면 `currently_ineligible_positive`로 분리한다.

- `profile_visibility='dont_share'`
- `get_internal_recommendation=false`
- blocked companies에 Wonderful이 있음
- candidate가 Wonderful을 현재 명시적으로 거절했고 사유가 그대로 유효함
- 법적·근무 방식 hard blocker가 현재 확인됨

raw positive overlap과 currently eligible positive overlap을 모두 보고하되, 주 평가 denominator는 `eligible_strict_positive`다.

최근 로그인하지 않았거나 setting status가 `stopped`라는 이유만으로 자동 ineligible로 만들지 않는다.

eligibility 규칙, Wonderful alias 정규화, hard blocker 목록은 unblind 전에 `source_manifest.json`에 고정한다. candidate별 값을 읽는 것은 unblind 후여도 되지만, miss한 후보를 사후적으로 denominator에서 빼기 위해 규칙을 추가하면 안 된다.

Wonderful에 대한 candidate의 과거 decline·stop reason은 outcome 정보이므로 matcher가 아니라 benchmark evaluator만 본다. 명시적 거절 사유가 현재에도 유효한지는 source와 시각을 남겨 판정한다.

## 16. Phase H: prediction 고정 후 unblind query

이 절은 `predictions.sha256`이 생성된 뒤 benchmark evaluator만 실행한다.

### 16.1 source role 재확인

hard-coded UUID만 사용하지 말고 workspace·role name·location 조건으로 현재 source role을 다시 확인한다. 확인된 UUID가 source manifest와 다르면 run을 중단한다.

### 16.2 stage evidence query

다음 query는 회사 stage evidence를 role·candidate별로 모으는 골격이다.

```sql
WITH source_roles AS (
  SELECT role_id, name
  FROM public.company_roles
  WHERE role_id IN (
    :fde_source_role_id::uuid,
    :field_cto_source_role_id::uuid
  )
),
candidate_universe AS (
  SELECT role_id, talent_id
  FROM public.talent_opportunity_recommendation
  WHERE role_id IN (SELECT role_id FROM source_roles)

  UNION

  SELECT opportunity_id AS role_id, talent_id
  FROM public.talent_opportunity_tag
  WHERE opportunity_id IN (SELECT role_id FROM source_roles)

  UNION

  SELECT role_id, talent_id
  FROM public.talent_progress
  WHERE role_id IN (SELECT role_id FROM source_roles)
),
org_event AS (
  SELECT
    p.role_id,
    p.talent_id,
    p.created_at,
    p.metadata->>'stage' AS stage,
    p.metadata->>'previousStage' AS previous_stage,
    p.metadata->>'stopReason' AS stop_reason,
    p.metadata->>'acceptReason' AS accept_reason
  FROM public.talent_progress p
  WHERE p.role_id IN (SELECT role_id FROM source_roles)
    AND p.kind = 'org_stage_change'
    AND p.metadata->>'org' = 'true'
),
event_agg AS (
  SELECT
    role_id,
    talent_id,
    bool_or(
      stage IN ('pending_connection', 'final_offer')
      OR stage LIKE 'custom:%'
    ) AS has_explicit_positive_event,
    bool_or(
      stage = 'process_stopped'
      AND (
        previous_stage = 'final_offer'
        OR previous_stage LIKE 'custom:%'
      )
    ) AS stopped_after_advanced_stage,
    bool_or(
      stage = 'process_stopped'
      AND previous_stage = 'pending_connection'
    ) AS stopped_from_pending_visible_state,
    bool_or(stage = 'process_stopped') AS has_stop_event,
    min(created_at) FILTER (
      WHERE stage IN ('pending_connection', 'final_offer')
         OR stage LIKE 'custom:%'
    ) AS first_explicit_positive_at,
    max(created_at) AS latest_org_event_at
  FROM org_event
  GROUP BY role_id, talent_id
),
tag_agg AS (
  SELECT
    opportunity_id AS role_id,
    talent_id,
    bool_or(
      tag IN ('내부:연결대기', '내부:최종오퍼')
      OR tag LIKE '내부단계:%'
    ) AS has_current_positive_tag,
    bool_or(
      tag IN ('내부:프로세스중단', '내부:거절', '내부:아카이브')
    ) AS has_current_stop_tag
  FROM public.talent_opportunity_tag
  WHERE opportunity_id IN (SELECT role_id FROM source_roles)
  GROUP BY opportunity_id, talent_id
)
SELECT
  roles.name AS source_role_name,
  universe.role_id,
  universe.talent_id,
  coalesce(events.has_explicit_positive_event, false)
    OR coalesce(events.stopped_after_advanced_stage, false)
    OR coalesce(tags.has_current_positive_tag, false)
      AS strict_positive,
  (
    coalesce(events.has_explicit_positive_event, false)
    OR coalesce(events.stopped_after_advanced_stage, false)
    OR coalesce(tags.has_current_positive_tag, false)
    OR coalesce(events.stopped_from_pending_visible_state, false)
  ) AS permissive_positive,
  coalesce(events.has_stop_event, false)
    OR coalesce(tags.has_current_stop_tag, false)
      AS has_process_stop,
  events.first_explicit_positive_at,
  events.latest_org_event_at
FROM candidate_universe universe
JOIN source_roles roles ON roles.role_id = universe.role_id
LEFT JOIN event_agg events
  ON events.role_id = universe.role_id
 AND events.talent_id = universe.talent_id
LEFT JOIN tag_agg tags
  ON tags.role_id = universe.role_id
 AND tags.talent_id = universe.talent_id
ORDER BY roles.name, strict_positive DESC, universe.talent_id;
```

현재 tag는 stage 이동 때 이전 tag가 삭제될 수 있으므로 historical 판정에서는 `org_stage_change` event가 우선이다. legacy 기간의 event가 없으면 uncertainty를 보고한다.

### 16.3 ground truth artifact

query 결과는 다음 파일에 저장한다.

```text
ground_truth.jsonl
unblind_ground_truth.sql
unblind_log.md
```

`unblind_log.md`에는 다음을 남긴다.

- prediction SHA-256
- unblind 시작 시각
- evaluator
- source role IDs
- strict/permissive/unknown candidate 수
- schema 또는 history 한계

## 17. Phase I: 성능 지표

### 17.1 주 지표

#### Strict role-pair hit@10

```text
선택된 primary (role, talent) pair 중
같은 source role의 eligible_strict_positive와 일치한 pair 수
```

최소 하나 이상이면 이 benchmark에서 강한 positive signal이다.

#### Unique candidate overlap@10

role을 무시하고 selected 고유 후보 중 eligible strict positive와 겹치는 사람 수를 센다. 잘못된 role에 배정한 경우도 보이기 때문에 role-pair hit와 함께 보고한다.

#### Cross-role placement error@10

selected candidate가 다른 source role에서는 strict positive지만 primary role에서는 아니면 `cross_role_placement_error`로 센다. 이는 사람을 찾는 데는 성공했지만 role differentiation에 실패한 경우다. `secondaryRole`이 정답 role이면 secondary hit도 별도 표시하되 exact primary pair hit에 합치지 않는다.

#### Company-validated hit@10

tier A 또는 B와 일치한 exact role pair 수를 센다. 연결대기 전체 hit와 함께 보고해 후보자 수락 신호와 회사 검증 신호를 구분한다.

#### Role coverage@10

- FDE strict positive hit 유무
- Field CTO strict positive hit 유무

두 role 모두에서 hit가 있으면 한 role에만 맞춘 시스템보다 더 강한 신호다.

### 17.2 단계별 진단 지표

각 eligible strict positive마다 다음 funnel 위치를 찾는다.

| 상태 | 의미 |
| --- | --- |
| retrieval 200 밖 | SQL recall·hard filter 문제 가능성 |
| retrieval 안, 독립 gate 탈락 | evidence extraction·절대 scoring 문제 가능성 |
| gate 통과, Top 50 밖 | score calibration·tie-break 문제 가능성 |
| Top 50 안, final 10 밖 | 비교·global allocation 문제 가능성 |
| final 10, 다른 role 배정 | role differentiation 문제 가능성 |
| final 10, 같은 role | strict hit |

추가로 기록한다.

- `retrieval_recall_at_200`
- role별 positive best rank
- role별 Top 50 overlap
- global Top 10 strict overlap
- tier A/B별 retrieval·independent gate·Top 50·final recall
- exact role-pair hit와 person-level hit의 차이
- cross-role placement error 수
- role별 score saturation과 archetype별 Top 50 구성
- permissive overlap
- currently ineligible positive 수
- ground truth unknown 수

### 17.3 결과 상태

무결성과 성능을 하나의 status 문자열로 섞지 않는다. 최종 결과는 `integrityStatus`와 `performanceSignal` 두 필드를 가진다.

`integrityStatus`:

```text
VALID:
  embargo, freeze, cleanup, no-write 계약을 모두 지킴

INVALID:
  예측 고정 전 outcome을 봤거나 candidate 연결 데이터가 남아 있었음

CONTAMINATED:
  benchmark role을 통해 후보자에게 추천·채팅·이메일이 노출됨

INCONCLUSIVE:
  eligible_strict_positive가 0명이거나 ground truth history가 너무 불완전해
  hit 여부를 정의할 수 없음
```

`performanceSignal`:

```text
STRONG_SIGNAL:
  두 role 모두 strict role-pair hit가 있거나 strict hit가 2건 이상

PASS_SIGNAL:
  global Top 10에 strict role-pair hit가 1건 이상

PARTIAL_SIGNAL:
  unique candidate는 맞지만 role pair가 다르거나,
  strict positive가 Top 50에는 있으나 Top 10에는 없음

NO_HIT_REVIEW:
  global Top 10 strict hit가 0건
```

`integrityStatus!='VALID'`이면 performance signal을 공식 비교에 사용하지 않는다. 두 필드는 단일 benchmark의 관찰값이지 전체 시스템의 최종 등급이 아니다.

## 18. hit와 miss 해석 규칙

### 18.1 hit가 있을 때도 확인할 것

- source outcome을 직접 또는 간접적으로 본 것은 아닌가?
- 후보자가 선택된 이유가 일반화 가능한 role evidence인가?
- 국적·학교 prestige 같은 잘못된 proxy로 우연히 맞춘 것은 아닌가?
- same-role이 아니라 단순 unique candidate overlap만 맞은 것은 아닌가?
- 현재 candidate acceptance가 실제로도 70 이상인가?
- known positive 한 명에 지나치게 유리한 query였는가?

leakage나 proxy로 만든 hit는 성능 증거로 인정하지 않는다.

### 18.2 miss가 있을 때도 확인할 것

- positive가 현재 `dont_share`, opt-out, blocked company 상태인가?
- source 당시와 현재 커리어 방향이 달라졌는가?
- profile 데이터가 부족해 evidence confidence가 낮았는가?
- source 회사가 당시 남긴 판단이 현재 request와 여전히 일치하는가?
- positive가 retrieval 200에 아예 없었는가?
- role pair를 잘못 배정했는가?
- 현재 시스템이 더 좋은 새 후보를 찾았을 가능성이 있는가?

`NO_HIT_REVIEW`는 자동 실패가 아니라 원인 분석을 시작하라는 상태다.

## 19. 선택자와 positive 비교 보고서

### 19.1 선택자 표

최대 10명 전원을 다음 형식으로 보고한다.

| rank | candidate | primary role | company fit | acceptance | mutual | strict hit | caveat |
| ---: | --- | --- | ---: | ---: | ---: | --- | --- |

표 아래에는 각 후보의 상세 정보 계약에 따른 설명을 둔다.

### 19.2 known positive 진단 표

unblind 후 eligible positive마다 다음을 기록한다.

| source role | talent ID | label quality | retrieval rank | independent result | Top 50 rank | final result | miss reason |
| --- | --- | --- | ---: | --- | ---: | --- | --- |

`label quality`는 `strict`, `permissive`, `unknown_legacy`를 기록하고, strict에는 `A_company_validated_advanced`, `B_company_validated_pending`, `C_connection_ready_explicit` tier를 추가한다.

### 19.3 개인정보 최소화

- report에 이메일·전화번호·주소를 쓰지 않는다.
- raw resume와 대화 전체를 복제하지 않는다.
- 필요한 objective fact와 source ID만 남긴다.
- candidate private conversation을 직접 인용하지 않는다.
- benchmark artifact는 git에 commit하지 않는 `output/` 아래에 둔다.

## 20. 기존 추천 매뉴얼 개선 절차

테스트의 마지막 목적은 hit 수만 세는 것이 아니라 `internal-company-role-talent-matching-manual-ko.md`를 개선할 근거를 만드는 것이다.

### 20.1 개선 전 snapshot

테스트 시작 전에 기존 매뉴얼의 다음을 기록한다.

- 문서 version
- Git blob hash 또는 SHA-256
- consideration schema version
- retrieval SQL version
- scoring weight
- evaluator prompt/version

unblind 후 현재 run에 사용한 매뉴얼 본문을 소급 수정하지 않는다.

### 20.2 miss 위치별 개선 후보

#### retrieval miss

검토 항목:

- role synonym이 부족했는가?
- title보다 project description을 더 봐야 하는가?
- Korean/English 혼합 keyword가 누락됐는가?
- customer-facing·integration evidence가 다른 표현으로 적혔는가?
- hard filter가 실제 request보다 강했는가?
- 데이터 join 또는 null 처리 오류가 있었는가?

#### 독립 평가 miss

검토 항목:

- profile 한 줄 뒤의 세부 성과를 읽지 못했는가?
- founder·consulting·solution role을 engineering evidence와 연결하지 못했는가?
- candidate acceptance evidence의 최신성을 잘못 판단했는가?
- system bonus가 core fit을 과도하게 덮었는가?
- unknown을 fail로 바꿨는가?

#### Top 50·Top 10 miss

검토 항목:

- harmonic mutual score가 양쪽 병목을 제대로 반영했는가?
- FDE와 Field CTO의 role differentiation이 충분한가?
- global 10명 선택에서 한 role이 과도하게 독점했는가?
- objective evidence confidence가 약한 후보가 너무 높았는가?
- 비교 단계가 절대 점수를 왜곡했는가?

#### acceptance miss

검토 항목:

- compensation·equity·global scope의 매력을 반영했는가?
- onsite Korea, 영어, seniority, hands-on 선호를 확인했는가?
- 최근 대화보다 오래된 insight를 우선했는가?
- 단순 활동성을 관심 신호로 과대평가했는가?

### 20.3 개선안 작성 계약

각 개선 제안은 다음 schema를 사용한다.

```json
{
  "id": "benchmark-change-001",
  "observedFailure": "어느 단계에서 무엇을 놓쳤는지",
  "evidence": ["artifact/source reference"],
  "rootCause": "일반화 가능한 원인",
  "proposedManualChange": "바꿀 규칙",
  "targetSection": "기존 매뉴얼 section",
  "expectedBenefit": "어떤 candidate class를 더 잘 찾는지",
  "overfitRisk": "이 benchmark 정답 암기 위험",
  "falsePositiveRisk": "새 규칙이 올릴 수 있는 오탐",
  "validationPlan": "다른 holdout에서 검증할 방법",
  "decision": "accept|reject|needs_more_evidence"
}
```

### 20.4 변경 채택 기준

다음 중 하나 이상을 만족해야 기존 매뉴얼 변경 후보가 된다.

- 두 명 이상의 후보에서 같은 failure pattern이 반복
- 한 명 사례라도 명확한 구조적 bug 또는 누락된 source가 확인
- 현재 role description·request와 직접 연결되는 일반 원칙
- 다른 회사·role에도 적용 가능한 evidence extraction 개선

다음은 변경 근거로 부족하다.

- positive candidate 한 명의 학교·회사명을 keyword에 추가
- 특정 talent ID를 예외 처리
- hit 수를 높이기 위한 점수 사후 조정
- Wonderful만을 위한 stage·회사명 feature 추가
- 보호 특성 proxy를 다시 도입

### 20.5 실제 문서 개선

benchmark report와 change proposal이 완성된 후에만 기존 매뉴얼을 수정한다.

1. 승인된 change만 적용한다.
2. 매뉴얼 version을 올린다.
3. 변경 전후 diff와 이유를 남긴다.
4. 같은 Wonderful benchmark 재실행은 `regression_test`로 표시한다.
5. 개선된 시스템의 새 blind 성능은 다른 holdout role로 검증한다.

같은 정답을 본 뒤 같은 benchmark 성능이 오르는 것은 기대된 회귀 결과이지 독립적인 성능 증거가 아니다.

## 21. 테스트 종료 절차

### 21.1 완료 조건

다음이 모두 충족되어야 `completed`다.

1. clone 두 개가 Harper에 있고 paused·doNotSend 상태다.
2. 시작 전 candidate-linked row가 모두 0이었다.
3. Wonderful outcome embargo를 지켰다.
4. role별 retrieval pool 전원을 독립 평가했다.
5. 최대 10명을 ground truth 없이 고정했다.
6. prediction hash를 만들었다.
7. hash 이후에만 ground truth를 조회했다.
8. strict·permissive positive와 strict evidence tier를 구분했다.
9. exact role-pair, person-level, cross-role placement, 단계별 miss를 계산했다.
10. role별 score saturation과 archetype coverage를 진단했다.
11. 선택자 최대 10명의 상세 정보를 작성했다.
12. 기존 매뉴얼 개선안을 작성했다.
13. 종료 시 benchmark role candidate-linked row가 다시 0임을 확인했다.

### 21.2 종료 시 DB 검증

benchmark는 dry-run이므로 종료 시에도 다음이 모두 0이어야 한다.

- fit
- recommendation
- tag
- progress
- benchmark discovery run
- delivery

0이 아니면 cleanup 절차를 다시 수행하고 원인을 보고한다. 후보자에게 노출된 row가 있으면 `contaminated` 처리한다.

### 21.3 clone 보존 또는 삭제

기본적으로 clone 두 개는 다음 반복 테스트를 위해 `paused` 상태로 보존한다. 사용자가 명시적으로 삭제를 요청한 경우에만 clone role을 삭제한다.

Wonderful source role과 source outcome은 절대 삭제하지 않는다.

## 22. 반복 실행 명령

실제 benchmark를 시작할 때 다음 형식을 사용한다.

```text
docs/wonderful-korea-fde-field-cto-benchmark-manual-ko.md대로
실제 benchmark 테스트를 실행해.

run_id=wonderful-kr-fde-field-cto-<timestamp>
max_selected=10
benchmark_mode=current_data_retrospective
blind=true
matching_manual=scripts/internal-company-role-talent-matching-manual-ko.md
```

regression test라면 명시한다.

```text
blind=false
benchmark_mode=regression_test
manual_version=<new version>
```

`blind=true`인데 실행 agent가 positive ID를 이미 알고 있으면 시작하지 않고 새 task를 요청한다.

## 23. 최종 보고서 형식

```markdown
# Wonderful Korea FDE·Field CTO benchmark 결과

## Run
- run_id:
- protocol version:
- matching manual version/hash:
- prediction hash:
- benchmark mode:
- integrity status: VALID|INVALID|CONTAMINATED|INCONCLUSIVE
- performance signal: STRONG_SIGNAL|PASS_SIGNAL|PARTIAL_SIGNAL|NO_HIT_REVIEW

## Data Isolation
- source role IDs:
- clone role IDs:
- pre-run linked row counts:
- post-run linked row counts:
- redacted source counts:
- redaction rule version/hash:

## Funnel
- FDE retrieval / evaluated / Top 50 / selected:
- Field CTO retrieval / evaluated / Top 50 / selected:
- global unique selected:

## Selected Candidates
최대 10명 상세 정보

## Ground Truth
- strict positives:
- tier A/B/C positives:
- eligible strict positives:
- permissive positives:
- unknown legacy stops:

## Metrics
- strict role-pair hit@10:
- unique candidate overlap@10:
- cross-role placement error@10:
- company-validated tier A/B hit@10:
- role coverage:
- retrieval recall@200:
- independent gate recall:
- Top 50 recall:
- score saturation by role:
- positive best ranks:

## Miss Analysis
positive별 funnel 위치와 원인

## Manual Improvements
채택·보류·거절 개선안

## Limitations
current-data, history completeness, post-outcome leakage 가능성
```

## 24. 품질 감사 체크리스트

### 실행 권한

- [ ] 사용자가 `실제 테스트를 실행해`라고 명시했다.
- [ ] 문서 작성 요청을 실제 실행 요청으로 오해하지 않았다.
- [ ] benchmark가 dry-run임을 확인했다.

### clone과 초기화

- [ ] Wonderful source workspace와 source role을 의미 조건으로 찾았다.
- [ ] Harper workspace를 정확히 확인했다.
- [ ] clone은 paused·doNotSend다.
- [ ] source description·request hash가 clone과 일치한다.
- [ ] 원본 considerations를 복사하지 않았다.
- [ ] 시작 전에 clone의 후보 연결 데이터를 전부 삭제했다.
- [ ] fit·recommendation·tag·progress count가 모두 0이다.
- [ ] orphan discovery run·delivery·chat preview count도 모두 0이다.
- [ ] Wonderful source 데이터는 변경하지 않았다.

### blind integrity

- [ ] matcher가 Wonderful outcome row를 읽지 않았다.
- [ ] source role의 `candidate_requested_connection`을 freeze 전에 읽거나 scoring에 사용하지 않았다.
- [ ] Wonderful sibling role outcome도 사용하지 않았다.
- [ ] candidate 대화의 Wonderful 관련 문맥을 redaction했다.
- [ ] source role 이름·축약·번역이 포함된 제안 문맥도 redaction했다.
- [ ] redaction rule version과 pattern hash를 freeze 전에 기록했다.
- [ ] 과거 benchmark positive ID를 matcher가 보지 않았다.
- [ ] prediction을 최대 10명으로 먼저 고정했다.
- [ ] prediction SHA-256을 unblind 전에 만들었다.
- [ ] unblind 후 prediction을 수정하지 않았다.

### matching

- [ ] company context는 Harper가 아니라 Wonderful을 사용했다.
- [ ] 국적·민족·출신 국가 proxy를 사용하지 않았다.
- [ ] young를 나이가 아니라 role scope·ownership으로 변환했다.
- [ ] role별 최대 약 200명을 retrieval했다.
- [ ] retrieval score가 role relevance 86 + system signal 14, total 100 cap을 지킨다.
- [ ] 네 retrieval lane과 quota를 unblind 전에 고정하고 dedupe했다.
- [ ] lane별 unique contribution을 기록하고 overlap shortfall을 backfill했다.
- [ ] retrieval pool 전원을 독립 평가했다.
- [ ] acceptance observability와 unknown/withheld를 구분했다.
- [ ] score distribution audit을 실행하고 포화 시 criterion-level review를 했다.
- [ ] role별 Top 50을 만든 후 global 최대 10명을 선택했다.
- [ ] Top 50의 사전 정의 archetype coverage를 확인했다.
- [ ] 두 role 점수 차이가 작은 후보의 role assignment를 별도 검토했다.
- [ ] 10명을 채우려고 기준을 완화하지 않았다.
- [ ] 선택자마다 company fit과 candidate acceptance를 분리했다.
- [ ] core 양면 65, 최종 양면 70, mutual 70, confidence 60 gate를 적용했다.
- [ ] system bonus 제거 sensitivity를 확인했다.

### ground truth와 분석

- [ ] explicit pending/custom/final evidence로 strict positive를 만들었다.
- [ ] process stopped를 무조건 positive로 세지 않았다.
- [ ] permissive·unknown legacy를 분리했다.
- [ ] currently ineligible positive를 분리했다.
- [ ] eligibility policy를 unblind 전에 hash로 고정했다.
- [ ] eligible strict positive가 0명이면 `INCONCLUSIVE`로 처리했다.
- [ ] role-pair와 unique candidate overlap을 모두 계산했다.
- [ ] retrieval·independent·Top 50·Top 10 miss를 구분했다.
- [ ] non-positive를 negative로 해석하지 않았다.

### 개선과 종료

- [ ] benchmark identity를 production rule에 넣지 않았다.
- [ ] 개선안마다 root cause와 overfit risk가 있다.
- [ ] 기존 매뉴얼 수정은 report 완성 뒤 수행했다.
- [ ] 같은 benchmark 재실행을 regression test로 표시했다.
- [ ] 종료 시 clone candidate-linked row가 다시 0이다.
- [ ] 후보자에게 어떤 제안도 발송하지 않았다.

## 25. 최종 실행 지시

이 benchmark에서 가장 중요한 것은 Top 10 숫자가 아니라 blind integrity다. Wonderful의 실제 진행자를 먼저 본 뒤 비슷한 사람을 고르는 것은 테스트가 아니다.

매번 Harper clone의 후보 연결 데이터를 0으로 초기화하고, 원본 Wonderful outcome을 차단한 상태에서 consideration·retrieval·독립 평가·Top 50·global Top 10을 끝낸다. 예측 파일을 hash로 고정한 뒤에만 stage 결과를 연다.

hit가 있으면 어떤 일반화 가능한 evidence로 맞췄는지 검증한다. hit가 없으면 positive가 funnel의 어디에서 빠졌는지 찾는다. 그 원인으로부터 기존 추천 매뉴얼의 변경안을 만들되, benchmark candidate를 외우는 규칙은 채택하지 않는다.

테스트가 끝났을 때 Harper benchmark role에는 fit·recommendation·tag·progress·delivery가 없어야 하며, Wonderful 원본 데이터는 처음부터 끝까지 변경되지 않아야 한다.
