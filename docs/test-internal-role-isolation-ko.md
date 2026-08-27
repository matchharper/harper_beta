# 테스트용 internal role 격리 원칙

## 절대 원칙

테스트·QA·데모·E2E용 internal role은 실제 talent 매칭 재고가 아니다. 다음 경로에 단 한 번도 들어가면 안 된다.

- `talent_opportunity_fit` 생성·재평가
- 주기 scheduler의 internal fit 대상 판정
- 추천 가능한 internal role 선택
- hold 기반 추가 질문과 답변 전파
- 내부 추천 후속 연락
- Ops 수동 추천 role 목록
- 실제 talent의 `talent_opportunity_recommendation`

회사 측 E2E에서 추천 이후의 질문·수락·거절·연결 흐름을 검증해야 할 때만, 전용 fixture talent 계정에 한해 직접 만든 fixture recommendation을 사용할 수 있다. 실제 talent에는 예외가 없다.

## 필수 데이터 표식

테스트 role을 만들기 전에 `company_roles.information`에 아래 값을 저장한다.

```json
{
  "testOnly": true,
  "testFixture": "고정된-fixture-이름",
  "testTalentIds": ["전용 fixture talent UUID"]
}
```

- `testOnly: true`가 canonical 격리 표식이다.
- `testFixture`는 어떤 테스트가 만든 role인지 추적하고 정확히 정리하기 위한 값이다.
- `testTalentIds`는 회사 측 E2E에 직접 fixture recommendation이 꼭 필요할 때만 사용한다. 실제 talent ID를 넣으면 안 된다.
- `workspace.is_internal`, `company_internal_roles.is_auto`, role 이름의 `E2E` 접두어, 고정 UUID, 테스트 종료 후 cleanup은 격리 표식이 아니다.

## 다중 방어선

1. E2E fixture 생성 스크립트가 `testOnly`와 전용 `testTalentIds`를 강제로 기록한다.
2. worker가 scheduler, fit 계산, 추천 선택, hold 질문, follow-up, 최종 저장에서 테스트 role을 제외한다.
3. 웹 애플리케이션이 onboarding hold 질문과 Ops 수동 추천 목록에서 테스트 role을 제외한다.
4. 데이터베이스 trigger가 테스트 role의 fit 저장을 거부하고, allowlist에 없는 talent 추천 저장을 거부한다.
5. `[E2E]`, `[Codex E2E]`, `[QA TEST]`, 테스트 source provider/job ID도 과거 fixture용 보조 차단 신호로 사용한다. 새 fixture는 이름 규칙에 의존하지 않고 반드시 `testOnly`를 기록한다.

## 운영 E2E 체크리스트

가능하면 별도 Supabase 프로젝트에서 테스트한다. 운영 환경에서 회사 측 E2E가 불가피하면 다음 순서를 지킨다.

1. 전용 fixture talent와 정확한 role ID 목록을 먼저 확정한다.
2. 모든 role에 canonical 표식을 넣은 뒤 생성한다.
3. role 생성 직후 해당 ID로 `talent_opportunity_fit`이 0건인지 확인한다.
4. 실제 talent recommendation, hold 질문, progress가 0건인지 확인한다.
5. 필요한 회사 측 흐름만 실행한다.
6. 테스트가 끝나면 exact ID로 role과 파생 recommendation, tag, progress, request, message, fit을 즉시 삭제한다.
7. 운영 스키마의 모든 `role_id`·`opportunity_id` 참조를 다시 조회해 잔존 행이 0건인지 확인한다.

테스트 role을 `active`로 남겨두거나 cleanup을 다음 작업으로 미루는 것은 금지한다.
