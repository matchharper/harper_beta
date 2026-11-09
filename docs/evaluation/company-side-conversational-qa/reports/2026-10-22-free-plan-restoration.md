# Free 프로필·10 Intro 복원과 활성 Role 1개 검증

- 기준일: 2026-10-22. 후속 사용자 승인으로 운영 DB 복원을 적용했다. 웹/Worker 배포·외부 연락은 없다. 아래 LLM·화면 검증은 로컬 소스 기준이다.
- 사용자 요청: Free 블러·열람 차감·LLM 정보 제한 제거, 원래 화면/문구와 월 10 Intro 복원, 활성 Free Role 최대 1개.
- 기존의 별도 이메일·이력서 공개 동의, 회사별 접근 권한, test-only 격리와 계약 권한은 유지한다.

## 변경 범위

카드·목록·상세·Slack 소개·회사 LLM의 Free 프로필 마스킹과 열람 승인 도구를 제거했다. 원래 Intro 보내기/Send intro 버튼·요청 모달·Intro 잔액 표시로 복원했다. 일반 프로필 조회는 비용이나 연락 효과가 없다. 회사 공개 가능한 정보와 비공개 Career 원본의 경계는 별개로 유지한다.

Free는 조직 공용 월 10 Intro와 활성 Role 1개다. 초안은 무제한이고 유효한 유료 슬롯마다 활성 Role 1개·월 50 Intro가 추가된다. 유료 Role은 자기 슬롯 잔액을 먼저 사용하고 공용 잔액을 사용할 수 있다. 다른 슬롯 잔액은 사용하지 않는다. Legacy·Enterprise·tailored 계약은 기존 권한을 유지한다.

준비한 `20261022071755_restore_free_intros_and_single_active_role.sql`은 기존 workspace 잠금·차감·재조정 함수를 사용한다. 열람 RPC와 outbox의 열람 제한 필드는 제거하고, 과거 열람/차감 기록은 감사 이력으로 남긴다. 현재 공용 Intro는 실제 Intro/연결 차감을 보존해 복원하며 과거 무차감 행동을 소급 차감하지 않는다. 기존 초과 상태 또는 슬롯 만료 시 유효한 슬롯 배정을 유지/보충하고, 가장 먼저 만든 적격 Free Role 하나를 남긴 뒤 나머지는 일시 중지한다. 후보자·Intro·진행 이력은 삭제하지 않는다.

## 실제 LLM 의미 검증

동결 `cases-v37.json`, `gold-v37.md`, `manifest-v37.json`과 canonical runner `scripts/evalCompanyAgentCapabilities.ts`를 사용했다. 모델은 `gpt-6.1-sol`, OpenAI Responses, reasoning high, progressive 도구 로딩이며 회사의 실제 prompt/schema/loop와 회사 공개용 소개 projection을 사용한다. DB·전달 도구 효과는 합성 adapter다.

최종 run `20261022-free-restoration-v37-r2`의 전체 답변·조회 결과·효과를 직접 읽고 gold에 따라 의미 검토했다. source fingerprint는 `3dba077b3783a95dbc9a42c9ca8c69d6eeb9637c706c7c5ba991947996912ccc`다.

| 사례 | 결과 |
| --- | --- |
| pricing_ko | Free 이름·공개 경력 조회, 조회 차감 없음, 월 10 공용 Intro, 활성 1개·초안 무제한을 설명. 통과. |
| slots_en | 유료 1개와 Free 1개 공존, 50/10 별도 잔액과 사용 순서, 만료 시 가장 오래된 적격 Role 유지·초과 중지·이력 보존을 설명. 실제 회사 계약을 추정하지 않음. 통과. |
| profile_ko | 공개 이름·Python API 운영/장애 대응 근거를 설명하고 미확인 설계 경험을 구분. 열람 승인·Intro·연락을 실행하지 않음. 통과. |

Gate는 **3/3**, 중대한 허위 사실·비공개 정보 유출·미승인 효과 0이다. 세 사례 모두 effects가 비었으며 후보 조회 사례만 일반 `read_talent`·`read_role`을 사용했다. 원본 출력·source snapshot·provider 캡처·별도 `manual-review.json`은 ignored `runs/20261022-free-restoration-v37-r2/`에 0700/0600으로 보존했다.

앞선 r1도 3/3이었다. Intro 용어 지침의 원문 복원 후 같은 frozen 입력으로 r2를 새로 실행했다. r1을 덮어쓰지 않았고 두 run을 독립 표본처럼 합산하지 않는다. 이는 작은 합성 challenge이며 독립 팀원 검토, 대표 운영 품질, 실제 계정 권한/DB/Stripe/Slack/메일 E2E 검증이 아니다.

## 실행 경계·화면 확인

- `node scripts/testWorkspaceFreePlan.mjs`: 실제 PostgreSQL의 격리된 로컬 cluster에서 통과. 운영 접속 없이 이전 열람 migration과 복원 migration을 적용했다. 동시 활성화 8건 중 1건 허용, 동시 Intro 12건 중 10건 허용, 소진 후 멱등 재시도, 활성 Role 교체, 유료 50 우선·공용 fallback, 슬롯 재배정/만료, 과거 실제 차감 보존·열람 차감 제외·계약 권한을 확인했다.
- 변경한 reader/schema/preview/relay/Slack 정보 경계의 선택 검사 9개 통과. 별도 billing presentation·검색 결과 맥락·agentic reader·이메일 공개 경계·preview 검사 29개 통과.
- 카드·요금제·Intro 모달·잔액 UI 검사 7개 통과. 최초 UI 실행은 테스트용 Supabase URL 누락으로 2개 실패했으며, 외부 접속 불가 로컬 주소를 지정한 최종 실행에서 통과했다. Intro 모달은 입력 검증과 중복 제출 방지도 확인했다.
- Worker Slack writer 관련 검사 14개 및 수정 Python 구문 확인 통과. Free/paid 모두 동일한 회사 공개 가능 이름·경력·소개 정보를 전달한다.
- 실제 React 컴포넌트와 현재 CSS를 정적 렌더링해 Playwright에서 한국어/영어, 390·767·768·1023·1024·1440px를 확인했다. 가로 넘침 없음. 모바일·데스크톱 스크린샷에서 블러 없는 후보 카드와 원래 Intro 버튼, Free 1 Role/10 Intro를 확인했다. 키보드로 카드에 진입할 수 있다. 합성 화면/스크린샷은 ignored `.local/free-plan-restoration/output/playwright/`에 남겼다. 인증된 전체 앱·실제 데이터·모바일 키보드·전체 모달 시각 E2E는 포함하지 않는다.
- 두 저장소 `git diff --check` 통과. 전체 TypeScript 검사에는 작업 시작 전부터 수정 중이던 `src/lib/ops/jobTitleSimilarityServer.test.ts:153`의 `0.1234567` 대 `0 | 1` 타입 오류 1개가 남아 있다. 초기 주변 검사에서 발견된 기존 도구 schema 기대값/Slack 테스트 harness 문제도 이 작업에서 수정하지 않았다. 전체 저장소 검사 통과로 주장하지 않는다.

## 적용 상태

후속 사용자 요청으로 운영 DB migration `20261022081230`(`restore_free_intros_and_single_active_role`)을 적용했다. 로컬 정본은 `20261022071755_restore_free_intros_and_single_active_role.sql`이며 SHA-256은 `4a9756a7a9e756731a050775ebb52b67deea082ce3102292f785d1542b008555`다. 같은 migration을 다시 적용하지 않는다.

적용 전 운영 함수와 대조해 두 부분을 보완했다.

1. 전체 Workspace를 순회하며 잠그던 전환 작업을 실제 정책 대상인 가입된 standard Workspace로 제한했다. Legacy·Enterprise 잔액과 재조정 시각은 건드리지 않는다.
2. 별도 계약 Role에 일반 Free 차감·유료 슬롯 필수 조건을 적용할 수 있던 경로를 수정했다. 기존 `role_matching_slot_type_v1`의 계약 권한을 재사용해 슬롯 없는 계약 Role의 Intro·연결과 무차감 동작을 유지한다.

로컬 PostgreSQL 검사에 별도 계약 잔액·재조정 시각 보존과 계약 Role의 Intro·연결·멱등 영수증을 추가해 통과했다. 추가 fixture의 첫 실행은 기존 allowance 제약에 맞지 않는 합성 수량 7을 사용해 실패했으며, 유효한 allowance 10과 잔액 3으로 수정해 실제 보존 경계를 확인했다. 운영 데이터로 차감·연락·Role 활성화 테스트를 수행하지 않았다.

운영 확인 결과:

- 바뀐 함수 6개의 본문이 로컬 정본과 일치하고 빈 search_path·anon/authenticated 실행 차단을 확인했다. 서버 역할의 필요한 실행 권한은 유지한다.
- 열람 RPC 두 개와 outbox의 `profile_access` 칼럼이 제거됐다. 현재 DB 함수에 제거된 열람 계약을 호출하는 경로는 없다.
- 실제 Free summary는 `capacity=1`, `allowance=10`, `remaining=10`이다. 서버 API도 summary HTTP 200과 같은 값을 반환했고, 폐기한 열람 조회 API는 HTTP 404를 반환했다. 설정된 API 도메인의 CNAME이 대상 Supabase 프로젝트와 일치함을 확인했다.
- 적용 전후 Role 상태별 수·기존 월 기간 잔액·과거 열람 영수증 5건이 동일하다. 이번 적용으로 일시 중지된 Role은 0개이고, 신규 Intro 차감 영수증도 없다.
- Supabase 보안 advisor의 기존 항목·개수는 동일하며 변경한 함수·테이블에 새 관련 지적은 없다. 기존 범위 밖 advisor 문제를 이번 작업에서 수정하지 않았으며 전체 보안 점검 완료를 뜻하지 않는다.
- 적용 전 함수·한도·영수증 및 적용 후 대조 자료는 ignored owner-only `.local/free-plan-production-20261022/private/`에 보관했다.

운영 웹은 Vercel READY revision `e97850a6c26c90af0f0d64a65c5c010b273702d5`로 확인했고 제거한 열람 RPC·필드에 의존하지 않는다. 웹·Worker는 이번에 배포하지 않았으며 Worker의 현재 release 전체를 검증한 것은 아니다. 운영 웹의 요금제·회사 LLM 기본 안내에는 이전 무제한 Role 설명이 남아 있으므로 로컬 화면·오류·정책 안내는 후속 웹 배포가 필요하다. 실제 DB 한도는 이미 적용됐다.

Notion [회사 제품 종합](https://app.notion.com/p/3fe7277d26df812dbc7def98e67aa45c), [회사 Workspace 공개 범위](https://app.notion.com/p/3ec7277d26df817cbf2cd66cb88efd07), [Role·후속 연락·인재 상태](https://app.notion.com/p/3b57277d26df810997b6e5480848ab87)를 기존 페이지에서 갱신하고 다시 조회했다. 현재 DB 정책과 웹 미배포 범위를 구분했으며, 날짜와 마지막 변경 이력의 최신 행을 추가하고 과거 이력은 보존했다.

## 문서·FAQ 후속 점검

사용자의 문서 점검 질문에 따라 관련 현재 안내와 과거 기록을 다시 대조했다. 앞선 점검에서는 남아 있던 슬롯 만료 도움말과 미공개 회사 약관의 무제한 Role 설명을 놓쳤다.

- 한·영 FAQ의 슬롯 만료 설명을 유효 슬롯 우선 배정 → 먼저 만든 적격 Free Role 1개 유지 → 초과 Role 일시 중지로 수정했다. Intro 잔액 소진과 별개인 활성 한도도 사용 안내에 명시했다.
- 운영 FAQ에는 이전 요금 설명도 남아 있었다. `service_answer_examples`의 요금·Intro 사용·슬롯 만료 한·영 6행만 원본 답변과 질문이 변하지 않았다는 조건으로 잠그고 수정했다. 재조회한 전체 88행(회사 77·Career 11) 중 해당 6행의 답변·수정자·수정 시각만 달라졌고 질문·embedding·태그·활성 상태·나머지 82행은 동일했다. 질문이 같아 embedding을 재생성하지 않았다.
- 한국어 FAQ 원본과 한국어 번역의 3개 해당 답변이 같은지 확인했다. 기존 FAQ 구조·공개 노출 구분·가격 계약 테스트 3개 통과. 가격 테스트의 이전 무제한 Role 기대값은 새 활성 Free Role 1개로 수정했다. 이 후속 작업에서 LLM 평가를 새로 실행하지 않았으며 앞의 v37 결과를 운영 FAQ 주입 대화 검증으로 주장하지 않는다.
- 구독 구현·설계 문서, 이전 UI 복원 기록의 폐기된 정책을 과거 기록으로 구분했다. 미공개 회사 약관 국문·영문 제4·6·9조와 README를 현재 한도·만료 동작에 맞췄다. 기존 공개 약관·동의 버전과 frozen 평가·과거 실행 기록은 보존했다. 법률 조건을 새로 검토하거나 약관을 게시·시행한 작업은 아니다.
- Notion의 같은 3개 페이지에 운영 FAQ 수정과 웹 기본 안내 미배포 상태를 구분해 반영했다. 종합 문서의 이전 배포 확인 절도 당시 기록임을 명시했다. 정책은 같은 날 이미 기록한 내용이어서 별도 변경 이력 행은 추가하지 않았다.

관련 현재 안내와 정책 경로를 점검한 것이며 저장소의 모든 문서·제품 기능을 전수 검증했다는 뜻은 아니다. 다른 제품의 프로필 열람 기능, 개인정보·동의 경계, Enterprise·기존 계약의 무제한 권한은 이번 Free 제한 제거와 구분한다. 운영 적용 전후 FAQ 증거는 owner-only `.local/free-plan-production-20261022/private/faq-{before,after,verification}.json`에 보관한다. 웹·Worker 배포는 여전히 수행하지 않았다.
