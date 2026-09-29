# 회사 질문에 대한 후보자 회신 — 로컬 전체 경로 검증

2026-09-28, `local-full-stack-reply-v1`, run `20260928-local-full-stack-reply-r1`.

이메일과 Career 채팅에서 작성한 후보자 답변이 회사 대화로 전달되는 경로는 모두 정상 동작했다.
두 답변의 일정·근무 조건이 보존됐고 각각 한 번씩 전달됐다. 다만 Career 회신 직후 표시 문제와
로컬 링크 문제가 관찰되어 전체 사용 경험을 완전히 정상이라고 판정하지 않는다.

| 사례 | 실제 실행 | 확인한 회사 전달 내용 | 판정 |
| --- | --- | --- | --- |
| LOCALREPLY01 | 회사 초안 작성 → 같은 revision 승인 → 로컬 메일 회신 → 실제 이메일 worker → 회사 대화·테스트 Slack | 화요일 오후 2시 불가, 목요일 오전 11시 가능, 첫 대화 온라인만 가능 | 전달 성공. 회사 화면과 실제 Slack 앱에서 확인 |
| LOCALREPLY02 | 회사 초안 작성 → 승인 → 후보자 Career 채팅 → 원본 LLM의 `contact_company` → 회사 대화·테스트 Slack 발송 | 주 3일 서울 사무실 출근 가능, 수요일 재택 필요 | 전달 성공. 회사 화면과 Slack 전송 receipt 확인. Career 직후 표시는 문제 있음 |

## 실행 및 격리

- 기존 로컬 fixture에서 정상 Intro 요청과 후보자 이메일 수락으로 연결을 먼저 만들었다. 연결 상태를 직접 쓰지 않았다.
- 후보자·회사 팀원은 사용자가 허용한 계정만 사용했고, 프로필·Role·질문은 합성 데이터다. 계정 매핑과 원문은 ignored `runs/`에만 남겼다.
- 로컬 Supabase, 실제 로컬 앱, opportunity/email/web queue worker와 전용 Slack 앱을 사용했다. 운영 데이터·queue를 복사하거나 운영 worker를 호출하지 않았다.
- 시작·종료 doctor에서 로컬 marker, `productionFallback=false`, `productionQueuesCopied=false`와 모든 프로세스의 정상 상태를 확인했다.
- Role의 `testOnly`, 고정 fixture 이름, 정확한 `testTalentIds`를 확인했다. 마지막 fit 행은 0개였다.
- 질문 두 건의 후보자 발송과 답변 두 건의 회사 전달은 각각 delivery 1개, `sent`다. 테스트 중 중복 전달은 관찰되지 않았다. 재시도 replay는 이번 범위가 아니다.
- 질문·답변 전후 Role 원문, Intro, 추천 단계, 파이프라인 태그와 단계 변경 event는 같았다. 후보자 답변 activity event 추가는 정상 연락 기록이다.
- Career 연락은 connection 기준으로 전달된다. 이메일 답장은 원래 request에 연결됐지만 Career relay의 requestId는 null이다. Career 할 일은 연락 시간순으로 해소됐으며, 이를 request 상태를 강제로 바꿀 이유로 취급하지 않았다.

## 남은 문제

1. **Career 표시:** 채팅 회신 직후 방금 작성한 답변과 Harper 응답이 화면에서 사라지고 메뉴가 영어로 바뀌었다. 원문과 전달 완료 응답은 DB에 저장됐고 회사에도 도착했다. 새로고침하면 두 메시지가 다시 표시됐다. 원인은 이번 실행에서 확정하지 않았다.
2. **로컬 링크:** 질문 메일의 `Harper에서 답하기`와 회사 응답의 후보자 링크가 운영 주소를 사용했다. 이번 테스트는 로컬 로그인 경로를 이용하여 운영 페이지로 이동하지 않았다. 로컬 DB/worker 격리와 별개로 링크 격리는 미완료다.
3. **Slack 표시:** 회사 에이전트 요약에 후보자 링크와 Markdown 표기가 원시 문자열로 보였다. 앞선 relay 본문은 읽을 수 있고 의미도 보존됐다.
4. **응답 지연:** 두 번째 질문의 초안 작성에 UI 기준 약 6분 2초가 걸렸다. 한 Gemini 호출은 316.029초였다. 이후 승인·회신·전달은 완료됐다. 지연의 원인을 이번 실행에서 확정하지 않았다.
5. **후보자 완료 응답:** Career 완료 응답에 향후 회사 회신 알림을 약속하는 문장이 추가됐다. 전달 내용이 누락되지는 않았지만 완료만 짧게 인정하라는 tool 지침보다 넓은 표현이다.

## 검증 범위와 재현

메일 transport는 **capture**였다. 지정된 실제 Gmail 연결이 만료되어 실제 Gmail 수신·답장은 검증하지 않았다.
이메일 테스트는 실제 서명된 로컬 inbound webhook, 로컬 worker, DB와 UI를 통과했다. Slack은
실제 전용 테스트 채널로 보냈으며 첫 답변의 본문·요약은 Slack 앱에서 직접 확인했다. 두 번째는
회사 화면과 Slack API 발송 receipt까지 확인했다. 운영 배포·운영 안정성·Calendar 동작을 검증한 결과는 아니다.

입력과 gold는 실행 전에 동결했고 runtime prompt나 모델을 테스트에 맞춰 수정하지 않았다.
회사 agent/event는 `google/gemini-3.8-flash`, Career 응답은 `z-ai/glm-5.3-flash`를 사용했다.
원문, request/relay/queue 식별자, tool trace, 모델 사용량, source hash와 상태 비교는 owner-only
`runs/20260928-local-full-stack-reply-r1/`에 보존했다. runtime source hash는 실행 중에 수집했으며,
동결 시점 이후 runtime 수정은 없었다. 평가는 Codex의 비독립 수동 검토다.

재현은 [로컬 전체 스택 runbook](../../../local-full-stack-e2e-ko.md)과 `scripts/localE2e/stack.mjs`를
사용하고, 동결된 `local-full-stack-reply-v1.json`의 두 대화를 새 로컬 fixture에서 순서대로 진행한다.
현재 테스트 환경은 재사용할 수 있게 실행 상태로 유지했다. 배포나 운영 데이터 변경은 하지 않았다.
