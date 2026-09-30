# Talent × Role 활동 통합

## 공개 범위

`talent_progress`가 활동의 원본이다. 각 행의 `open_to_talent`와 `open_to_company`가 독립적으로 공개 대상을 정한다. 후보자 화면과 Career LLM은 `open_to_talent=true` 행의 `talent_text`를, 회사 피드와 company-side LLM은 `open_to_company=true` 행의 `company_text`를 읽는다. Ops는 원문 `text`와 metadata를 계속 읽을 수 있다. 알 수 없는 새 kind와 `manual_note`는 기본적으로 둘 다 false다.

| 범위 | 기존 kind |
| --- | --- |
| 양쪽 | `internal_followup_sent`, `internal_process_stopped_notified`, `company_request_followup_sent`, 후보자 연락·전달·답변에 해당하는 `org_candidate_activity` |
| 후보자 | `candidate_requested_connection`, `internal_fit_question_asked`, `candidate_role_recommendation_presented`, `candidate_role_recommendation_accepted`, 이전한 `memo`와 `saved_stage_changed` |
| 회사 | `org_stage_change`, `org_note`, `org_candidate_role_move`, `org_slack_profile_view`, 발송 완료된 `intro_to_company` |
| Ops | `manual_note`, 미분류 kind, 미발송 `intro_to_company` |

양쪽 공개 행이라도 문구는 대상별로 다를 수 있다. 특히 Ops 원문이나 metadata를 LLM에 통째로 전달하지 않는다. `org_candidate_activity`는 회사의 연락 이력에 필요한 이벤트만 후보자에게 일반화한 문구로 보인다.

## 이관과 읽기

기존 `talent_role_activity`의 UUID와 시각을 유지해 `talent_progress`로 복사한다. 동일 ID는 재삽입하지 않고 이관 검증에서 내용과 공개 범위를 확인한다. `talent_memo` 스냅샷은 같은 추천의 동일 메모가 없을 때만 복사한다. 복사 후 물리 활동 테이블은 호환 view로 바꿔 구버전 Career와 저장 RPC를 잠시 지원한다. 최종 Career 전환 후 메모 RPC는 progress에만 쓰고 스냅샷은 비운다.

Career의 역할 상세는 후보자 공개 행을 모두 조회한다. LLM의 `get_role_context`는 최근 10건을 기본 제공하고 `activityOffset`으로 다음 10건을 읽을 수 있다. company-side LLM의 `read_talent`도 공개 행을 기본 10건, 최대 30건씩 `progressOffset`으로 읽는다. 여러 후보자를 한꺼번에 읽는 `read_role`에는 최근 공개 활동만 요약하고 특정 후보자의 나머지는 `read_talent`로 읽는다.

종료 활동은 역할의 상태값 변경만으로 생성하지 않는다. 후보자에게 종료 안내가 포함된 Career 답변이 저장되거나, 이메일 발송이 성공한 뒤 해당 추천을 `closed`로 바꾸는 트랜잭션에서 `internal_process_stopped_notified`를 기록한다. 중복 호출은 이미 종료된 추천을 다시 기록하지 않는다.

## 배포 순서와 현재 상태

1. **완료:** `20260930080950_unify_talent_role_progress_visibility.sql`, `20260930081853_fix_talent_progress_nullable_audiences.sql`, `20260930084147_restrict_unknown_org_candidate_activity_visibility.sql`, `20260930084525_refresh_progress_audience_text_on_edit.sql`을 운영 DB에 적용했다. 기존 progress 행의 공개 범위를 분류했다. 새 후보자 전용 활동 행은 아직 복사하지 않았다.
2. **대기:** beta의 회사 공개 범위 필터 커밋 `9ac9ea18`과 Worker의 이력 해석·발송 시점 수정 커밋 `51ed930`을 배포하고 동작을 확인한다.
3. **대기:** 회사 측 옛 LLM이 더는 후보자 전용 행을 읽지 않음을 확인한 뒤 `20260930084600_migrate_legacy_talent_role_activity.sql`을 적용한다. 구버전 Career는 호환 view와 메모 스냅샷을 계속 사용한다.
4. **대기:** 통합 Career reader와 메모/단계 writer를 담은 beta 후속 커밋을 배포한다.
5. **대기:** `20260930084700_remove_talent_memo_snapshot_after_progress_cutover.sql`을 적용해 메모의 이중 저장을 종료한다.

이 순서는 후보자 전용 메모가 구버전 회사 LLM에 노출되는 상황과 Career 이력의 일시적 누락을 막기 위한 것이다. 각 배포와 두 번째 이후 DB 이관은 별도 실행 확인이 필요하다.
