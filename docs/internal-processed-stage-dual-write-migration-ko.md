# Internal pipeline `processed_stage` 1단계 안정화

## 결론

현재 `/ops`, `/org`, 후보자 수락·거절 흐름이 사용하는
`talent_opportunity_tag`는 그대로 유지한다. `processed_stage`는 태그와
후보자 feedback에서 계산되는 추천 row 단위의 보조 투영값으로 추가한다.

- 기존 UI와 API의 태그 읽기·쓰기 로직은 변경하지 않는다.
- 마이그레이션을 설치해도 기존 recommendation row는 자동 변환하지 않는다.
- 설치 이후 발생하는 stage/feedback 변경부터 DB trigger가
  `processed_stage`를 함께 맞춘다.
- 기존 `processed_stage` 직접 writer도 제거하거나 차단하지 않지만, 직접
  쓰기는 태그를 역으로 이동시키지 않는 레거시·비상 호환 경로다.
- 기존 row 변환은 dry-run과 상세 preview 후 `p_apply = true`를 명시해야만
  실행된다.
- backfill 적용 전 값은 실행 ID별로 자동 백업된다.
- `processed_stage_version` 변경 토큰으로 backfill 뒤 상태가 다른 곳을
  거쳐 같은 값으로 돌아온 경우까지 복구 충돌로 감지한다.
- Org Agent의 후보자·포지션 조회는 raw `processed_stage`가 아니라 `/org`
  보드와 동일한 권한·태그·feedback·연결 이벤트 판정을 사용한다.

즉, 1단계에서는 태그가 현재 파이프라인의 기준이고 `processed_stage`는
호환 가능한 projection이다. 둘 중 하나를 바로 제거하거나 모든 reader를
한 번에 전환하지 않는다.

## canonical 값

| 기존 상태 | `processed_stage` |
| --- | --- |
| `내부:수락` 또는 stage 태그가 없는 positive/like feedback | `accepted` |
| `내부:거절` 또는 stage 태그가 없는 negative/dislike feedback | `rejected` |
| `내부:연결대기` | `pending_connection` |
| `내부:연결됨` | `connected` |
| `내부:최종오퍼` | `final_offer` |
| `내부:프로세스중단` | `process_stopped` |
| `내부:아카이브` | `archived` |
| `내부:보류` | `hold` |
| `내부단계:<stage uuid>` | `custom:<하이픈을 포함한 stage uuid>` |
| stage 태그와 feedback이 모두 없음 | `null` |

커스텀 단계명은 저장하지 않는다. 사용자가 단계명을 바꾸더라도 같은
단계여야 하므로 불변 ID인 `custom:<uuid>`를 저장하고, 화면 표시 시
`ops_matching_role_stages.label`을 조회한다.

`내부:추천`과 `saved_stage`는 projection 입력으로 사용하지 않는다.
`saved_stage`는 후보자 저장/연결/종료 의미가 섞인 레거시 필드이고,
`내부:추천`은 실제 파이프라인 이동이 아니기 때문이다.

## 자동 동기화 범위

마이그레이션 설치 후 아래 경우에만 자동 동기화한다.

1. internal role의 stage 태그가 생성, 수정, 삭제될 때
2. internal recommendation의 feedback이 생성 또는 변경될 때
3. internal recommendation이 새로 생성될 때
4. 커스텀 stage 정의가 생성, 삭제되거나 다른 role로 이동될 때

따라서 현재의 다음 경로를 별도 애플리케이션 수정 없이 포함한다.

- `/ops` pipeline의 기본·커스텀 단계 이동
- `/org` pipeline의 기본·커스텀 단계 이동
- 후보자의 internal 추천 수락, 거절, 결정 되돌리기
- 후보자의 프로세스 중단 요청
- `change_internal_talent_opportunity_decision` RPC
- 커스텀 단계명 변경 및 단계 삭제
- 동일 talent-role 쌍에 recommendation row가 둘 이상 있는 레거시 경우

external role row는 건드리지 않는다. 같은 talent-role 쌍에 recommendation이
여러 개면 현재 태그 모델과 동일하게 모두 같은 projection을 갖는다.

새 recommendation INSERT에 non-null `processed_stage`를 명시한 기존 writer는
그 값을 보존한다. 이후 그 talent-role 쌍에 stage 또는 feedback 변경이
발생하면 현재 태그/feedback 값으로 수렴한다. 따라서 직접 writer는 당장
깨지지 않지만 정식 파이프라인 이동 경로로 간주하지 않는다. 직접 쓰기는
`talent_opportunity_tag`를 역으로 갱신하지 않으므로 `/ops`, `/org` 상태를
움직이려면 기존 stage writer를 계속 사용해야 한다.

`processed_stage_version`은 상태 변경 때마다 DB가 새 UUID를 발급하는 내부
변경 토큰이다. 애플리케이션이 같은 값이나 임의 UUID를 써도 DB가 기존
토큰을 보존하거나 새 토큰으로 교체하므로 복구 안전성 판정에만 사용한다.

## 실패 및 경계조건

- stage 태그가 비정상적으로 여러 개면 `/ops`, `/org` 조회 순서와 같이
  `updated_at`, `created_at`, `id` 내림차순의 첫 번째 유효 태그를 사용한다.
- 삭제된 커스텀 stage를 가리키는 orphan 태그는 무시하고 다음 유효 태그나
  feedback으로 fallback한다.
- 현재 커스텀 stage 삭제 순서는 정의 삭제 후 태그 삭제다. 정의 삭제
  trigger가 먼저 projection을 fallback하므로 중간에도 존재하지 않는
  `custom:<uuid>`를 남기지 않는다.
- 현재 `/ops`, `/org`의 태그 교체는 삭제와 삽입 두 요청이다. 두 요청
  사이에는 기존 태그 조회에서도 일시적으로 stage 태그가 없는 상태가
  존재한다. projection도 그 순간의 실제 상태처럼 feedback 또는 null로
  fallback하고, 삽입 성공 즉시 최종 stage로 수렴한다.
- 태그 삽입이 실패하면 기존 시스템과 마찬가지로 삭제 뒤 fallback 상태가
  남는다. projection만 과거 단계를 유지하여 두 저장소가 서로 다르게
  보이는 상황은 만들지 않는다.
- backfill과 restore는 recommendation row update이므로 기존 DB의
  `updated_at` 자동 갱신 trigger가 있다면 timestamp가 바뀔 수 있다. 적용
  전·후 timestamp는 audit에 함께 기록한다.
- Org Agent는 같은 `/org` 보드 판정을 사용하므로 backfill로 채워진
  `processed_stage`만 보고 회사 사용자에게 내부 전용 상태를 새로 노출하지
  않는다.

## 배포 순서

대상 migration:
`supabase/migrations/20260803150000_internal_processed_stage_dual_write.sql`

### 1. schema만 설치

이 단계는 trigger와 migration helper를 설치한다. 기존 row backfill은
실행하지 않는다.

설치 직후 아래 query로 trigger 상태를 확인한다.

```sql
select
  event_object_table,
  trigger_name
from information_schema.triggers
where trigger_name in (
  'version_talent_opportunity_processed_stage',
  'sync_internal_processed_stage_from_tag',
  'sync_internal_processed_stage_after_recommendation_insert',
  'sync_internal_processed_stage_after_feedback_change',
  'sync_internal_processed_stage_from_custom_stage'
)
order by event_object_table, trigger_name;
```

### 2. 기존 데이터 dry-run 요약

아래 호출은 데이터를 수정하지 않는다.

```sql
select *
from public.backfill_internal_opportunity_processed_stage(false);
```

확인할 값:

- `would_update_rows`: 적용 시 변경될 전체 row
- `would_fill_null_rows`: null에서 canonical 값으로 채울 row
- `would_replace_legacy_rows`: non-null legacy 값을 canonical 값으로 바꿀 row
- `would_clear_rows`: 근거 태그/feedback이 없어 null로 정리할 row
- `would_change_canonical_rows`: 이미 canonical이지만 현재 근거와 다른 row
- `updated_rows`: dry-run에서는 반드시 0
- `migration_run_id`: dry-run에서는 반드시 null

### 3. 변경 대상 상세 검토

```sql
select *
from public.preview_internal_opportunity_processed_stage_backfill(5000);
```

`migration_action`은 `fill_null`, `replace_legacy`, `clear`,
`change_canonical` 중 하나다. 특히 기존 자유입력 값은 자동으로 의미를
추측하지 않고 현재 태그와 feedback에서 다시 계산한다.

### 4. 선택적 rehearsal

운영 DB에서 실행해야 한다면 같은 transaction 안에서 적용 결과를 확인한
뒤 rollback할 수 있다. 이 transaction 밖에는 변경과 backup 모두 남지 않는다.

```sql
begin;

select *
from public.backfill_internal_opportunity_processed_stage(true);

select *
from public.backfill_internal_opportunity_processed_stage(false);

rollback;
```

두 번째 결과의 `would_update_rows`가 0인지 확인한다.

### 5. 실제 backfill

사용자 확인 전에는 실행하지 않는다.

```sql
select *
from public.backfill_internal_opportunity_processed_stage(true);
```

결과의 `migration_run_id`를 반드시 기록한다. 적용 직전 값은
`internal_processed_stage_backfill_audit`에 이 ID로 백업된다.

적용 직후 다시 dry-run을 실행한다.

```sql
select *
from public.backfill_internal_opportunity_processed_stage(false);
```

동시 변경이 없었다면 `would_update_rows = 0`이어야 한다.

## 안전 복구

먼저 복구 preview를 실행한다.

```sql
select *
from public.restore_internal_opportunity_processed_stage_backfill(
  '<migration_run_id>'::uuid,
  false
);
```

- `restorable_rows`: backfill 이후 값이 바뀌지 않아 안전하게 복구 가능한 row
- `already_restored_rows`: 이미 backfill 이전 값과 같은 row
- `conflict_rows`: backfill 후 stage/feedback/direct write로 projection 변경
  토큰이 달라진 row. 값이 다른 상태를 거쳐 우연히 backfill 결과와 같아진
  경우도 포함한다.
- `missing_rows`: recommendation 자체가 삭제된 row

실제 복구는 아래처럼 명시한다.

```sql
select *
from public.restore_internal_opportunity_processed_stage_backfill(
  '<migration_run_id>'::uuid,
  true
);
```

복구 함수는 `conflict_rows`와 `missing_rows`를 덮어쓰지 않는다. 따라서
backfill 이후의 실제 파이프라인 이동을 과거 값으로 되돌리지 않는다.

## trigger 긴급 중지

schema를 삭제하지 않고 새 dual-write만 중지하려면 아래 trigger를 disable할
수 있다. 기존 태그 기반 `/ops`, `/org` 로직은 그대로 동작한다.

```sql
alter table public.talent_opportunity_tag
  disable trigger sync_internal_processed_stage_from_tag;
alter table public.talent_opportunity_recommendation
  disable trigger sync_internal_processed_stage_after_recommendation_insert;
alter table public.talent_opportunity_recommendation
  disable trigger sync_internal_processed_stage_after_feedback_change;
alter table public.ops_matching_role_stages
  disable trigger sync_internal_processed_stage_from_custom_stage;
```

재개할 때는 각 query의 `disable`을 `enable`로 바꾼다. trigger를 중지한 동안
발생한 차이는 dry-run으로 확인한 뒤 명시적 backfill로 다시 맞춘다.

## 2단계로 미룬 것

이번 변경에서는 다음을 하지 않는다.

- 모든 reader를 `processed_stage` 하나로 전환
- 태그 교체와 progress 기록을 하나의 원자적 RPC로 통합
- talent-role recommendation과 별도의 process/entity 테이블 도입
- direct `processed_stage` writer 제거 또는 DB constraint 추가

Org Agent만은 이번 안전화에서 raw `processed_stage` reader를 제거했다. 이는
새 projection으로 전환한 것이 아니라, 이미 `/org`가 사용하는 기존 상태
판정을 재사용해 마이그레이션 전후 노출을 동일하게 만든 것이다.

1단계 운영 결과와 dry-run 차이를 확인한 뒤, 2단계에서 한 source of truth로
정리한다.
