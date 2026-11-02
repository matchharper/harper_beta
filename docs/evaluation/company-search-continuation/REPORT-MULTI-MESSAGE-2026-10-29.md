# 다중 메시지 변경 후 확인 — 2026-10-29

로컬 구현이며 운영 DB 적용·웹 배포는 하지 않았다. 일반 `/career`(지원 준비 포함)와 `/org` 채팅이 도구 단계의 사용자용 문장을 각각 저장하고 다음 문장을 새 메시지로 이어간다. 발화 여부는 원본 모델이 결정한다. Slack·이메일의 전달 횟수 계약과 별도 Role 생성 편집기의 실행 루프는 이번 변경 범위가 아니다.

## 저장 및 표시

Career는 provider completion의 도구 실행 직전에 `onAssistantMessage`로 메시지를 저장한다. loader와 terminal handoff도 같은 경계를 사용하며 도구마다 안내를 강제하지 않는다. SSE의 `continuing`은 메시지 확정과 전체 작업 완료를 구분한다. Org는 기존 progress 저장 경로를 반복 사용하며 순번을 보존한다. 이미 저장한 메시지의 작업 표시는 완료 상태로 남기고 새 작업 내역은 다음 메시지에 연결한다.

`20261029094911_company_chat_multiple_progress_messages.sql`은 웹 progress의 유일성을 run·phase·sequence로 바꾼다. 기존 인덱스로는 두 번째 progress가 충돌한다. 같은 순번 재저장, terminal 중복, Slack progress 중복은 계속 차단한다. 행·권한·정책은 변경하지 않는다. 운영 반영 전에 이 DB 변경이 필요하며 이번 작업에서는 적용하지 않았다.

## 확인

- 관련 코드 검사 12개 통과: OpenAI/Anthropic 메시지 확정 → 도구 → 다음 메시지, 도구 실패·사용자 질문 handoff, 양쪽 UI의 진행 유지, Career 저장 이력 재로딩·추천 중단·지원 카드 호환, 웹/Slack prompt 범위.
- 별도 PGlite 검사 통과: 기존 두 번째 progress 충돌 재현 → 새 migration 실행 → 세 progress와 terminal 저장; 이전 행 보존 및 각 중복 거부.
- 변경 경로와 그 의존성 타입 검사 오류 0. 실제 브라우저 로그인·운영 DB·외부 제출·발송은 검사하지 않았다.
- 처음 함께 실행한 기존 검사 중 Role 생성 prompt 문자열, web-action enqueue/silent 계약, 영어 Org 화면의 한국어 오류 기대값이 현재 로컬 구현과 맞지 않았다. 이번 변경과 무관한 해당 구현·기대값은 수정하지 않았다. 다중 메시지 검사는 별도 실행했다.

## 실제 모델의 기존 동결 사례

회사: `company-search-continuation/v1`, run `multi-message-20261029`. 기존 기본 Gemini·합성 adapter·provider 외 네트워크 차단으로 4/4 구조 gate 통과. 추가 등록·분석만 요청·후속 취소·적합 후보 없음의 실행 효과는 기대와 일치했다. 다만 전체 답변 수동 검토에서 conflict/good 같은 내부 평가 라벨, 과도한 집계 설명, 무후보 사례의 입력에 없는 월·수·금 일정 언급이 남았다. 취소 사례의 ‘채용은 잠시 보류해 두고’도 실제 상태 변경으로 오해할 수 있다. 따라서 전체 대화 품질 gate 통과로 주장하지 않는다. 이번 작업에서 별도 문체·검색 정책 수정으로 확대하지 않았다.

Career: `application-resume-first/v1`, run `2026-10-29T09-43-52-764Z`. 기존 Haiku와 in-memory 저장으로 이력서 read → ready_for_role, 전달 후 지원서 read → save_application의 두 턴 구조 gate 통과. 원본 보존·추가 질문 없음·외부 제출 없음. 최종 안내는 문서 링크, 이어지는 지원서 준비 및 검토·제출 요청을 설명했다. 항목을 다시 나열하는 장황함은 남는다.

두 canonical runner는 비스트리밍 기존 사례이므로 실제 모델이 여러 중간 메시지를 선택하는 빈도나 브라우저 전달을 입증하지 않는다. 순차 전달·보존은 실제 provider adapter를 모사한 streaming 검사와 실제 React hook 검사로 별도 확인했다. 원본 입력·출력과 source hash는 각 ignored owner-only run 폴더에 보존했다.
