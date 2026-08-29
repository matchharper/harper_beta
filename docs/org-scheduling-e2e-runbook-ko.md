# Organization 인터뷰 스케줄링 실제 E2E Runbook

## 목적

회사 사용자의 Slack 요청부터 후보자 이메일 수신, 공개 일정 링크 선택, Google Calendar 일정과
Google Meet 생성, 양측 초대까지 실제 전달면을 검증한다.

## 사용자가 허용한 고정 테스트 범위

사용자는 2026-08-26에 아래 범위의 반복적인 실제 E2E 조작을 명시적으로 허용했다. 이후 같은
스케줄링 검증에서는 매번 동일한 허용 여부를 다시 묻지 않아도 된다. 사용자가 철회하거나 범위를
바꾸면 이 절을 함께 갱신한다.

- 회사: 회사명이 `Harper`인 internal Workspace
- 회사 전달면: 위 Workspace에 연결된 Slack의 테스트 가능한 허용 채널
- 후보자 계정: `khj605123@gmail.com`, `daniel@matchharper.com`
- 우선 후보자 계정: Codex Gmail 연결로 실제 수신 확인이 가능한 `khj605123@gmail.com`
- 허용 작업: 격리 규칙을 충족한 테스트용 role·recommendation·candidate
  stage·availability·meeting schedule·round·delivery 데이터 생성 및 수정, 연결 수락·종료, 실제
  후보자 이메일 발송, 공개 일정 링크 열기와 제출, Google Calendar 일정과 Google Meet 생성, 지정
  테스트 Gmail 계정에서의 답장
- 허용되지 않은 대상: 위 두 후보자 외 실제 talent, `Harper` internal 외 회사 Workspace
- 범위 밖: 배포, production service 재시작

이 허용은 E2E 검증에 필요한 상태 변경을 허용하지만, 불특정 사용자 데이터 변경이나 배포 권한으로
확장해서 해석하지 않는다. 실행 전에는 조회로 Workspace·후보자 이메일·수신자를 다시 확인한다.

## 실행 원칙

1. 로컬 변경을 검증할 때는 Slack App 자격 증명을 바꾸지 않는다. `z-test-harper`처럼 지정된 테스트
   채널만 전용 local worker target으로 잠시 라우팅하고 로컬 Next 서버로 처리한 뒤, 종료 전에 반드시
   실행 직전의 `worker_target`으로 되돌리고 local worker를 종료한다.
2. 외부 메일은 반드시 허용된 두 후보자 주소 중 하나로만 보낸다. 회사 참석자·CC도 Harper internal
   구성원인지 확인한다.
3. Slack 메시지와 테스트 title에는 실행 시각을 포함해 다른 테스트와 구분한다.
4. 승인 전, queued, sent, submitted, confirmed를 각각 구분해 관찰한다. UI 문구만 보지 않고 가능하면
   DB/outbox 상태와 Gmail 원문을 함께 대조한다.
5. 오류를 발견하면 같은 fixture를 무작정 반복하지 않는다. 멱등성·현재 상태를 먼저 확인하고 코드를
   수정한 뒤 새 식별자의 fixture로 재검증한다.
6. 실행이 끝나면 생성한 fixture, 남은 queue, Slack local routing과 실행 process를 확인한다. 이미 보낸
   Gmail과 감사 기록은 증거이므로 임의로 영구 삭제하지 않는다.
7. 표준 일정 선택 메일은 생성 즉시 보내지 않고 20분 뒤로 예약한다. 발송 전 후보자에게 더 전할
   내용을 요청하면 새 메일을 만들지 않고 같은 queue와 공개 링크의 본문을 수정하는지 확인한다.
8. Slack 대화 조작과 가시 응답 확인에는 Slack 플러그인을 우선 사용한다. 플러그인 메시지에 Harper를
   직접 멘션하면 일반 사용자 이벤트와 동일한 경로로 로컬 worker target에 전달된다.

## 최소 실제 시나리오

| ID | 시나리오 | 핵심 성공 기준 |
| --- | --- | --- |
| S1 | 가능 시간 없음 → Slack에서 반복 시간 설정 | 첫 요청에서는 단계만 저장하고 후보자는 그대로 둔다. 가능 시간을 답한 turn에서 추가 승인 없이 가능 시간 저장, 후보자 이동, 일정 선택 메일 예약까지 이어진다. |
| S2 | 기본 60분 일정 → 20분 예약 발송 → 한 시간 제출 | queue·메일·공개 링크가 각각 1개이고, schedule/round가 한 번만 confirmed 된다. |
| S3 | 여러 시간 제출 + 내부 추가 메시지 | Luna는 최대 한 번 호출되고 회사의 수동 선택 없이 하나가 확정된다. |
| S4 | 날짜 예외·다른 Harper 참석자 busy | 불가능한 시간이 후보자 선택지와 최종 submit에서 모두 제외된다. |
| S5 | 발송 뒤 availability/timezone 변경 | active link는 최신 slot/timezone을 사용하고 stale submit은 안전하게 거절된다. |
| S6 | 이메일 답장·취소·재조율 요청 | 현재 미지원 경계를 사실대로 안내하며 구현되지 않은 상태 변경을 주장하지 않는다. |
| S7 | 발송 전 후보자 안내 문구 추가 | 기존 queue의 예약 시각과 공개 링크를 유지한 채 본문만 수정되고 중복 delivery가 생기지 않는다. |
| S8 | 후보자 최종 시간 선택 | 링크를 열 때 회사 Calendar의 최신 busy를 먼저 제외하고, 선택 뒤 Calendar 일정과 Meet 링크가 만들어져 양측에 전달된다. |

## 실행 기록 형식

각 실행은 이 문서 아래에 계속 누적하지 않고 별도의 날짜별 검증 문서로 작성한다.

- 환경과 실행 시각
- Workspace, Slack channel, role/recommendation/schedule/round ID
- Slack 원문과 Harper 응답의 핵심 사실
- Gmail message ID, 수신자, 제목, public link state
- 후보자 제출 option과 최종 확정 시간
- DB/outbox 상태
- 발견한 문제, 수정, 재검증 결과
- 남아 있는 fixture와 정리 결과
