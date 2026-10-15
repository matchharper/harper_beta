# 팀원 온보딩 Slack 환영 검증

2026-10-15, 로컬 구현·미배포. 기존 task 입력과 gold는 보존했다.

## 변경

온보딩 완료 요청에서 팀원의 이메일로 Slack 계정을 찾고, 연결된 활성 채널을 이름순으로 확인한다. 실제로 참여한 첫 채널에 멘션을 보내고 그 스레드에 안내를 전달한 뒤 Slack 링크를 반환한다. 참여 채널이 없으면 Calendar 조회·LLM 작성·발송·이동을 건너뛴다. 가입은 회사 입사가 아니라 기존 팀원의 Harper Workspace 진입이다.

안내는 기존 company-side 모델·system prompt·회사 사건 작성 adapter를 사용한다. 현재 팀원, 저장된 Calendar 연결, 설정 링크와 채널에서 공유 가능한 Role 이름·상태만 제공한다. 전체 회사 대화나 다른 팀원의 자료를 안내에 넣지 않는다. 발송은 기존 Slack 대화 기록과 메시지 식별자를 사용하며, 별도 환영 table·queue나 정성적 출력 후처리를 추가하지 않는다.

## 동결 모델 실행

Dataset/gold/manifest는 `member-welcome-v1`로 실행 전에 동결했다. Canonical runner는 `scripts/evalOrgOnboardingSlackWelcome.ts`, raw artifacts는 ignored `runs/2026-10-15-member-welcome-r1` 및 `runs/2026-10-15-member-welcome-r2`에만 저장했다. 모델은 기존 Slack 기본 `google/gemini-3.8-flash`, OpenRouter, medium reasoning, temperature 0.5다. 실행별 소스·prompt·input/gold/runner hash와 dirty revision을 기록했다.

초기 r1은 일부 안내에서 Workspace 가입을 회사 합류처럼 표현하고, 저장된 Calendar 연결만으로 일정과 가능한 시간 사용이 준비됐다고 과하게 설명했다. 초기 입력·출력을 보존하고, 같은 frozen dataset/gold에 새 run을 생성했다. 사실 context와 목적을 보완했으며 문구를 deterministic하게 재작성하지 않았다.

| 사례 | r2 전체 안내 의미 검토 |
| --- | --- |
| 한국어, 미연결 Calendar, 작성 중 Role | Workspace 환영·Calendar 링크/일정 준비 안내·초안 Role의 가벼운 다음 행동. 통과 |
| 한국어, 저장 연결 Calendar, 채용 중 Role | 재연결 요청 없이 설정 확인을 안내하고 현재 Role의 도움을 제안. 통과 |
| 영어, 미연결 Calendar, 빈 공유 목록 | Calendar 링크/가능 시간 설정, 조직에 Role이 없다고 단정하지 않음. 통과 |
| 영어, 저장 연결 Calendar, 종료 Role 및 권한 밖 Role | 종료 상태를 유지하고 비공개 Role을 제외. 재연결·작업 실행 주장 없음. 통과 |

Codex가 실제 채널 멘션·Slack 링크 렌더링을 포함한 전체 출력을 읽고 검토했다. r2는 4/4 의미 통과, critical failure 0이며 모델 작성은 약 4.4–11.9초였다. 독립 팀원의 blind review나 대표 운영 분포 검증은 아니다.

## 실행 및 한계

- 관련 단위/API 검사 32개 통과: 참여 채널 순서와 pagination, 읽지 못하는 채널 건너뛰기, 미참여 skip, Calendar 사실·Role 공유 범위, 멘션 후 스레드 순서, 부분 실패 시 이동 안 함, 완료 저장 후 발송 대기, 기존 완료/동시 완료의 기본 반복 보호.
- 두 초기 단위 실행은 모듈 초기화용 Supabase/OpenAI 환경값 부족으로 일부 파일을 실행하지 못했다. 이후 통신하지 않는 합성 환경값을 제공해 통과했다. 모델 평가에는 별도의 network guard로 DB·Slack 통신을 차단했다.
- 실제 DB는 기존 채널 및 Calendar 표의 필요한 조회 필드를 읽기 전용으로 확인했다. 상태·schema 변경이나 메시지 전송은 없었다.
- 변경 파일 lint의 신규 오류를 수정했다. 온보딩 화면의 기존 effect 경고는 보존했다. 전체 타입 검사에는 변경 범위 밖 `contactEvent.server.ts`의 `SlackCandidateCard.roleId` 오류가 남아 있다.
- 실제 운영 Slack 발송, 새 팀원의 OAuth/이메일 일치 및 브라우저 이동을 실행하지 않았다. Slack 이메일을 찾지 못하거나 발송에 실패하면 온보딩은 완료하고 웹에서 이어간다. 보통 완료 갱신과 기존 Slack 메시지 식별자 외에 강한 중복 방지·자동 복구 경로는 추가하지 않았다.
