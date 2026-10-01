# Talent × Role 활동 통합

## 저장과 공개 범위

`talent_progress`의 `text` 하나가 화면과 LLM에 전달되는 활동 문구다. `open_to_talent`와 `open_to_company`가 독립적으로 공개 대상을 정하며, 양쪽 모두 true인 행은 동일한 문구를 읽는다. 이전의 대상별 문구 칼럼은 운영 DB에서 제거했다. 공개용 문구로 바꾸기 전의 운영 원문은 `metadata._internal_original_text`에 남겨 증거를 보존한다. 이 metadata 값은 후보자와 회사 reader에 전달하지 않는다.

| 범위 | 기존 kind |
| --- | --- |
| 양쪽 | `internal_followup_sent`, `internal_process_stopped_notified`, `company_request_followup_sent`, 후보자 연락·전달·답변에 해당하는 `org_candidate_activity` |
| 후보자 | `candidate_requested_connection`, `internal_fit_question_asked`, `candidate_role_recommendation_presented`, `candidate_role_recommendation_accepted`, 복사할 `memo`와 `saved_stage_changed` |
| 회사 | `org_stage_change`, `org_note`, `org_candidate_role_move`, `org_slack_profile_view`, 발송 완료된 `intro_to_company` |
| Ops | `manual_note`, 미분류 kind, 미발송 `intro_to_company` |

양쪽 공개가 가능한 자동 안내에는 같은 중립적 문구를 저장한다. 연락 본문처럼 양쪽 당사자에게 전달된 내용은 공통 `text`로 유지한다. Ops 전용 원문과 공개 범위가 다른 metadata를 LLM에 통째로 전달하지 않는다.

## 레거시 이관과 지속 동기화

기존 물리 `talent_role_activity` 테이블과 추천 행의 `talent_memo` 칼럼은 **삭제하거나 비우지 않는다**. 활동은 원본 UUID·시각·metadata를 유지하며 `talent_progress`로 복사한다. 동일 UUID는 재삽입하지 않고 모든 필드를 검증한다. 스냅샷 메모는 같은 추천과 같은 내용의 progress 메모가 없을 때만 복사한다. 2026-09-30 점검 시 스냅샷 48건 모두 활동 메모와 일치해 추가 중복 행은 필요하지 않았다.

복사 시 구버전 Career가 계속 쓸 수 있도록 레거시 활동 INSERT와 `talent_memo` 갱신을 progress로 복사하는 DB trigger를 둔다. 새 Career와 회사 reader는 각 공개 불리언으로 거른 progress만 읽는다. 현재의 구버전 메모·단계 RPC는 원본 테이블에 쓰고 trigger가 progress에 같은 활동을 복사한다. 원본을 보존하기 위한 호환 경로이며 progress의 중복 행은 만들지 않는다.

Career의 역할 상세는 후보자 공개 행을 모두 조회한다. LLM의 `get_role_context`는 최근 10건을 기본 제공하고 `activityOffset`으로 다음 10건을 읽을 수 있다. company-side LLM의 `read_talent`도 공개 행을 기본 10건, 최대 30건씩 `progressOffset`으로 읽는다. 여러 후보자를 한꺼번에 읽는 `read_role`에는 최근 공개 활동만 요약하고 특정 후보자의 나머지는 `read_talent`로 읽는다.

종료 활동은 역할의 상태값 변경만으로 생성하지 않는다. 후보자에게 종료 안내가 포함된 Career 답변이 저장되거나, 이메일 발송이 성공한 뒤 해당 추천을 `closed`로 바꾸는 트랜잭션에서 `internal_process_stopped_notified`를 기록한다. 중복 호출은 이미 종료된 추천을 다시 기록하지 않는다.

## 적용 상태

1. **완료:** 공개 불리언을 분류했고, 운영 DB는 공통 `text`와 `open_to_talent`·`open_to_company`만 사용한다. 기존 progress의 교체된 원문은 내부 metadata에 보존했다.
2. **완료:** `harper_beta`의 회사 화면·company-side LLM reader는 `open_to_company=true` 활동만 읽고 후보자 전용 메모 스냅샷을 회사 입력에 싣지 않는다. 2026-10-01 운영 배포 `c3cb1577`에 반영했다.
3. **완료:** 레거시 활동과 메모의 progress 복사·지속 동기화가 운영 DB에 적용돼 있다. 2026-10-01 읽기 전용 점검에서 레거시 활동 9,048건 중 progress에 없는 ID는 0건이고, 회사에 공개된 `memo` 활동은 0건이었다. 원본 테이블은 유지한다.
4. **완료:** 후보자에게 실제 종료 안내가 전달된 뒤 종료 활동을 기록하는 Worker 코드가 `0b36f10`으로 배포됐다. 단순한 역할 상태 변경만으로 안내 완료를 기록하지 않는다.
