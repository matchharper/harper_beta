# Apply with Harper 저장된 지원서 UI — 로컬 구현·검증

2026-10-28. 웹/Worker 배포 및 실제 지원서 제출 없음. 기존 제출 엔진과 전송 직전의 요청별 승인을 유지했다.

## 동작

- 웹에서 이력서 제안 작성과 공식 JD 탐색·읽기 전용 폼 조사를 함께 시작한다. Ops의 기존 Exa 검색 10개 후보·최대 두 차례 탐색을 재사용한다. 로그인 등 명시적인 접근 장벽이면 재검색 없이 직접 지원으로 넘긴다. 중단된 공식 링크 조사 작업은 전체 탐색을 자동 반복하지 않는다.
- 원본 Career LLM이 `ready_for_role.application_fields`로 관측한 필드 ID에 확인된 사실·승인된 답변·문서를 배치한다. 새로운 숨은 답변 작성 LLM은 없다. `final_resume` 첨부 참조는 같은 호출에서 저장한 이력서 ID로 해결한다.
- 지원서는 기존 `talent_simulate_application.payload.applicationReview`에 저장한다. Documents는 기존 이력서·첨부 파일을 계속 보관한다. 별도 테이블·migration은 없다.
- 채팅과 공고 상세에서 같은 지원서를 열고 수정·저장한다. 사용자 편집은 모델의 후속 준비로 덮어쓰지 않는다. 별도 지원서 revision으로 다른 화면의 수정과 충돌을 확인한다. 충돌 시 로컬 입력을 유지한다.
- 사용자가 지원 화면에서 시작하면 기존 브라우저가 내용을 입력한다. 실제 보류된 요청의 필드·파일과 전송 선택을 같은 화면에서 표시하고, 기존 `resumeApplicationBrowser`로 정확한 요청을 해제한다. 최종 웹사이트 접수 증거 없이 완료로 표시하지 않는다.
- 실행에 사용한 지원서 snapshot은 기존 브라우저 attempt에 저장된다. 실행 중이거나 전송된 지원서는 편집을 막는다. 기존 문서 변경 검사·전송 중복 방지·불확실한 결과의 자동 재시도 금지를 유지한다. 문서 링크는 기존 Documents를 열며, 이 변경은 문서 파일의 별도 영구 사본 보관 기능을 추가하지 않는다.
- 새로운 조회/수정 API는 사용자 소유 activity만 읽는다. 클라이언트 응답에 브라우저 자격 증명과 요청 body는 넣지 않는다.

## 확인한 범위

- 관련 단위/통합 fixture 검증 77개 통과: `applicationReview`, `readyForRole`, `server`, `applicationInspection`, `applicationBrowser`, `applicationFormInspection`, `applicationLinkResolution`, Stagehand `form` 테스트.
- 기존 전송 승인 테스트는 provider에 전달되는 텍스트 projection을 읽도록 갱신했다. 자유 텍스트·skip이 전송 동의가 되지 않는지, 승인된 동일 요청이 한 번만 실행되는지 확인했다.
- Playwright에서 실제 React 컴포넌트와 로컬 Next 서버를 사용하고 API·인증·외부 네트워크는 합성 fixture로 격리했다. 수정/저장/재열기/전송 확인/완료, 로그인 장벽 직접 지원, 저장 실패 시 입력 유지, 모바일 가로 넘침 없음을 확인했다. 실제 ATS·DB를 거친 종단간 제출 검증은 아니다.
- 인증 없는 실제 로컬 API GET/POST는 모두 401.
- 전체 TypeScript 검사는 기존의 빈 `src/types/database.types.ts`와 범위 밖 오류로 통과하지 못했다. 추가한 파일의 타입 오류는 정리했다. 변경 경로 공백 검사는 통과했다.
- 이번 UI의 한국어·직접 작성한 영어 16키만 로컬 사전과 번역 DB 32행에 반영·재조회했다. 다른 번역과 운영 지원 데이터는 수정하지 않았다.

화면 검증 산출물은 ignored `output/playwright/application-review/`에 있다. 운영 이력/고객 데이터/실제 발송을 fixture로 사용하지 않았다.
