# 채용 완성 전 Criteria 선작성 검증

문서 기준: 2026-10-15. 로컬 코드 변경이며 미배포. 운영 DB·후보자·Slack·메일은 변경하지 않았다.

## 후속 정정: 코드 완료 조건 제거

제약 제거 후 같은 frozen 4개 입력을 `20261015-role-criteria-no-gate-r1`로 재실행했다. 완료 검사에 Criteria 항목이 없어도 신규 세 직무에서 먼저 작성·저장·안내하고, 기존 Role의 부분 수정에서는 빈 Criteria를 유지했다. 구조와 이 작성 흐름 원문 검토 4/4, 관련 단위/계약 검사 13개와 ESLint 통과. 결과는 owner-only run의 `review.json`에 보존했다.

사용자가 Criteria 개수의 DB·코드 제약을 원하지 않는다고 명시해, 최소 개수 상수와 Criteria 완료 검사 자체를 제거했다. 빈 목록도 저장·등록 완료를 코드가 막지 않는다. 프롬프트의 선작성·안내·자연스러운 대화 진행은 유지한다. DB 제약은 처음부터 추가하지 않았다. 아래 r1~r3와 최소 개수 검사 결과는 정정 전 로컬 구현에 대한 역사적 기록이며 현재 완료 계약으로 읽지 않는다.

## 변경과 범위

- 새 Role 완료 검사는 완성된 Criteria 1~6개를 요구한다. 초안·기존 목록 편집 중 0개 저장은 허용한다. 기존 등록 Role의 부분 수정에 생성 조건을 다시 적용하지 않는다.
- 공통 작성 정본에서 직접적인 경험·seniority 범위·근거 있는 배경 제목과 독립적 후보 비교 의미를 정의한다. 새로운 연차·tier·제외 조건을 발명하지 않는다. 실제 필수·제외 조건은 Hiring Brief에 유지한다.
- LLM은 알고 있는 채용 맥락으로 먼저 저장하고 다음 답변에서 비교 요소를 알린 뒤 대화를 이어간다. 기준 선택 질문·별도 Criteria 승인은 필수 단계가 아니다. 최종 Role 등록 동의는 유지한다.
- 전용 작성 흐름과 일반 Slack의 draft 완료가 같은 완료 검사를 사용한다. 일반 Role 편집 도구와 policy도 같은 작성 정본을 따른다.

## 고정 입력과 실행

입력/gold/manifest는 `role-criteria-v1`이며 첫 호출 전에 동결했다. 기존 `notification-consent-v1`은 변경하지 않고 재실행했다. 기본 Gemini 3.8 Flash, OpenRouter, medium, temperature 0.5와 실제 prompt/input builder·schema·criteria parser·완료 검사를 사용했다. 설정·source/prompt/input hash와 provider 원문은 owner-only ignored runs에 보존했다.

Canonical runner는 `scripts/evalRoleNotificationConsent.ts`이다. dataset 인자를 추가하고 기존 notification 실행을 유지하면서 공통 Role 편집·완료 검사 adapter를 확장했다. DB executor 대신 in-memory 도구 효과를 사용하며 모델 provider 이외 네트워크를 차단한다. 구조 assertion과 원문 의미 검토를 구분한다.

## 결과와 보완

| 실행 | 구조 | 원문 검토 및 의미 |
| --- | --- | --- |
| Criteria r1 | 3/4; RC03은 adapter 문제 | 네 단위에서 먼저 작성·안내·대화 진행은 수행. 이미 같은 알림 설정을 저장하는 호출을 새 효과로 센 adapter 오류를 보존했다. 투자 경험의 상세 범위를 좁히는 문구는 추가 보완했다. |
| Notification r1 | 기존 6/6 | 설정 변경/무효과는 유지. 2개 답변에서 저장한 Criteria 안내가 빠져 공통 작성 계약을 보강했다. |
| Criteria r2 | 4/4 | 세 신규 직무의 선작성·안내·후속 대화와 기존 Role의 부분 수정 보존 확인. |
| Notification r2 | 선택 2/2 | Criteria 안내는 확인. 자격 기반 Criteria에 추가된 미제공 실무 범위를 발견해 원문 자격 계약을 Criteria에도 명시했다. |
| **Criteria r3, 최종 소스** | **4/4** | **전체 정의·도구 호출·답변 원문 검토 4/4.** 기준 선택/별도 승인 없이 저장·안내 후 discovery 또는 최종 등록 확인으로 진행했다. 기존 Role의 지역 수정에서는 Criteria를 추가하지 않았다. |
| Notification r3, 최종 소스 | 선택 1/1 | 앞서 상세 범위를 강화했던 N02를 재검토해 입력 범위 보존과 Criteria 안내 확인. 최종 소스의 전체 6개 재실행으로 주장하지 않는다. |

각 run의 `review.json`에 작성자 검토를 남겼다. 실패와 중간 run을 삭제하거나 최종 결과로 덮어쓰지 않았다.

## 코드 검증과 남은 한계

- Criteria 유효성/편집/완료 검사 10개, 생성 prompt 관련 9개, 직접 수정한 도구 계약 3개 검증 통과. 변경 경로의 ESLint와 diff whitespace 검사를 통과했다.
- 포함한 주변 계약 검사 전체는 50개 중 46개 통과, 4개 실패다. 이번 Criteria 변경 밖의 알림 담당자 오류 문구, 연락 상세 필드, 연락 follow-up enum assertion 불일치와 기존 전체 prompt 길이 제한이다. 이 실패들을 고치기 위해 관련 없는 구현이나 테스트를 수정하지 않았다.
- 전체 prompt의 17,000자 제한은 변경 전 공통 작성 계약을 주입해도 20,086자로 이미 초과했다. 이번 요구사항의 실제 대화 검증과 길이 검사의 실패를 구분한다.
- 작은 합성 표본과 Codex 원문 검토이며 독립 팀원 검토·실제 DB/권한/최종 활성화·Slack/메일·전체 순차 discovery E2E는 제외한다. 실제 후보자 fitness 매핑과 매칭 품질도 검증 범위가 아니다. 운영 배포 완료를 뜻하지 않는다.
