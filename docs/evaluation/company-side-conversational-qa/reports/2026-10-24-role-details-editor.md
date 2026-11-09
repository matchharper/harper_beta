# 역할 정보 편집 화면 — 로컬 확인

- 날짜: 2026-10-24. 로컬 구현이며 배포하지 않았다.
- 실행: `20261024-role-details-rc04-r1`, 기존 `role-criteria-v1`의 RC04만 실행. 동결 입력과 gold 변경 없음.
- 모델: 현재 제품 기본 `gpt-6.1-sol`, reasoning high. 실제 prompt/input builder, 도구 목록과 문서 부분 편집 helper를 재사용했다.
- 화면 맥락: `role_details`. 기존 회사 LLM이 역할 수정과 근거 조회만 사용하며 역할 활성화·알림 설정·회사 전체 정보 변경은 이 화면의 도구 노출과 실행에서 제외한다.
- 결과: `update_role_draft`가 근무 지역만 부산으로 변경했다. Description·Hiring Brief·기존 Criteria·고용/근무 형태는 보존됐다. 알림 변경·등록 확인 요청은 0건. 전체 요청·도구 인자·저장 결과·최종 답변을 직접 검토해 해당 1건의 의미를 확인했다.
- 원문과 fingerprint: ignored `runs/20261024-role-details-rc04-r1/`의 owner-only manifest와 RC04 기록.

검증 범위는 합성 도구를 사용하는 1-turn 편집 사례다. 실제 운영 DB 저장·권한·웹에서의 LLM 왕복·다양한 Description 수정·등록 전체 흐름의 품질은 증명하지 않는다. 운영 자료·발송·DB 쓰기는 없으며 모델 provider 이외의 네트워크는 차단했다.

별도 UI 확인에서는 역할 정보 4:6 배치, 2열 정보, 공통 Description 편집기의 저장과 재진입, 참고 인물 입력창 1개, AI 요청 실패 시 입력 유지를 확인했다. 프리뷰의 실제 AI 호출 차단은 유지한다. 링크와 이유 전달 및 SSE 성공/실패 회귀 5개 통과.

전체 타입 검사에는 기존 Career mock·직무 유사도 fixture·Slack fitness 타입 오류 3건이 남아 있다. 기존 Role prompt의 길이 상한 검사(기존 25,190자 > 17,000자)와 영어 화면의 한국어 오류 문구 기대값 검사도 이번 변경 전과 맞지 않아 통과로 보고하지 않는다. 이 범위 밖 구현/테스트는 수정하지 않았다.
