# Organization 인터뷰 스케줄링 실제 E2E — 2026-08-26

## 범위

- Workspace: `Harper` internal Workspace
- Slack: `z-test-harper`
- 회사 사용자·후보자: `khj605123@gmail.com`
- 제외: Google Calendar event, Google Meet 링크 생성·발송, 배포
- 실행 뒤 role, recommendation, availability, schedule, round, queue, 임시 member, reply alias fixture는
  모두 제거했고 Slack channel worker target은 `production`으로 복구했다. 실제 Slack·Gmail 메시지는
  전달 증거로 남겼다.

## 실제로 따라간 시나리오

| # | 시나리오 | 결과 |
| --- | --- | --- |
| 1 | 가능 시간 없이 Slack에서 “바로 미팅 잡아줘” | 통과. 기본 60분 안과 설정 링크만 안내하고 candidate stage·schedule은 바꾸지 않았다. |
| 2 | 같은 thread에서 “매주 오전 7시부터 오후 8시까지 가능” | 최초 실패 후 수정·통과. 일정 답변이 `uncertain`으로 무시되던 router를 scheduling thread bypass로 보완했다. |
| 3 | 가능 시간 저장 뒤 재요청, 한 번의 확인 | 통과. 확인 전에는 여전히 연결 대기·schedule 없음, 확인 후에만 `connected`와 draft 한 건이 생겼다. |
| 4 | 회사 Inbox에서 추가 메시지 저장 | 통과. “가능하면 가장 빠른 시간”이 round와 후보자용 snapshot에 보존됐다. |
| 5 | locale 기반 이메일 preview | 통과. 후보자 locale에 맞는 한국어 제목·본문을 LLM이 만들었고 회사 사용자가 발송 전에 수정할 수 있었다. |
| 6 | durable queue와 실제 Gmail 수신 | 통과. queue가 `queued → processing → sent`로 바뀌고 Gmail 원문에서 수신자·제목·본문·선택 링크를 확인했다. |
| 7 | 후보자가 서로 다른 날짜의 세 시간을 제출 | 통과. Luna를 한 번 호출해 가장 빠른 시간을 골랐고 회사의 수동 선택 단계 없이 confirmed 됐다. |
| 8 | 제출 링크 재접속과 중복 승인 | 통과. 링크는 read-only 확정 화면만 보였고, Slack 승인 반복으로 두 번째 schedule이 생기지 않았다. |
| 9 | organizer busy와 다른 미팅 attendee busy | 최초 실패 후 수정·통과. JSONB attendee filter 직렬화 오류를 고쳤고 두 busy 범위가 모두 slot에서 빠졌다. |
| 10 | 초대 메일에 취소 답장 | Reply-To 누락을 수정·통과. 실제 Gmail 답장이 alias로 inbound event와 Career 대화에 들어왔다. 다만 schedule 취소 자체는 아직 자동화되지 않았다. |

## 발견해 수정한 문제

### 실제 Slack 문구의 링크와 organizer 이름이 불안정함

실제 `z-test-harper`에서 일정 조율을 네 turn 진행했을 때, company-side LLM 호출은 전부
`gpt-5.6-luna`였다. 이 과정에서 Web Markdown link가 Slack에 문자 그대로 보였고, Slack display
name은 `Daniel`인데 DB 이름을 사용해 회사 참석자와 후보자가 모두 `김호진`으로 보였다.

Slack에 게시하기 직전 HTTP Markdown link를 mrkdwn으로 정규화하고, 현재 요청자가 organizer이면
Slack display name을 attendee snapshot에 사용하도록 고쳤다. 다른 organizer를 편집 중일 때는 현재
편집자의 이름을 대신 쓰지 않는다.

재검증 중 내부 식별자 보정 LLM이 정상 스케줄 URL의 Workspace UUID를 `조직ID`로 바꾸는 문제도
발견했다. HTTP link 안의 식별자는 보정 검사에서 제외하고 본문의 raw 식별자는 계속 탐지하도록
경계를 고쳤다. 최종 Slack 화면에서 `스케줄 열기`가 실제 link로 렌더링되고 정확한 Workspace
URL을 가리키며, 참석자가 `Daniel (khj605123@gmail.com)`으로 표시되는 것을 확인했다.

- [처음부터 승인까지 진행한 실제 Slack thread](https://match-harper.slack.com/archives/C0BLRJ96GSJ/p1787680637096129)
- [수정 뒤 링크·참석자·Luna를 확인한 실제 Slack thread](https://match-harper.slack.com/archives/C0BLRJ96GSJ/p1787681269354459)

### Slack thread 답변이 무시됨

Harper가 가능한 시간을 요청한 같은 thread에서 사용자가 반복 시간을 답해도 일반 reply router가
`uncertain`으로 판정했다. 직전 Harper 메시지와 최신 사용자 메시지가 일정 맥락인 경우에는 모델
router를 거치지 않고 응답하도록 했다. 단순한 사람 간 대화에는 적용하지 않는다.

### attendee busy 조회가 preview를 500으로 만듦

`company_attendees`는 JSONB 배열인데 Supabase filter에 JavaScript Array를 넘겨 PostgreSQL array
literal로 직렬화하고 있었다. JSON 문자열로 전달하도록 고쳤다. 그 결과 현재 사용자가 다른 confirmed
미팅의 organizer이거나 attendee인 두 경우가 모두 busy로 수집되고 겹치는 slot이 제거됐다.

### 일정 초대 메일 답장이 Harper로 들어오지 않음

첫 실제 초대에는 `Reply-To`가 없어 Gmail 답장이 `hello@matchharper.com`으로 향했고 inbound worker에
들어오지 않았다. 발송 전에 Career conversation용 reply alias를 만들고 Resend `reply_to`와 outbound
email metadata에 함께 저장하도록 고쳤다. 수정 뒤 실제 답장이 `email_inbound_events`, reply job,
Career user message까지 이어지는 것을 확인했다.

같은 점검에서 이미 provider가 수락한 초대 job을 worker가 재수행할 때 round 복구 SQL이 다른
`company_talent_request` 분기에 잘못 들어가 있던 것도 발견했다. SQL을 meeting invitation의
`sent_at` 복구 분기로 옮겨, 재시도 시 queue와 round가 함께 `sent`로 수렴하도록 했다.

### 후보자 확정 뒤 회사 Slack에 최신 결과가 없음

선택 LLM의 `companyMessage`가 round snapshot에만 있었고 회사 Slack thread에는 남지 않았다. 그래서
뒤늦은 Slack 질문이 과거 “초안만 저장됨” 상태를 답할 수 있었다. 후보자 제출 transaction이 성공한
뒤 확정 메시지를 원래 회사 conversation의 마지막 canonical message로 넣고, 원래 Slack thread에도
round별 idempotency key로 한 번 공지하도록 보완했다. Slack 실패는 확정 transaction을 되돌리지 않고
canonical message는 유지한다.

## 아직 구현되지 않은 경계

1. 후보자의 취소 답장은 정확한 reply alias로 Career에 도착하지만 schedule을 `cancelled`로 바꾸거나
   회사에 취소를 통보하지 않는다. 실제 답장에서는 Career가 여러 기회를 구분하려고 재질문했고
   schedule은 `awaiting_talent`로 유지됐다.
2. 이를 해결하려고 Career LLM에 일정 변경 tool을 추가하지 않았다. 다음 구현은 reply alias와
   meeting round를 서버가 결정적으로 연결하고, 명시적 취소·재조율 의도만 전용 service/RPC가 처리하는
   방식이 우선이다. 범용 Career tool을 추가하려면 별도 제품 확인이 필요하다.
3. 후보자 제출 직후의 후보자 확정 이메일, 회사·후보자 재조율 round, 하루 뒤 reminder는 아직 없다.
4. Google Calendar busy sync, event, Meet 링크 생성과 양측 발송은 이번 범위에서 제외했다.

## 검증과 정리

- web targeted lint 및 meeting selection/slot/Slack router test: 통과
- Slack link, organizer name, response guard 단위 테스트 22개와 전체 TypeScript 검사: 통과
- worker meeting invitation queue test: 통과
- 실제 후보자 메일 2건 수신 및 두 번째 메일 Reply-To: 확인
- 실제 후보자 세 option 제출, Luna 자동 선택, one-time link: 확인
- organizer/attendee confirmed busy 두 범위: 확인
- 생성 DB fixture와 local Slack worker: 정리 완료
- Slack `z-test-harper` worker target: `production` 복구 확인
- `Harper Local` 테스트 앱의 channel membership 제거 확인
