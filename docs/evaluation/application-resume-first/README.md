# 이력서 전달 후 지원서 작성

목표: 같은 Career 대화 모델이 이력서를 먼저 작성·저장·전달하고, 별도 다음 turn에서 관측된 지원서 답변·첨부를 저장하는지 확인한다. hidden writer, 외부 제출, 운영 DB 접근은 없다.

단위: 합성 후보자 1명·공고 1개에서 이어지는 대화 2턴. fixture/gold는 `cases-v1.json`; 초기 제안의 승인/건너뛰기가 이미 저장된 입력이다. v1은 2026-10-29 Codex가 작성한 합성 자료이며 실제 사용자의 경력·문서를 포함하지 않는다.

정본 runner: `scripts/evalApplicationResumeFirst.ts`. 실행: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalApplicationResumeFirst.ts`. 실제 conversation prompt builder, 도구 정의, 문서 reader, ready_for_role/save_application executor와 provider adapter를 사용한다. 저장소만 기존 in-memory evaluation adapter다. 기본 모델은 운영 설정의 CLAUDE_HAIKU_MODEL; 모델 요청 파라미터·원문·입력/코드 해시는 runs에 기록한다. 네트워크는 해당 모델 provider만 허용한다. 모델 요청/출력/문서 원문은 owner-only ignored runs 디렉터리에 저장한다.

구조 gate: 1턴 이력서 저장, 원본 보존, 지원서 미작성; 전달 receipt 후 2턴 save_application, 필수 서술 답변·이력서 첨부, 추가 질문·외부 제출 없음. 실제 출력은 사람이 별도로 읽어 자연스러운 안내·사실 보존·불필요한 재확인 없는지를 판정한다. 정규식 품질 심사나 재작성 루프를 런타임에 넣지 않는다.

한계: 한 합성 사례이며 사이트 접근·브라우저 입력/제출·실제 전송을 검증하지 않는다. 동시 완료 순서, 중복 claim, 재시도, UI 재진입은 applicationFollowUp.test.ts 및 ApplicationPreparationPolling.test.tsx가 검증한다. 로그인/접근 불명·소유권·사용자 수정 보존은 readyForRole.test.ts 및 applicationReview.test.ts가 검증한다. live 브라우저 확인은 이 합성 결과와 구분해 보고한다.

2026-10-29 확인: `runs/2026-10-29T07-23-48-457Z`에서 구조 gate를 통과했다. 첫 turn은 read_document → ready_for_role, 전달 이후 turn은 read_document → save_application을 호출했다. 두 번째 turn에서 이름·이메일·지원 이유와 이력서 첨부가 저장됐고 추가 질문이나 외부 제출은 없었다. 출력 수동 검토에서는 첫 안내에 문서 링크가 있었으며 두 번째 안내는 검토·수정·제출 요청을 안내했다. 두 번째 안내가 입력 항목을 다시 나열하고 제출을 곧바로 보낼 수 있는 것처럼 표현한 점은 남은 문체상 한계다. 이 결과를 모든 공고·모델의 대화 품질 보장으로 해석하지 않는다.

2026-10-29 단일 제출 승인 변경 후 확인: `runs/2026-10-29T08-03-40-905Z`에서 같은 v1·기본 모델로 구조 gate를 통과했다. 이력서 전달 뒤 다음 turn이 이름·이메일·지원 이유·이력서 첨부를 저장했고 추가 질문·외부 제출은 없었다. 첫 이력서 저장 호출은 필수 experience.title 누락으로 실패했으며 같은 대화 모델이 인자를 수정해 저장했다. 이력서 작업 두 개가 성공한 것은 아니다. 실제 안내는 문서 링크와 이후 작성, 최종 지원서 확인·수정·제출 요청을 전달했다. 문서 변경 내용을 설명하고 입력 항목을 다시 나열하는 장황함은 남아 있다. 새 제출 동작은 이 LLM 평가의 검증 범위가 아니다. `applicationReview.test.ts`와 `applicationManagedBrowser.test.ts`가 저장한 지원서의 제출 액션 → 재승인 없는 provider 실행, 중복 클릭, 변경된 양식·파일, 새 필수 질문 응답 후 계속, 로그인·인증·CAPTCHA 중단을 합성 provider로 검증한다. 실제 채용 사이트 제출·운영 배포는 수행하지 않았다.
