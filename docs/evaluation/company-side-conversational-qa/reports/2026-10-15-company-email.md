# 회사 이메일 답장 로컬 구현·검증

문서 기준: 2026-10-15. 최초 구현 뒤 사용자 요청으로 운영 DB만 적용했다. 웹 배포·runtime 활성화·실제 외부 메일 발송은 하지 않았다. 후속 적용과 로컬 통합 검증은 마지막 절에 기록한다.

## 구현과 실제 범위

기존 talent의 webhook → durable job → Queue → LLM → 고정 발송 인자 → provider checkpoint 경로에
회사용 alias 분기를 추가했다. 동일 이메일 주소의 company/talent 등록 여부로 추측하지 않고
`company+` namespace와 기존 alias의 회사·팀원·대화 소유권을 검증한다. 원본 발송의 별도 업무 LLM은 없다.
새 회사 메일 발송 entry point는 `src/lib/email/company.ts`의 `sendCompanyEmail`이다.

회사 답장은 기존 `runOrgAgentChat`·도구·현재 권한·회사 일반 대화·언어 설정을 재사용한다.
실행 중 재검증 callback과 원자적으로 저장된 source message를 넘기고, 원래 메일과 인용 이력은
새 명령이 아닌 참고 context로 제공한다. email surface는 최종 이메일 한 통을 작성하며 진행 메시지는
저장하지 않는다. 본문은 Markdown HTML/plain text로 렌더링하고 기존 회사 navigation 변환기로
실제 Workspace 링크를 만든다. 수신자의 임의 Reply-To와 CC는 회사 응답의 전달 대상이 아니다.

새 테이블은 없다. alias에 필요한 durable 수신 대상·원본 메일·대화 참조만 추가했다.
DB 제약은 audience/소유권 혼선과 발송 사건·수신 원문·최종 답변의 중복을 방지한다.
회사 작업은 runtime trigger로 legacy talent poller에서 격리하고, 같은 회사 대화의 이메일 실행을
원문 저장 시 직렬화한다. 문체·의미·시나리오 제약은 추가하지 않았다.

## 격리 검증

35개 관련 단위/SQL 검사 통과(이후 recipient 고정 검사 수정은 동일 묶음으로 재확인).

- 실제 migration을 PGlite에 적용: audience 소유권, legacy 격리, lease, 중복 원문/답변,
  같은 회사 대화 실행 충돌, 소속 해제 및 서버 전용 RPC 권한.
- 가짜 DB·회사 LLM·메일 transport를 사용하는 adapter 검사: 전달받은 alias·복수/mixed alias·만료 거절,
  LLM 이후 소속 해제 시 발송 차단, 발송 실패 후 작성본 재사용, provider 성공 기록의 무발송 복구.
- 동일 outbound key의 alias 재사용 및 본문 변경 거절. 등록된 회사 이메일로만 회신하며
  `In-Reply-To`·`References`·Reply-To를 보존하고 실제 company LLM에 원본 메일 context를 제공하는지 확인.
- 기존 talent 전달·renderer·inbound와 공통 company prompt/input 검사. 회사 private navigation은
  이메일 HTML과 plain text에서 실제 Workspace URL로 변환되는지 확인.
- `pnpm exec tsc --noEmit --incremental false` 통과. 저장소 전체 테스트·lint·운영 데이터 회귀는 실행하지 않았다.

테스트 준비 과정의 환경 변수 누락 및 동적 import mock 적용 실패는 fixture 설정과 명시적인
runChat dependency seam으로 수정했다. production DB나 provider를 대체 연결해 통과시키지 않았다.

## 기존 frozen v19 모델 재실행

입력·gold·manifest를 변경하지 않았다. canonical runner에 email response surface 선택과 manifest
기록만 추가했다. 실제 기본 company-side 모델 `google/gemini-3.8-flash` / OpenRouter / temperature 0.5와
기존 reasoning 설정, 합성 도구 adapter, 기존 외부 네트워크 제한을 사용했다.

| Run | 조건 | 전체 답변 직접 검토 |
| --- | --- | --- |
| `20261015-company-email-v19-r1` | email surface, 저장 언어 없는 경로 | 권한 의미 3/3, 부당 조회·권한 확대·허위 후보자 0. Owner 답변의 ‘멤버’ 표현은 팀원 용어 계약 미달로 기록 |
| `20261015-company-email-v19-r2` | 같은 입력, 저장 언어 ko 경로 | 권한 의미 3/3, 핵심 사실·권한 경계 유지. 과한 섹션 구분·불필요한 마무리 제안은 문체 한계로 기록 |

최초 실제 응답에 `role:`·`roles` 웹 전용 링크가 나와 이메일 renderer에 기존 회사 링크 변환기를 연결했다.
원본 모델 답변을 정규식으로 재작성하지 않았다. 각 run의 raw, source/prompt fingerprint, 설정,
`review.json`은 ignored runs의 owner-only 파일이다. 자동 실행 완료를 정성 품질 전체 통과로 간주하지 않는다.

## 남은 범위와 활성화 조건

- 운영 migration·웹 배포·runtime 활성화는 별도 승인된 배포 작업이다. 지금 live 동작으로 설명하면 안 된다.
- 기존 회사 메일 발송 지점을 일괄 전환하지 않았다. 앞으로 답장을 받을 회사 메일에서 새 helper를 사용한다.
- 실제 Resend 수신/발송·Queue·운영 권한 E2E는 미실행. 3개의 권한 대화는 이메일 품질 전체의 대표 표본이 아니다.
- 첨부 내용 추출은 미지원이며 이름·유형만 전달한다. 인용 제거 후 본문 한도는 32,000자다.
- 비동기 작업의 후속 안내는 기존 웹·Slack 경로다. CC 공동 대화, 모든 후속 결과의 이메일 자동 전달은 추가하지 않았다.
- provider 성공 checkpoint를 잃고 Resend idempotency 기간까지 지난 경우의 중복 위험은 기존 이메일 계약과 같다.


## 후속 요청: 운영 DB 적용 및 실제 로컬 통합 검증

사용자가 운영 DB 적용과 로컬 테스트를 명시적으로 요청했다. Harper 프로젝트
`zzojrniuppueizhnmqfd`의 실제 columns·function definitions·indexes·RLS·기존 작업을 먼저 대조했다.
회사 이메일 columns/functions/indexes가 없고, 신규 unique index와 충돌하는 행도 0건이었다.

- 운영 migration: `20261015103733` / `company_email_replies`.
  로컬 파일 `20261015120000_company_email_replies.sql`과 같은 내용이며 timestamp가 다르다.
  재적용하지 않는다.
- 적용 뒤 columns, 두 unique index의 유효성, 작업 라우팅 trigger, 고정 search_path와
  RPC의 anon/authenticated 실행 불가·service_role 실행 가능을 확인했다.
- 존재하지 않는 작업을 RPC에 전달한 무쓰기 검사는 `email_runtime_lease_lost`로 차단됐다.
- 운영의 기존 reply 작업은 sent 1,390 / failed 25 / skipped 58, 모두 legacy로 유지됐다.
  회사용 alias는 0건이며 기존 사건 재발송·runtime 전환·프로덕션 fixture 생성은 없었다.
- 보안 advisor의 관련 항목에는 기존 `set_email_reply_jobs_updated_at` search_path 경고가 남아 있다.
  이번에 추가한 함수의 경고는 없었으며 범위 밖 함수는 변경하지 않았다.

로컬 PGlite/adapter/inbound/renderer/기존 talent delivery 검사 22개를 다시 실행해 모두 통과했다.
그 뒤 실제 로컬 Supabase(`127.0.0.1:55431`)에 migration을 적용하고, 별도의 합성 계정·Workspace로
`sendCompanyEmail → ingestResendInboundEvent → processEmailRuntimeMessage → runOrgAgentChat →
최종 메일 capture`를 직접 실행했다. LLM을 모의 대체하지 않았으며 기본
`google/gemini-3.8-flash`를 호출했다. Resend transport만 로컬 capture로 대체하고 네트워크는
loopback 및 모델 provider로 제한했다. 웹 3000번 포트의 다른 실행 프로세스는 건드리지 않았다.

같은 주소를 company/talent 양쪽에 등록했지만 회사 메시지 2개(수신·답변)만 생성됐고,
reply job의 `talent_id`는 null, 상태는 sent였다. 최초 발송 재시도는 같은 주소·발송을 재사용했고,
완료된 reply job 재실행 시 추가 모델 호출·발송은 0건이었다. Reply-To와 In-Reply-To도 유지됐다.
모델 provider 호출 2건은 서비스 예시용 embedding과 답장 completion이며, 외부 실제 이메일은 0통이다.

실제 질문:
> 이 메일에 답장하면 Harper와 채용 이야기를 이어갈 수 있는 건가요? 지금은 질문만 확인하고 싶어요. 채용이나 후보자 연락은 시작하지 말아 주세요.

실제 답장:
> 네, 맞아요. 이 메일에 편하게 답장해 주시면 저와 계속 채용 관련 대화를 나누실 수 있어요.
>
> 말씀해 주신 대로 지금은 채용 진행이나 후보자 탐색·연락 같은 작업은 일절 시작하지 않으니 안심하셔도 괜찮아요.
>
> 앞으로 채용 기준이나 역할 설정, 후보자 검토 등 궁금한 점이나 의논하고 싶은 내용이 생기면 언제든 이 메일로 말씀해 주세요.

전체 답변을 읽어 질문의 답, 미실행 요청 보존, 자연어 후속 회신 가능 여부를 확인했다.
테스트에는 Role을 생성하지 않았다. 종료 후 테스트 Auth 사용자·Workspace·회사 alias·회사 reply job이
각각 0건임을 확인했다. 원문 결과·렌더링 HTML·로그·일회성 실행기는 ignored
`.local/company-email-smoke/`의 owner-only 파일로 보관했다.

첫 로컬 실행에서는 오래된 DB에 `company_internal_roles.team_id`가 없어 멈췄다.
기존 팀 컬럼 이관과 role matching schema migration 2개를 로컬에만 적용한 뒤 재실행했다.
성공한 실행에도 선택적인 matching history reader는 로컬의 `scheduled_role_ids` 부재 경고를 남겼다.
이번 문의는 추천 이력을 요구하지 않아 답장 경로는 완료됐지만, 추천 이력 조회 전체의 로컬 E2E를
검증한 것은 아니다. 이 제한을 숨기거나 production에 추가 migration을 적용하지 않았다.

웹·Worker 배포와 이메일 runtime 활성화는 하지 않았다. 따라서 팀원용 Notion 문서를 live 기능으로
갱신하지 않았다. 실제 Resend 수신 webhook 서명·외부 발송과 Vercel Queue 전달은 이번 로컬 검사 범위 밖이다.
