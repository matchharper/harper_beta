# Harper 제보 도구 검증 — 2026-10-13

미배포. report_issue를 회사 웹/Slack 기본 도구로 추가했다. 서버는 workspace view 권한을 확인하고 현재 작성자·대화·발화 참조를 붙인다. 기존 내부 문의 Slack 채널을 재사용한다. 같은 turn의 반복 호출은 결과를 재사용하며 stable client_msg_id를 보낸다. Slack 성공만 전달 완료로 설명하고 불명확한 결과는 자동 재시도하지 않는다. Slack의 무기한 exactly-once 보장은 주장하지 않는다. 프로필 철회·거절 lifecycle은 이 변경에 포함하지 않았다.

## 검증

- 관련 unit/contract 테스트 87/87, TypeScript 검사 및 diff whitespace 검사 통과.
- frozen v21, 실제 기본 모델 google/gemini-3.8-flash / OpenRouter / medium / temperature 0.5. 정밀 설정과 source/input hash는 각 run manifest에 보존.
- r1: tracked 삭제 파일의 source snapshot 읽기로 실행 시작 전 실패. runner가 현재 존재하는 source만 snapshot하도록 수정. 실패 디렉터리 보존.
- r2/r3: 4대화 실행 완료. 전달 미확인 답변의 첫 문장이 접수 완료처럼 읽힐 여지가 있어 전체 통과로 처리하지 않았다. 제보 helper의 안내 필드가 회사 tool serializer의 responseGuidance 계약과 달라 모델에 전달되지 않는 연결 결함을 발견·수정하고 serializer 회귀 검사를 추가했다.
- r4: 4/4 수동 의미 검토 통과. 웹/Slack 각 1회 전송, 미확인 1회 시도/확정 효과 0, 초안 요청 호출 0. 성공·미확인 경계와 미확인 원인 보존, 미승인 전송·허위 조사 약속 없음.

모든 입력은 합성이고 DB·메일·Slack 통신은 차단했다. 실제 Harper 팀원에게 제보를 보내지 않았다. 원문은 ignored owner-only runs에 저장한다. 모델 평가의 DB/도구 adapter와 transport는 합성이며 실제 인증·Slack 전달 E2E, 운영 평균, 독립 팀원 검토는 미검증이다.
