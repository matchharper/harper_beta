# 개별 프로세스 종료 안내 선택

2026-10-16 로컬 구현, 미배포. 운영 DB 변경·실제 후보자 연락 없음.

## 변경

- `/org` 공통 종료 다이얼로그에서 Harper의 별도 종료 안내를 선택한다. 기본은 기존처럼 켜짐이며 후보자 화면의 종료 상태는 별도로 유지한다.
- company-side LLM의 prepare/decide/move 도구가 `notifyCandidateOnClosure`를 받는다. 종료 확인에 선택값을 보존하고 다른 선택으로 실행하려면 기존 확인 계약을 다시 따른다. 실행 인자 생략 시 확인한 선택을 유지한다.
- 기존 `talent_progress.metadata`에 boolean을 저장한다. Worker가 현재 종료 사건의 명시적 false를 제외한다. 필드 없는 기존 사건은 기존 동작을 유지하고, 이전 종료의 false는 새 종료에 상속하지 않는다.
- 발송 직전 기존 live delivery guard가 같은 대상 조회를 다시 사용하므로 준비된 종료 안내도 현재 대상에서 제외되면 발송하지 않는다. 다른 추천/연락 경로, 종료 상태, 기존 유예 기간은 유지한다. 별도 schema migration은 없다.

## 검증

- Worker 대상 선정/행동/발송 전 검사 33개 통과. false/true/기존 필드 없음, Role 종료와 중복, 새 종료 주기, 준비된 메일 차단 포함.
- 웹 tool schema/결과 projection 83개 통과, 새 Slack 안내 제외 테스트 1개 통과.
- 실제 Gemini frozen v35 2대화·4턴: `20261016-closure-choice-r1`, 전체 원문과 효과를 읽고 2/2 의미 확인. false/true가 각각 실제 tool call과 합성 종료 효과에 유지된다. 기존 v6 fixture와 v35 입력/gold/hash 보존. 원문/도구/모델 설정/소스는 ignored owner-only run에 저장.
- 처음 실행한 Slack 테스트 파일에는 이번 변경 밖의 기존 채용 시작 문구 기대 불일치 1건이 있다. 수정하지 않았다.
- TypeScript 검사에서 기존 `src/lib/org/automaticFollowupFeed.test.ts:122`의 unknown 타입 오류 1건이 남는다. 변경 경로 오류는 없다.

## 한계

LLM 평가는 합성 executor이며 운영 DB 저장·권한·Slack/메일 transport와 브라우저 렌더링 E2E를 증명하지 않는다. 독립 팀원 검토나 운영 분포 평가도 아니다. 실제 선택을 운영 메일에 반영하려면 웹과 Worker 모두 해당 변경을 배포해야 한다. 배포 요청이 없어 배포하지 않았다.
