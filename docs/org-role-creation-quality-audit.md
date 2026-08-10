# `/org` 역할 생성 대화 모드 품질 평가

문서 기준: 2026-08-09

## 1. 목적

이 문서는 `/org/new` 역할 생성 대화 모드가 제품 요구사항과 기존 시스템의
불변 조건을 실제로 만족하는지 평가하는 품질 게이트다. 설계 의도나 프롬프트 문구만을
근거로 통과시키지 않고, 상태를 바꾸는 서버 경로와 실행 가능한 검증 증거를 우선한다.

## 2. 판정 방식

각 기준은 다음 셋 중 하나로 판정한다.

- `통과`: 요구사항을 만족하는 실행 경로가 있고, 핵심 실패 조건을 막는 서버 검증 또는
  자동화 테스트 증거가 있다.
- `부분 통과`: 정상 경로는 구현됐지만 서버 강제, 동시성, 오류 복구, 자동화 테스트 중
  하나가 부족하다.
- `실패`: 핵심 요구사항을 만족하지 않거나 다른 사용자·역할·Career 동작에 영향을 줄
  수 있다.

다음 항목은 `부분 통과`도 출시 차단으로 본다.

1. Career UI·온보딩·기본 tool 동작 무회귀
2. workspace/role 대화 격리
3. 권한 및 다른 workspace 데이터 차단
4. 버튼 외 경로로 역할 활성화 방지
5. draft 역할의 talent-side 검색·추천 노출 방지
6. 파일 형식·개수·크기 서버 검증

## 3. 평가 기준

| ID | 기준 | 통과 조건 |
| --- | --- | --- |
| Q1 | Career 무회귀 | Career API/온보딩 분기/프롬프트/종료 조건이 유지되고, 공통 UI의 class·DOM·기본 interaction이 동등하며, Career 전체 테스트가 통과한다. Career `open_url`의 기존 LinkedIn 차단도 유지한다. |
| Q2 | 기존 company-side LLM 무회귀 | `mode`가 없으면 일반 `/org`와 Slack이 기존 workspace conversation, prompt, 후보자 mention, tool loop를 그대로 사용한다. |
| Q3 | 대화 범위 격리 | 역할 생성 메시지는 `workspaceId + roleId`에 귀속되고, 일반 채팅·Slack·다른 역할 메시지가 조회/프롬프트/UI에 섞이지 않는다. |
| Q4 | draft lifecycle | 첫 실제 전송에서만 draft가 생성되고, 재시도가 중복 role을 만들지 않으며, 목록에서 재개되고, 활성 역할은 생성 화면으로 재진입하지 않는다. |
| Q5 | draft 검색 차단 | draft의 검색 vector가 비고 internal role search/recommendation의 status 조건에서도 제외된다. 활성화 시 vector가 복구된다. |
| Q6 | 권한·소유권 | 모든 생성·조회·수정·파일 추출·완료 경로가 인증과 `manage_candidates`, workspace-role 소속을 서버에서 검증한다. |
| Q7 | LLM 대화 품질 | 폼식 질문을 피하고, 알려진 값 재질문 금지, 최대 두 개의 쉬운 질문, 회사/역할 맥락별 nudge, 비공개 기준, 다른 역할 기억 제안을 프롬프트와 도구가 지원한다. |
| Q8 | tool 최소 권한과 입력 계약 | role mode에는 필요한 도구만 있으며 roleId는 서버 고정이다. tool schema가 실제 실행기 입력과 일치하고 빈 호출·잘못된 enum·다른 role 수정이 차단된다. |
| Q9 | Slack·담당자 명시적 확인 | Slack/담당자는 실제 사용 가능한 값만 설정되고, 사용자의 명시적 동의 없이는 완료 요건의 confirmed 상태가 될 수 없다. 담당자는 정확히 한 명이다. |
| Q10 | 완료 안전성 | completion tool은 선택지만 만들고 status를 바꾸지 않는다. 최신 미처리 선택지의 실제 버튼 요청만 활성화하며 클릭 시 필수값을 재검증하고 중복/경합을 안전하게 처리한다. |
| Q11 | 첨부파일 | role mode에서만 최대 3개를 전송 전 chip으로 관리한다. client와 server가 형식·MIME·파일당/합계 크기를 검증하고, 추출문은 untrusted context이며 원문은 남기지 않는다. |
| Q12 | URL/LinkedIn | 공통 schema/일반 URL 계약을 공유하고, company-side만 LinkedIn Apify를 opt-in한다. profile/job/company actor가 분리되며 job은 정확한 한 공고만 반환하고 raw payload를 축약한다. |
| Q13 | 공통 UI와 Career 동등성 | composer, user/assistant bubble, 날짜, 선택지, 이전 대화, Thinking을 공통 primitive로 재사용하며 Career의 기존 결과는 변하지 않는다. |
| Q14 | 생성 화면 UX | roleId가 없으면 오른쪽 없이 중앙 composer/안내 문구와 펼친 sidebar가 보이고, role 생성 후 2-pane과 네 탭, 72px 아이콘 sidebar가 나타난다. 펼친 sidebar의 Recent 역할을 누르면 해당 role-scoped 대화를 열고, 데스크톱 2-pane divider의 저장된 폭을 복원한다. |
| Q15 | 실시간 상세 반영 | chat tool 변경 후 Role/Company/Setting query가 갱신되고, draft 재개/완료 routing과 오른쪽 편집 UI가 같은 저장값을 사용한다. |
| Q16 | 오류·동시성·재시도 | 첫 전송/완료의 재시도가 멱등적이고, 부분 성공·LLM 실패·중복 클릭·두 탭 경합이 데이터 손상이나 거짓 성공 문구를 만들지 않는다. |
| Q17 | 개인정보·prompt injection | 파일/웹/LinkedIn을 비신뢰 자료로 다루고, 추출 본문·private request·memory를 client나 로그에 노출하지 않으며 prompt 크기를 제한한다. |
| Q18 | 검증·운영 준비 | migration, typecheck, lint, diff check, 신규 계약 테스트, Career/Org 회귀 테스트 결과가 기록되고 알려진 실패가 이번 변경과 분리된다. |

## 4. 현재 평가

### 4.1 감사 중 발견하고 수정한 결함

| 관련 기준 | 발견한 문제 | 개선 |
| --- | --- | --- |
| Q8 | `update_role_draft`, `update_company_context`가 빈 object도 schema상 허용했고 실행기도 no-op을 받아들였다. | 모든 부분 수정 field에 `anyOf`를 추가하고, 실행기에서 빈 입력·미등록 key·잘못된 work mode/employment type/숫자 범위를 다시 검증한다. |
| Q9 | Slack/담당자의 “명시적 동의”가 system prompt에만 있었고 model이 tool을 바로 호출하면 confirmed metadata가 생길 수 있었다. | 현재 사용자 문장에 대상이 직접 명시되었거나, 직전 Harper 문장에 정확한 대상명이 있고 사용자가 명확히 수락한 경우만 서버 validator가 허용한다. 관련 단위 테스트 4개를 추가했다. |
| Q9 | 일반 Role 설정 UI를 그대로 쓰면서 역할 생성 중에도 담당자를 여러 명 선택할 수 있었다. | `roleCreation` 화면에서만 마지막 선택 한 명으로 교체되게 하고 일반 역할의 복수 담당자 동작은 유지했다. |
| Q10·Q16 | status 조건 update는 활성화 자체만 한 번 막았고, 두 탭 경합에서 확인 메시지가 중복되거나 응답 유실 후 재시도가 409가 될 수 있었다. generic role API로 draft status를 바꿀 여지도 있었다. | conversation metadata compare-and-set, 60초 recovery lease, confirmation identity 기반 멱등 응답과 message marker를 추가했다. DB trigger는 generic `draft → 다른 상태` 변경을 차단하고 service-role 전용 completion RPC만 활성화한다. |
| Q11 | 확장자는 검사했지만 PDF 이름에 실행 파일 MIME을 붙인 경우처럼 확장자-MIME 불일치를 구체적으로 막지 않았다. | 허용 확장자별 MIME allowlist를 client, 추출 API, chat orchestrator에 모두 적용하고 빈 파일·개별/전체 크기를 재검증한다. |
| Q7 | `read_other_roles`가 설계와 달리 다른 역할의 request만 읽고 role memory를 반환하지 않았다. | 같은 workspace의 role memory를 별도 조회해 role별 2,500자로 제한하여 함께 반환한다. |
| Q15·Q16 | LLM/tool 부분 성공 뒤 네트워크 오류가 나면 role query invalidation이 생략될 수 있었다. | client가 처음부터 알고 있는 draft UUID까지 보존하고 role mode 실패 경로에서도 org/role/history/notification query를 invalidate한다. |
| Q6 | 파일 추출 route가 permission 오류도 일반 400으로 변환했다. | 인증 실패는 401, `OrgHttpError`는 원래 403/4xx status를 보존한다. |
| Q18 | 실제 Slack 기본 모델은 Claude인데 기존 테스트 두 개만 DeepSeek을 기대했다. | 런타임 설정은 바꾸지 않고 stale 테스트 설명과 기대값을 현재 설정에 맞췄다. |
| Q4 | 실제 workspace에서 첫 입력을 보내자 기존 `company_roles_status_check`가 `draft`를 거부해 LLM 호출 전에 생성이 실패했다. | migration 시작부에서 기존 제품 상태 전체에 `draft`를 더한 check constraint를 설치·검증한 뒤 role-creation object를 만들도록 순서를 수정했다. 재발 방지 migration 계약도 추가했다. |
| Q7 | 초기 구현은 응답 길이와 형식을 코드로 판정하고 상태별 고정 문구로 교체해 LLM의 맥락 판단을 제한했다. | 글자 수·Markdown 검증, 강제 재생성, 고정 confirmation/recovery/완료 문구를 제거했다. system prompt와 tool description은 좋은 질문·요약·가독성에 도움이 되는 방식을 권장하고, 최종 확인 전후 문장도 최신 상태를 본 LLM이 작성한다. |
| Q10·Q16 | notification과 confirmation tool이 같은 turn에 실행된 뒤 `confirmation_pending`을 저장할 때 turn 시작 시점 metadata로 덮어써 방금 확인한 Slack·담당자가 사라졌다. | 최종 확인 직전에 다시 읽은 최신 conversation metadata를 기반으로 pending 상태를 저장하고 회귀 계약을 추가했다. 실제 다음 조회의 missing 0으로 확인했다. |
| Q18 | smoke cleanup이 role을 먼저 삭제해 role conversation FK가 `NULL`로 바뀌면서 workspace conversation unique index와 충돌했다. | 정확한 role-scoped conversation을 먼저 삭제하고 그 다음 테스트 role을 삭제한다. draft뿐 아니라 명시적 `--decision=yes` 테스트가 만든 active role도 정확한 UUID일 때만 정리한다. |

### 4.2 최종 기준별 판정

| ID | 판정 | 근거 |
| --- | --- | --- |
| Q1 | 통과 | Career adapter는 공통 presentation primitive만 사용한다. 기존 class/DOM을 고정하는 `sharedCareerUiContract.test.ts`가 통과했고 Career/온보딩/도구 테스트 85/85가 통과했다. company-side opt-in이 없으면 LinkedIn 차단 결과도 기존 그대로다. |
| Q2 | 통과 | API의 mode 기본값은 `general`이고 일반 web/Slack은 계속 `role_id IS NULL` conversation을 쓴다. 기존 company-side LLM 회귀를 포함한 Organization 테스트 175/175가 통과했다. `open_url`/`web_search` 추가만 요청에 따른 additive 변경이다. |
| Q3 | 통과 | `ensureOrgRoleCreationConversation`은 workspace+role 소속을 검사하고 role conversation unique index를 사용한다. message query는 그 conversation id에만 묶이며 query key도 mode+roleId로 분리된다. 정적 격리 계약과 query-key 테스트가 통과했다. |
| Q4 | 통과 | migration이 status check에 `draft`를 먼저 추가한다. 첫 submit 직전 client UUID를 만들고 서버가 동일 workspace draft만 재사용한다. draft는 목록/role picker에서 생성 route로 돌아오며 active role은 일반 상세로 redirect한다. |
| Q5 | 통과 | migration trigger가 draft의 `opportunity_search_tsv`를 null로 만들고 활성화 때 재계산한다. Career internal search와 ops matching의 기존 active/paused 계열 status allowlist에도 draft가 없다. |
| Q6 | 통과 | chat/messages/extract/confirm route가 모두 인증하고 store/state가 `manage_candidates`와 workspace-role 소속을 검사한다. 다른 workspace role은 role query에서 찾지 못한다. |
| Q7 | 통과 | 전용 prompt는 이미 아는 정보 활용, 단계·역할별 nudge, 공개/비공개 기준 분리, 객관적 직무 역량으로의 전환, 다른 역할 기준 제안을 좋은 대화 방식으로 안내한다. Markdown·이유·예시는 유용할 때 쓰도록 권장하며 서버는 길이·문장 수·형식을 점수화하지 않는다. `read_other_roles`는 description/request/memory를 제한해 제공한다. |
| Q8 | 통과 | role mode allowlist에는 일곱 도구만 있고 roleId는 schema가 아니라 server context에서 주입된다. schema와 runtime 양쪽에서 빈 update, extra key, enum, 숫자 범위를 검사한다. |
| Q9 | 통과 | 사용 가능한 Slack/member만 설정할 수 있고 서버 consent validator가 대상별 동의를 fail-closed로 확인한다. tool은 담당자 한 명만 쓰며 오른쪽 creation UI도 한 명으로 제한한다. notification 실제값과 confirmed metadata가 다르면 완료 validator가 다시 missing으로 판정한다. |
| Q10 | 통과 | confirmation tool은 선택지만 만들고 최신 notification metadata를 보존한다. confirm API는 최신 message/action/decision을 검사하고 필수값을 재검증한다. CAS lease가 한 처리자만 선점하며 같은 identity 재시도는 멱등이다. DB trigger+service-role RPC가 버튼 API 밖 draft activation을 차단한다. 실제 `예` 선택으로 active 전환과 vector 복구를 확인했다. |
| Q11 | 통과 | 첨부는 role mode에만 보이며 rounded chip/X/최대 3개 UX가 있다. client·extract API·chat 서버가 확장자, MIME, 빈 파일, 파일당 10MB, 합계 25MB를 검사한다. 추출문은 server-only metadata로 저장되고 조회 직전에 제거된다. |
| Q12 | 통과 | 두 제품이 동일 `open_url`/`web_search` schema와 executor를 쓴다. LinkedIn은 company-side 호출만 opt-in하고 profile/job/company actor input과 compact 결과가 분리된다. job은 ID/canonical URL exact match가 없으면 실패한다. live actor 확인은 Q18의 운영 확인 항목이다. |
| Q13 | 통과 | composer frame, bubble, 날짜, 선택지, 이전 대화, Thinking을 공통화했다. Career 전용 rich text/marker/LLM state는 adapter에 남겼고 class/DOM 계약 및 85개 Career 회귀가 통과했다. |
| Q14 | 통과 | roleId 전에는 안내+중앙 composer만, 생성 뒤 2-pane+Role/Company/Setting/Calibration을 렌더한다. 생성 route는 desktop sidebar 72px와 모든 icon tooltip을 사용하고 production build에 `/org/new`가 포함됐다. |
| Q15 | 통과 | stream 종료/오류 후 org bootstrap, role history, notification query를 invalidate한다. Role/Setting은 role/memory version key를 쓰고 Company는 `/org/team`의 동일 컴포넌트와 workspace data를 쓴다. |
| Q16 | 통과 | client 첫 submit guard와 UUID 재사용, 실패 경로 invalidation, confirmation CAS/lease/idempotency, DB activation guard가 있다. tool 성공 후 다음 LLM call이 실패해도 DB 변경과 draft/user message는 보존된다. |
| Q17 | 통과 | prompt가 파일/URL/LinkedIn을 untrusted reference로 지정하고 context 길이를 제한한다. 파일 원문은 저장하지 않고 추출문은 client 응답에서 제거하며 새 경로에 본문/request/memory log가 없다. |
| Q18 | 부분 통과 | typecheck, lint, diff check, production build, Career/Organization 회귀와 실제 LLM eval이 통과했다. migration 적용 DB에서 full/sparse/confidential 세 시나리오와 실제 `예` 선택을 실행해 저장, 격리, 내부 기준 비공개, active 전환, vector 복구, cleanup을 확인했다. 다만 인증된 브라우저 E2E, 두 탭 경합의 실제 동시 transaction, 실제 Apify token을 쓴 세 actor smoke test는 아직 수행하지 않았다. |

결과는 `통과 17 / 부분 통과 1 / 실패 0`이다. 출시 차단으로 정의한 Q1, Q3, Q5,
Q6, Q10, Q11은 모두 통과했다.

### 4.3 실행한 검증

| 검증 | 결과 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 통과 |
| 변경 파일 ESLint | 오류·경고 0 |
| 전체 `pnpm exec eslint .` | 오류 0, 저장소 전체 경고 152 |
| `git diff --check` | 통과 |
| `pnpm build` | 통과, `/org/new`와 두 role-creation API route 포함 |
| Career/온보딩/도구 회귀 | 85/85 통과 |
| Organization/company-side LLM/Slack 회귀 | 175/175 통과 |
| 역할 생성·공통 UI 집중 계약 | 동의, completion, DB guard, MIME, 격리, 검색 차단, Career class/DOM 계약 통과 |
| `pnpm org-role-creation:llm-eval` | 실제 `deepseek-v4-flash` 4-turn 호출 통과. 역할/성과 update, Slack·담당자 동의, confirmation 도구 5회, tool 오류 0, missing 0 |
| 실제 workspace 첫 전송 | 기존 DB constraint의 `draft` 거부 재현. migration에 status check 확장을 추가했고 실패 후 draft 잔여 데이터 0건 확인 |
| migration 적용 후 실제 DB smoke | full/sparse/confidential 시나리오 모두 통과. 상황에 맞는 후속 질문과 공개/비공개 분리, tool 오류 0, role-scoped 저장, draft vector null, 테스트 데이터 정리 확인 |
| 실제 `예` 선택 | 총 8개 메시지, missing 0, completion RPC 성공, status active, search vector 복구, conversation completed, 결과 안내 저장 후 테스트 데이터 정리 |

## 5. 출시 판정

로컬 코드 기준으로는 `조건부 통과`다. 즉, 구현 결함 때문에 막힌 출시 차단 항목은 없다.
다만 다음 세 가지 운영 검증 전에는 배포 완료로 판정하지 않는다.

1. 두 탭에서 같은 confirmation을 동시에 누르는 실제 transaction 경합을 staging에서 확인한다.
2. 인증된 브라우저에서 첨부 3개, draft 재개,
   네 탭 live update, sidebar tooltip, 예/아니오 완료 흐름을 desktop/mobile에서 확인한다.
3. 운영과 같은 Apify actor ID/token으로 profile/job/company를 한 번씩 읽고 job exact-one,
   timeout/error 문구, compact payload를 확인한다.

이 문서는 로컬 구현 평가이며 배포 승인을 의미하지 않는다. 실제 배포 시에는 저장소 루트
`AGENTS.md`의 Notion 문서 동기화 절차를 별도로 수행한다.
