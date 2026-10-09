# 로컬 Request Intro 통합 테스트

회사 웹/Slack → Request Intro → Opportunity Worker → 후보자 메일/채팅 → 수락 → 소개 메일·파이프라인 전이 → 이메일 회신을 현재 로컬 코드로 실행하는 환경이다. 운영 서비스 배포와는 별개다.

## 초대 없이 회사 첫 가입 테스트

회사에 소속되지 않은 첫 가입자는 기존 메일함의 `회사 담당자로 로그인`을 사용하지 않는다. 그 계정은 이미 Workspace의 팀원이므로 새 회사 가입 화면이 나오지 않는다.

일반 개발 서버가 3000 포트를 사용 중이면 먼저 종료한 뒤 실행한다. 기존 로컬 Supabase와 Auth 개발 메일함이 켜져 있어야 한다.

```sh
pnpm local:company-signup
pnpm local:company-signup status
pnpm local:company-signup stop
```

이 명령은 운영 DB 설정을 제외한 로컬 환경으로 웹 앱만 실행한다. Auth 사용자·초대·회사·Role을 미리 만들지 않으며 Worker, Slack, 실제 이메일 발송, 결제를 시작하지 않는다. 로컬 DB의 격리 표시와 가입 기능을 먼저 확인하고, 기존 데이터나 스키마를 초기화하지 않는다.

1. 시크릿 창에서 `http://localhost:3000/company`를 열고 **무료로 시작하기**를 누른다.
2. 명령에 표시된 새 회사 이메일을 입력해 로그인 링크를 요청한다. 이 주소는 로컬 테스트용이며 실제 메일함이 필요 없다.
3. 같은 시크릿 창의 다른 탭에서 `http://127.0.0.1:55434`를 열고 해당 주소로 온 인증 메일의 링크를 누른다. 회사 가입 페이지로 돌아온다.
4. **Workspace 만들기**를 누르고 이름·직함, 회사 정보, **Free** 요금제를 선택해 완료한다. 가상 도메인이라 회사 검색 결과가 없으면 직접 입력한다. Slack 연결은 건너뛴다.
5. 다시 완전히 처음부터 보려면 로그아웃하고 명령을 다시 실행한다. 매번 다른 회사 도메인을 제안하므로 이전 회사의 팀원 초대 화면으로 이어지지 않는다. 이전 테스트 기록은 보존된다.

Google OAuth·유료 결제·Slack 연결은 이 가입 테스트 모드의 검증 범위에 포함하지 않는다. 공개 회사 정보 검색은 설정된 Exa 키가 있으면 실행되며, 검색 실패 시에도 수동 입력할 수 있다. 일반 개발 모드로 돌아가려면 `pnpm local:company-signup stop` 후 `pnpm dev`를 실행한다. 상태와 로그는 ignored `.local/full-stack/private/company-signup/`에 저장한다.

## 시작과 종료

`harper_beta`에서 실행한다.

```sh
pnpm local:e2e up
pnpm local:e2e doctor
pnpm local:e2e new-round    # 이전 DB/메일을 파일로 보관하고 새 시나리오로 재시작
pnpm local:e2e down
```

`down`은 먼저 Socket Mode와 Worker의 새 작업 수신을 멈춘다. 실행 중 작업이 있으면 앱·메일·DB는 유지한 채 drain 상태를 알려준다. Worker가 종료된 후 `down`을 한 번 더 실행한다. 강제 종료와 운영으로의 자동 전환은 없다. DB와 메일함은 보존된다. `up`은 이미 살아 있는 프로세스를 중복 실행하지 않는다.

웹 앱은 3000 포트 하나에서 실행한다. 일반 `pnpm dev`가 이미 3000을 사용 중이면 종료한 뒤 `pnpm local:e2e up`을 실행한다. 이 명령은 다른 앱이 3000을 점유하면 오류를 내며, 로컬 DB를 연결한 앱으로 조용히 대체하지 않는다.

| 구성 | 위치 |
|---|---|
| 테스트 로그인·메일함·회신 | http://127.0.0.1:3211 |
| 회사 웹 | http://localhost:3000/org |
| 후보자 웹 | http://localhost:3000/career |
| 로컬 Supabase Studio | http://127.0.0.1:55433 |
| Auth 개발 메일함 | http://127.0.0.1:55434 |
| Slack | `z-test-harper` 채널의 **Harper Local** 앱 |

메일함의 `회사 담당자로 로그인`은 `daniel@matchharper.com`, `후보자로 로그인`은 `khj605123@gmail.com`에 대응하는 로컬 Auth 링크를 생성한다. 소개 이메일의 두 사람을 구분하려면 회사 요청은 회사 담당자 계정에서 시작한다. 같은 브라우저에서 로그인 계정을 바꾸거나 브라우저 프로필을 두 개 사용한다. 운영 계정의 세션·비밀번호와는 별개다.

두 계정의 표시 이름은 각각 **박서윤**, **김하준**이라는 가상 이름이다. 실제 수신자의 이름·경력을 뜻하지 않는다. 이름에 “후보자/담당자”를 넣으면 현재 소개 메일의 역할 호칭 검증과 충돌하므로 쓰지 않는다.

현재 `z-test-harper`는 **비공개 채널**이다. 멘션에는 `app_mention`/`app_mentions:read`, 멘션 없는 스레드 답장과 이력 읽기에는 **`message.groups`/`groups:history`**가 필요하다. 공개 채널용 `message.channels`/`channels:history`만으로는 부족하다. Harper Local 앱의 이벤트 구독과 OAuth 권한을 확인하고 권한 변경 시 앱을 재설치한 뒤 `pnpm local:e2e:seed`로 로컬 토큰/권한 정보를 갱신한다. 운영 Harper 앱은 변경하지 않는다.

## 반복할 테스트

1. 메일함에서 회사 담당자로 로그인한다. 회사 화면의 최신 `[Local E2E]` Role을 연다.
2. 인박스 → `먼저 제안 가능한 후보`에서 `Intro 요청`을 누른다. 회사가 관심을 가진 이유를 입력하고, 소개 메일 회사 수신자는 `daniel@matchharper.com`으로 지정한다.
3. 메일함에서 생성된 **전체 본문**을 읽고 `/career`의 안내와 대조한다. 큐 완료만으로 글의 품질을 통과 처리하지 않는다.
4. 메일함에서 후보자로 로그인해 후보자 화면에서 수락하거나, 메일함의 회신 폼에서 후보자 주소로 수락 답장을 보낸다. 메일 회신 폼은 서명된 로컬 inbound webhook → 실제 이메일 Worker를 통과한다. 수락 이후의 제품 동작은 현재 로컬 웹 코드·SQL을 따른다.
5. 회사 화면의 파이프라인과 소개 메일의 수신자·내용을 확인한다. 추가 질문·답장으로 양측 연락의 후속 처리를 확인한다.
6. Slack에서는 **`@Harper Local`**을 멘션한다. 이 앱이 만든 스레드에서 이어서 답장한다. 운영 Harper 앱을 멘션하거나 기존 운영 스레드에서 테스트하지 않는다.
7. `doctor`와 private 로그에서 Worker 결과를 확인한다. 다음 테스트는 `new-round`로 시작한다. Worker를 drain한 뒤 이전 업무 DB·메일·fixture를 `private/rounds/<시각>/`에 보관하고, 로컬 업무 데이터를 초기화해 새 ready 제안을 만든다. Auth 계정과 스키마는 유지한다. 이전 대화가 다음 테스트의 LLM 문맥에 섞이지 않는다. 다시 로그인하고 Slack도 새 최상위 메시지로 시작한다.

초기 ready 제안은 테스트 시작점을 위한 fixture다. 실제 검색 LLM이 이 후보자를 선발했다는 증거가 아니다. 후보자 경력과 Role은 합성 데이터이며, 운영 후보자 이력은 복사하지 않는다. Role은 삽입 전부터 `information.testOnly=true`, `testFixture=local-full-stack-v1`, 정확한 `testTalentIds`를 가진다. 예약 검색 Scheduler는 실행하지 않는다. 일반 추천·fit 경로의 test-only 차단도 그대로 유지한다.

## 실제 Gmail로 받기·답장하기

기본 `capture` 모드는 실제 메일을 보내지 않는다. 실제 메일 테스트는 다음 순서로 전환한다.

```sh
pnpm local:e2e gmail-connect
# 출력된 링크를 열어 khj605123@gmail.com으로 인증한다.
pnpm local:e2e mail-mode gmail
pnpm local:e2e new-round
```

현재 테스트 주소는 `khj605123@gmail.com`, `daniel@matchharper.com` 두 개뿐이다. To/CC/BCC가 이 범위 밖이면 발송을 거절한다. Gmail 모드는 실제 Resend 발송을 사용하고 Reply-To 및 연결 캡처 주소를 `khj605123+harperlocal.<환경>.<식별자>@gmail.com`으로 바꾼다. 회사·후보자가 답장하면 15초 간격의 브리지가 **생성한 정확한 별칭으로 온 메일만** 가져와 로컬 webhook으로 보낸다. 일반 받은편지함 전체를 동기화하지 않는다.

운영의 `reply.matchharper.com`으로 회신을 보내지 않으므로 운영 Resend webhook/이메일 Worker가 로컬 회신을 가져가지 않는다. 별칭과 처리한 Gmail message ID는 재시작 후에도 유지된다. Gmail 연결이 만료되면 실패를 표시하며 운영 수신 경로로 바꾸지 않는다. 다시 `gmail-connect`로 인증하면 된다.

```sh
pnpm local:e2e mail-mode capture
```

이 명령은 이후 새 메일을 로컬 보관 모드로 바꾼다. 이미 실제 발송한 메일은 회수하지 않는다. Gmail 모드의 실제 OAuth·수신·회신은 계정 인증 이후 별도로 검증해야 한다. 현재 브리지는 본문/헤더를 지원하고 Gmail 첨부파일 다운로드, Resend 운영 webhook 자체, Google Calendar 연동은 이 테스트 범위에 포함하지 않는다.

## 격리 구조

- 전용 Colima profile `harper-e2e` 안에 별도 Supabase DB/Auth/Storage를 실행한다. Docker의 전역 context는 변경하지 않는다. 운영 DB 행·큐·토큰을 복제하지 않는다.
- 앱, Opportunity Worker, 이메일/contact Worker, Slack Worker, 웹 액션 큐 poller가 모두 이 로컬 DB를 사용한다. 로컬 Slack 이벤트와 웹 액션을 Vercel Queue에 발행하지 않는다.
- 런처는 기존 환경 값을 비운 뒤 필요한 모델 키·Harper Local 앱 키만 허용한다. 앱/Worker에는 실제 Resend 키 대신 로컬 메일 transport 키를 준다. 실제 메일 키는 수신자 제한을 수행하는 브리지에만 있다.
- DB·앱·Supabase·메일 주소가 loopback이 아니면 시작하지 않는다. DB 내부의 로컬 marker, test-only Role, fit 누출 여부, Slack target, Cron·HTTP extension 부재도 확인한다.
- Python의 기존 `localhost → matchharper.com` 변환과 `worker.env` 덮어쓰기는 명시적인 로컬 모드에서 차단한다. 운영 모드는 기존 동작을 유지한다.
- 운영 Ops 채널용 범용 `SLACK_BOT_TOKEN`은 넘기지 않는다. Workspace에 연결된 Harper Local 봇을 통한 회사 측 Slack만 테스트하며, 운영 내부 알림 채널 발송은 제외한다.
- 기존 `Harper Slack - LOCAL.command`는 운영 DB 채널 routing을 바꾸는 별도 방식이다. 이 통합 환경과 함께 실행하지 않는다. 여기서는 운영 채널 routing을 수정하거나 종료 시 production target으로 복원하지 않는다.
- Slack 이벤트는 앱·채널뿐 아니라 현재 시나리오의 시작 시각으로 제한한다. 초기화 이전 이벤트의 재전송과 오래된 스레드 답장은 ACK 후 제외한다.

## 최초 설치 / 다시 만들기

Apple Silicon macOS, Node/pnpm, Docker CLI, Python 3.11+, PostgreSQL 18 클라이언트(`pg_dump`, `pg_restore`)가 필요하다. `harper_worker`는 `harper_beta`와 같은 상위 폴더에 둔다.

```sh
node scripts/localE2e/bootstrap.mjs
# 최초에는 schema snapshot이 없다는 안내에서 멈춘다.
.local/full-stack/venv/bin/python scripts/localE2e/capture_schema.py
node scripts/localE2e/bootstrap.mjs
pnpm local:e2e up
```

bootstrap은 공식 배포본의 SHA-256을 확인해 ARM Colima/Lima를 프로젝트의 ignored runtime 폴더에 설치한다. schema capture는 읽기 전용 세션으로 public 스키마만 가져온다. `worker.env`에 설정된 SSH source는 DB 주소 조회에만 사용하고, 런타임은 해당 주소를 상속하지 않는다. bootstrap은 이미 marker가 있는 DB를 덮어쓰지 않는다. 기본 Supabase 스키마와 확장에 public 테이블·뷰·RPC·트리거·RLS·기존 ACL을 복원한다. 클라우드 superuser의 미래 객체 기본 ACL은 제외하며, DB의 외부 HTTP extension과 Cron 스케줄은 활성화하지 않는다.

로컬 코드가 스냅샷보다 앞선 SQL을 요구할 때는 **정확한 파일을 지정해 로컬에만** 적용한다. 마이그레이션을 자동으로 전부 재생하지 않는다.

```sh
pnpm local:e2e migrate 20260928084316_optional_connection_process_stage.sql
```

현재 작업 트리의 Intro 요청은 위 SQL을 필요로 한다. 2026-09-28 환경에는 로컬 적용했다. 마이그레이션 명령은 로컬 marker를 확인하고 파일명·내용 hash를 별도 local history에 기록한다. 같은 파일이 적용 후 변경되면 자동 재적용하지 않는다.

필수 provider 설정은 `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`다. `.env.local` 또는 owner-only `.local/full-stack/private/providers.json`에 둔다. 실제 메일에는 `.env.local`의 Resend/Composio 설정과 별도 Gmail 인증이 필요하다. provider 모델 호출에는 실제 사용량이 발생한다.

## 상태·로그

모든 상태·DB snapshot·메일 본문·실행 로그는 ignored `.local/full-stack/private/` 안에 보관한다. 이 폴더나 로그인 링크를 Git에 추가하지 않는다.

- `app.log`, `opportunity.log`, `email.log`, `slack.log`, `socket.log`, `web-queue.log`, `mail.log`
- `fixture.json`: 현재 테스트 식별자, `round-*.json`: 이전 테스트 식별자
- `mailbox.json`: 로컬 메일과 별칭·수신 중복 방지 기록
- `rounds/<시각>/database.dump`, `mailbox.json`, `fixture.json`: 이전 시나리오 전체 업무 데이터와 메일. `new-round` 이후 옛 메일에 답장해도 새 시나리오로 수집하지 않는다.
- `pnpm local:e2e doctor`: 프로세스/HTTP 상태와 로컬 DB 큐 상태

프로세스가 실행 중인 것과 사용자에게 메일·응답이 전달된 것은 별도로 확인한다. 모델 오류는 로그와 해당 큐 상태를 함께 보고 원인을 고친다. 실패를 숨기기 위해 테스트 데이터를 지우거나 성공 상태로 바꾸지 않는다.

## 2026-09-28 구성 중 확인한 사항

- 브라우저 로그인·Role 조회, 실제 로컬 Opportunity Worker의 메일/카드 생성, 로컬 메일 회신 webhook → 이메일 Worker → 후보자 수락 → `연결됨` 전이와 소개 메일 생성을 확인했다.
- 가상 이름으로 실행한 시나리오에서 Intro의 `connected`, 추천의 `feedback=like` 및 지정한 다음 단계, 회사/후보자 두 주소가 포함된 소개 메일을 확인했다. 연결 후 양측 회신 두 건도 `org_intro_reply`로 저장되고 스레드 `message_count=2`가 되었다. 이 수신은 기록만 하는 기존 경로라 큐 상태가 `skipped`, 이유가 `org_intro_capture_saved`인 것이 정상이다.
- 위 성공 시나리오의 DB·메일은 `private/rounds/20260928T092735Z/`에 보존했다. 전달 시점에는 새 `ready` Intro로 초기화하고 7개 로컬 프로세스를 실행해 두었다.
- 실제 Slack의 Harper Local 멘션이 Socket Mode → 로컬 DB 큐 → 로컬 Slack Worker/Next → Slack 답장으로 이어지는 것을 확인했다.
- 비공개 채널의 멘션 없는 스레드 답장은 설치된 로컬 앱의 `groups:history` 권한과 `message.groups` 구독 추가 후 검증이 남아 있다. 현재 멘션은 응답하지만 이전 스레드 이력 조회는 `missing_scope`로 제한된다.
- 수신자 allowlist 밖 발송은 거절되었고, 원격 DB/앱 URL·실제 메일 API 키·production Slack target 설정 거부 검사가 통과했다.
- 실제 Gmail OAuth/수신 왕복은 사용자 인증 후 확인해야 한다. 연결이 만료된 상태에서는 `gmail` 모드를 활성화할 수 없다.
- 이전 연결 이력을 남긴 채 같은 회사의 새 Role을 요청하면, 새 Intro 메일에 이전 수락 문맥이 섞이는 경우를 관찰했다. 이 교차 Role 동작은 제품 회귀로 별도 확인할 항목이다. 당시 DB/메일은 `private/rounds/20260928T091542Z/`에 보존했다. `new-round`의 독립 시나리오 초기화가 이 제품 동작을 수정하는 것은 아니다.
- 기존 `webActionTurnContract.test.ts` 중 1개는 현재 작업 트리의 별도 company capability refactor와 맞지 않는 `getEnabledOrgAgentTools(args.surface)` 소스 assertion으로 실패한다. 나머지 5개와 이번 격리 검사, 수정한 TypeScript 파일의 ESLint는 통과했다. 이 작업에서 해당 테스트나 company-side prompt를 바꾸지 않았다.
