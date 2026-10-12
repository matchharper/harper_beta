# PR #155 로컬 main 통합·검증 — 2026-10-12

기존 main `dba0125338525b1ea35f4d1275d85ce69e253bc0`에 PR head `ab50b1410f60be9aa74bd391667fbeb4f9aaa65a`를 통합했다. 텍스트 충돌은 없었고, 실행 계약의 충돌을 수정했다. 기존 checkout에서 진행했으며 별도 worktree, push, 배포, production DB 변경은 하지 않았다. 다른 작업의 미커밋 수정은 별도로 보존한다.

## 합의한 기능

- 공개 외부 지원 사이트에서의 지원 준비·전송을 포함한다. 사용자가 다른 작업을 요청하면 함께 지원 모드를 마칠지 확인하고, 동의 후 같은 턴에서 새 작업을 이어간다.
- 공통 `read_talent_context`, `write_talent_context`, `update_talent_profile`을 모드 안에서도 제공한다. 현재 지원의 일회성 결정은 activity에, 향후 탐색 기준은 Brief에, 확인된 지속적 사실은 Memory에 둔다. 공통 Profile 도구가 실제로 지원하는 필드는 이름·소개·현재 거주지·개인 링크·row 메모 등이다. 경력 회사명 자체를 직접 바꾸는 새 기능은 추가하지 않았다.
- PR의 이력서 디자인을 포함한다. A4 미리보기와 PDF, 데스크톱·모바일 페이지 경계와 본문 보존을 검사하고 출력 화면을 확인했다.

## 세 기술 문제의 수정

1. **모드가 도구 제한을 우회하던 문제:** 활성 모드에도 caller allowlist(빈 배열 포함), 온보딩·음성 경계를 먼저 적용한다. 허용되지 않은 도구와 terminal 이름은 노출하지 않는다.
2. **모드를 끝낸 직후 이전 도구·종료 규칙이 남던 문제:** 공통 capability runtime에서 현재 서버 상태로 매 completion의 schema와 prompt를 구성한다. 모드 종료 후 progressive loader로 돌아간다. terminal 도구 목록도 매 completion 갱신한다. 승인된 새 요청을 담은 실제 종료 receipt를 공통으로 사용하고, 시작 결과 지침과 새로 저장한 사용자 context를 유지한다.
3. **최종 전송 승인이 prompt에만 의존하던 문제:** 모델의 shell·임의 JavaScript 실행을 제거하고, Harper가 소유한 별도 실행기에서 실제 네트워크 요청을 보류한다. 사용자 Send 선택이 있어야 정확한 요청 한 건이 전송된다. 원본/최종 문서 구분, 소유권·문서 버전·승인 범위, 재시도 영수증을 검사한다. 승인 전 POST·GET 제출, 파일 업로드, WebSocket·background 요청 우회를 검사했다.

브라우저 계약과 제한의 상세 기록: `application-playwright-upload.md`.

## 검증과 재현

- TypeScript 전체 검사와 변경 경로 ESLint.
- PR 변경 테스트와 공통 loader/Memory/Profile/streaming 회귀 테스트: `pr155-local-test-files.txt`의 55개 파일, 261개 테스트. 실제 Chromium/PDF opt-in도 켠다. production 통신은 `scripts/offlineTestNetwork.mjs`로 차단하고, loopback 합성 폼만 허용한다.
- 네 provider 경로(native, OpenAI, OpenRouter, fallback) × 일반/streaming에서 모드 종료 후 schema/policy/terminal 갱신과 같은 응답의 미노출 도구 거부를 확인한다.
- 실제 driver로 POST·GET 보류, 거절, 위조된 승인 범위, 정확한 multipart 파일 bytes/이름, 한 번만 전송, 같은 origin GET redirect의 receipt 조회를 확인한다. 실행기 mock은 고정 command, 허용 document ID, 만료·유실 시 재시작 금지와 provisioning cleanup을 확인한다.
- 실제 모델 `gpt-6.1-sol`, reasoning xhigh, progressive: 동결 v5의 4대화·13사용자 턴과 v8의 지원 모드 4대화·5사용자 턴을 검사했다. 구조 오류 0. Codex가 전체 응답과 tool 효과를 gold에 대조해 의미 검토했다. 독립 human review나 전체 dataset gate로 주장하지 않는다.
- 초기 v6/v7 run도 보존한다. 현재 지원 예외를 Brief에 남긴 문제는 production prompt를 보완했다. 잘못된 Profile 필드 gold, session 도구 전체 금지 gold, UI metadata/질문 receipt가 빠진 stub은 실제 계약으로 바로잡고 새 version/run으로 검증했다. 입력·gold를 덮어쓰지 않았다.

실행 예시(키는 합성 값이며, 실제 모델 평가와 별도):

```sh
OPENAI_API_KEY=test-key ANTHROPIC_API_KEY=test-key OPENROUTER_API_KEY=test-key GEMINI_API_KEY=test-key NEXT_PUBLIC_SUPABASE_URL=https://test.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key SUPABASE_SERVICE_ROLE_KEY=test-key RESUME_PDF_TEST=1 APPLICATION_BROWSER_TEST=1 pnpm exec tsx --tsconfig scripts/tsconfig.json --import ./scripts/offlineTestNetwork.mjs --test --test-concurrency=2 $(cat docs/testing/pr155-local-test-files.txt)
```

실제 모델 평가의 canonical 실행·동결 version·개인정보 경계·결과는 `docs/evaluation/career-capability-loading/README.md`를 따른다. PR의 과거 exploratory script 3개는 `docs/evaluation/application-simulation-legacy/`에 별도로 등록했으며 이번 검증에 실행/포함하지 않았다.

## 실환경에서 아직 확인하지 않은 범위

로컬에 Vercel Sandbox 인증이 없어 cloud VM provisioning과 실제 employer ATS는 실행하지 않았다. 새 SDK 의존성은 `@vercel/sandbox@3.6.1`; 배포 runtime은 OIDC, 외부 실행은 token/team/project trio를 사용한다. 개인 파일이나 실제 지원은 전송하지 않았다.

보수적인 요청 차단 때문에 initial POST 기반 화면, background autosave, 한 동작에서 여러 전송을 요구하는 사이트, 로그인·CAPTCHA는 수동 지원이 필요할 수 있다. 브라우저·응답을 잃으면 재시작/재전송하지 않고 불확실성을 유지한다. 요청이 전송됐다는 사실과 사이트의 접수 완료 증거는 별개다. migration 파일은 로컬에 포함했지만 live schema 적용이나 확인은 이 작업에 포함하지 않는다.
