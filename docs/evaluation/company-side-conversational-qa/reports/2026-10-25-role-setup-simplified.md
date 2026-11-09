# 웹 Setup 공개 역할 정보 작성 단순화 — 2026-10-25

로컬 변경이며 배포하지 않았다. `/org/new` 첫 입력 및 역할 정보 편집은 `ROLE_SETUP_SYSTEM_PROMPT`를 그대로 사용한다. 공개 JD 작성·저장·결과 설명이 목적이며 Brief 질문·보상 확인·참고 인물·알림 선택 지시가 섞이지 않는다. 동일 회사 공고와 웹 자료는 일반 조회 도구로 참고한다. 공개 필드 저장, URL 열기, 웹 검색, 다른 역할 조회 네 도구를 제공한다. `descriptionSourceResearch` 상태는 제거했다.

역할 작성 loop의 도구 호출 10회/반복 10회와 출력 토큰 상한을 제거했다. 기존 기본 상수 4,800은 Gemini에서 공통 helper에 의해 실제 8,192로 올라갔다. 새 요청은 출력 토큰 필드를 지정하지 않으며 OpenRouter 경로의 공통 request builder도 추가하지 않는다. provider/context 한도와 요청 취소는 별개다. Finalize는 저장된 알림·담당자를 우선하며 없으면 사용 가능한 첫 채널 또는 이메일과 현재 팀원을 기본값으로 표시한다.

## 실제 모델 확인

- 입력/gold: 변경 없이 동결한 `role-setup-v1` RS01·RS02, 기존 `role-criteria-v1` RC04.
- 모델: `google/gemini-3.8-flash`, reasoning low. 실제 시스템/context builder·도구 schema, 합성 조회/저장 adapter. DB·외부 발송 없음.
- `2026-10-25-setup-simplified-r1`: 구조 2/2. RS01이 확인하지 않은 React/TypeScript 등 자격·우대 조건을 작성하여 의미 gate 실패. 출력 원문을 보존했다.
- `2026-10-25-setup-simplified-r2`: 같은 입력으로 구조·작성자 의미 검토 2/2. RS01은 회사 공고를 조회해 충분한 업무 설명과 알려진 근무지를 저장하고, 확인되지 않은 자격 조건은 만들지 않았다. RS02는 주어진 요구 수준과 원격/풀타임을 보존했다. 질문·알림·활성화·비공개 기준 쓰기 없음.
- `2026-10-25-setup-edit-compat-r2`: RC04 구조·의미 1/1. 근무 지역만 변경하고 원문과 나머지 정보를 보존했다.
- 고정 입력과 gold, source/prompt hash, 전체 응답과 도구 효과, review는 registry 및 ignored owner-only runs에 보존한다. 이전 compatibility r1도 삭제하지 않았다.

## 코드 확인과 한계

Setup context/schema/시스템 연결 표적 검사 3/3. 변경 파일 lint 오류 없음(기존 React 경고 4개). TypeScript 검사는 범위 밖 기존 오류 3개(OpportunitySwipeRow.test.tsx, jobTitleSimilarityServer.test.ts, slackCandidateWorkObject.server.ts) 때문에 전체 통과하지 못했다. 변경 경로 타입 오류는 없었다.

소규모 합성 작성자 검토로 독립 평가·실제 검색 품질·DB/브라우저 E2E·운영 지연은 검증하지 않았다. 참고 자료를 바탕으로 업무를 구체화하는 모델의 가정은 남는다. RS01의 칸반 보드 업무와 RS02의 worldwide 같은 표현은 실제 회사 사실로 별도 검증된 내용이 아니며 사용자 검토 대상이다. 이번 gate는 새 hard requirement·복지·효과를 꾸미는 문제와 공개 역할 정보 작성 흐름에 집중한다. 문자열 차단이나 답변 후처리는 추가하지 않았다.

## 후속: JD 요약 응답 제외

사용자 요청으로 마지막 답변 지침만 조정했다. 작성·수정 완료를 짧게 알리고 오른쪽에 표시되는 JD를 요약·반복하지 않으며, 자료나 가정은 검토에 필요한 경우만 덧붙인다. 기존 frozen RS02를 `2026-10-25-setup-short-reply-r1`로 실제 모델 재실행하여 저장 효과와 전체 JD/최종 답변/도구 trace를 확인했다. 구조·작성자 의미 검토 1/1이며 JD 내용은 유지되고 답변은 짧은 완료 안내였다. 일반적인 패널 검토 안내 꼬리말은 남아 있어 문구 자체의 보장은 아니다. 합성 adapter·로컬 미배포이며 나머지 한계는 위와 같다.
